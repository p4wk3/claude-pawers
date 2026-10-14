import { expect, test } from 'claude-code/testing'

test('panel rysuje się bez odrzucenia na desktopie i w terminalu', async ($, on) => {
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 191000, window: 1000000, percent: 19 },
    rateLimits: [],
    cost: { usd: 2.82 },
  } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
    on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }) as never)
  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'Przegląd decyzji', subagentType: 'sztab:badacz' } as never)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'sztab',
      surface,
      component: 'Pane',
      requestId: 'sztab',
      props: { title: 'Sztab', isFocused: false, bodyColumns: 60 } as never,
    })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('19%')
    expect(drawn).toContain('Przegląd decyzji')
    expect(drawn).not.toContain('Zadania')
    if (surface === 'desktop') expect(drawn).toContain('Badacz')
    await ui.unmount()
  }
})

const PLIK = JSON.stringify({
  etap: 'M3',
  zadania: [
    { id: 'VIN-148', tytul: 'K- Poprawki ściągi', stan: 'w-toku' },
    { id: 'VIN-150', tytul: 'T- Coś na potem', stan: 'do-zrobienia' },
    { id: 'VIN-151', tytul: 'K- Do gry', stan: 'do-sprawdzenia' },
    { id: 'VIN-90', tytul: 'R- Stare', stan: 'zrobione' },
  ],
})

test('zadania z pliku, grupowanie po id, czynność z tool.call, tokeny i podgląd wyniku', async ($, on) => {
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 1000, window: 1000000, percent: 1 },
    rateLimits: [],
  } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
  on('fs.read', ($, e) => {
    if (e.path.replace(/\\/g, '/').endsWith('zadania/zadania.json')) return { value: PLIK } as never
    throw new Error(`ENOENT ${e.path}`)
  })
  const ids: Record<string, string> = { 'VIN-148 Poprawki ściągi': 'a1', 'VIN-148: Przegląd zmian': 'a2', 'Luźne pytanie': 'a3' }
  on('agent.spawn', ($, e) => ({ model: 'claude-sonnet-5-5', agentId: ids[e.description] ?? 'ax' }) as never)
  on('tool.call', () => ({ result: {}, text: '' }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer, usage: e.usage }))

  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'VIN-148 Poprawki ściągi', subagentType: 'rzemieslnik' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'VIN-148: Przegląd zmian', subagentType: 'recenzent' } as never)
  await $.agent.spawn({ prompt: 'x', description: 'Luźne pytanie', subagentType: 'zwiadowca' } as never)
  await $.tool.call({ tool: 'Read', file_path: 'C:\\mody\\sztab\\hooks\\register.tsx', agentId: 'a1' } as never)
  await $.turn.complete({
    answer: 'Przejrzałem zmiany: wszystko gra.',
    durationMs: 10,
    isAborted: false,
    turnId: 't1',
    agentId: 'a2',
    reason: 'answer',
    usage: { input_tokens: 200, cache_read_input_tokens: 1000, cache_creation_input_tokens: 300, output_tokens: 500, model: 'claude-sonnet-5-5' },
  })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({
      plugin: 'sztab',
      surface,
      component: 'Pane',
      requestId: 'sztab',
      props: { title: 'Sztab', isFocused: false, bodyColumns: 60 } as never,
    })
    const drawn = JSON.stringify(await ui.drawn())
    expect(drawn).toContain('Zadania')
    expect(drawn).toContain('do zrobienia 1 · do sprawdzenia 1 · zrobione 1')
    expect(drawn).toContain('VIN-148 · K- Poprawki ściągi')
    expect(drawn).toContain('Poprawki ściągi')
    expect(drawn).not.toContain('VIN-148 Poprawki')
    expect(drawn).toContain('Przegląd zmian')
    expect(drawn).not.toContain('VIN-148: Przegląd')
    expect(drawn).toContain('Bez zadania')
    expect(drawn).toContain('czyta register.tsx')
    expect(drawn).toContain('2k tokenów')
    if (surface === 'desktop') {
      expect(drawn).toContain('kto pracował kiedy')
      expect(drawn).toContain('animateTransform')
      expect(drawn).not.toContain('wszystko gra')
      await ui.press({ key: 'wynik-a2' })
      expect(JSON.stringify(await ui.drawn())).toContain('wszystko gra')
      await ui.press({ key: 'wynik-a2' })
      expect(JSON.stringify(await ui.drawn())).not.toContain('wszystko gra')
    }
    await ui.unmount()
  }
})

test('zadania z Lineara: zapasowy plik .claude/zadania.json i id MNG-', async ($, on) => {
  on('session.usage', () => ({ value: {
    startedAt: 0,
    context: { tokens: 1000, window: 1000000, percent: 1 },
    rateLimits: [],
  } }) as never)
  on('agent.list', () => ({ value: [] }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: {} }) as never)
  on('clock.now', () => ({ value: 1000 }) as never)
  on('fs.read', ($, e) => {
    if (e.path.replace(/\\/g, '/').endsWith('.claude/zadania.json')) {
      return { value: JSON.stringify({ zadania: [{ id: 'MNG-140', tytul: 'Lista wizyt', stan: 'w-toku' }] }) } as never
    }
    throw new Error(`ENOENT ${e.path}`)
  })
  on('agent.spawn', () => ({ model: 'claude-haiku-5-5', agentId: 'm1' }) as never)

  await $.session.start({ cwd: '/x', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'x', description: 'MNG-140 Gdzie lista wizyt', subagentType: 'zwiadowca' } as never)

  const ui = await $.ui.mount({
    plugin: 'sztab',
    surface: 'desktop',
    component: 'Pane',
    requestId: 'sztab',
    props: { title: 'Sztab', isFocused: false, bodyColumns: 60 } as never,
  })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn).toContain('Zadania')
  expect(drawn).toContain('MNG-140 · Lista wizyt')
  expect(drawn).toContain('Gdzie lista wizyt')
  expect(drawn).not.toContain('Bez zadania')
  await ui.unmount()
})
