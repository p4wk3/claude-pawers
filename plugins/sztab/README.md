# Sztab

Wtyczka do [Claude Code](https://claude.com/claude-code), która zamienia główną sesję w **orkiestratora**.
Orkiestrator rozmawia z tobą i rozdziela robotę między ośmiu subagentów. Ich pracę widać na żywo
w panelu.

- **Skill `sztab`** — sposób pracy: zadanie z trackera, kolejność zwiadowca → badacz → rzemieślnik →
  tester → recenzent, jak pisać zlecenia, jak domykać zmianę.
- **Agenci** — `sztab:zwiadowca` (haiku, namierzanie), `sztab:badacz` (research), `sztab:rzemieslnik`
  (wykonanie zmiany), `sztab:tester` (sprawdzenie na żywo w przeglądarce), `sztab:recenzent` (przegląd), a do filmów animowanych `sztab:modelarz` (modele narzędziami projektu), `sztab:animator` (sceny, klatki
  kontrolne) i `sztab:montazysta` (głos, napisy, eksport poziomy, pionowy i na telefon). Wszyscy poza
  zwiadowcą na Sonnecie — tanio i szybko; orkiestrator tylko zleca i ocenia.
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
- **Globalny log i szacunki w tokenach** — każdy prompt głównej sesji, w każdym projekcie, trafia jako
  jedna linia JSON do `~/.claude/pawers/log-RRRR-MM.jsonl`: początek promptu, przyrost kosztu sesji
  (z subagentami, cennik API), tokeny, czas, a z gita pliki, `+`/`−` linii i commity tej tury.
  `node skills/sztab/szacuj.mjs` liczy z niego metrykę (USD i tokeny na prompt i na 100 linii, per
  projekt) i szacunek (`--linie 400`, `--prompty 12`, `--projekt`, `--dni`, `--json`). Orkiestrator
  szacuje pracę tą metryką, nigdy w godzinach ani dniach. Wpis dostaje id zadania (z promptu albo
  jedynego „w toku” w pliku zadań), więc `--zadanie MNG-140` i `--zadania` pokazują faktyczny koszt
  zadań. Szacunek zapisany przy zadaniu (`--zapisz`) po jego zamknięciu (`--zamknij`) kalibruje
  kolejne szacunki (`~/.claude/pawers/szacunki.jsonl`). Klucze API wklejone w prompt log maskuje.
- **`/szacuj`** — szacunek kosztu planowanej implementacji (USD, tokeny, prompty) z metryk logu.
  Do tego stała zasada w prompcie głównej sesji: agent szacuje w USD, tokenach i promptach, a przy
  każdym planie implementacji proponuje sprawdzenie względem metryk.
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

Pasek: `MVP fryz.app  ███░░░░░░░ 3/10  ·  za 18 dni`. Listy pilnych zadań w pasku nie ma (brak miejsca);
pilne to zadania z `"mvp": true`, które nie są zrobione — orkiestrator czyta je z pliku zadań: najpierw
w toku, potem do zrobienia, w każdej grupie według priorytetu (1 = pilne). Termin żółknie na tydzień
przed, czerwienieje na 3 dni przed.

Opcjonalne pole `"wdrozenie": { "z": "development", "na": "origin/main" }` dokłada do paska
`czeka na wdrożenie: 3` — liczbę zmian (commitów bez scaleń) w gałęzi `z`, których nie ma jeszcze
w `na` — albo `wszystko wdrożone`. Domyślnie `z` = `HEAD`, `na` = `origin/main`.

Stany: `do-zrobienia`, `w-toku`, `do-sprawdzenia`, `zrobione`. Orkiestrator prowadzi plik skryptem
`skills/sztab/zadanie.mjs`. Dodaj `.claude/zadania.json` i `.claude/sztab-koszty.json` do `.gitignore`
projektu.

### Repo w panelu

Sekcja „Repo” (między Zadaniami a Agentami, tylko w repozytorium gita) odświeża się co 15 s i po
każdej turze: `main · ↑2 ↓0` (albo `brak upstreamu`), `3 pliki · +40 −12`, trzy ostatnie commity
(`↑` = jeszcze nie wypchnięty) i otwarty PR gałęzi z CI (`PR #12 · CI ✓`, potrzebny `gh`).

Ocena commita pochodzi od `sztab:recenzent`: ostatnia linia jego odpowiedzi
`verdict: ok|changes|reject sha: <sha>` oznacza commit jako ✓ przejrzany, ⚠ uwagi albo ✗ odrzucony;
bez niej ○ nieprzejrzany. Werdykty zostają w magazynie wtyczki (`$.store`, poza drzewem roboczym),
pod kluczem repozytorium (jego głównego katalogu, wspólnego dla worktree), więc przeżywają sesję.

Jeśli projekt ma własnego recenzenta, jego odpowiedź też musi kończyć się linią
`verdict: ok|changes|reject sha: <sha>` — inaczej do przeglądu przed merge'em użyj `sztab:recenzent`.

### Bramka

Bramka to zabezpieczenie przed pomyłką, nie granica bezpieczeństwa: agent z dostępem do Basha zawsze
może ją obejść. Łapie realne ścieżki (zwykłe polecenia, `bash -c`, heredoc, potok do powłoki), nie
złośliwe obejścia. Znane ryzyko resztkowe: aliasy i funkcje powłoki (`alias git=…`, `cd() {…}`) oraz
konfiguracja poza poleceniem (hooki gita, `core.hooksPath`) zmieniają skutek polecenia, a bramka ich nie widzi.
Katalog docelowy rozstrzyga tylko w wąskim modelu (`cd`, przypisania, `git -C`, git do odczytu przed
push/merge); poza nim odmawia i każe uruchomić push/merge osobnym poleceniem.

Polecenia Bash i PowerShell, także subagentów:

- **Merge/push do `main`/`master`** (tylko te gałęzie; push i merge do `development` czy innych
  gałęzi przechodzą) — `git push` na `main` (`origin main`, `feature:main`, `HEAD:main`, zwykły
  `git push` na gałęzi `main`), `git merge` na `main` i `gh pr merge` PR-a z bazą `main` przechodzą
  tylko wtedy, gdy commit, który tam trafia, ma werdykt `ok`: źródło refspecu przy pushu, scalany ref
  przy `git merge`, głowa PR-a przy `gh pr merge`. Bramka uwzględnia `cd <katalog> &&` i `git -C`;
  gdy gałęzi nie da się odczytać, `gh` nie odpowie albo polecenia nie da się rozebrać (np. push
  w `$(…)`), traktuje je jak push do `main`. Odblokowanie: recenzent na tym commicie albo prompt
  zaczynający się od „bez przeglądu” (albo „skip review”).
- **Wdrożenie** — polecenie, którego pierwsze słowo to skrypt `wdroz…`/`…deploy…`, oraz
  `supabase db push`, `vercel … --prod`, `fly deploy`, `gh workflow run <deploy|wdroz…>` i takie
  polecenia przez `ssh <host> '…'`, przechodzą tylko po prompcie zaczynającym się od „wdrażaj” (albo
  „deploy now”). „Nie wdrażaj jeszcze” zgodą nie jest. `cat docs/deploy.md` czy commit ze słowem
  „deploy” to nie wdrożenie.

Bramka rozbiera też `bash -c "…"`, `pwsh -Command "…"`, `eval "…"` oraz tekst podany powłoce, `ssh`
czy interpreterowi przez heredoc (`bash <<EOF`) albo potok (`echo … | sh`); poza tym tekst
w cudzysłowach i heredocach nie liczy się jako polecenie. Subagent: HEAD i bieżąca gałąź są
rozwiązywane w jego katalogu z `cwd` wywołania Agent, a bez niego w katalogu sesji; `cd <katalog> &&`
liczy się tylko w poleceniu, w którym stoi. Zgoda z promptu działa na jedno
polecenie. Push na inne gałęzie i zakładanie PR-ów nie są blokowane.

Repo, w którym commitujesz prosto na `main` (bez gałęzi i PR-ów), wyłącza bramkę przeglądu plikiem
`.claude/sztab.json`: `{ "bramka": { "main": false } }`. Bramka wdrożeń działa dalej.

### Log i aktualizacja

Log nie wymaga ustawień w projektach: mod wtyczki zapisuje go w katalogu domowym
(`~/.claude/pawers/`) wszędzie tam, gdzie wtyczka jest zainstalowana (zakres user). Projekty, które
już jej używają, nie potrzebują żadnych zmian. Opcjonalnie: nowe brzmienie linii o orkiestratorze
w `CLAUDE.md` (tylko sesja główna, nie subagenci) wpisze ponowne `/pawers-setup` albo ręczna poprawka.
Sesje w worktree (`.claude/worktrees/…`) logują się pod nazwą repo.

Aktualizacja: z marketplace — `claude plugin marketplace update pawers` i restart. Instalacja
lokalna (`CLAUDE_CODE_PLUGIN_DIRS` albo `--plugin-dir`) używa tej gałęzi, która jest wyciągnięta na dysku.

## Rozwój

```bash
claude --plugin-dir ~/projects/claude-pawers/plugins/sztab   # z dysku, przeładowuje się po zapisie
claude plugin validate .
claude plugin test .
```

## Zmiany

- **0.11.0** — globalny, międzyprojektowy log promptów (`~/.claude/pawers/`) z kosztem, tokenami
  i liczbami z diffu; skrypt `szacuj.mjs`; skill szacuje pracę w tokenach i USD zamiast w czasie;
  `/podsumowanie` podaje koszt dnia; komenda `/szacuj` (skill `sztab:szacuj`) i stała sekcja promptu
  o kosztach (szacunki w USD, tokenach i promptach, propozycja sprawdzenia przy planie); poprawki panelu
  i pliku kosztów; sekcja 7 skilla: Workflow i ultracode. Wpisy logu z id zadania (z promptu albo
  jedynego w toku); szacunek przy zadaniu (`--zapisz`), faktyczny koszt (`--zadanie`, `--zadania`),
  zamknięcie (`--zamknij`) i kalibracja kolejnych szacunków; klucze API w promptach maskowane w logu.
- **0.9.1** — sekcja 6 skilla: podsesje i sprinty (gałąź sprintu, meldunki, scala sesja główna, numery
  przy scalaniu); lekcje kompilacji (testy po jednym, `touch`, bez formatowania całego repo); merge
  pełnym sha; agent projektu o tej samej nazwie wygrywa; tester nie dla programów okienkowych.
- **0.9.0** — agent `sztab:modelarz`; modelarz, animator i montażysta pracują tylko istniejącymi
  narzędziami projektu — czego brakuje, nie tworzą ani nie szukają, tylko zgłaszają `BLOCKED`.
- **0.8.0** — agenci `sztab:animator` i `sztab:montazysta` (Sonnet) z awatarami w panelu; w skillu sekcja
  4a „Filmy animowane”: kto co robi, zasady do zleceń i lista kontrolna orkiestratora (lekcje z
  pierwszej parodii: nietykalny głos, czasy w JSON-ie, napisy, sprawdzanie gotowego mp4).
- **0.7.0** — rzemieślnik na Sonnecie z krokami, bramka Opus przy ryzyku, lekcje z raportów.

## Licencja

MIT — patrz `LICENSE` w głównym katalogu repo.
