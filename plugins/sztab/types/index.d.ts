export type AgentRow = {
  id: string
  description: string
  type: string
  model: string
  startedAt: number
  endedAt?: number
  status: string
  // Wejście + cache + wyjście ze wszystkich tur agenta.
  tokens: number
  // Ostatnia czynność z tool.call, po polsku ("czyta register.tsx").
  activity?: string
  // Początek odpowiedzi z turn.complete, do rozwinięcia pod wierszem.
  answer?: string
  // Szacunek kosztu w USD z cennika API (subskrypcja płaci inaczej; to miara skali).
  costUsd?: number
}

// Sumy na zadanie, zapisywane do .claude/sztab-koszty.json (narastająco między sesjami).
export type KosztZadania = { agenci: number; tokeny: number; kosztUsd: number; minuty: number }

export type CtxCategory = { name: string; tokens: number }

export type CtxSnap = {
  percent?: number
  tokens?: number
  window: number
  costUsd?: number
  categories: CtxCategory[]
  breakdownTotal?: number
  breakdownMax?: number
  compactAt?: number
  error?: string
}

export type ZadanieW = { id: string; tytul: string }

// Zadanie MVP do zrobienia, w kolejności pilności (w toku, potem priorytet).
export type ZadanieMvp = { id: string; tytul: string; stan: string; priorytet?: number }

// Cel z pola `cel` pliku zadań: postęp MVP i to, co go blokuje.
export type CelSnap = {
  nazwa: string
  termin?: string
  zrobione: number
  wszystkie: number
  pilne: ZadanieMvp[]
}

// Wyciąg z pliku zadań bieżącego katalogu (format w README).
export type ZadaniaSnap = {
  wToku: ZadanieW[]
  tytuly: Record<string, string>
  doZrobienia: number
  doSprawdzenia: number
  zrobione: number
  cel: CelSnap | null
}

declare module 'claude-code' {
  interface PluginState {
    sztab: {
      agents: AgentRow[]
      ctx: CtxSnap | null
      now: number
      zadania: ZadaniaSnap | null
      // Id gotowych agentów z rozwiniętym podglądem wyniku.
      open: string[]
      // Dzień (liczba dni od epoki, czas lokalny) do odliczania terminu celu.
      dzis: number
      // Zasady rozmowy w prompcie (.claude/sztab.json `rozmowa`); null = jeszcze nie czytane.
      rozmowa: boolean | null
    }
  }
}
