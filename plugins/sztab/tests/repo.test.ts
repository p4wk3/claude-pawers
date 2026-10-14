import { expect, test } from 'claude-code/testing'

// Czekanie na zapisy, które moduł robi bez await.
const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 50))

const HEAD = 'abc1234def5678901234567890abcdef12345678'
const PR_HEAD = 'feed0001feed0001feed0001feed0001feed0001'

// Repo na gałęzi main: 1 commit przed upstreamem, otwarty PR z zielonym CI.
function git(argv: readonly string[]): { exitCode: number; stdout: string } {
  const cmd = argv.join(' ')
  if (cmd === 'git branch --show-current') return { exitCode: 0, stdout: 'main\n' }
  if (cmd.startsWith('git rev-list')) return { exitCode: 0, stdout: '0\t1\n' }
  if (cmd === 'git status --porcelain') return { exitCode: 0, stdout: ' M a.ts\n M b.ts\n?? c.ts\n' }
  if (cmd === 'git diff --shortstat HEAD') return { exitCode: 0, stdout: ' 2 files changed, 40 insertions(+), 12 deletions(-)\n' }
  if (cmd.startsWith('git log')) {
    return {
      exitCode: 0,
      stdout: `${HEAD}\tfeat: nowa sekcja\t5 minutes ago\n0000000aaaa\tfix: stare\t2 days ago\n1111111bbbb\tchore: start\t3 days ago\n`,
    }
  }
  if (cmd === 'git rev-parse HEAD') return { exitCode: 0, stdout: `${HEAD}\n` }
  if (cmd === 'gh pr view --json number,url,state,statusCheckRollup') {
    return {
      exitCode: 0,
      stdout: JSON.stringify({ number: 12, url: 'https://x/12', state: 'OPEN', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }] }),
    }
  }
  if (cmd.startsWith('gh pr view') && cmd.includes('headRefOid')) return { exitCode: 0, stdout: JSON.stringify({ headRefOid: PR_HEAD }) }
  return { exitCode: 1, stdout: '' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setup(on: any, run: (argv: readonly string[]) => { exitCode: number; stdout: string } = git) {
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1000000, percent: 1 }, rateLimits: [] } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
  on('clock.every', () => ({ value: undefined }) as never)
  on('fs.read', ($: unknown, e: { path: string }) => {
    throw new Error(`ENOENT ${e.path}`)
  })
  const written: Record<string, string> = {}
  on('fs.write', ($: unknown, e: { path: string; text: string }) => {
    written[e.path.replace(/\\/g, '/')] = e.text
    return { value: undefined } as never
  })
  on('process.run', ($: unknown, e: { argv: readonly string[] }) => ({ value: { ...run(e.argv), stderr: '' } }) as never)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'r1' }) as never)
  on('turn.complete', ($: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('tool.call', () => ({ result: { stdout: 'ok' }, text: 'ok' }) as never)
  on('prompt.submit', ($: unknown, e: { text: string }) => ({ text: e.text }))
  return written
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
  expect(JSON.parse(Object.entries(written).find(([path]) => path.endsWith('.claude/sztab-przeglady.json'))?.[1] ?? '{}')).toEqual({ abc1234: 'ok' })
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
  await $.prompt.submit({ text: 'scal bez przeglądu', origin: { kind: 'composer' } } as never)
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
