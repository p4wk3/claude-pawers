import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, TurnCompleteInput } from 'claude-code'

import type { WpisLogu } from '../types'

// Globalny, międzyprojektowy log promptów: jedna linia JSON na turę głównej sesji.
// Z niego skill liczy szacunki pracy w tokenach i USD (skills/sztab/szacuj.mjs) zamiast godzin.
// Plik na miesiąc, żeby żaden nie dobił do limitu 4 MiB odczytu `$.fs.read`.
const KATALOG = '.claude/pawers'
const PROMPT_MAX = 160
// Nieśledzone pliki liczymy po liniach; większych i dalszych nie czytamy.
const NOWE_MAX = 40
const NOWY_BAJTY = 512 * 1024

type Stan = Record<string, [number, number]>


const start = atom({ plugin: 'sztab', key: 'logStart' } as const, null)
// Koszt sesji przy ostatnim wpisie. Workflow i agenci w tle wydają też między turami: liczymy od
// ostatniego wpisu, nie od startu tury, żeby nic nie przepadło (trafia do następnego promptu).
const ostatniUsd = atom({ plugin: 'sztab', key: 'logUsd' } as const, null)

async function git($: EngineInterface, argv: string[]): Promise<string | null> {
  try {
    const r = await $.process.run(['git', ...argv], { timeoutMs: 10000 })
    return r.exitCode === 0 ? r.stdout : null
  } catch {
    return null
  }
}

function linie(text: string): number {
  if (!text) return 0
  const n = text.split('\n').length
  return text.endsWith('\n') ? n - 1 : n
}

// Dodane/usunięte linie każdego pliku względem commita `base`, razem z nieśledzonymi (jako dodane).
export async function stanRepo($: EngineInterface, base: string): Promise<Stan | undefined> {
  const out = await git($, ['diff', '--numstat', base])
  if (out === null) return undefined
  const stan: Stan = {}
  for (const row of out.split('\n')) {
    const [a, d, ...p] = row.split('\t')
    if (!p.length) continue
    // Pliki binarne mają "-": liczymy je jako zmianę bez linii.
    stan[p.join('\t')] = [Number(a) || 0, Number(d) || 0]
  }
  const nowe = (await git($, ['ls-files', '--others', '--exclude-standard'])) ?? ''
  for (const path of nowe.split('\n').filter(Boolean).slice(0, NOWE_MAX)) {
    try {
      const s = await $.fs.stat(path)
      stan[path] = [s.size > NOWY_BAJTY ? 0 : linie(await $.fs.read(path)), 0]
    } catch {
      stan[path] = [0, 0]
    }
  }
  return stan
}

// Różnica dwóch stanów: ile linii przybyło i ubyło w tej turze, w ilu plikach.
export function roznica(przed: Stan, po: Stan): { pliki: number; plus: number; minus: number } {
  let pliki = 0
  let plus = 0
  let minus = 0
  for (const path of new Set([...Object.keys(przed), ...Object.keys(po)])) {
    const [a0, d0] = przed[path] ?? [0, 0]
    const [a1, d1] = po[path] ?? [0, 0]
    if (a0 === a1 && d0 === d1 && (path in przed) === (path in po)) continue
    pliki += 1
    // Cofnięcie dodanej linii to „ubyło”, cofnięcie usuniętej to „przybyło”.
    const da = a1 - a0
    const dd = d1 - d0
    plus += Math.max(0, da) + Math.max(0, -dd)
    minus += Math.max(0, dd) + Math.max(0, -da)
  }
  return { pliki, plus, minus }
}

function krotko(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > PROMPT_MAX ? `${t.slice(0, PROMPT_MAX)}…` : t
}

async function kosztSesji($: EngineInterface): Promise<number | undefined> {
  try {
    return (await $.session.usage()).cost?.usd
  } catch {
    return undefined
  }
}

async function plikLogu($: EngineInterface, t: number): Promise<string | undefined> {
  const home = (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME'))
  if (!home) return undefined
  const d = new Date(t)
  const mies = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${home.replace(/\\/g, '/')}/${KATALOG}/log-${mies}.jsonl`
}

async function projekt($: EngineInterface): Promise<string> {
  const top = (await git($, ['rev-parse', '--show-toplevel']))?.trim()
  const dir = top || (await $.session.cwd())
  return dir.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || dir
}

async function dopisz($: EngineInterface, wpis: WpisLogu): Promise<void> {
  const path = await plikLogu($, Date.parse(wpis.t))
  if (!path) return
  let dotad = ''
  try {
    dotad = await $.fs.read(path)
  } catch {
    // Plik jest, ale nie da się go przeczytać (blokada, limit 4 MiB): nie nadpisujemy go jedną linią.
    if (await $.fs.exists(path).catch(() => true)) return
  }
  try {
    await $.fs.write(path, `${dotad}${JSON.stringify(wpis)}\n`)
  } catch {
    // brak zapisu w katalogu domowym: wpis przepada, sesja działa dalej
  }
}

export const registerLog: Register = on => {
  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    const [t, usd, head] = await Promise.all([$.clock.now(), kosztSesji($), git($, ['rev-parse', 'HEAD'])])
    const base = head?.trim() || undefined
    const stan = base ? await stanRepo($, base) : undefined
    await update($, start, () => ({ turnId: e.turnId, prompt: krotko(e.text), t, usd, base, stan }))
    return result
  }).catch(($, e, next) => next(e))
}

// Wołane z jedynego hooka `turn.complete` w register.tsx (host nie przyjmuje drugiego bez matchera).
export async function logTurnComplete($: EngineInterface, e: TurnCompleteInput): Promise<void> {
  if (e.agentId !== undefined) return
  const s = await read($, start)
  if (!s || s.turnId !== e.turnId) return
  await update($, start, () => null)
  void (async () => {
    const [t, usd, nazwa] = await Promise.all([$.clock.now(), kosztSesji($), projekt($)])
    const u = e.usage
    const wpis: WpisLogu = {
      t: new Date(s.t).toISOString(),
      projekt: nazwa,
      prompt: s.prompt,
      koniec: e.reason,
      min: Math.round(((t - s.t) / 60000) * 10) / 10,
    }
    // Koszt sesji z hosta liczy też subagentów i workflow; bez niego nie zgadujemy.
    const od = (await read($, ostatniUsd)) ?? s.usd
    if (usd !== undefined && od !== undefined) wpis.usd = Math.round((usd - od) * 10000) / 10000
    if (usd !== undefined) await update($, ostatniUsd, () => usd)
    if (u) {
      wpis.tokWe = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
      wpis.tokWy = u.output_tokens
      wpis.model = u.model
    }
    if (s.base && s.stan) {
      const po = await stanRepo($, s.base)
      if (po) Object.assign(wpis, roznica(s.stan, po))
      const head = (await git($, ['rev-parse', 'HEAD']))?.trim()
      if (head && head !== s.base) {
        const n = Number((await git($, ['rev-list', '--count', `${s.base}..${head}`]))?.trim())
        if (n > 0) wpis.commity = n
      }
    }
    await dopisz($, wpis)
  })()
}
