import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

// Komendy początku i końca sesji (/raport, /podsumowanie) oraz zasady rozmowy z właścicielem
// dokładane do promptu systemowego głównej sesji.

// Opisy komend; rejestruje je session.start w register.tsx z dosłowną nazwą (walidator wtyczki
// wiąże command.run z komendą po literale), bo drugi hook session.start bez matchera jest zabroniony,
// a $ nie wolno przekazać do funkcji z innego pliku.
export const OPISY = {
  raport: 'Raport na start sesji: kalendarz, zadania, porządek w repo i propozycja pierwszego zadania',
  podsumowanie: 'Podsumowanie na koniec sesji: co zrobione, co zostało, przypomnienie na jutro',
} as const

// Opt-out: `{ "rozmowa": false }` w tym pliku wyłącza sekcję.
const USTAWIENIA = '.claude/sztab.json'

// Po angielsku, bo to tańsze w tokenach; model i tak odpowiada w języku użytkownika.
export const ROZMOWA_ID = 'sztab:rozmowa'
export const ROZMOWA = `# Talking to the owner

- Reply in the user's language. In Polish: correct Polish with diacritics, plain words, no jargon (explain a needed term once, in plain words), short sentences.
- Keep replies short: one phone screen. Details only on request. Lists: at most 2-3 points, one sentence each.
- When you hand back finished work, end with a tl;dr as a Markdown blockquote: first line \`> **tl;dr**\`, then 1-3 short \`> \` lines: what was done, what to remember. Never a code block (no wrapping on phones).
- Short exchange: only the tl;dr. Long session or a big piece of work: a short summary, then exactly 2 distinct proposals, then a question (do one of them? want more?), then the tl;dr.
- Subagent briefs and reports are a different channel: English, terse, internal. Never show them raw to the owner; translate them into plain language.
- Never ask the owner to read code. Ask only for product decisions, each with an example of what the user will see.`

const rozmowa = atom({ plugin: 'sztab', key: 'rozmowa' } as const, null)

// Czy dokładać sekcję; plik czytany raz na sesję.
async function rozmowaWlaczona($: EngineInterface): Promise<boolean> {
  const cached = await read($, rozmowa)
  if (cached !== null) return cached
  let on = true
  try {
    const cfg = JSON.parse(await $.fs.read(USTAWIENIA)) as { rozmowa?: unknown }
    on = cfg.rozmowa !== false
  } catch {
    // brak pliku albo zły JSON = domyślnie włączone
  }
  await update($, rozmowa, () => on)
  return on
}

// Z hooka komendy nie wolno czekać na turę, którą on trzyma: prompt idzie chwilę później.
function zlecSkill($: EngineInterface, skill: string, args: string): void {
  const extra = args.trim()
  $.clock.after(0, () => {
    void $.prompt.submit({
      text: `Wczytaj skill \`${skill}\` i wykonaj go.` + (extra ? ` Moje uwagi: ${extra}` : ''),
    })
  })
}

export function komendy(on: On): void {
  // Raport i podsumowanie prowadzi model według skilla; komenda tylko je zleca (jak /pawers-setup).
  on('command.run', { command: 'raport' }, async ($, e) => {
    zlecSkill($, 'sztab:raport', e.args)
    return { text: 'Raport: zbieram.' }
  })

  on('command.run', { command: 'podsumowanie' }, async ($, e) => {
    zlecSkill($, 'sztab:podsumowanie', e.args)
    return { text: 'Podsumowanie: zbieram.' }
  })

  // Tylko główna sesja: teammate renderuje prompt swojego lidera, subagent ma własny prompt,
  // a gdyby silnik kiedyś podał id pętli agenta, też go pomijamy.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const agentId = (e as { agentId?: string }).agentId
    if (agentId || e.traits.includes('teammate')) return result
    if (!(await rozmowaWlaczona($))) return result
    return { sections: [...result.sections, { id: ROZMOWA_ID, text: ROZMOWA, scope: 'session' }] }
  })
}
