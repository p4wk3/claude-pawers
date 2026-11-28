import { expect, test } from 'claude-code/testing'

import { roznica, zadanieTury } from '../hooks/log'

const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 50))

test('różnica stanów: nowe, zmienione i cofnięte linie', () => {
  const przed = { 'a.ts': [10, 2], 'b.ts': [5, 0], 'c.ts': [1, 1] } as Record<string, [number, number]>
  const po = { 'a.ts': [30, 2], 'c.ts': [1, 1], 'd.ts': [7, 0] } as Record<string, [number, number]>
  // a: +20; b: cofnięte 5 dodanych = −5; c: bez zmian; d: nowy +7.
  expect(roznica(przed, po)).toEqual({ pliki: 3, plus: 27, minus: 5 })
})

test('tura głównej sesji dopisuje linię do globalnego logu; tura subagenta nie', async ($, on) => {
  let usd = 1
  let diff = '3\t1\ta.ts\n'
  let head = 'aaa'
  on('process.run', ($: unknown, e: { argv: readonly string[] }) => {
    const cmd = e.argv.join(' ')
    let stdout = ''
    if (cmd === 'git rev-parse HEAD') stdout = `${head}\n`
    // Sesja w worktree: wpis ma iść pod nazwą repo, nie katalogu worktree.
    else if (cmd === 'git rev-parse --path-format=absolute --git-common-dir') stdout = 'C:/Users/u/projects/mnghub/.git\n'
    else if (cmd === 'git rev-parse --show-toplevel') stdout = 'C:/Users/u/projects/mnghub/.claude/worktrees/x\n'
    else if (cmd.startsWith('git diff --numstat')) stdout = diff
    else if (cmd.startsWith('git rev-list --count')) stdout = '2\n'
    else if (cmd.startsWith('git ls-files --others')) stdout = 'nowy.ts\n'
    return { value: { exitCode: 0, stdout, stderr: '' } } as never
  })
  on('fs.stat', () => ({ value: { kind: 'file', size: 20, mtimeMs: 0, isLink: false } }) as never)
  on('fs.exists', ($: unknown, e: { path: string }) => ({ value: e.path.replace(/\\/g, '/') in files }) as never)
  const files: Record<string, string> = {
    'nowy.ts': 'a\nb\n',
    // Plik zadań w katalogu repo (sesja w worktree nie ma własnego).
    'C:/Users/u/projects/mnghub/.claude/zadania.json': JSON.stringify({
      zadania: [
        { id: 'VIN-7', tytul: 'a', stan: 'w-toku' },
        { id: 'VIN-8', tytul: 'b', stan: 'do-zrobienia' },
      ],
    }),
  }
  on('fs.read', ($: unknown, e: { path: string }) => {
    const p = e.path.replace(/\\/g, '/')
    if (p in files) return { value: files[p] } as never
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.write', ($: unknown, e: { path: string; text: string }) => {
    files[e.path.replace(/\\/g, '/')] = e.text
    return { value: undefined } as never
  })
  on('env.get', ($: unknown, e: { name: string }) => ({ value: e.name === 'USERPROFILE' ? 'C:\\Users\\u' : undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 10, percent: 1 }, rateLimits: [], cost: { usd } } }) as never)
  on('session.cwd', () => ({ value: 'C:/Users/u/projects/mnghub' }) as never)
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 28, 9, 0) }) as never)
  on('turn.start', ($: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', ($: unknown, e: { answer: string }) => ({ text: e.answer }))

  await $.turn.start({ text: 'dodaj   listę\nwizyt', turnId: 't1' })
  usd = 1.45
  diff = '13\t4\ta.ts\n'
  head = 'bbb'
  await $.turn.complete({
    answer: 'ok',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
    usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 900, output_tokens: 50, model: 'claude-opus-5-5' },
  } as never)
  await settle()
  // Subagent nie pisze do logu.
  await $.turn.start({ text: 'x', turnId: 't2', agentId: 'a1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', agentId: 'a1', reason: 'answer' } as never)
  await settle()
  // Workflow w tle wydał $0.30 między turami: trafia do następnego wpisu, nie przepada.
  usd = 1.75
  await $.turn.start({ text: 'teraz VIN-8, klucz sk-abcdefghijklmnopqrstuv', turnId: 't3' })
  usd = 1.8
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' } as never)
  await settle()

  const log = files['C:/Users/u/.claude/pawers/log-2026-11.jsonl']
  expect(log).toBeDefined()
  const lines = log.trim().split('\n')
  expect(lines.length).toBe(2)
  const drugi = JSON.parse(lines[1])
  expect(drugi.usd).toBe(0.35)
  // Id z promptu wygrywa z zadaniem w toku; klucz nie trafia do logu.
  expect(drugi.zadanie).toBe('VIN-8')
  expect(drugi.prompt).toBe('teraz VIN-8, klucz [sekret]')
  expect(JSON.parse(lines[0])).toEqual({
    t: '2026-11-28T09:00:00.000Z',
    projekt: 'mnghub',
    prompt: 'dodaj listę wizyt',
    koniec: 'answer',
    min: 0,
    usd: 0.45,
    tokWe: 1000,
    tokWy: 50,
    model: 'claude-opus-5-5',
    pliki: 1,
    plus: 10,
    minus: 3,
    commity: 2,
    zadanie: 'VIN-7',
  })
})

test('zadanie tury: id z promptu, jedyne w toku, kilka w toku = lista', () => {
  const z = [
    { id: 'A-1', stan: 'w-toku' },
    { id: 'A-2', stan: 'w-toku' },
    { id: 'A-3', stan: 'zrobione' },
  ]
  expect(zadanieTury(['A-3'], z)).toEqual({ zadanie: 'A-3' })
  // Nieznane id, ale jedyne w prompcie: też je bierzemy (zadanie spoza pliku).
  expect(zadanieTury(['B-9'], z)).toEqual({ zadanie: 'B-9' })
  // Znane id wygrywa z nieznanym (np. UTF-8 w treści).
  expect(zadanieTury(['UTF-8', 'A-1'], z)).toEqual({ zadanie: 'A-1' })
  expect(zadanieTury([], z)).toEqual({ zadania: ['A-1', 'A-2'] })
  expect(zadanieTury([], [{ id: 'A-1', stan: 'w-toku' }])).toEqual({ zadanie: 'A-1' })
  expect(zadanieTury([], [])).toEqual({})
})

test('nieczytelny istniejący log nie jest nadpisywany', async ($, on) => {
  const writes: string[] = []
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '' } }) as never)
  on('fs.read', () => {
    throw new Error('EBUSY')
  })
  on('fs.exists', () => ({ value: true }) as never)
  on('fs.write', ($: unknown, e: { path: string }) => {
    writes.push(e.path)
    return { value: undefined } as never
  })
  on('env.get', ($: unknown, e: { name: string }) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }) as never)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 10, percent: 1 }, rateLimits: [], cost: { usd: 1 } } }) as never)
  on('session.cwd', () => ({ value: '/x/proj' }) as never)
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 28) }) as never)
  on('turn.start', ($: unknown, e: { turnId: string }) => ({ turnId: e.turnId }))
  on('turn.complete', ($: unknown, e: { answer: string }) => ({ text: e.answer }))
  await $.turn.start({ text: 'x', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
  await settle()
  expect(writes.filter(p => p.includes('pawers'))).toEqual([])
})
