import { expect, test } from 'claude-code/testing'

const settle = () => new Promise(r => (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout(() => r(undefined), 50))

const SEKCJE = { sections: [{ id: 'intro', text: 'x', scope: 'shared' }] }
const FAKTY = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null }
const USAGE = { input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100, model: 'claude-sonnet-5-5' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setup(on: any, files: Record<string, string> = {}, opts: { slowWrite?: boolean } = {}) {
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1000000, percent: 1 }, rateLimits: [] } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 1000 }) as never)
  on('clock.every', () => ({ value: undefined }) as never)
  const opens = { n: 0 }
  on('ui.open', () => {
    opens.n += 1
    return { value: {} } as never
  })
  on('tool.call', () => ({ result: {}, text: '' }) as never)
  on('turn.complete', ($: unknown, e: { answer: string; usage: unknown }) => ({ text: e.answer, usage: e.usage }))
  const norm = (p: string) => p.replace(/\\/g, '/')
  const written: Record<string, string> = {}
  on('fs.exists', ($: unknown, e: { path: string }) => ({ value: Object.keys(files).some(k => norm(e.path).endsWith(k)) }) as never)
  on('fs.read', ($: unknown, e: { path: string }) => {
    const k = Object.keys(files).find(f => norm(e.path).endsWith(f))
    if (k) return { value: files[k] } as never
    throw new Error(`ENOENT ${e.path}`)
  })
  on('fs.write', async ($: unknown, e: { path: string; text: string }) => {
    if (opts.slowWrite) await settle()
    written[norm(e.path)] = e.text
    files[norm(e.path).replace(/^.*\/\.claude\//, '.claude/')] = e.text
    return { value: undefined } as never
  })
  return Object.assign(written, { opens })
}

const koszt = (written: Record<string, unknown>) => Object.entries(written).find(([p]) => p.endsWith('.claude/sztab-koszty.json'))?.[1] as string | undefined

test('sekcja kosztów w prompcie głównej sesji, także przy rozmowa=false; nie u teammate’a ani agenta', async ($, on) => {
  setup(on, { '.claude/sztab.json': JSON.stringify({ rozmowa: false }) })
  on('prompt.compose', () => SEKCJE as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  const main = await $.prompt.compose({ ...FAKTY, traits: [] })
  const section = main.sections.find(s => s.id === 'sztab:koszty')
  expect(section?.scope).toBe('session')
  expect(section?.text).toContain('--linie N')
  expect(section?.text).toContain('/szacuj')
  expect(section?.text).toContain('skills/sztab/szacuj.mjs')
  expect(section?.text).not.toContain('\\')
  expect(main.sections.some(s => s.id === 'sztab:rozmowa')).toBe(false)
  const mate = await $.prompt.compose({ ...FAKTY, traits: ['teammate'] })
  expect(mate.sections.some(s => s.id === 'sztab:koszty')).toBe(false)
  const agent = await $.prompt.compose({ ...FAKTY, traits: [], agentId: 'a1' } as never)
  expect(agent.sections.some(s => s.id === 'sztab:koszty')).toBe(false)
})

test('/szacuj zleca modelowi skill sztab:szacuj', async ($, on) => {
  setup(on)
  let sent = ''
  on('prompt.submit', ($, e) => {
    sent = e.text
    return { drop: 'test' } as never
  })
  on('clock.after', () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  const out = await $.command.run({ command: 'szacuj', args: '300 linii' } as never)
  await settle()
  expect(out.text).toContain('Szacunek')
  expect(sent).toContain('sztab:szacuj')
  expect(sent).toContain('300 linii')
})

test('koszty: nieczytelny istniejący plik nie jest nadpisywany', async ($, on) => {
  const written = setup(on, { '.claude/sztab-koszty.json': '{zepsute' })
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }) as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'VIN-148 Coś', subagentType: 'rzemieslnik' } as never)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', agentId: 'a1', reason: 'answer', usage: USAGE })
  await settle()
  expect(koszt(written)).toBeUndefined()
})

test('koszty: równoległe zakończenia agentów nie gubią sum', async ($, on) => {
  const written = setup(on, {}, { slowWrite: true })
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: e.description.endsWith('A') ? 'a1' : 'a2' }) as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'VIN-148 A', subagentType: 'rzemieslnik' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'VIN-148 B', subagentType: 'rzemieslnik' } as never)
  for (const agentId of ['a1', 'a2']) {
    await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: agentId, agentId, reason: 'answer', usage: USAGE })
  }
  await settle()
  await settle()
  expect(JSON.parse(koszt(written) ?? '{}')['VIN-148']).toMatchObject({ agenci: 2, tokeny: 400 })
})

test('workflow: panel otwiera się raz na przebieg, koszt bez id trafia na jedyne zadanie w toku', async ($, on) => {
  const written = setup(on, {
    'zadania/zadania.json': JSON.stringify({ zadania: [{ id: 'VIN-7', tytul: 'Jedyne', stan: 'w-toku' }] }),
  })
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: `w${e.workflow?.agentIndex ?? 0}` }) as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  await settle()
  for (const [runId, agentIndex] of [['wf_1', 1], ['wf_1', 2], ['wf_2', 1]] as const) {
    await $.agent.spawn({ prompt: 'x', description: 'Zadanie agenta', subagentType: 'zwiadowca', workflow: { runId, agentIndex } } as never)
  }
  await $.agent.spawn({ prompt: 'x', description: 'Zwykły', subagentType: 'zwiadowca' } as never)
  expect(written.opens.n).toBe(3)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't', agentId: 'w1', reason: 'answer', usage: USAGE })
  await settle()
  expect(JSON.parse(koszt(written) ?? '{}')['VIN-7']).toMatchObject({ agenci: 1, tokeny: 200 })
})

test('lista agentów: wiersze „running” nie wypadają przy cięciu do 50', async ($, on) => {
  setup(on)
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: e.description }) as never)
  await $.session.start({ cwd: '/x', surface: 'terminal', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'pierwszy', subagentType: 'zwiadowca' } as never)
  for (let i = 0; i < 55; i++) {
    await $.agent.spawn({ prompt: 'x', description: `a${i}`, subagentType: 'zwiadowca' } as never)
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: `t${i}`, agentId: `a${i}`, reason: 'answer', usage: USAGE })
  }
  const ui = await $.ui.mount({ plugin: 'sztab', surface: 'terminal', component: 'Pane', requestId: 'sztab', props: { title: 'Sztab', isFocused: false, bodyColumns: 60 } as never })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('pierwszy')
  expect(drawn).not.toContain('a0 ')
  await ui.unmount()
})
