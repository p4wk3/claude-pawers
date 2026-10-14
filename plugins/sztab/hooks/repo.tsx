import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { RepoCommit, RepoSnap, Werdykt } from '../types'

// Sekcja „Repo” panelu (jak Source Control w VS Code), werdykty recenzenta i bramka
// na merge/push do main oraz wdrożenia.

const repo = atom({ plugin: 'sztab', key: 'repo' } as const, null)
const przeglady = atom({ plugin: 'sztab', key: 'przeglady' } as const, {})
const zgoda = atom({ plugin: 'sztab', key: 'zgoda' } as const, { bezPrzegladu: false, wdrazaj: false })
// Ten sam klucz co w register.tsx: typ agenta po id.
const agents = atom({ plugin: 'sztab', key: 'agents' } as const, [])

const PRZEGLADY = '.claude/sztab-przeglady.json'
const MAIN = new Set(['main', 'master'])
const VERDICT_RE = /^verdict:\s*(ok|changes|reject)\s+sha:\s*([0-9a-f]{7,40})/gim
const DEPLOY_RE = /\b(wdroz|deploy|supabase\s+db\s+push|vercel\s+--prod|fly\s+deploy)\b/i
// Prompty, które pisze człowiek; wtyczka, agent czy harmonogram nie dają zgody.
const HUMAN = new Set(['composer', 'bridge', 'slack-ping'])

async function run($: EngineInterface, argv: string[]): Promise<{ exitCode: number; stdout: string } | null> {
  try {
    return await $.process.run(argv, { timeoutMs: 10000 })
  } catch {
    return null
  }
}

type PrView = {
  number: number
  url: string
  state: string
  statusCheckRollup?: { status?: string; conclusion?: string; state?: string }[]
}

const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])

function ciOf(checks: PrView['statusCheckRollup']): 'ok' | 'fail' | 'pending' | undefined {
  if (!checks || checks.length === 0) return undefined
  const outcome = (c: NonNullable<PrView['statusCheckRollup']>[number]) => (c.conclusion || c.state || '').toUpperCase()
  if (checks.some(c => FAILED.has(outcome(c)))) return 'fail'
  if (checks.some(c => (c.status && c.status.toUpperCase() !== 'COMPLETED') || ['PENDING', 'EXPECTED'].includes(outcome(c)))) {
    return 'pending'
  }
  return 'ok'
}

async function refreshRepo($: EngineInterface): Promise<void> {
  const head = await run($, ['git', 'branch', '--show-current'])
  let snap: RepoSnap | null = null
  if (head && head.exitCode === 0) {
    const [short, counts, status, stat, log, pr] = await Promise.all([
      head.stdout.trim() ? null : run($, ['git', 'rev-parse', '--short', 'HEAD']),
      run($, ['git', 'rev-list', '--left-right', '--count', '@{u}...HEAD']),
      run($, ['git', 'status', '--porcelain']),
      run($, ['git', 'diff', '--shortstat', 'HEAD']),
      run($, ['git', 'log', '-3', '--format=%H%x09%s%x09%cr']),
      run($, ['gh', 'pr', 'view', '--json', 'number,url,state,statusCheckRollup']),
    ])
    const lr = counts?.exitCode === 0 ? counts.stdout.trim().split(/\s+/).map(Number) : []
    const hasUpstream = lr.length === 2 && lr.every(n => Number.isFinite(n))
    const ahead = hasUpstream ? lr[1] ?? 0 : undefined
    const st = stat?.exitCode === 0 ? stat.stdout : ''
    const commits: RepoCommit[] = (log?.exitCode === 0 ? log.stdout : '')
      .split('\n')
      .filter(Boolean)
      .map((line, i) => {
        const [sha = '', subject = '', when = ''] = line.split('\t')
        return { sha, subject, when, pushed: hasUpstream ? i >= (ahead ?? 0) : false }
      })
    let prSnap: RepoSnap['pr']
    if (pr?.exitCode === 0) {
      try {
        const v = JSON.parse(pr.stdout) as PrView
        if (v.state === 'OPEN') prSnap = { number: v.number, url: v.url, ci: ciOf(v.statusCheckRollup) }
      } catch {
        // gh bez JSON-a: bez linii PR
      }
    }
    snap = {
      branch: head.stdout.trim() || (short?.exitCode === 0 ? short.stdout.trim() : 'HEAD'),
      ahead,
      behind: hasUpstream ? lr[0] : undefined,
      files: status?.exitCode === 0 ? status.stdout.split('\n').filter(Boolean).length : 0,
      added: Number(st.match(/(\d+) insertion/)?.[1] ?? 0),
      removed: Number(st.match(/(\d+) deletion/)?.[1] ?? 0),
      commits,
      pr: prSnap,
    }
  }
  await update($, repo, prev => (JSON.stringify(prev) === JSON.stringify(snap) ? prev : snap))
}

function verdictFor(sha: string, all: Record<string, Werdykt>): Werdykt | undefined {
  const s = sha.toLowerCase()
  const key = Object.keys(all).find(k => s.startsWith(k.toLowerCase()) || k.toLowerCase().startsWith(s))
  return key ? all[key] : undefined
}

async function loadPrzeglady($: EngineInterface): Promise<Record<string, Werdykt>> {
  try {
    return JSON.parse(await $.fs.read(PRZEGLADY)) as Record<string, Werdykt>
  } catch {
    return {}
  }
}

async function savePrzeglad($: EngineInterface, sha: string, verdict: Werdykt): Promise<void> {
  await update($, przeglady, prev => ({ ...prev, [sha]: verdict }))
  const all = { ...(await loadPrzeglady($)), [sha]: verdict }
  try {
    await $.fs.write(PRZEGLADY, `${JSON.stringify(all, null, 2)}\n`)
  } catch {
    // brak zapisu: werdykt zostaje w stanie sesji
  }
}

// Polecenie powłoki na kawałki i słowa (bez cudzysłowów); wystarczy do rozpoznania git/gh.
function segments(command: string): { text: string; words: string[] }[] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map(text => ({ text, words: (text.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(w => w.replace(/^["']|["']$/g, '')) }))
    .filter(s => s.words.length > 0)
}

const isExe = (w: string | undefined, name: string) =>
  w !== undefined && (w.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '') === name

// Słowa po podkomendzie gita (`git -C x push ...` -> ['push', ...]).
function gitArgs(words: string[]): string[] | undefined {
  const i = words.findIndex(w => isExe(w, 'git'))
  if (i < 0) return undefined
  let j = i + 1
  while (j < words.length && (words[j] ?? '').startsWith('-')) j += ['-C', '-c'].includes(words[j] ?? '') ? 2 : 1
  return words.slice(j)
}

type Gate = { kind: 'git'; branchNeeded: boolean; refs: string[] } | { kind: 'pr'; args: string[] }

const VALUE_FLAGS = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])

// Co w kawałku idzie do main: push na main, merge na main, `gh pr merge`.
function gateOf(words: string[]): Gate | undefined {
  const g = gitArgs(words)
  if (g?.[0] === 'push') {
    const pos: string[] = []
    let all = false
    for (let k = 1; k < g.length; k++) {
      const w = g[k] ?? ''
      if (VALUE_FLAGS.has(w)) k++
      else if (w === '--all' || w === '--mirror') all = true
      else if (!w.startsWith('-')) pos.push(w)
    }
    if (all) return { kind: 'git', branchNeeded: false, refs: ['main'] }
    const refspecs = pos.slice(1)
    if (refspecs.length === 0) return { kind: 'git', branchNeeded: true, refs: [] }
    const dst = refspecs.map(r => (r.replace(/^\+/, '').split(':').pop() ?? '').replace(/^refs\/heads\//, ''))
    return { kind: 'git', branchNeeded: dst.includes('HEAD'), refs: dst }
  }
  if (g?.[0] === 'merge' && !g.includes('--abort')) return { kind: 'git', branchNeeded: true, refs: [] }
  const i = words.findIndex(w => isExe(w, 'gh'))
  if (i >= 0 && words[i + 1] === 'pr' && words[i + 2] === 'merge') return { kind: 'pr', args: words.slice(i + 3) }
  return undefined
}

// Wdrożenie; push na inną gałąź i zakładanie PR-a nie są wdrożeniem, nawet z „deploy” w nazwie.
function isDeploy(seg: { text: string; words: string[] }): boolean {
  if (!DEPLOY_RE.test(seg.text) || gitArgs(seg.words)?.[0] === 'push') return false
  const i = seg.words.findIndex(w => isExe(w, 'gh'))
  return !(i >= 0 && seg.words[i + 1] === 'pr' && seg.words[i + 2] === 'create')
}

// Bez odczytu repo: czy push/merge może iść do main (gałąź nieznana = może).
function mayHitMain(g: Gate): boolean {
  return g.kind === 'pr' || g.branchNeeded || g.refs.length === 0 || g.refs.some(r => MAIN.has(r))
}

const PR_VALUE_FLAGS = new Set(['-R', '--repo', '-t', '--subject', '-b', '--body', '-F', '--body-file', '-A', '--author-email', '--match-head-commit'])

async function prHead($: EngineInterface, args: string[]): Promise<string | undefined> {
  const argv = ['gh', 'pr', 'view']
  for (let k = 0; k < args.length; k++) {
    const w = args[k] ?? ''
    if (w === '-R' || w === '--repo') argv.push(w, args[k + 1] ?? '')
    if (PR_VALUE_FLAGS.has(w)) k++
    else if (w.startsWith('--repo=')) argv.push(w)
    else if (!w.startsWith('-') && argv.length === 3) argv.push(w)
  }
  const out = await run($, [...argv, '--json', 'headRefOid'])
  if (out?.exitCode !== 0) return undefined
  try {
    return (JSON.parse(out.stdout) as { headRefOid?: string }).headRefOid
  } catch {
    return undefined
  }
}

function commandOf(e: unknown): string | undefined {
  const x = e as { tool?: unknown; command?: unknown }
  return (x.tool === 'Bash' || x.tool === 'PowerShell') && typeof x.command === 'string' ? x.command : undefined
}

const DENY_REVIEW = (cmd: string, sha: string | undefined, verdict: Werdykt | undefined) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. Merging or pushing into main/master needs a passed review, and ` +
  (sha
    ? `commit ${sha.slice(0, 12)} has ${verdict ? `verdict "${verdict}"` : 'no review verdict'}.`
    : 'the commit to be merged could not be resolved.') +
  ` To unblock: spawn sztab:recenzent on this diff; its last line \`verdict: ok sha: ${sha ?? '<sha>'}\` unblocks it.` +
  ' Or the owner writes "bez przeglądu" in their prompt (allows the next such command once).'

const DENY_DEPLOY = (cmd: string) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. Deploys need the owner's explicit go-ahead. ` +
  'Ask the owner to write "wdrażaj" in their prompt; it allows the next deploy command once.'

// Zwraca powód odmowy albo undefined, gdy polecenie może iść.
async function judge($: EngineInterface, cmd: string): Promise<string | undefined> {
  const segs = segments(cmd)
  const gates = segs.map(s => gateOf(s.words)).filter((g): g is Gate => g !== undefined && mayHitMain(g))
  const deploy = segs.some(isDeploy)
  if (gates.length === 0 && !deploy) return undefined

  const z = await read($, zgoda)
  let reviewDenied: string | undefined
  if (gates.length > 0) {
    let branch: string | undefined
    const toMain: Gate[] = []
    for (const g of gates) {
      if (g.kind === 'git' && g.branchNeeded && branch === undefined) {
        branch = (await run($, ['git', 'branch', '--show-current']))?.stdout.trim() ?? ''
      }
      const refs = g.kind === 'git' ? g.refs.map(r => (r === 'HEAD' ? branch ?? '' : r)) : []
      if (g.kind === 'pr' || refs.some(r => MAIN.has(r)) || (g.kind === 'git' && g.refs.length === 0 && MAIN.has(branch ?? ''))) {
        toMain.push(g)
      }
    }
    if (toMain.length > 0) {
      const all = await read($, przeglady)
      for (const g of toMain) {
        const sha = g.kind === 'pr' ? await prHead($, g.args) : (await run($, ['git', 'rev-parse', 'HEAD']))?.stdout.trim() || undefined
        const verdict = sha ? verdictFor(sha, all) : undefined
        if (verdict !== 'ok') {
          reviewDenied = DENY_REVIEW(cmd, sha, verdict)
          break
        }
      }
    }
  }
  if (reviewDenied && !z.bezPrzegladu) return reviewDenied
  if (deploy && !z.wdrazaj) return DENY_DEPLOY(cmd)
  // Zgoda właściciela działa na jedno polecenie.
  if (reviewDenied || deploy) {
    await update($, zgoda, prev => ({
      bezPrzegladu: reviewDenied ? false : prev.bezPrzegladu,
      wdrazaj: deploy ? false : prev.wdrazaj,
    }))
  }
  return undefined
}

type RepoView = { sync: string; changes: string; ci: string; marks: (c: RepoCommit) => { mark: string; color?: string; label: string } }

function viewOf(snap: RepoSnap, all: Record<string, Werdykt>): RepoView {
  return {
    sync: snap.ahead === undefined ? 'brak upstreamu' : `↑${snap.ahead} ↓${snap.behind ?? 0}`,
    changes: snap.files === 0 ? 'bez zmian' : `${snap.files} ${pliki(snap.files)} · +${snap.added} −${snap.removed}`,
    ci: snap.pr?.ci === 'ok' ? ' · CI ✓' : snap.pr?.ci === 'fail' ? ' · CI ✗' : snap.pr?.ci === 'pending' ? ' · CI …' : '',
    marks: c => {
      const v = verdictFor(c.sha, all)
      return v === 'ok'
        ? { mark: '✓', color: 'success', label: 'przejrzany' }
        : v === 'changes'
          ? { mark: '⚠', color: 'warning', label: 'uwagi' }
          : v === 'reject'
            ? { mark: '✗', color: 'error', label: 'odrzucony' }
            : { mark: '○', label: 'nieprzejrzany' }
    },
  }
}

// Sekcja „Repo” panelu; register.tsx podaje elementy i stan (bez $: ten nie przechodzi przez import).
export function repoDesktop(ui: Pick<Elements['desktop'], 'Box' | 'Text'>, snap: RepoSnap | null, all: Record<string, Werdykt>) {
  if (!snap) return null
  const { Box, Text } = ui
  const v = viewOf(snap, all)
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text dimColor>Repo</Text>
        <Text dimColor>{v.changes}</Text>
      </Box>
      <Text wrap="truncate-end">
        <Text bold>{snap.branch}</Text>
        <Text dimColor>{` · ${v.sync}`}</Text>
      </Text>
      {snap.commits.map(c => {
        const m = v.marks(c)
        return (
          <Text key={`commit-${c.sha}`} wrap="truncate-end">
            <Text color={m.color} dimColor={!m.color}>{`${m.mark} `}</Text>
            <Text dimColor>{`${c.sha.slice(0, 7)} `}</Text>
            {c.subject}
            <Text dimColor>{`  ${c.pushed ? '' : '↑ '}${c.when} · ${m.label}`}</Text>
          </Text>
        )
      })}
      {snap.pr && <Text dimColor wrap="truncate-end">{`PR #${snap.pr.number}${v.ci}`}</Text>}
    </Box>
  )
}

export function repoTerminal(ui: Pick<Elements['terminal'], 'Box' | 'Text'>, snap: RepoSnap | null, all: Record<string, Werdykt>) {
  if (!snap) return null
  const { Box, Text } = ui
  const v = viewOf(snap, all)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold wrap="truncate-end">{`Repo — ${snap.branch} · ${v.sync}`}</Text>
      <Text dimColor wrap="truncate-end">{v.changes}</Text>
      {snap.commits.map(c => {
        const m = v.marks(c)
        return (
          <Text key={`commit-${c.sha}`} wrap="truncate-end">
            <Text color={m.color} dimColor={!m.color}>{m.mark}</Text>
            {` ${c.sha.slice(0, 7)} ${c.subject}`}
            <Text dimColor>{`  ${c.pushed ? '' : '↑ '}${c.when} · ${m.label}`}</Text>
          </Text>
        )
      })}
      {snap.pr && <Text dimColor wrap="truncate-end">{`PR #${snap.pr.number}${v.ci}`}</Text>}
    </Box>
  )
}

function pliki(n: number): string {
  if (n === 1) return 'plik'
  const d = n % 10
  const dd = n % 100
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'pliki' : 'plików'
}

export function registerRepo(on: Parameters<Register>[0]): void {
  // register.tsx trzyma hooki session.start i turn.complete bez matchera, a drugi taki sam
  // silnik odrzuca; matcher łapiący wszystko daje własny hook (a $ nie przechodzi przez import).
  on('session.start', { cwd: /./ }, async ($, e, next) => {
    const result = await next(e)
    const saved = await loadPrzeglady($)
    await update($, przeglady, prev => ({ ...saved, ...prev }))
    $.clock.every(15000, () => void refreshRepo($))
    void refreshRepo($)
    return result
  })

  // Po turze głównej: odświeżenie repo. Po turze recenzenta: werdykt z ostatniej linii.
  on('turn.complete', { turnId: /./ }, async ($, e, next) => {
    const result = await next(e)
    if (!e.agentId) {
      void refreshRepo($)
      return result
    }
    const row = (await read($, agents)).find(r => r.id === e.agentId)
    if (row?.type.endsWith('recenzent')) {
      const found = [...e.answer.matchAll(VERDICT_RE)].pop()
      if (found?.[1] && found[2]) await savePrzeglad($, found[2].toLowerCase(), found[1].toLowerCase() as Werdykt)
    }
    return result
  })

  // Ostatni prompt właściciela: zgoda na jedno polecenie bez przeglądu albo jedno wdrożenie.
  on('prompt.submit', async ($, e, next) => {
    if (HUMAN.has(e.origin?.kind)) {
      await update($, zgoda, () => ({
        bezPrzegladu: /bez\s+przegl[aą]du/i.test(e.text),
        wdrazaj: /wdra[zż]aj/i.test(e.text),
      }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Bramka: merge/push do main po werdykcie recenzenta, wdrożenie po „wdrażaj”.
  // Z matcherem, bo hook czynności w register.tsx zajmuje tool.call bez matchera.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const cmd = commandOf(e)
    if (cmd === undefined) return next(e)
    const deny = await judge($, cmd)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    const cmd = commandOf(e)
    if (cmd === undefined) return next(e)
    const risky = segments(cmd).some(s => {
      const g = gateOf(s.words)
      return isDeploy(s) || (g !== undefined && mayHitMain(g))
    })
    return risky ? { deny: 'sztab: the merge/deploy gate could not check this command, so it is blocked. Retry it.' } : next(e)
  })
}
