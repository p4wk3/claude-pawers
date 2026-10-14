# Sztab

Wtyczka do [Claude Code](https://claude.com/claude-code), która zamienia główną sesję w **orkiestratora**.
Orkiestrator rozmawia z tobą i rozdziela robotę między czterech subagentów. Ich pracę widać na żywo
w panelu.

- **Skill `sztab`** — sposób pracy: zadanie z trackera, kolejność zwiadowca → badacz → rzemieślnik →
  recenzent, jak pisać zlecenia, jak domykać zmianę.
- **Agenci** — `sztab:zwiadowca` (haiku, namierzanie), `sztab:badacz` (research), `sztab:rzemieslnik`
  (wykonanie zmiany), `sztab:recenzent` (przegląd). Wszyscy raportują zwięźle, w stałym formacie.
- **Pasek MVP** nad promptem — cel, postęp, ile dni zostało i najpilniejsze zadania do MVP.
- **`/pawers-setup`** — konfiguracja w repo: źródło zadań, cel MVP, wpis w `CLAUDE.md`.
- **Panel `/sztab`** — subagenci na żywo, pogrupowani po id zadania, z bieżącą czynnością, czasem,
  tokenami i podglądem wyniku. Do tego zapełnienie okna kontekstu i koszt sesji oraz zadania w toku.
  Działa w terminalu i w aplikacji desktopowej.

## Wymagania

- **Agenci i skill** działają w każdym repo bez niczego więcej.
- **Zadania w panelu i pasek MVP** potrzebują źródła zadań — inaczej ich po prostu nie ma:
  - **Linear** podłączony do Claude Code (connector albo serwer MCP Lineara), z którego orkiestrator
    przepisuje zadania do pliku, **albo**
  - **plik `.claude/zadania.json`** w repo, prowadzony ręcznie albo przez orkiestratora.

  Obie drogi ustawia komenda `/pawers-setup`.

## Instalacja

```bash
claude plugin marketplace add p4wk3/claude-pawers
claude plugin install sztab@pawers
```

Albo w sesji Claude Code w terminalu: `/plugin install sztab --marketplace p4wk3/claude-pawers`
(potwierdź `y`, wybierz zakres **user**). Wtyczka w zakresie user działa też w zakładce Code aplikacji
desktopowej. Aktualizacja: `claude plugin marketplace update pawers`.

## Użycie

0. W repo uruchom `/pawers-setup`. Zapyta o źródło zadań (Linear albo plik) i cel MVP, dopisze wpis do
   `CLAUDE.md` i `.gitignore`. Kroki 1–3 poniżej robi wtedy za ciebie.
1. W projekcie dopisz do `CLAUDE.md` jedno zdanie, np. *„Pracuj jako orkiestrator według skilla
   `sztab`.”*, oraz to, czego skill nie wie o projekcie: tracker i prefiks zadań, gałąź roboczą, komendy
   sprawdzające (typecheck, lint, testy, build), zasady, które agenci muszą znać.
2. Otwórz panel komendą `/sztab`. Otwiera się też sam, gdy wystartuje pierwszy subagent.
3. Agenci grupują się po id zadania na początku opisu wywołania (`MNG-140 Lista wizyt`). Pasuje każdy
   prefiks w formacie `WIELKIE-123`.

### Zadania w panelu

Panel czyta pierwszy istniejący z plików w katalogu repo: `zadania/zadania.json` albo
`.claude/zadania.json`. Bez pliku sekcja zadań się nie pokazuje.

```json
{
  "zadania": [
    { "id": "MNG-140", "tytul": "Lista wizyt", "stan": "w-toku" }
  ]
}
```

Z celem MVP plik wygląda tak (pole `cel` włącza pasek nad promptem):

```json
{
  "cel": { "nazwa": "MVP fryz.app", "termin": "2026-11-01" },
  "zadania": [
    { "id": "MNG-140", "tytul": "Lista wizyt", "stan": "w-toku", "mvp": true, "priorytet": 1 }
  ]
}
```

Pasek: `MVP fryz.app  ███░░░░░░░ 3/10  ·  za 18 dni  │  pilne: MNG-140 Lista wizyt · …`. Pilne to zadania
z `"mvp": true`, które nie są zrobione: najpierw w toku, potem do zrobienia, w każdej grupie według
priorytetu (1 = pilne). Termin żółknie na tydzień przed, czerwienieje na 3 dni przed.

Stany: `do-zrobienia`, `w-toku`, `do-sprawdzenia`, `zrobione`. Orkiestrator prowadzi plik skryptem
`skills/sztab/zadanie.mjs`. Dodaj `.claude/zadania.json` do `.gitignore` projektu.

## Rozwój

```bash
claude --plugin-dir ~/projects/claude-pawers/plugins/sztab   # z dysku, przeładowuje się po zapisie
claude plugin validate .
claude plugin test .
```

## Licencja

MIT — patrz `LICENSE` w głównym katalogu repo.
