import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentRow, CelSnap, CtxSnap, ZadaniaSnap, ZadanieMvp } from '../types'
import { avatarFor, bounce } from '../avatary/iso'

const PANE = 'sztab'
const TITLE = 'Sztab'
// Plik zadań bieżącego repo (format w README); brak = brak sekcji.
// Drugi to lokalna kopia zadań z trackera, którą orkiestrator prowadzi skryptem zadanie.mjs.
const ZADANIA = ['zadania/zadania.json', '.claude/zadania.json']

async function readZadania($: EngineInterface): Promise<string> {
  for (const path of ZADANIA) {
    try {
      return await $.fs.read(path)
    } catch {
      // następny kandydat
    }
  }
  throw new Error('brak pliku zadań')
}

const agents = atom({ plugin: 'sztab', key: 'agents' } as const, [])
const ctx = atom({ plugin: 'sztab', key: 'ctx' } as const, null)
const now = atom({ plugin: 'sztab', key: 'now' } as const, 0)
const zadania = atom({ plugin: 'sztab', key: 'zadania' } as const, null)
const open = atom({ plugin: 'sztab', key: 'open' } as const, [])
const dzis = atom({ plugin: 'sztab', key: 'dzis' } as const, 0)

const DAY = 24 * 60 * 60 * 1000

// Numer dnia w czasie lokalnym, żeby „za 3 dni” zmieniało się o północy, nie o 2:00.
function dayNumber(ms: number): number {
  const d = new Date(ms)
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY)
}

function parseDay(iso: string): number | undefined {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // 2026-02-31 to nie 3 marca: zła data = brak terminu.
  if (t.getUTCMonth() !== Number(m[2]) - 1 || t.getUTCDate() !== Number(m[3])) return undefined
  return Math.floor(t.getTime() / DAY)
}

function za(days: number): string {
  if (days === -1) return 'termin był wczoraj'
  if (days < 0) return `${-days} dni po terminie`
  if (days === 0) return 'termin dziś'
  if (days === 1) return 'termin jutro'
  return `za ${days} dni`
}

type PlikZadan = {
  cel?: { nazwa?: string; termin?: string }
  zadania?: { id: string; tytul: string; stan: string; mvp?: boolean; priorytet?: number }[]
}

// Kolejność pilności: w toku, do zrobienia, do sprawdzenia; potem priorytet trackera (1 = pilne, 0 = brak).
const RANGA: Record<string, number> = { 'w-toku': 0, 'do-zrobienia': 1, 'do-sprawdzenia': 2 }

function celOf(z: PlikZadan): CelSnap | null {
  if (!z.cel?.nazwa) return null
  const mvp = (z.zadania ?? []).filter(x => x.mvp)
  const prio = (x: ZadanieMvp) => (x.priorytet && x.priorytet > 0 ? x.priorytet : 99)
  const pilne = mvp
    .filter(x => x.stan !== 'zrobione')
    .map(x => ({ id: x.id, tytul: x.tytul, stan: x.stan, priorytet: x.priorytet }))
    .sort((a, b) => (RANGA[a.stan] ?? 3) - (RANGA[b.stan] ?? 3) || prio(a) - prio(b))
  return {
    nazwa: z.cel.nazwa,
    termin: z.cel.termin,
    zrobione: mvp.length - pilne.length,
    wszystkie: mvp.length,
    pilne,
  }
}

const RUNNING = new Set(['pending', 'running', 'waiting'])

// "VIN-148 Poprawki ściągi" -> zadanie VIN-148, opis "Poprawki ściągi".
// Dowolny prefiks w stylu Lineara/Jiry: wielkie litery, myślnik, numer.
const TASK_RE = /^([A-Z][A-Z0-9]*-\d+)\s*[·:—-]?\s*/

function splitTask(description: string): { task?: string; rest: string } {
  const m = description.match(TASK_RE)
  if (!m) return { rest: description }
  return { task: m[1], rest: description.slice(m[0].length) || description }
}

type Group = { key: string; task?: string; rows: AgentRow[] }

// Grupy w kolejności pierwszego wystąpienia; agenci bez id w grupie o pustym kluczu.
function groupRows(rows: AgentRow[]): Group[] {
  const groups = new Map<string, Group>()
  for (const r of rows) {
    const { task } = splitTask(r.description)
    const key = task ?? ''
    const g = groups.get(key) ?? { key, task, rows: [] }
    g.rows.push(r)
    groups.set(key, g)
  }
  return [...groups.values()]
}

function fileName(p: unknown): string {
  return typeof p === 'string' ? p.split(/[\\/]/).filter(Boolean).pop() ?? p : ''
}

function cut(s: string, n: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n)}…` : one
}

// Ostatnia czynność agenta po polsku, z nazwy narzędzia i jego argumentów.
function activityOf(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
      return `czyta ${fileName(args.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `edytuje ${fileName(args.file_path)}`
    case 'Write':
      return `pisze ${fileName(args.file_path)}`
    case 'Grep':
    case 'Glob':
      return `szuka ${cut(String(args.pattern ?? ''), 30)}`
    case 'Bash':
    case 'PowerShell':
      return `uruchamia ${cut(String(args.command ?? ''), 30)}`
    case 'WebSearch':
    case 'WebFetch':
      return 'szuka w sieci'
    default:
      return tool
  }
}

// Zapis czynności najwyżej raz na 0,5 s na agenta; nowsze czekają na takt zegara.
const lastWrite = new Map<string, number>()
const pending = new Map<string, string>()

function writeActivity($: EngineInterface, id: string, text: string): void {
  lastWrite.set(id, Date.now())
  void update($, agents, rows =>
    rows.some(r => r.id === id && r.activity !== text)
      ? rows.map(r => (r.id === id ? { ...r, activity: text } : r))
      : rows,
  )
}

function noteActivity($: EngineInterface, id: string, text: string): void {
  if (Date.now() - (lastWrite.get(id) ?? 0) < 500) {
    pending.set(id, text)
    return
  }
  pending.delete(id)
  writeActivity($, id, text)
}

function flushActivity($: EngineInterface): void {
  for (const [id, text] of pending) {
    pending.delete(id)
    writeActivity($, id, text)
  }
}

async function refreshZadania($: EngineInterface): Promise<void> {
  let snap: ZadaniaSnap | null = null
  try {
    const z = JSON.parse(await readZadania($)) as PlikZadan
    const list = z.zadania ?? []
    const count = (stan: string) => list.filter(x => x.stan === stan).length
    snap = {
      wToku: list.filter(x => x.stan === 'w-toku').map(x => ({ id: x.id, tytul: x.tytul })),
      tytuly: Object.fromEntries(list.map(x => [x.id, x.tytul])),
      doZrobienia: count('do-zrobienia'),
      doSprawdzenia: count('do-sprawdzenia'),
      zrobione: count('zrobione'),
      cel: celOf(z),
    }
  } catch {
    // brak albo zepsuty plik: sekcja zadań się nie pokazuje
  }
  // Najpierw dzień: pasek nie może narysować terminu liczonego od dnia 0.
  const day = dayNumber(await $.clock.now())
  await update($, dzis, prev => (prev === day ? prev : day))
  await update($, zadania, prev => (JSON.stringify(prev) === JSON.stringify(snap) ? prev : snap))
}

// Kolory w średnich tonach: czytelne na jasnym i ciemnym motywie.
const PALETTE = ['#8b7fd6', '#4f9dde', '#3fb6a8', '#e0a03a', '#d77aa8', '#e06c4f', '#9aa0a6']
const MUTED = '#8a8f98'
const TRACK = '#8a8f9826'
const RUN = '#d97757'
const OK = '#3fb68b'
const BAD = '#e5534b'

// "claude-sonnet-5-5" -> "sonnet 5.5"
function shortModel(model: string): string {
  const m = model.match(/(opus|sonnet|haiku|fable)[-_]?(\d+)?[-_.]?(\d+)?/i)
  if (!m) return model
  return [(m[1] ?? '').toLowerCase(), [m[2], m[3]].filter(Boolean).join('.')].filter(Boolean).join(' ')
}

function kTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}

function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  return m === 0 ? `${s} s` : `${m} min ${String(s % 60).padStart(2, '0')} s`
}

function bar(percent: number, width: number): string {
  const full = Math.round((Math.min(100, percent) / 100) * width)
  return '█'.repeat(full) + '░'.repeat(Math.max(0, width - full))
}

// flexGrow przyjmuje najwyżej 10000: skalujemy do tysięcznych całości.
function grow(part: number, whole: number): number {
  return Math.round((Math.max(0, part) / Math.max(1, whole)) * 1000)
}

function levelColor(percent: number): string {
  return percent >= 85 ? BAD : percent >= 60 ? '#e0a03a' : OK
}

async function refreshCtx($: EngineInterface): Promise<void> {
  let snap: CtxSnap
  try {
    const plain = await $.session.usage()
    snap = {
      percent: plain.context.percent,
      tokens: plain.context.tokens,
      window: plain.context.window,
      costUsd: plain.cost?.usd,
      categories: [],
    }
  } catch (err) {
    await update($, ctx, () => ({ window: 0, categories: [], error: String(err) }))
    return
  }
  // Podział na kategorie to lokalny szacunek; jeśli host go nie da, zostaje sam pasek.
  try {
    const full = await $.session.usage({ breakdown: 'summary' })
    const b = full.context.breakdown
    if (b) {
      snap.categories = b.categories
        .filter(c => c.kind === 'used' && c.tokens > 0)
        .map(c => ({ name: c.name, tokens: c.tokens }))
      snap.breakdownTotal = b.totalTokens
      snap.breakdownMax = b.rawMaxTokens
      snap.compactAt = b.autoCompactThreshold
    }
  } catch {
    // bez podziału
  }
  await update($, ctx, prev => (JSON.stringify(prev) === JSON.stringify(snap) ? prev : snap))
}

async function refreshAgents($: EngineInterface): Promise<void> {
  const list = await $.agent.list()
  const byId = new Map(list.map(a => [a.id, a]))
  const t = await $.clock.now()
  await update($, agents, rows =>
    rows.map(row => {
      const live = byId.get(row.id)
      if (!live || live.status === row.status) return row
      const isDone = !RUNNING.has(live.status)
      return { ...row, status: live.status, endedAt: isDone ? row.endedAt ?? t : undefined }
    }),
  )
  await update($, now, () => t)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sztab',
      description: 'Otwiera panel Sztab: subagenci na żywo i okno kontekstu',
    })
    await $.command.register({
      name: 'pawers-setup',
      description: 'Konfiguruje Sztab w tym repo: źródło zadań (Linear albo plik JSON), cel MVP, CLAUDE.md',
    })

    let tick = 0
    $.clock.every(1000, () => {
      tick += 1
      flushActivity($)
      void (async () => {
        const rows = await read($, agents)
        if (rows.some(r => RUNNING.has(r.status))) await refreshAgents($)
        if (tick % 4 === 0) await refreshCtx($)
        if (tick % 30 === 0) await refreshZadania($)
      })()
    })
    void refreshCtx($)
    void refreshZadania($)

    return next(e)
  })

  on('command.run', { command: 'sztab' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    await refreshCtx($)

    const zs = await read($, zadania)

    return { text: zs ? 'Panel Sztab otwarty.' : 'Panel Sztab otwarty. Brak pliku zadań — zadania i pasek MVP ustawia /pawers-setup.' }
  })

  // Konfigurację prowadzi model według skilla sztab:setup; komenda tylko ją zleca.
  on('command.run', { command: 'pawers-setup' }, async ($, e) => {
    const extra = e.args.trim()
    // Z hooka komendy nie wolno czekać na turę, którą on trzyma: prompt idzie chwilę później.
    $.clock.after(0, () => {
      void $.prompt.submit({
        text:
          'Skonfiguruj Sztab w tym repo: wczytaj skill `sztab:setup` i przeprowadź mnie przez niego krok po kroku.' +
          (extra ? ` Moje uwagi: ${extra}` : ''),
      })
    })

    return { text: 'Konfiguracja Sztabu: zaczynam.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if ('agentId' in result && result.agentId) {
      const t = await $.clock.now()
      const row: AgentRow = {
        id: result.agentId,
        description: e.workflow ? `${e.description} (workflow #${e.workflow.agentIndex})` : e.description,
        type: e.subagentType,
        model: shortModel(result.model),
        startedAt: t,
        status: 'running',
        tokens: 0,
      }
      await update($, agents, rows => [...rows, row].slice(-50))
      await update($, now, () => t)
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return result
  }).catch(($, e, next) => next(e))

  // Czynność subagenta: bez await, żeby nie spowalniać narzędzi.
  on('tool.call', ($, e, next) => {
    if (e.agentId) noteActivity($, e.agentId, activityOf(String(e.tool), e as unknown as Record<string, unknown>))

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) {
      const t = await $.clock.now()
      const u = e.usage
      const used = u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens + u.output_tokens : 0
      const text = e.answer.trim()
      const answer = text ? (text.length > 300 ? `${text.slice(0, 300)}…` : text) : undefined
      await update($, agents, rows =>
        rows.map(row =>
          row.id === e.agentId
            ? {
                ...row,
                tokens: row.tokens + used,
                answer: answer ?? row.answer,
                status: e.reason === 'answer' ? 'completed' : 'failed',
                endedAt: t,
              }
            : row,
        ),
      )
      await update($, now, () => t)
    } else {
      await refreshCtx($)
      await refreshZadania($)
    }

    return result
  })

  // Pasek MVP nad promptem: tylko gdy plik zadań ma pole `cel`.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const zs = await read($, zadania)
    const cel = zs?.cel
    if (!cel || e.props.hasSurvey) return next(e)

    const today = await read($, dzis)
    const end = cel.termin ? parseDay(cel.termin) : undefined
    const days = end === undefined ? undefined : end - today
    const termColor = days === undefined ? undefined : days <= 3 ? 'error' : days <= 7 ? 'warning' : undefined
    const isDone = cel.wszystkie > 0 && cel.pilne.length === 0
    const shown = cel.pilne.slice(0, 3)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" flexWrap="wrap">
        <Text bold color="claude">
          {cel.nazwa}
        </Text>
        {cel.wszystkie === 0 ? (
          <Text dimColor>{'  brak zadań MVP: oznacz je (zadanie.mjs --mvp) albo /pawers-setup'}</Text>
        ) : isDone ? (
          <Text color="success">{'  gotowe ✓'}</Text>
        ) : (
          <Text>
            {'  '}
            <Text color="success">{bar(cel.wszystkie ? (100 * cel.zrobione) / cel.wszystkie : 0, 10)}</Text>
            <Text dimColor>{` ${cel.zrobione}/${cel.wszystkie}`}</Text>
          </Text>
        )}
        {days !== undefined && !isDone && cel.wszystkie > 0 && <Text color={termColor}>{`  ·  ${za(days)}`}</Text>}
        {shown.length > 0 && (
          <Text wrap="truncate-end">
            <Text dimColor>{'  │  pilne: '}</Text>
            {shown.map((z, i) => (
              <Text key={z.id}>
                {i > 0 ? <Text dimColor>{' · '}</Text> : null}
                <Text bold={z.stan === 'w-toku'}>{z.id}</Text>
                <Text dimColor>{` ${cut(z.tytul, 28)}`}</Text>
              </Text>
            ))}
            {cel.pilne.length > shown.length && <Text dimColor>{`  +${cel.pilne.length - shown.length}`}</Text>}
          </Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const snap = await read($, ctx)
    const rows = await read($, agents)
    const t = await read($, now)
    const running = rows.filter(r => RUNNING.has(r.status))
    const done = rows.filter(r => !RUNNING.has(r.status))
    const ordered = [...running, ...done.slice().reverse()].slice(0, 20)
    const zs = await read($, zadania)
    const opened = await read($, open)
    const groupTitle = (g: Group) => (g.task ? `${g.task}${zs?.tytuly[g.task] ? ` · ${zs.tytuly[g.task]}` : ''}` : 'Bez zadania')
    const counters = zs ? `do zrobienia ${zs.doZrobienia} · do sprawdzenia ${zs.doSprawdzenia} · zrobione ${zs.zrobione}` : ''
    const endOf = (r: AgentRow) => (RUNNING.has(r.status) ? Math.max(t, r.startedAt) : r.endedAt ?? r.startedAt)

    if (e.surface === 'desktop') {
      const { Box, Text, Button, Svg } = $.ui.resolve(e)
      const percent = snap?.percent ?? 0
      const used = snap?.tokens ?? 0
      const max = snap?.window ?? 0
      const sum = (snap?.categories ?? []).reduce((acc, c) => acc + c.tokens, 0)
      const top = (snap?.categories ?? [])
        .map((c, i) => ({ ...c, color: PALETTE[i % PALETTE.length] ?? MUTED }))
        .sort((x, y) => y.tokens - x.tokens)

      return (
        <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>Kontekst tej rozmowy</Text>
              <Text>
                <Text color={levelColor(percent)} bold>{snap?.percent === undefined ? '—' : `${percent}%`}</Text>
                <Text dimColor>{max ? `  ${kTokens(used)} / ${kTokens(max)}` : ''}</Text>
              </Text>
            </Box>
            <Box flexDirection="row" width="100%" height={1} backgroundColor={TRACK} overflow="hidden" marginTop={1}>
              {sum > 0
                ? (snap?.categories ?? []).map((c, i) => (
                    <Box key={c.name} flexGrow={grow(c.tokens, max)} height={1} backgroundColor={PALETTE[i % PALETTE.length]} />
                  ))
                : <Box flexGrow={grow(used, max)} height={1} backgroundColor={levelColor(percent)} />}
              <Box flexGrow={grow(max - (sum > 0 ? sum : used), max)} height={1} />
            </Box>
            {top.length > 0 && (
              <Box flexDirection="row" flexWrap="wrap" columnGap={2} marginTop={1}>
                {top.slice(0, 4).map(c => (
                  <Text key={c.name}>
                    <Text color={c.color}>● </Text>
                    <Text dimColor>{`${c.name.toLowerCase()} ${kTokens(c.tokens)}`}</Text>
                  </Text>
                ))}
              </Box>
            )}
            {snap?.costUsd !== undefined && <Text dimColor>{`koszt sesji $${snap.costUsd.toFixed(2)}`}</Text>}
            {snap?.error && <Text color="error">{snap.error}</Text>}
          </Box>

          {!zs && (
            <Text dimColor wrap="wrap">
              Zadania i pasek MVP: podłącz Linear albo prowadź plik .claude/zadania.json — ustawi to /pawers-setup.
            </Text>
          )}

          {zs && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between">
                <Text dimColor>Zadania</Text>
                <Text dimColor>{zs.wToku.length > 0 ? `${zs.wToku.length} w toku` : 'nic w toku'}</Text>
              </Box>
              {zs.wToku.slice(0, 8).map(z => (
                <Text key={z.id} wrap="truncate-end">
                  <Text color={RUN}>● </Text>
                  <Text bold>{z.id}</Text>
                  {` ${z.tytul}`}
                </Text>
              ))}
              <Text dimColor wrap="truncate-end">{counters}</Text>
            </Box>
          )}

          <Box flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>Agenci</Text>
              <Text dimColor>{rows.length > 0 ? `${running.length} pracuje · ${done.length} gotowe` : 'brak'}</Text>
            </Box>
            {groupRows(ordered).map((g, _i, all) => {
              const showHeader = g.task !== undefined || all.length > 1
              const lane = g.rows.slice().sort((x, y) => x.startedAt - y.startedAt)
              const g0 = Math.min(...lane.map(r => r.startedAt))
              const g1 = Math.max(...lane.map(endOf))
              const span = Math.max(1, g1 - g0)
              return (
                <Box key={`grupa-${g.key}`} flexDirection="column" marginTop={1}>
                  {showHeader && (
                    <Text wrap="truncate-end" dimColor={g.task === undefined}>
                      {g.task ? <Text bold>{groupTitle(g)}</Text> : groupTitle(g)}
                    </Text>
                  )}
                  {lane.length >= 2 && (
                    <Box flexDirection="column" marginTop={1}>
                      <Text dimColor>{`kto pracował kiedy · 0–${clock(span)}`}</Text>
                      {lane.map(r => {
                        const isRun = RUNNING.has(r.status)
                        const color = isRun ? RUN : r.status === 'completed' ? OK : BAD
                        const end = endOf(r)
                        return (
                          <Box key={`os-${r.id}`} flexDirection="row" gap={1} alignItems="center">
                            <Box width={12}>
                              <Text dimColor wrap="truncate-end">{avatarFor(r.type).label.replace(/ \(.*\)$/, '')}</Text>
                            </Box>
                            <Box flexDirection="row" flexGrow={1} height={1} backgroundColor={TRACK} overflow="hidden">
                              <Box flexGrow={grow(r.startedAt - g0, span)} height={1} />
                              <Box flexGrow={Math.max(10, grow(end - r.startedAt, span))} height={1} backgroundColor={color} />
                              <Box flexGrow={grow(g1 - end, span)} height={1} />
                            </Box>
                          </Box>
                        )
                      })}
                    </Box>
                  )}
                  {g.rows.map(r => {
                    const isRun = RUNNING.has(r.status)
                    const color = isRun ? RUN : r.status === 'completed' ? OK : BAD
                    const mark = isRun ? '● ' : r.status === 'completed' ? '✓ ' : '✗ '
                    const who = avatarFor(r.type)
                    const { rest } = splitTask(r.description)
                    const isOpen = opened.includes(r.id)
                    const canOpen = !isRun && r.answer !== undefined
                    const detail = isRun && r.activity
                      ? `${who.label} · ${r.activity}`
                      : `${who.label} · ${r.model}${r.tokens ? ` · ${kTokens(r.tokens)} tokenów` : ''}`
                    return (
                      <Box key={r.id} flexDirection="row" gap={1} marginTop={1} alignItems="center">
                        <Svg
                          source={isRun ? bounce(who.svg) : who.svg.replace('<svg ', '<svg opacity="0.55" ')}
                          alt={who.label}
                          width={32}
                          height={32}
                          isInteractive={isRun || undefined}
                        />
                        <Box flexDirection="column" flexGrow={1}>
                          <Box flexDirection="row" justifyContent="space-between">
                            {canOpen ? (
                              <Button
                                key={`wynik-${r.id}`}
                                plain
                                onPress={() => update($, open, l => (l.includes(r.id) ? l.filter(x => x !== r.id) : [...l, r.id]))}
                              >
                                <Text color={color}>{mark}</Text>
                                <Text dimColor>{rest}</Text>
                                <Text dimColor>{isOpen ? ' ▾' : ' ▸'}</Text>
                              </Button>
                            ) : (
                              <Text wrap="truncate-end">
                                <Text color={color}>{mark}</Text>
                                <Text dimColor={!isRun}>{rest}</Text>
                              </Text>
                            )}
                            <Text dimColor>{clock(endOf(r) - r.startedAt)}</Text>
                          </Box>
                          <Text dimColor wrap="truncate-end">{detail}</Text>
                          {canOpen && isOpen && (
                            <Box marginTop={1}>
                              <Text dimColor wrap="wrap">{r.answer}</Text>
                            </Box>
                          )}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              )
            })}
          </Box>

          {done.length > 0 && (
            <Box>
              <Button
                key="clear"
                label="Wyczyść gotowe"
                plain
                onPress={() => update($, agents, list => list.filter(r => RUNNING.has(r.status)))}
              />
            </Box>
          )}
        </Box>
      )
    }

    // Terminal: wersja tekstowa.
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = Math.max(30, e.props.bodyColumns ?? e.viewport?.columns ?? 60)
    const percent = snap?.percent ?? 0
    const barColor = percent >= 85 ? 'error' : percent >= 60 ? 'warning' : 'success'
    const room = Math.max(3, (e.viewport?.rows ?? 30) - 10)

    return (
      <Box flexDirection="column">
        <Text bold>Okno kontekstu</Text>
        {snap === null || snap.percent === undefined ? (
          <Text dimColor>{snap?.error ? `Błąd odczytu: ${snap.error}` : 'Czekam na pierwszy odczyt…'}</Text>
        ) : (
          <Box flexDirection="column">
            <Text>
              <Text color={barColor}>{bar(percent, Math.min(40, cols - 22))}</Text>
              {` ${percent}%  ${kTokens(snap.tokens ?? 0)}/${kTokens(snap.window)}`}
            </Text>
            {snap.categories.length > 0 && (
              <Text dimColor wrap="wrap">
                {snap.categories.map(c => `${c.name} ${kTokens(c.tokens)}`).join(' · ')}
              </Text>
            )}
            {snap.costUsd !== undefined && <Text dimColor>Koszt sesji: ${snap.costUsd.toFixed(2)}</Text>}
          </Box>
        )}
        {!zs && (
          <Box marginTop={1}>
            <Text dimColor wrap="wrap">
              Zadania i pasek MVP: podłącz Linear albo prowadź plik .claude/zadania.json — ustawi to /pawers-setup.
            </Text>
          </Box>
        )}
        {zs && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Zadania{zs.wToku.length > 0 ? ` — w toku ${zs.wToku.length}` : ''}</Text>
            {zs.wToku.slice(0, 8).map(z => (
              <Text key={z.id} wrap="truncate-end">
                <Text color="claude">●</Text> {z.id} {z.tytul}
              </Text>
            ))}
            <Text dimColor wrap="truncate-end">{counters}</Text>
          </Box>
        )}
        <Text> </Text>
        <Text bold>
          Agenci{rows.length > 0 ? ` — pracuje ${running.length}, skończonych ${done.length}` : ''}
        </Text>
        {rows.length === 0 && <Text dimColor>Jeszcze żaden subagent nie wystartował.</Text>}
        {groupRows(ordered.slice(0, room)).map((g, _i, all) => (
          <Box key={`grupa-${g.key}`} flexDirection="column">
            {(g.task !== undefined || all.length > 1) && (
              <Text wrap="truncate-end" bold={g.task !== undefined} dimColor={g.task === undefined}>
                {groupTitle(g)}
              </Text>
            )}
            {g.rows.map(r => {
              const isRunning = RUNNING.has(r.status)
              const mark = isRunning ? '●' : r.status === 'completed' ? '✓' : '✗'
              const markColor = isRunning ? 'claude' : r.status === 'completed' ? 'success' : 'error'
              const elapsed = clock(endOf(r) - r.startedAt)
              const detail = isRunning && r.activity
                ? `${r.activity} · ${elapsed}`
                : `${r.type} · ${r.model} · ${elapsed}${r.tokens ? ` · ${kTokens(r.tokens)} tokenów` : ''}`
              return (
                <Box key={r.id} flexDirection="column">
                  <Text wrap="truncate-end" dimColor={!isRunning}>
                    <Text color={markColor}>{mark}</Text> {splitTask(r.description).rest}
                  </Text>
                  <Text dimColor wrap="truncate-end">{`  ${detail}`}</Text>
                </Box>
              )
            })}
          </Box>
        ))}
        {done.length > 0 && (
          <Box marginTop={1}>
            <Button
              key="clear"
              label="Wyczyść skończonych"
              onPress={() => update($, agents, list => list.filter(r => RUNNING.has(r.status)))}
            />
          </Box>
        )}
      </Box>
    )
  })
}
