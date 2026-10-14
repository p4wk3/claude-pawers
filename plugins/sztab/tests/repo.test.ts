import { expect, test } from 'claude-code/testing'

// Czekanie na zapisy, które moduł robi bez await.
const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 50))

const HEAD = 'abc1234def5678901234567890abcdef12345678'
const PR_HEAD = 'feed0001feed0001feed0001feed0001feed0001'
const FEAT = 'beef0002beef0002beef0002beef0002beef0002'
const REFS: Record<string, string> = { HEAD, main: HEAD, 'feature/x': FEAT }

type Run = { exitCode: number; stdout: string }
type Init = { cwd?: string }

// Repo na gałęzi main: 1 commit przed upstreamem, otwarty PR z zielonym CI.
// PR 13 idzie do development, PR 99 nie istnieje; katalog ../other jest na gałęzi feature.
function git(argv: readonly string[], init?: Init): Run {
  const cmd = argv.join(' ')
  if (cmd === 'git branch --show-current') return { exitCode: 0, stdout: init?.cwd === '../other' ? 'feature\n' : 'main\n' }
  if (cmd.startsWith('git rev-list')) return { exitCode: 0, stdout: '0\t1\n' }
  if (cmd === 'git status --porcelain') return { exitCode: 0, stdout: ' M a.ts\n M b.ts\n?? c.ts\n' }
  if (cmd === 'git diff --shortstat HEAD') return { exitCode: 0, stdout: ' 2 files changed, 40 insertions(+), 12 deletions(-)\n' }
  if (cmd.startsWith('git log')) {
    return {
      exitCode: 0,
      stdout: `${HEAD}\tfeat: nowa sekcja\t5 minutes ago\n0000000aaaa\tfix: stare\t2 days ago\n1111111bbbb\tchore: start\t3 days ago\n`,
    }
  }
  if (cmd.startsWith('git rev-parse --verify --quiet ')) {
    const sha = REFS[(argv[4] ?? '').replace(/\^\{commit\}$/, '')]
    return sha ? { exitCode: 0, stdout: `${sha}\n` } : { exitCode: 1, stdout: '' }
  }
  if (cmd === 'gh pr view --json number,url,state,statusCheckRollup') {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ number: 12, url: 'https://x/12', state: 'OPEN', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    }
  }
  if (cmd.startsWith('gh pr view') && cmd.endsWith('--json headRefOid,baseRefName')) {
    if (argv.includes('99')) return { exitCode: 1, stdout: '' }
    const base = argv.includes('13') ? 'development' : 'main'
    return { exitCode: 0, stdout: JSON.stringify({ headRefOid: PR_HEAD, baseRefName: base }) }
  }
  return { exitCode: 1, stdout: '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setup(on: any, run: (argv: readonly string[], init?: Init) => Run = git, store: Record<string, unknown> = {}, files: Record<string, string> = {}) {
  on('session.repo', () => ({ value: { root: '/repo', origin: null } }) as never)
  on('store.get', ($: unknown, e: { key: string }) => ({ value: store[e.key] }) as never)
  on('store.set', ($: unknown, e: { key: string; value: unknown }) => {
    store[e.key] = JSON.parse(JSON.stringify(e.value))
    return { value: undefined } as never
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1000000, percent: 1 }, rateLimits: [] } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
  on('clock.every', () => ({ value: undefined }) as never)
  on('fs.read', ($: unknown, e: { path: string }) => {
    const hit = Object.entries(files).find(([name]) => e.path.replace(/\\/g, '/').endsWith(name))
    if (hit) return { value: hit[1] } as never
    throw new Error(`ENOENT ${e.path}`)
  })
  const written: Record<string, string> = {}
  on('fs.write', ($: unknown, e: { path: string; text: string }) => {
    written[e.path.replace(/\\/g, '/')] = e.text
    return { value: undefined } as never
  })
  const calls: string[] = []
  on('process.run', ($: unknown, e: { argv: readonly string[]; init?: Init }) => {
    calls.push(e.argv.join(' '))
    return { value: { ...run(e.argv, e.init), stderr: '' } } as never
  })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'r1' }) as never)
  on('turn.complete', ($: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { stdout: 'ok' }, text: 'ok' }) as never)
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  return { written, calls, store }
}

// Odmowa bramki: { deny } albo wynik z błędem, zależnie od drogi wywołania.
const blocked = (r: { deny?: string; isError?: boolean }) => r.deny !== undefined || r.isError === true

async function pane(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: any,
  surface: 'desktop' | 'terminal',
): Promise<string> {
  const ui = await $.ui.mount({
    plugin: 'sztab',
    surface,
    component: 'Pane',
    requestId: 'sztab',
    props: { title: 'Sztab', isFocused: false, bodyColumns: 80 } as never,
  })
  const drawn = JSON.stringify(await ui.drawn())
  await ui.unmount()
  return drawn
}

async function review(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: any,
  answer: string,
) {
  await $.agent.spawn({ prompt: 'x', description: 'PAW-2 Przegląd', subagentType: 'sztab:recenzent' } as never)
  await $.turn.complete({ answer, durationMs: 10, isAborted: false, turnId: 't1', agentId: 'r1', reason: 'answer' })
  await settle()
}

test('sekcja Repo: gałąź, zmiany, commity, PR; werdykt recenzenta oznacza commit', async ($, on) => {
  const written = setup(on)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()
  for (const surface of ['desktop', 'terminal'] as const) {
    const drawn = await pane($, surface)
    expect(drawn).toContain('Repo')
    expect(drawn).toContain('main')
    expect(drawn).toContain('↑1 ↓0')
    expect(drawn).toContain('3 pliki · +40 −12')
    expect(drawn).toContain('feat: nowa sekcja')
    expect(drawn).toContain('5 minutes ago · nieprzejrzany')
    expect(drawn).toContain('PR #12 · CI ✓')
  }

  await review($, 'Uwagi: brak.\nverdict: changes sha: abc1234\nverdict: ok sha: abc1234')
  for (const surface of ['desktop', 'terminal'] as const) {
    const drawn = await pane($, surface)
    expect(drawn).toContain('5 minutes ago · przejrzany')
    expect(drawn).toContain('2 days ago · nieprzejrzany')
  }
  // Werdykt w magazynie wtyczki pod kluczem repo, nie w pliku w repo.
  expect(written.store['przeglady:/repo']).toEqual({ abc1234: 'ok' })
  expect(Object.keys(written.written).some(path => path.includes('sztab-przeglady'))).toBe(false)
})

test('poza repozytorium gita sekcji Repo nie ma', async ($, on) => {
  setup(on, () => ({ exitCode: 128, stdout: '' }))
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()
  expect(await pane($, 'desktop')).not.toContain('Repo')
})

test('bramka: gh pr merge bez przeglądu odmowa, po verdict: ok przechodzi', async ($, on) => {
  setup(on)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()

  const denied = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12 --squash' } as never)
  expect(String(denied.deny ?? denied.text)).toContain('sztab:recenzent')
  // Push na inną gałąź i zakładanie PR-a nie są blokowane.
  const push = await $.tool.call({ tool: 'Bash', command: 'git push origin feature/deploy-x' } as never)
  expect(blocked(push)).toBe(false)
  // Na main zwykły push idzie na main.
  const plain = await $.tool.call({ tool: 'PowerShell', command: 'git push' } as never)
  expect(String(plain.deny ?? plain.text)).toContain('verdict: ok sha:')

  await review($, `verdict: ok sha: ${PR_HEAD.slice(0, 10)}`)
  const merged = await $.tool.call({ tool: 'Bash', command: 'gh pr merge 12 --squash' } as never)
  expect(blocked(merged)).toBe(false)
})

test('bramka: „bez przeglądu” od właściciela przepuszcza jedno polecenie', async ($, on) => {
  setup(on)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()
  await $.prompt.submit({ text: 'bez przeglądu, scal', origin: { kind: 'composer' } } as never)
  const first = await $.tool.call({ tool: 'Bash', command: 'git push origin HEAD:main' } as never)
  expect(blocked(first)).toBe(false)
  const second = await $.tool.call({ tool: 'Bash', command: 'git push origin HEAD:main' } as never)
  expect(blocked(second)).toBe(true)
})

test('bramka: wdrożenie tylko po „wdrażaj”, raz', async ($, on) => {
  setup(on)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()
  // Słowo „deploy” w opisie commita, PR-a czy issue to nie wdrożenie.
  for (const command of ['git commit -m "deploy fix"', 'gh pr create --title "Deploy docs"', 'gh issue create -t deploy']) {
    expect(blocked(await $.tool.call({ tool: 'Bash', command } as never))).toBe(false)
  }
  const denied = await $.tool.call({ tool: 'Bash', command: 'scripts/wdroz-mnghub sha-1234567 fryzapp' } as never)
  expect(String(denied.deny ?? denied.text)).toContain('wdrażaj')
  expect(blocked(await $.tool.call({ tool: 'Bash', command: 'gh workflow run deploy.yml' } as never))).toBe(true)
  // Prompt wtyczki to nie zgoda właściciela.
  await $.prompt.submit({ text: 'wdrażaj' } as never)
  const fromPlugin = await $.tool.call({ tool: 'Bash', command: 'scripts/wdroz-mnghub sha-1234567 fryzapp' } as never)
  expect(blocked(fromPlugin)).toBe(true)

  await $.prompt.submit({ text: 'Wdrażaj na prod', origin: { kind: 'composer' } } as never)
  const allowed = await $.tool.call({ tool: 'Bash', command: 'scripts/wdroz-mnghub sha-1234567 fryzapp' } as never)
  expect(blocked(allowed)).toBe(false)
  const again = await $.tool.call({ tool: 'Bash', command: 'vercel --prod' } as never)
  expect(blocked(again)).toBe(true)
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gated($: any, command: string, tool: 'Bash' | 'PowerShell' = 'Bash'): Promise<boolean> {
  return blocked(await $.tool.call({ tool, command } as never))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function started(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: any,
  run?: (argv: readonly string[], init?: Init) => Run,
  store?: Record<string, unknown>,
  files?: Record<string, string>,
) {
  const out = setup(on, run, store, files)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await settle()
  return out
}

test('zgoda: tylko prompt zaczynający się od frazy, także po angielsku', async ($, on) => {
  await started($, on)
  await $.prompt.submit({ text: 'nie wdrażaj jeszcze', origin: { kind: 'composer' } } as never)
  expect(await gated($, 'scripts/wdroz-mnghub sha-1')).toBe(true)
  await $.prompt.submit({ text: 'nigdy bez przeglądu', origin: { kind: 'composer' } } as never)
  expect(await gated($, 'git push origin HEAD:main')).toBe(true)
  await $.prompt.submit({ text: "don't deploy now", origin: { kind: 'composer' } } as never)
  expect(await gated($, 'scripts/wdroz-mnghub sha-1')).toBe(true)

  await $.prompt.submit({ text: 'wdrażaj', origin: { kind: 'composer' } } as never)
  expect(await gated($, 'scripts/wdroz-mnghub sha-1')).toBe(false)
  await $.prompt.submit({ text: 'Deploy now, please', origin: { kind: 'composer' } } as never)
  expect(await gated($, 'vercel --prod')).toBe(false)
  await $.prompt.submit({ text: '  skip review and push', origin: { kind: 'composer' } } as never)
  expect(await gated($, 'git push origin HEAD:main')).toBe(false)
})

test('podział polecenia: kontynuacje, cudzysłowy, heredoc, nawiasy, &', async ($, on) => {
  await started($, on)
  // Tekst w cudzysłowach i ciałach heredoców nie tworzy kawałków.
  const commit = "git commit -m \"$(cat <<'EOF'\nfix: x\n\ngit push origin main; ./deploy.sh\nEOF\n)\""
  expect(await gated($, commit)).toBe(false)
  expect(await gated($, 'cat <<EOF > notes.txt\ngit push origin main\nEOF\ngit status')).toBe(false)
  expect(await gated($, 'echo "a; git push origin main"')).toBe(false)
  expect(await gated($, "git commit -m @'\nmerge \"x\"; git push origin main\n'@", 'PowerShell')).toBe(false)
  // Prawdziwe polecenia po separatorach są bramkowane.
  expect(await gated($, 'echo a \\\n  && git push origin main')).toBe(true)
  expect(await gated($, 'echo a `\n  ; git push origin main', 'PowerShell')).toBe(true)
  expect(await gated($, '(git push origin main)')).toBe(true)
  expect(await gated($, 'x & git push origin main')).toBe(true)
  expect(await gated($, 'git status\ngit push origin main')).toBe(true)
})

test('wdrożenie: tylko pierwsze słowo kawałka, ssh z poleceniem zdalnym', async ($, on) => {
  await started($, on)
  for (const command of [
    'cat docs/deploy.md',
    'grep -rn deploy src',
    'echo wdroz',
    'gh pr create --title x --body "line one\ndeploy notes\nmore"',
    'git commit -m "deploy: fix\n\nwdroz later"',
    "ssh apps 'docker ps'",
  ]) {
    expect(await gated($, command)).toBe(false)
  }
  for (const command of [
    'FOO=1 ./scripts/deploy.sh',
    'supabase db push',
    'vercel build && vercel deploy --prebuilt --prod',
    'fly deploy',
    'gh workflow run -R o/r wdroz.yml',
    "ssh apps '/srv/zrodla/wdroz.sh --cofnij fryzapp'",
    'ssh -p 22 apps sudo ./deploy.sh',
    'bash scripts/wdroz-mnghub',
  ]) {
    expect(await gated($, command)).toBe(true)
  }
})

test('zagnieżdżone powłoki i ostatnia deska', async ($, on) => {
  await started($, on)
  expect(await gated($, 'bash -c "git push origin main"')).toBe(true)
  expect(await gated($, "sh -lc 'cd x && git push origin main'")).toBe(true)
  expect(await gated($, 'pwsh -NoProfile -Command "git push origin main"', 'PowerShell')).toBe(true)
  expect(await gated($, 'eval "git push origin main"')).toBe(true)
  expect(await gated($, "bash -c './deploy.sh'")).toBe(true)
  expect(await gated($, 'bash -c "git push origin feature/x"')).toBe(false)
  // Rozbiór nie widzi celu: może iść do main.
  const odd = await $.tool.call({ tool: 'Bash', command: 'git $(echo push) origin main' } as never)
  expect(String(odd.deny ?? odd.text)).toContain('could not parse')
  expect(await gated($, 'gh api -X PUT repos/o/r/pulls/12/merge')).toBe(true)
  expect(await gated($, 'git stash push -m wip')).toBe(false)
  expect(await gated($, 'git merge --abort')).toBe(false)
  expect(await gated($, 'git log --merges')).toBe(false)
})

test('gh pr merge: bramka tylko dla bazy main, repo i PR przekazane do gh, błąd gh = odmowa', async ($, on) => {
  const out = await started($, on)
  expect(await gated($, 'gh pr merge 13 --squash')).toBe(false)
  expect(await gated($, 'gh pr merge --squash 99')).toBe(true)
  expect(await gated($, 'gh pr merge --squash --repo o/r 12 --delete-branch')).toBe(true)
  expect(out.calls).toContain('gh pr view --repo o/r 12 --json headRefOid,baseRefName')
  expect(await gated($, 'gh pr merge -R o/r --body x 13')).toBe(false)
  expect(out.calls).toContain('gh pr view --repo o/r 13 --json headRefOid,baseRefName')
})

test('sprawdzany jest sha, który idzie do main: źródło refspecu, scalany ref', async ($, on) => {
  await started($, on)
  await review($, `verdict: ok sha: ${FEAT}`)
  expect(await gated($, 'git push origin feature/x:main')).toBe(false)
  expect(await gated($, 'git merge --no-ff -m "merge x" feature/x')).toBe(false)
  const head = await $.tool.call({ tool: 'Bash', command: 'git push origin HEAD:main' } as never)
  expect(String(head.deny ?? head.text)).toContain(`verdict: ok sha: ${HEAD}`)
  expect(await gated($, 'git merge other')).toBe(true)
})

test('gałąź nieznana = może być main; cd i git -C sprawdzają swój katalog', async ($, on) => {
  await started($, on)
  expect(await gated($, 'cd ../other && git push')).toBe(false)
  expect(await gated($, 'git -C ../other push')).toBe(false)
  expect(await gated($, 'cd ../elsewhere && git push')).toBe(true)
})

test('gałąź nieczytelna albo odłączony HEAD: push blokowany', async ($, on) => {
  await started($, on, (argv, init) => (argv.join(' ') === 'git branch --show-current' ? { exitCode: 0, stdout: '\n' } : git(argv, init)))
  expect(await gated($, 'git push')).toBe(true)
  expect(await gated($, 'git push origin feature/x')).toBe(false)
})

test('werdykty: trwale w magazynie wtyczki, plik w repo pomijany', async ($, on) => {
  // Podrzucony plik w repo z werdyktem ok dla HEAD nic nie daje.
  const forged = JSON.stringify({ [HEAD]: 'ok', [PR_HEAD]: 'ok' })
  await started($, on, git, { 'przeglady:/repo': { [FEAT.slice(0, 8)]: 'ok', zzz: 'ok', [PR_HEAD]: 'maybe' } }, { '.claude/sztab-przeglady.json': forged })
  expect(await gated($, 'git push origin HEAD:main')).toBe(true)
  expect(await gated($, 'gh pr merge 12')).toBe(true)
  // Werdykt z poprzedniej sesji (magazyn) działa.
  expect(await gated($, 'git push origin feature/x:main')).toBe(false)
})

test('heredoc i potok do powłoki, ssh czy interpretera są rozbierane', async ($, on) => {
  await started($, on)
  expect(await gated($, "bash <<'EOF'\ngit push origin HEAD:main\nEOF")).toBe(true)
  expect(await gated($, 'cat <<EOF | sh\ngit push origin main\nEOF')).toBe(true)
  expect(await gated($, "ssh apps <<'EOF'\n/srv/zrodla/wdroz.sh --cofnij\nEOF")).toBe(true)
  expect(await gated($, "python3 <<'EOF'\nimport os\nos.system('git push origin main')\nEOF")).toBe(true)
  expect(await gated($, "echo 'git push origin HEAD:main' | sh")).toBe(true)
  expect(await gated($, "printf 'cd x\\n./deploy.sh\\n' | bash")).toBe(true)
  // Tekst do pliku albo do nie-powłoki dalej jest tylko tekstem.
  expect(await gated($, "cat <<'EOF' > notes.md\ngit push origin main\nEOF")).toBe(false)
  expect(await gated($, "ssh apps <<'EOF'\ndocker ps\nEOF")).toBe(false)
  expect(await gated($, "echo 'git push origin main' | grep push")).toBe(false)
  expect(await gated($, "echo 'git push origin feature/x' | sh")).toBe(false)
})

test('subagent: katalog nieznany a HEAD/bieżąca gałąź do main = odmowa; znany z cd albo spawnu', async ($, on) => {
  await started($, on)
  const call = (command: string, agentId: string) => $.tool.call({ tool: 'Bash', command, agentId } as never)
  const unknown = await call('git push origin HEAD:main', 'w1')
  expect(String(unknown.deny ?? unknown.text)).toContain('Run it from the main session')
  expect(blocked(await call('git push', 'w1'))).toBe(true)
  // Jawny sha/gałąź nie zależy od katalogu.
  await review($, `verdict: ok sha: ${FEAT}`)
  expect(blocked(await call('git push origin feature/x:main', 'w1'))).toBe(false)
  // `cd <ścieżka absolutna>` w poleceniu agenta: katalog znany, także dla następnych poleceń.
  expect(blocked(await call('cd /wt/other && git status', 'w1'))).toBe(false)
  const known = await call('git push origin HEAD:main', 'w1')
  expect(String(known.deny ?? known.text)).not.toContain('working directory is unknown')
  expect(String(known.deny ?? known.text)).toContain(`verdict: ok sha: ${HEAD}`)
  // Katalog z wywołania Agent (cwd).
  await $.agent.spawn({ prompt: 'x', description: 'PAW-4 Zmiana', subagentType: 'sztab:rzemieslnik', cwd: '../other' } as never)
  expect(blocked(await call('git push', 'r1'))).toBe(false)
})

test('wdrożenie po sudo/env/nice/timeout z flagami', async ($, on) => {
  await started($, on)
  for (const command of ['sudo -u root ./deploy.sh', 'env -u FOO BAR=1 ./scripts/wdroz-mnghub', 'nice -n 10 ./deploy.sh', 'timeout -s KILL 30 ./deploy.sh']) {
    expect(await gated($, command)).toBe(true)
  }
  expect(await gated($, 'sudo -u root cat deploy.log')).toBe(false)
})
