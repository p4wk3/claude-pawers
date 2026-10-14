# Sztab

Wtyczka do [Claude Code](https://claude.com/claude-code), która zamienia główną sesję w **orkiestratora**.
Orkiestrator rozmawia z tobą i rozdziela robotę między pięciu subagentów. Ich pracę widać na żywo
w panelu.

- **Skill `sztab`** — sposób pracy: zadanie z trackera, kolejność zwiadowca → badacz → rzemieślnik →
  tester → recenzent, jak pisać zlecenia, jak domykać zmianę.
- **Agenci** — `sztab:zwiadowca` (haiku, namierzanie), `sztab:badacz` (research), `sztab:rzemieslnik`
  (wykonanie zmiany), `sztab:tester` (sprawdzenie na żywo w przeglądarce), `sztab:recenzent` (przegląd).
  Zlecenia i raporty idą po angielsku, w zwięzłym stałym formacie („sztab-speak”) — czyta je tylko
  orkiestrator, tobie przekazuje wynik po polsku.
- **Pasek MVP** nad promptem — cel, postęp, ile dni zostało i najpilniejsze zadania do MVP.
- **`/pawers-setup`** — konfiguracja w repo: źródło zadań, cel MVP, wpis w `CLAUDE.md`.
- **`/raport`** — na start sesji: kalendarz z wczoraj i dziś (przypomnienia z `/podsumowanie`), otwarte
  zadania, porządek w repo i propozycja pierwszego zadania. Na jednym ekranie telefonu.
- **`/podsumowanie`** — na koniec sesji: co zrobione (z kosztem na zadanie), co zostało, propozycje
  nowych zadań i przypomnienie w kalendarzu na jutro. Niczego nie tworzy bez twojego „tak”.
- **Zasady rozmowy** — sekcja w prompcie systemowym głównej sesji (nie subagentów): odpowiedzi w twoim
  języku, prostymi słowami, na jeden ekran telefonu, z `tl;dr` na końcu; raporty agentów przetłumaczone,
  pytania tylko o decyzje produktowe. Wyłączasz je w repo plikiem `.claude/sztab.json`:
  `{ "rozmowa": false }`.
- **Koszt na zadanie** — przy każdym zadaniu w panelu: liczba agentów, tokeny i szacunkowy koszt
  według cennika API. Sumy narastają w `.claude/sztab-koszty.json`, skąd orkiestrator wpisuje je do
  komentarza w trackerze przy domknięciu.
- **Panel `/sztab`** — subagenci na żywo, pogrupowani po id zadania, z bieżącą czynnością, czasem,
  tokenami i podglądem wyniku. Do tego zapełnienie okna kontekstu i koszt sesji oraz zadania w toku.
  Działa w terminalu i w aplikacji desktopowej.
- **Sekcja Repo i bramka** — w panelu gałąź, zmiany, ostatnie commity z oceną recenzenta i PR z CI.
  Merge/push do `main` i wdrożenia czekają na przegląd albo zgodę właściciela.

## Wymagania

- **Agenci i skill** działają w każdym repo bez niczego więcej.
- **Tester** potrzebuje przeglądarki, którą steruje Claude: rozszerzenia
  Claude in Chrome albo wbudowanej przeglądarki aplikacji desktopowej Claude.
  Bez niej zgłasza `BLOCKED`.
- **Node.js 18+** w `PATH` — skrypt `zadanie.mjs`, który prowadzi plik zadań, to program Node'a.
- **Zadania w panelu i pasek MVP** potrzebują źródła zadań — inaczej ich po prostu nie ma:
  - **Linear** podłączony do Claude Code (connector albo serwer MCP Lineara), z którego orkiestrator
    przepisuje zadania do pliku, **albo**
  - **plik `.claude/zadania.json`** w repo, prowadzony ręcznie albo przez orkiestratora.

  Obie drogi ustawia komenda `/pawers-setup`.
- **Kalendarz Google** (connector) — opcjonalny. Z nim `/raport` czyta wczorajsze i dzisiejsze
  wydarzenia, a `/podsumowanie` zakłada przypomnienie na jutro; bez niego `/raport` pomija kalendarz,
  a `/podsumowanie` daje tekst przypomnienia do skopiowania.

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
   `sztab:sztab`.”*, oraz to, czego skill nie wie o projekcie: tracker i prefiks zadań, gałąź roboczą, komendy
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
`skills/sztab/zadanie.mjs`. Dodaj `.claude/zadania.json` i `.claude/sztab-koszty.json` do `.gitignore`
projektu.

### Repo w panelu

Sekcja „Repo” (między Zadaniami a Agentami, tylko w repozytorium gita) odświeża się co 15 s i po
każdej turze: `main · ↑2 ↓0` (albo `brak upstreamu`), `3 pliki · +40 −12`, trzy ostatnie commity
(`↑` = jeszcze nie wypchnięty) i otwarty PR gałęzi z CI (`PR #12 · CI ✓`, potrzebny `gh`).

Ocena commita pochodzi od `sztab:recenzent`: ostatnia linia jego odpowiedzi
`verdict: ok|changes|reject sha: <sha>` oznacza commit jako ✓ przejrzany, ⚠ uwagi albo ✗ odrzucony;
bez niej ○ nieprzejrzany. Werdykty zostają w `.claude/sztab-przeglady.json` (dodaj do `.gitignore`).

### Bramka

Polecenia Bash i PowerShell, także subagentów:

- **Merge/push do `main`/`master`** — `gh pr merge`, `git push` na `main` (`origin main`, `HEAD:main`,
  zwykły `git push` na gałęzi `main`) i `git merge` na `main` przechodzą tylko wtedy, gdy commit (HEAD,
  a przy `gh pr merge` głowa PR-a) ma werdykt `ok`. Odblokowanie: recenzent na tej zmianie albo
  „bez przeglądu” w twoim prompcie.
- **Wdrożenie** — `wdroz…`, `deploy`, `supabase db push`, `vercel --prod`, `fly deploy` przechodzą
  tylko po „wdrażaj” w twoim ostatnim prompcie.

Zgoda z promptu działa na jedno polecenie. Push na inne gałęzie i zakładanie PR-ów nie są blokowane.

## Rozwój

```bash
claude --plugin-dir ~/projects/claude-pawers/plugins/sztab   # z dysku, przeładowuje się po zapisie
claude plugin validate .
claude plugin test .
```

## Licencja

MIT — patrz `LICENSE` w głównym katalogu repo.
