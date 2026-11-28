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
  szacuj: 'Szacunek kosztu planowanej implementacji z metryk globalnego logu (USD, tokeny, prompty)',
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

// Szacowanie kosztów z globalnego logu; zawsze włączone (nie podlega opt-outowi `rozmowa`).
export const KOSZTY_ID = 'sztab:koszty'
export function koszty(root: string): string {
  const skrypt = `${root.replace(/\\/g, '/')}/skills/sztab/szacuj.mjs`
  return `# Cost estimates

- Never estimate work in hours, days or weeks. Estimate in USD, tokens and number of prompts, from real data: \`node "${skrypt}" --linie N\` (or \`--prompty N\`, \`--projekt <name>\`).
- When you present a plan for any implementation, end it with ONE short offer to check its cost against the metrics (/szacuj). Do not run it unasked.
- If the log is empty or small, say so.`
}

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
  // Raport, podsumowanie i szacunek prowadzi model według skilla; komenda tylko je zleca (jak /pawers-setup).
  on('command.run', { command: 'raport' }, async ($, e) => {
    zlecSkill($, 'sztab:raport', e.args)
    return { text: 'Raport: zbieram.' }
  })

  on('command.run', { command: 'podsumowanie' }, async ($, e) => {
    zlecSkill($, 'sztab:podsumowanie', e.args)
    return { text: 'Podsumowanie: zbieram.' }
  })

  on('command.run', { command: 'szacuj' }, async ($, e) => {
    zlecSkill($, 'sztab:szacuj', e.args)
    return { text: 'Szacunek: liczę z metryk.' }
  })

  // Tylko główna sesja: teammate renderuje prompt swojego lidera, subagent ma własny prompt,
  // a gdyby silnik kiedyś podał id pętli agenta, też go pomijamy.
  on('prompt.compose', async ($, e, next) => {
    const result = await next(e)
    const agentId = (e as { agentId?: string }).agentId
    if (agentId || e.traits.includes('teammate')) return result
    const sections = [...result.sections, { id: KOSZTY_ID, text: koszty($.plugin.root), scope: 'session' as const }]
    if (!(await rozmowaWlaczona($))) return { sections }
    return { sections: [...sections, { id: ROZMOWA_ID, text: ROZMOWA, scope: 'session' }] }
  })
}
