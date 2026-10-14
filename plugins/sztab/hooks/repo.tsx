import { atom, read, update } from 'claude-code'
import type { Elements, EngineInterface, Register } from 'claude-code'

import type { RepoCommit, RepoSnap, Werdykt } from '../types'

// Sekcja „Repo” panelu (jak Source Control w VS Code), werdykty recenzenta i bramka
// na merge/push do main oraz wdrożenia.

const repo = atom({ plugin: 'sztab', key: 'repo' } as const, null)
const przeglady = atom({ plugin: 'sztab', key: 'przeglady' } as const, {})
const zgoda = atom({ plugin: 'sztab', key: 'zgoda' } as const, { bezPrzegladu: false, wdrazaj: false })
const agentCwd = atom({ plugin: 'sztab', key: 'agentCwd' } as const, {})
// Bramka przeglądu przed main; repo, które commituje prosto na main, wyłącza ją w .claude/sztab.json:
// { "bramka": { "main": false } }. Bramka wdrożeń działa zawsze.
const bramkaMain = atom({ plugin: 'sztab', key: 'bramkaMain' } as const, true)

async function loadBramka($: EngineInterface): Promise<boolean> {
  try {
    const cfg = JSON.parse(await $.fs.read('.claude/sztab.json')) as { bramka?: { main?: boolean } }
    return cfg.bramka?.main !== false
  } catch {
    return true
  }
}
// Ten sam klucz co w register.tsx: typ agenta po id.
const agents = atom({ plugin: 'sztab', key: 'agents' } as const, [])

const MAIN = new Set(['main', 'master'])
const VERDICT_RE = /^verdict:\s*(ok|changes|reject)\s+sha:\s*([0-9a-f]{7,40})/gim
// Nazwa skryptu/komendy wdrożenia (`wdroz-mnghub`, `./deploy.sh`) i workflow (`deploy.yml`).
const DEPLOY_NAME = /^wdroz|deploy/i
const DEPLOY_WF = /deploy|wdroz/i
// Zgoda tylko wtedy, gdy prompt od niej się zaczyna: „nie wdrażaj jeszcze” zgodą nie jest.
const CONSENT_DEPLOY = /^\s*(wdra[zż]aj|deploy\s+now)(?![\p{L}\p{N}_])/iu
const CONSENT_NO_REVIEW = /^\s*(bez\s+przegl[aą]du|skip\s+review)(?![\p{L}\p{N}_])/iu
// Prompty, które pisze człowiek; wtyczka, agent czy harmonogram nie dają zgody.
const HUMAN = new Set(['composer', 'bridge', 'slack-ping'])

async function run($: EngineInterface, argv: string[], cwd?: string): Promise<{ exitCode: number; stdout: string } | null> {
  try {
    return await $.process.run(argv, { timeoutMs: 10000, ...(cwd ? { cwd } : {}) })
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

// Werdykty trzyma magazyn wtyczki (poza drzewem roboczym, więc nie da się ich podrzucić plikiem
// w repo), pod kluczem repozytorium: główny katalog repo (wspólny dla jego worktree) albo cwd.
async function przegladyKey($: EngineInterface): Promise<string> {
  let root: string | undefined
  try {
    root = (await $.session.repo())?.root
  } catch {
    root = undefined
  }
  return `przeglady:${(root ?? (await $.session.cwd())).replace(/\\/g, '/').toLowerCase()}`
}

async function loadPrzeglady($: EngineInterface): Promise<Record<string, Werdykt>> {
  try {
    const raw = await $.store.get(await przegladyKey($))
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).filter(
        ([sha, v]) => /^[0-9a-f]{7,40}$/i.test(sha) && (v === 'ok' || v === 'changes' || v === 'reject'),
      ),
    ) as Record<string, Werdykt>
  } catch {
    return {}
  }
}

async function savePrzeglad($: EngineInterface, sha: string, verdict: Werdykt): Promise<void> {
  await update($, przeglady, prev => ({ ...prev, [sha]: verdict }))
  try {
    await $.store.set(await przegladyKey($), { ...(await loadPrzeglady($)), [sha]: verdict })
  } catch {
    // brak zapisu: werdykt zostaje w stanie sesji
  }
}

// --- Rozbiór polecenia powłoki ---

// Kawałek polecenia: słowa bez cudzysłowów; `bare` to tylko słowa spoza cudzysłowów (do ostatniej deski);
// `sep` to separator, który go zakończył (`|` = wyjście idzie do następnego kawałka).
type Seg = { words: string[]; bare: string[]; sep: string }
// Tekst podany poleceniu na wejście (ciało heredoca): `target` to polecenie, które go wykona.
type Fed = { target: string; text: string }

// Polecenia, które wykonują tekst z wejścia.
const FEEDABLE = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'ssh', 'python', 'python3', 'py', 'node', 'deno', 'bun', 'ruby', 'perl'])

// Kto dostaje ciało heredoca zaczętego w `pos`: pierwszy FEEDABLE z etapów potoku od tego miejsca
// do końca linii (`bash <<EOF`, `cat <<EOF | sh`).
function feedTarget(text: string, pos: number): string | undefined {
  const start = Math.max(...[';', '&', '\n', '('].map(c => text.lastIndexOf(c, pos))) + 1
  const nl = text.indexOf('\n', pos)
  const line = text.slice(start, nl < 0 ? text.length : nl)
  for (const s of line.split('|')) {
    const words = s.trim().split(/\s+/)
    const name = baseName(words[headIndex(words)] ?? '')
    if (FEEDABLE.has(name)) return name
  }
  return undefined
}

// Ciała heredoców (`<<'EOF' … EOF`, także w `$(cat <<EOF …)`) i here-stringów PowerShella
// (`@' … '@`) to tekst, nie polecenia: wycinamy je przed podziałem. Ciało podane powłoce, ssh
// czy interpreterowi wraca w `fed` do osobnego rozbioru.
function stripBodies(cmd: string): { text: string; fed: Fed[] } {
  const fed: Fed[] = []
  let out = cmd.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, "''")
  const re = /(?<!<)<<(?!<)-?[ \t]*(['"]?)([A-Za-z_][\w.-]*)\1/g
  let m: RegExpExecArray | null
  while ((m = re.exec(out)) !== null) {
    const delim = m[2] ?? ''
    const nl = out.indexOf('\n', m.index + m[0].length)
    if (nl < 0) break
    const lines = out.slice(nl + 1).split('\n')
    const end = lines.findIndex(l => {
      const t = l.replace(/\r$/, '').trim()
      return t === delim || (t.startsWith(delim) && /^[)"'`;&|\s]/.test(t.slice(delim.length)))
    })
    if (end < 0) continue
    const target = feedTarget(out, m.index)
    if (target) fed.push({ target, text: lines.slice(0, end).join('\n') })
    const rest = (lines[end] ?? '').trim().slice(delim.length)
    out = `${out.slice(0, nl + 1)}${rest}\n${lines.slice(end + 1).join('\n')}`
    re.lastIndex = m.index + m[0].length
  }
  return { text: out, fed }
}

// Polecenie na kawałki po `&&`, `||`, `;`, `|`, `&`, nowej linii, `(`, `)` (i backticku w bashu);
// separatory w cudzysłowach nie dzielą. Kontynuacje linii (`\` albo PowerShellowy backtick) łączone.
function lex(cmd: string, ps: boolean): { segs: Seg[]; fed: Fed[] } {
  const { text: src, fed } = stripBodies(cmd.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' '))
  const esc = ps ? '`' : '\\'
  const segs: Seg[] = []
  let words: string[] = []
  let bare: string[] = []
  let w = ''
  let has = false
  let quoted = false
  const endWord = () => {
    if (has) {
      words.push(w)
      if (!quoted) bare.push(w)
    }
    w = ''
    has = false
    quoted = false
  }
  const endSeg = (sep: string) => {
    endWord()
    if (words.length > 0) segs.push({ words, bare, sep })
    words = []
    bare = []
  }
  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? ''
    if (c === esc && i + 1 < src.length) {
      w += src[++i]
      has = true
    } else if (c === "'") {
      const j = src.indexOf("'", i + 1)
      const end = j < 0 ? src.length : j
      w += src.slice(i + 1, end)
      i = end
      has = quoted = true
    } else if (c === '"') {
      let j = i + 1
      for (; j < src.length && src[j] !== '"'; j++) {
        if (src[j] === esc && j + 1 < src.length && (ps || '$`"\\'.includes(src[j + 1] ?? ''))) j++
        w += src[j]
      }
      i = j
      has = quoted = true
    } else if (c === '#' && !has) {
      const j = src.indexOf('\n', i)
      i = (j < 0 ? src.length : j) - 1
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord()
    } else if ((c === '|' || c === '&') && src[i + 1] === c) {
      endSeg(c + c)
      i++
    } else if ('\n;&|()'.includes(c) || (!ps && c === '`')) {
      endSeg(c)
    } else {
      w += c
      has = true
    }
  }
  endSeg('')
  return { segs, fed }
}

const isExe = (w: string | undefined, name: string) =>
  w !== undefined && (w.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '') === name

const isAbs = (d: string) => /^([\\/]|~|[A-Za-z]:)/.test(d)
const joinDir = (base: string | undefined, d: string) => (!base || isAbs(d) ? d : `${base}/${d}`)

// Słowa po podkomendzie gita (`git -C x push ...` -> ['push', ...]) i katalog z `-C`.
function gitArgs(words: string[]): { args: string[]; dir?: string } | undefined {
  const i = words.findIndex(w => isExe(w, 'git'))
  if (i < 0) return undefined
  let dir: string | undefined
  let j = i + 1
  while (j < words.length && (words[j] ?? '').startsWith('-')) {
    if (words[j] === '-C') dir = joinDir(dir, words[j + 1] ?? '')
    j += ['-C', '-c'].includes(words[j] ?? '') ? 2 : 1
  }
  return { args: words.slice(j), dir }
}

const SHELLS = ['bash', 'sh', 'zsh', 'dash']

// `bash -c "<cmd>"`, `pwsh -Command "<cmd>"`, `eval "<cmd>"`: polecenie w środku.
function nestedOf(words: string[], ps: boolean): { cmd: string; ps: boolean } | undefined {
  for (let i = 0; i < words.length; i++) {
    const w = words[i] ?? ''
    if (SHELLS.some(n => isExe(w, n))) {
      for (let k = i + 1; k < words.length; k++) {
        if (/^-[a-z]*c[a-z]*$/i.test(words[k] ?? '')) return { cmd: words[k + 1] ?? '', ps: false }
      }
    } else if (isExe(w, 'pwsh') || isExe(w, 'powershell')) {
      for (let k = i + 1; k < words.length; k++) {
        const f = (words[k] ?? '').toLowerCase()
        if (f === '-c' || (f.length >= 3 && '-command'.startsWith(f))) return { cmd: words.slice(k + 1).join(' '), ps: true }
      }
    } else if (w === 'eval' || /^(iex|invoke-expression)$/i.test(w)) {
      return { cmd: words.slice(i + 1).join(' '), ps }
    }
  }
  return undefined
}

// Co trafia do gałęzi: `src` to ref do rozwiązania (null = nie da się: kasowanie, --all),
// `dst` gałąź docelowa (null = bieżąca gałąź).
type Target = { src: string | null; dst: string | null }
type Gate = { kind: 'git'; targets: Target[]; cwd?: string } | { kind: 'pr'; args: string[]; cwd?: string }

const VALUE_FLAGS = new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])
const MERGE_VALUE_FLAGS = new Set(['-m', '--message', '-F', '--file', '-s', '--strategy', '-X', '--strategy-option', '--into-name'])

// Kawałek z git push / git merge / gh pr merge: jego bramka. `seen`: rozbiór rozpoznał git/gh z push/merge.
function gateOf(words: string[], cwd: string | undefined): { gate?: Gate; seen: boolean } {
  const g = gitArgs(words)
  const dir = g?.dir ? joinDir(cwd, g.dir) : cwd
  const a = g?.args ?? []
  if (a[0] === 'push') {
    const pos: string[] = []
    let all = false
    let del = false
    for (let k = 1; k < a.length; k++) {
      const w = a[k] ?? ''
      if (VALUE_FLAGS.has(w)) k++
      else if (w === '--all' || w === '--mirror' || w === '--branches') all = true
      else if (w === '-d' || w === '--delete') del = true
      else if (!w.startsWith('-')) pos.push(w)
    }
    if (all) return { seen: true, gate: { kind: 'git', targets: [{ src: null, dst: 'main' }], cwd: dir } }
    const specs = pos.slice(1)
    if (specs.length === 0) return { seen: true, gate: { kind: 'git', targets: [{ src: 'HEAD', dst: null }], cwd: dir } }
    const targets = specs.map((spec): Target => {
      const r = spec.replace(/^\+/, '')
      const c = r.indexOf(':')
      const src = c < 0 ? r : r.slice(0, c)
      const dst = c < 0 ? r : r.slice(c + 1)
      return { src: del || src === '' ? null : src, dst: dst === 'HEAD' || dst === '@' ? null : dst.replace(/^refs\/heads\//, '') }
    })
    return { seen: true, gate: { kind: 'git', targets, cwd: dir } }
  }
  if (a[0] === 'merge') {
    if (a.includes('--abort') || a.includes('--quit')) return { seen: true }
    const pos: string[] = []
    for (let k = 1; k < a.length; k++) {
      const w = a[k] ?? ''
      if (MERGE_VALUE_FLAGS.has(w)) k++
      else if (!w.startsWith('-')) pos.push(w)
    }
    const src = a.includes('--continue') ? 'MERGE_HEAD' : (pos[pos.length - 1] ?? '@{u}')
    return { seen: true, gate: { kind: 'git', targets: [{ src, dst: null }], cwd: dir } }
  }
  if (g && a.some(w => w === 'push' || w === 'merge')) return { seen: true }
  const i = words.findIndex(w => isExe(w, 'gh'))
  if (i >= 0 && words[i + 1] === 'pr' && words[i + 2] === 'merge') {
    return { seen: true, gate: { kind: 'pr', args: words.slice(i + 3), cwd } }
  }
  return { seen: false }
}

// --- Wdrożenie: pierwsze słowo kawałka to skrypt albo komenda wdrożenia ---

// Słowa przed właściwym poleceniem i ich flagi z wartością (`sudo -u root x`, `timeout 30 x`).
const PREFIX: Record<string, Set<string>> = {
  sudo: new Set(['-u', '-g', '-C', '-h', '-p', '-U', '-r', '-t', '-D', '--user', '--group']),
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir']),
  nice: new Set(['-n', '--adjustment']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  time: new Set(['-f', '-o']),
  nohup: new Set(),
  exec: new Set(['-a']),
  command: new Set(),
  '.': new Set(),
  source: new Set(),
  call: new Set(),
}

// Indeks właściwego polecenia: po przypisaniach `FOO=1` i prefiksach z ich flagami.
function headIndex(words: string[]): number {
  let i = 0
  while (i < words.length) {
    const w = words[i] ?? ''
    if (/^[A-Za-z_]\w*=/.test(w)) {
      i++
      continue
    }
    const flags = Object.hasOwn(PREFIX, w) ? PREFIX[w] : undefined
    if (!flags) break
    i++
    while (i < words.length && ((words[i] ?? '').startsWith('-') || /^[A-Za-z_]\w*=/.test(words[i] ?? ''))) i += flags.has(words[i] ?? '') ? 2 : 1
    if (w === 'timeout' && /^\d/.test(words[i] ?? '')) i++
  }
  return i
}
const INTERP = new Set(['node', 'python', 'python3', 'py', 'bash', 'sh', 'zsh', 'pwsh', 'powershell', 'deno', 'bun', 'tsx', 'ruby', 'perl'])
const RUNNERS = new Set(['npm', 'pnpm', 'yarn', 'make', 'just'])
const RUNNER_VALUE_FLAGS = new Set(['--filter', '-F', '-C', '--dir', '--prefix', '-w', '--workspace', '-f', '--file'])
const GH_WF_VALUE_FLAGS = new Set(['-R', '--repo', '-r', '--ref', '-f', '--raw-field', '-F', '--field'])
const SSH_VALUE_FLAGS = new Set(['-p', '-i', '-o', '-l', '-F', '-J', '-L', '-R', '-D', '-b', '-c', '-E', '-e', '-m', '-O', '-Q', '-S', '-W', '-w', '-B', '-I'])
const NONE = new Set<string>()

const baseName = (w: string) => (w.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.exe$/, '')

function positional(words: string[], from: number, valueFlags: Set<string>, skip: string[] = []): { word: string; at: number } | undefined {
  for (let k = from; k < words.length; k++) {
    const w = words[k] ?? ''
    if (valueFlags.has(w)) k++
    else if (!w.startsWith('-') && !skip.includes(w)) return { word: w, at: k }
  }
  return undefined
}

function isDeploy(words: string[], ps: boolean, depth: number): boolean {
  const i = headIndex(words)
  const head = words[i]
  if (head === undefined) return false
  const name = baseName(head)
  const rest = words.slice(i + 1)
  if (name === 'git') return false
  if (name === 'gh') return rest[0] === 'workflow' && rest[1] === 'run' && DEPLOY_WF.test(positional(rest, 2, GH_WF_VALUE_FLAGS)?.word ?? '')
  if (name === 'supabase') return rest.some((w, k) => w === 'db' && rest[k + 1] === 'push')
  if (name === 'vercel') return rest.some(w => w === '--prod' || w === '--prod=true')
  if (name === 'fly' || name === 'flyctl') return rest[0] === 'deploy'
  if (name === 'ssh') {
    const host = positional(rest, 0, SSH_VALUE_FLAGS)
    const remote = host ? rest.slice(host.at + 1).join(' ') : ''
    return depth < 3 && remote !== '' && analyze(remote, false, depth + 1).deploy
  }
  // `bash -c`, `pwsh -Command`: to rozbiera analyze() rekurencyjnie.
  if (INTERP.has(name)) return !nestedOf(words.slice(i), ps) && DEPLOY_NAME.test(baseName(positional(rest, 0, NONE)?.word ?? ''))
  if (RUNNERS.has(name)) return DEPLOY_NAME.test(positional(rest, 0, RUNNER_VALUE_FLAGS, ['run', 'run-script'])?.word ?? '')
  return DEPLOY_NAME.test(name)
}

// `cwd`: katalog po ostatnim `cd` w poleceniu (jeśli był).
type Analysis = { gates: Gate[]; deploy: boolean; unparsed: boolean; cwd?: string }

// Tekst wykonany przez powłokę/ssh/interpreter z wejścia (heredoc, `echo … | sh`).
function analyzeFed(f: Fed, depth: number): Analysis {
  if (depth >= 3) return { gates: [], deploy: false, unparsed: true }
  if (f.target === 'ssh') return { gates: [], deploy: analyze(f.text, false, depth + 1).deploy, unparsed: false }
  if (SHELLS.includes(f.target)) return analyze(f.text, false, depth + 1)
  if (f.target === 'pwsh' || f.target === 'powershell') return analyze(f.text, true, depth + 1)
  // Kod interpretera: nie rozbieramy go, ale git push/merge albo skrypt wdrożenia w nim blokują.
  const lines = f.text.split('\n').map(l => l.trim().split(/\s+/))
  return {
    gates: [],
    deploy: lines.some(l => DEPLOY_NAME.test(baseName(l[headIndex(l)] ?? ''))),
    unparsed: /\bgit\b[^\n]*\b(push|merge)(?![\w-])/.test(f.text),
  }
}

// Co `echo`/`printf` wypisuje do potoku; undefined, gdy tego nie widać (np. `cat plik`).
function echoed(words: string[]): string | undefined {
  const i = headIndex(words)
  const name = baseName(words[i] ?? '')
  if (name === 'echo' || name === 'write-output') return words.slice(i + 1).filter(w => !/^-[neE]+$/.test(w)).join(' ')
  if (name === 'printf') return (words[i + 1] ?? '').replace(/\\n/g, '\n')
  return undefined
}

function analyze(cmd: string, ps: boolean, depth = 0): Analysis {
  const res: Analysis = { gates: [], deploy: false, unparsed: false }
  const { segs, fed } = lex(cmd, ps)
  const merge = (inner: Analysis, cwd?: string) => {
    res.gates.push(...inner.gates.map(g => ({ ...g, cwd: g.cwd ? joinDir(cwd, g.cwd) : cwd })))
    res.deploy ||= inner.deploy
    res.unparsed ||= inner.unparsed
  }
  for (const f of fed) merge(analyzeFed(f, depth))
  let cwd: string | undefined
  let seen = false
  for (const [k, s] of segs.entries()) {
    // `echo '<polecenie>' | sh`: wypisany tekst wykona następny kawałek.
    const next = segs[k + 1]
    const target = s.sep === '|' && next ? baseName(next.words[headIndex(next.words)] ?? '') : ''
    if (FEEDABLE.has(target)) {
      const text = echoed(s.words)
      if (text !== undefined) merge(analyzeFed({ target, text }, depth), cwd)
    }
    const w0 = (s.words[0] ?? '').toLowerCase()
    if (['cd', 'pushd', 'chdir', 'set-location', 'sl'].includes(w0)) {
      cwd = joinDir(cwd, s.words.slice(1).find(w => !w.startsWith('-')) ?? '~')
      continue
    }
    const nested = depth < 3 ? nestedOf(s.words, ps) : undefined
    if (nested) {
      merge(analyze(nested.cmd, nested.ps, depth + 1), cwd)
      continue
    }
    const g = gateOf(s.words, cwd)
    if (g.gate) res.gates.push(g.gate)
    seen ||= g.seen
    if (isDeploy(s.words, ps, depth)) res.deploy = true
    // `gh api …/pulls/12/merge` albo `…/merges` scala bez `gh pr merge`.
    if (s.words.some(w => isExe(w, 'gh')) && s.words.includes('api') && s.words.some(w => /\/merges?(?:[/?]|$)/.test(w))) {
      res.unparsed = true
    }
  }
  // Ostatnia deska: git z push/merge albo gh z pr merge poza cudzysłowami, a rozbiór ich nie rozpoznał.
  if (!seen) {
    const bare = segs.flatMap(s => s.bare)
    const git = bare.some(w => isExe(w, 'git')) && bare.some(w => w === 'push' || w === 'merge')
    const gh = bare.some(w => isExe(w, 'gh')) && bare.includes('pr') && bare.includes('merge')
    if (git || gh) res.unparsed = true
  }
  res.cwd = cwd
  return res
}

// Bez odczytu repo: czy push/merge może iść do main (gałąź nieznana = może).
function mayHitMain(g: Gate): boolean {
  return g.kind === 'pr' || g.targets.some(t => t.dst === null || MAIN.has(t.dst))
}

const PR_VALUE_FLAGS = new Set(['-R', '--repo', '-t', '--subject', '-b', '--body', '-F', '--body-file', '-A', '--author-email', '--match-head-commit'])

// Głowa i baza PR-a z `gh pr view`, z tym samym repo i PR-em co `gh pr merge`.
function prView(args: string[]): { argv: string[]; target?: string } {
  const argv = ['gh', 'pr', 'view']
  let target: string | undefined
  for (let k = 0; k < args.length; k++) {
    const w = args[k] ?? ''
    if (w === '-R' || w === '--repo') argv.push('--repo', args[++k] ?? '')
    else if (w.startsWith('--repo=')) argv.push(w)
    else if (/^-R./.test(w)) argv.push('--repo', w.slice(2))
    else if (PR_VALUE_FLAGS.has(w)) k++
    else if (!w.startsWith('-') && target === undefined) target = w
  }
  if (target !== undefined) argv.push(target)
  return { argv, target }
}

async function prInfo($: EngineInterface, args: string[], cwd?: string): Promise<{ head: string; base: string } | undefined> {
  const { argv } = prView(args)
  const out = await run($, [...argv, '--json', 'headRefOid,baseRefName'], cwd)
  if (out?.exitCode !== 0) return undefined
  try {
    const v = JSON.parse(out.stdout) as { headRefOid?: unknown; baseRefName?: unknown }
    return typeof v.headRefOid === 'string' && typeof v.baseRefName === 'string' ? { head: v.headRefOid, base: v.baseRefName } : undefined
  } catch {
    return undefined
  }
}

async function revParse($: EngineInterface, ref: string, cwd?: string): Promise<string | undefined> {
  const out = await run($, ['git', 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
  return out?.exitCode === 0 ? out.stdout.trim() || undefined : undefined
}

function commandOf(e: unknown): { cmd: string; ps: boolean } | undefined {
  const x = e as { tool?: unknown; command?: unknown }
  return (x.tool === 'Bash' || x.tool === 'PowerShell') && typeof x.command === 'string'
    ? { cmd: x.command, ps: x.tool === 'PowerShell' }
    : undefined
}

const UNBLOCK_OWNER = ' Or the owner starts their prompt with "bez przeglądu" (or "skip review"); that allows the next such command once.'

const DENY_REVIEW = (cmd: string, ref: string, sha: string | undefined, verdict: Werdykt | undefined) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. Merging or pushing into main/master needs a passed review, and ` +
  (sha
    ? `commit ${sha.slice(0, 12)} (${ref}) has ${verdict ? `verdict "${verdict}"` : 'no review verdict'}.`
    : `the commit to be merged (${ref}) could not be resolved.`) +
  ` To unblock: spawn sztab:recenzent on ${sha ? `commit ${sha}` : 'this diff'}; its last line \`verdict: ok sha: ${sha ?? '<sha>'}\` unblocks it.` +
  UNBLOCK_OWNER

const DENY_PR = (cmd: string) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. \`gh pr view\` could not read the PR's base and head, so the gate cannot tell ` +
  'whether it merges into main/master. Check gh auth and the PR number/repo, then retry.' +
  UNBLOCK_OWNER

const DENY_UNPARSED = (cmd: string) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. It looks like a push or merge (git push/merge, gh pr merge, gh api …/merge) ` +
  'that the gate could not parse, so it may go into main/master and needs a review. Run it as a plain command ' +
  '(e.g. `git push origin <branch>`, `gh pr merge <n>`) so the gate can check the target.' +
  UNBLOCK_OWNER


const DENY_DEPLOY = (cmd: string) =>
  `sztab: blocked \`${cmd.slice(0, 80)}\`. Deploys need the owner's explicit go-ahead. ` +
  'Ask the owner to start their prompt with "wdrażaj" (or "deploy now"); it allows the next deploy command once.'


async function judge($: EngineInterface, cmd: string, ps: boolean, agentId?: string): Promise<string | undefined> {
  const a = analyze(cmd, ps)
  // Subagent: katalog z agent.spawn (`cwd`), inaczej katalog sesji, jak dla samego Basha.
  // `cd` w poleceniu liczy się tylko dla tego polecenia (powłoka agenta wraca do swojego katalogu).
  const base = agentId ? (await read($, agentCwd))[agentId] : undefined
  const mainGate = await read($, bramkaMain)
  const gates = mainGate ? a.gates.filter(mayHitMain).map(g => ({ ...g, cwd: g.cwd ? joinDir(base, g.cwd) : base })) : []
  const unparsed = mainGate && a.unparsed
  if (gates.length === 0 && !a.deploy && !unparsed) return undefined

  const z = await read($, zgoda)
  let reviewDenied = unparsed ? DENY_UNPARSED(cmd) : undefined
  if (!reviewDenied && gates.length > 0) {
    const all = await read($, przeglady)
    // Gałąź nieznana (błąd, odłączony HEAD) = może być main.
    const branches = new Map<string, string>()
    const branchOf = async (cwd?: string) => {
      const key = cwd ?? ''
      if (!branches.has(key)) {
        const out = await run($, ['git', 'branch', '--show-current'], cwd)
        branches.set(key, out?.exitCode === 0 ? out.stdout.trim() : '')
      }
      return branches.get(key) ?? ''
    }
    const check = (ref: string, sha: string | undefined) => {
      const verdict = sha ? verdictFor(sha, all) : undefined
      return verdict === 'ok' ? undefined : DENY_REVIEW(cmd, ref, sha, verdict)
    }
    for (const g of gates) {
      if (g.kind === 'pr') {
        const pr = await prInfo($, g.args, g.cwd)
        if (!pr) reviewDenied = DENY_PR(cmd)
        else if (MAIN.has(pr.base)) reviewDenied = check('PR head', pr.head)
      } else {
        for (const t of g.targets) {
          if (t.dst !== null && !MAIN.has(t.dst)) continue
          if (t.dst === null) {
            const b = await branchOf(g.cwd)
            if (b !== '' && !MAIN.has(b)) continue
          }
          reviewDenied = check(t.src ?? 'all/deleted refs', t.src === null ? undefined : await revParse($, t.src, g.cwd))
          if (reviewDenied) break
        }
      }
      if (reviewDenied) break
    }
  }
  if (reviewDenied && !z.bezPrzegladu) return reviewDenied
  if (a.deploy && !z.wdrazaj) return DENY_DEPLOY(cmd)
  // Zgoda właściciela działa na jedno polecenie.
  if (reviewDenied || a.deploy) {
    await update($, zgoda, prev => ({
      bezPrzegladu: reviewDenied ? false : prev.bezPrzegladu,
      wdrazaj: a.deploy ? false : prev.wdrazaj,
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
    const main = await loadBramka($)
    await update($, bramkaMain, () => main)
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

  // Ostatni prompt właściciela: zgoda na jedno polecenie bez przeglądu albo jedno wdrożenie,
  // tylko gdy prompt zaczyna się od tej frazy.
  on('prompt.submit', async ($, e, next) => {
    if (HUMAN.has(e.origin?.kind)) {
      await update($, zgoda, () => ({
        bezPrzegladu: CONSENT_NO_REVIEW.test(e.text),
        wdrazaj: CONSENT_DEPLOY.test(e.text),
      }))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Katalog subagenta, gdy wywołanie Agent go podało; bez niego agent pracuje w katalogu sesji.
  on('agent.spawn', { subagentType: /./ }, async ($, e, next) => {
    const result = await next(e)
    const id = result.agentId
    const dir = e.cwd
    if (id && dir) await update($, agentCwd, prev => ({ ...prev, [id]: dir }))
    return result
  }).catch(($, e, next) => next(e))

  // Bramka: merge/push do main po werdykcie recenzenta, wdrożenie po „wdrażaj”.
  // Z matcherem, bo hook czynności w register.tsx zajmuje tool.call bez matchera.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($, e, next) => {
    const c = commandOf(e)
    if (c === undefined) return next(e)
    const deny = await judge($, c.cmd, c.ps, e.agentId)
    return deny ? { deny } : next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    const c = commandOf(e)
    if (c === undefined) return next(e)
    const a = analyze(c.cmd, c.ps)
    const risky = a.deploy || a.unparsed || a.gates.some(mayHitMain)
    return risky ? { deny: 'sztab: the merge/deploy gate could not check this command, so it is blocked. Retry it.' } : next(e)
  })
}
