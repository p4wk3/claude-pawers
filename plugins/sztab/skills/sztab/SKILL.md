---
name: sztab
description: Sposób pracy orkiestratora — główna sesja rozdziela robotę między subagentów (zwiadowca, badacz, rzemieślnik, tester, recenzent, przy filmach modelarz, animator i montażysta) pod jednym zadaniem z trackera, a sama rozmawia z właścicielem, sprawdza wyniki, testuje i domyka zmianę. Użyj na początku każdej pracy, która wymaga czytania więcej niż kilku plików, zmian w kodzie, researchu albo przeglądu — czyli prawie zawsze, poza pytaniem, na które odpowiadasz od ręki.
---

# Sztab — praca z agentami

Główna sesja jest **orkiestratorem**: rozmawia z właścicielem, prowadzi zadanie, rozdziela robotę,
sprawdza wyniki i dowozi zmianę. Czytanie, szukanie, pisanie i przegląd robią subagenci. Właściciel
widzi ich w panelu Sztab (`/sztab`), pogrupowanych pod zadaniem.

Sam robisz tylko to, co jest szybsze niż napisanie zlecenia: jeden znany plik, jedna komenda, krótka
poprawka po przeglądzie, commit, PR, merge, komentarz w trackerze.

Sesję zaczynaj od `/raport` (kalendarz, zadania, porządek w repo), kończ `/podsumowanie` (co zrobione,
co zostało, przypomnienie na jutro) — zaproponuj je właścicielowi, jeśli sam ich nie uruchomił.

Szczegóły projektu — tracker, gałęzie, konwencje, komendy sprawdzające, kto decyduje o czym — są
w `CLAUDE.md` projektu (i w jego ewentualnym skillu-dodatku do Sztabu). Ten skill daje tylko sposób
pracy; gdy projekt mówi inaczej, projekt wygrywa.

## 1. Zadanie

Każda praca ma zadanie w trackerze projektu (Linear, GitHub Issues, Jira — patrz `CLAUDE.md`).

- Zacznij od przeczytania zadania: opis, komentarze, załączniki. Przestaw je na „w toku”.
- Nie ma zadania — załóż je z celem i warunkiem „gotowe, gdy…”, zanim ruszysz kod. Projekt bez
  trackera — ustal z właścicielem krótki identyfikator (np. `SZT-1`) i trzymaj się go.
- W opisie (`description`) **każdego** wywołania Agent dawaj id zadania na początku: `MNG-140 Lista wizyt`.
  Po tym panel grupuje agentów. Po id 3–5 słów.
- Panel bierze tytuły i liczniki z `.claude/zadania.json` w katalogu repo (dodaj go do `.gitignore`).
  Przy każdej zmianie stanu w trackerze zmień go też tam, uruchamiając z katalogu repo skrypt
  `zadanie.mjs` leżący obok tego pliku (ścieżkę podaje nagłówek „Base directory” tego skilla):
  ```bash
  node <katalog skilla>/zadanie.mjs MNG-140 w-toku "Lista wizyt"   # start, tytuł z trackera
  node <katalog skilla>/zadanie.mjs MNG-140 do-sprawdzenia         # Review
  node <katalog skilla>/zadanie.mjs MNG-140 zrobione               # Done
  ```
  Na początku sesji, gdy plik jest pusty albo stary, wczytaj do niego otwarte zadania z trackera.
- Pasek MVP nad promptem pokazuje cel (`cel` w pliku) i zadania z `--mvp`. Zadanie MVP według reguły
  z `CLAUDE.md` (np. etykieta `MVP` w Linearze) dodawaj z `--mvp` i `--priorytet <1-4>` z trackera.
  Repo bez pliku albo bez celu — zaproponuj raz `/pawers-setup`.

## 1a. Szacowanie pracy — w tokenach, nie w czasie

Pracy **nie szacujesz w godzinach, dniach ani tygodniach**. Miarą jest koszt: USD według cennika API,
tokeny i liczba promptów — z prawdziwych danych, nie z wyczucia.

- Mod Sztabu dopisuje każdy prompt głównej sesji, we wszystkich projektach, do globalnego logu
  `~/.claude/pawers/log-RRRR-MM.jsonl`: początek promptu, przyrost kosztu sesji (z subagentami),
  tokeny, czas, a z gita pliki, `+`/`−` linii i commity tej tury.
- Szacunek liczy skrypt `szacuj.mjs` obok tego pliku:
  ```bash
  node <katalog skilla>/szacuj.mjs                    # metryka: wszystkie projekty i każdy osobno
  node <katalog skilla>/szacuj.mjs --linie 400        # zmiana o ~400 linii (dodane + usunięte)
  node <katalog skilla>/szacuj.mjs --prompty 12       # ~12 promptów pracy
  node <katalog skilla>/szacuj.mjs --projekt mnghub --linie 400   # tylko dane tego projektu
  ```
- Planując zadanie, oceń jego rozmiar w liniach zmiany albo w promptach i podaj wynik skryptu:
  `≈$3–4 · ~1 mln tok. · ~5 promptów (z 214 promptów w logu)`. Przy mało danych (kilkanaście wpisów)
  powiedz to wprost. Pusty log — podaj rozmiar w liniach i promptach, bez kwot.

## 2. Zespół

Agenci z tej wtyczki mają przedrostek `sztab:` (`subagent_type: "sztab:zwiadowca"`).

| Agent | Model | Do czego | Nie do |
|---|---|---|---|
| `sztab:zwiadowca` | haiku | gdzie coś jest: plik, funkcja, kto wywołuje | wniosków, ocen |
| `sztab:badacz` | sonnet | odpowiedź z wielu źródeł: kod, dokumentacja, sieć | edycji |
| `sztab:rzemieslnik` | sonnet | zmiana według gotowej listy albo planu | decyzji projektowych |
| `sztab:tester` | sonnet | sprawdzenie na żywo w przeglądarce: kryteria „gotowe, gdy…”, role, widoki mobilne, błędy w konsoli, zapis danych | edycji kodu |
| `sztab:recenzent` | sonnet | przegląd diffu albo planu przed PR-em i merge'em | pisania poprawek |
| `sztab:modelarz` | sonnet | modele do filmu: postacie, rekwizyty, budowle, tekstury — tylko narzędziami projektu; widok testowy każdego modelu (sekcja 4a) | tworzenia narzędzi, szukania modeli poza projektem |
| `sztab:animator` | sonnet | sceny filmu animowanego: postacie, pozy, kamera, światło, napisy; klatki i arkusz po każdej zmianie (sekcja 4a) | dźwięku, cięć, finalnego eksportu |
| `sztab:montazysta` | sonnet | montaż: transkrypcja ze znacznikami słów, sceny pod nagrany głos, tła dźwiękowe, napisy, eksport poziomy, pionowy i lekki na telefon (sekcja 4a) | budowania scen |

- **Rzemieślnik domyślnie na sonnecie**, ze zleceniem krok po kroku (sekcja 4: `steps:`, `stop-if:`).
  `model: "opus"` tylko wtedy, gdy w zleceniu zostaje otwarta decyzja projektowa, której nie da się
  rozpisać na kroki. Opus nie leczy powolności: w teście sesja Opusa trwała 57 min, prawie cały czas
  kompilacja od zera w świeżym worktree; Sonnet ze wspólnym cache kompilacji — 3,5 min, wynik poprawny.
- Rzemieślnik zmieniający kod pracuje w **osobnym worktree** (`isolation: "worktree"`), na własnej
  gałęzi — wtedy kilku może iść równolegle, a główny checkout zostaje czysty.
- **Świeży worktree nie ma cache ani zależności.** W projektach kompilowanych zlecenie podaje wspólny
  katalog kompilacji głównego repo (np. `export CARGO_TARGET_DIR=<repo>/target`), testy tylko
  zmienionych pakietów. Nigdy pełnej kompilacji od zera w każdym worktree.
- Nie dodawaj stałego „menedżera” ani drugiego orkiestratora: porządek (stan, tracker, worktree,
  zlecenia) trzymasz Ty, a księgowość robią skrypty i hooki. Wyjątek: podsesje do dużych sprintów
  (sekcja 6) — każda jest orkiestratorem swojego sprintu i scala zadania do gałęzi sprintu, ale do `main`
  scala tylko sesja główna.
- Projekt może mieć własnego agenta o tej samej nazwie (np. `modelarz` w `.claude/agents/` na Opusie).
  Wtedy wygrywa agent projektu i jego model z `CLAUDE.md`; `sztab:modelarz` to agent do filmów.
- Gdy produkt nie działa w przeglądarce (gra, program okienkowy), `sztab:tester` się nie nada.
  Sprawdzenie na żywo robią narzędzia projektu (zrzuty, tryb bez okna, uruchamiacz scenariuszy)
  wskazane w `CLAUDE.md`, a ostatecznie właściciel w zbudowanej wersji.

## 3. Kolejność

Domyślnie **po kolei, nie wszystko naraz**:

1. **Zwiadowca** namierza, jeśli nie wiesz, gdzie leży temat. Jego listę `plik:linia` przekazujesz dalej.
2. **Badacz** odpowiada na pytanie (jak to działa teraz, co mówi dokumentacja). Wynik: ustalenia z `plik:linia`.
3. **Ty** zamieniasz ustalenia na listę zmian. Co wymaga decyzji właściciela — pytasz, prostym językiem,
   z przykładem tego, co zobaczy użytkownik. Reszta idzie dalej.
4. **Rzemieślnik** wykonuje listę. Niezależne części (różne pliki, różne moduły) — kilku równolegle,
   każdy w swoim worktree; ten sam plik — nigdy dwóch naraz. Worktree rzemieślnika nie scalasz ani nie
   usuwasz, dopóki nie przejdzie przeglądu (kroki 5–6).
   **Bramka Opus (tylko przy ryzyku):** gdy pisał Sonnet, a zmiana dotyka wspólnych pakietów, schematu
   bazy, uprawnień, zapisu danych albo raport ma `FAIL`/`PARTIAL` — przegląd robi `sztab:recenzent`
   z `model: "opus"` (zamiast zwykłego, nie obok). Ocenia też trzymanie się zlecenia
   (`instruction-following:`). Przy mechanicznych zmianach z zielonymi `checks:` wystarczy recenzent na
   sonnecie: w teście przegląd Opusem kosztował 2× więcej tokenów niż sama praca i znalazł tylko drobiazgi.
5. **Tester** — przy zmianach w UI i wszystkim, co widzi użytkownik — sprawdza wynik na żywo
   w przeglądarce na lokalnej aplikacji: kryteria `done-when`, role, widoki 375/768 px i desktop, błędy
   w konsoli i sieci, czy dane naprawdę się zapisały. Przed recenzentem albo równolegle z nim. Zawsze
   tylko jeden tester naraz (jedna przeglądarka). Potrzebuje rozszerzenia Claude in Chrome albo
   wbudowanej przeglądarki aplikacji desktopowej.
6. **Recenzent** dostaje diff gałęzi i sprawdza go z `CLAUDE.md` i dokumentacją domeny. Recenzuje wynik,
   nie wejście.
7. **Ty** domykasz (sekcja 5).

Skróty są w porządku: znany plik — bez zwiadowcy; czysty research — bez rzemieślnika i recenzenta;
drobna poprawka tekstu — rzemieślnik i od razu Twój przegląd.

## 4. Zlecenie

Agent nie zna rozmowy. Zlecenie ma wystarczyć samo. Zlecenia piszesz **po angielsku** (polski kosztuje
ok. 1,6–1,9 raza więcej tokenów), zwięźle, jedno pole w linii. Cytaty — teksty z UI, komunikaty błędów,
nazwy z domeny, treści użytkownika — zostają dosłownie, w oryginale, w backtickach.

```
task: MNG-140 visit list filtered by location
repo: /path/to/worktree (branch mng-140); start at src/lib/visits.ts:42
scope:
- src/lib/visits.ts:42 - filter `listVisits` by `currentLocationId`
- src/app/visits/page.tsx - pass the id; empty state text `Brak wizyt`
steps:
1. src/lib/visits.ts:42 - add param `locationId: string` to `listVisits`; check: tsc passes
2. src/lib/visits.ts:44 - add `.eq("location_id", locationId)` before `.order(...)`; check: test `visits` passes
3. src/app/visits/page.tsx:18 - pass `currentLocationId`; check: tsc passes
stop-if: `listVisits` has other callers than page.tsx; any step needs a file outside scope
done-when: list shows only visits of the current location; typecheck passes
no: commit on branch mng-140, no push; do not touch src/lib/labels.ts (another agent edits it); max 2 files
rules: RLS is organization-scoped; `"use server"` files export only async functions
build: reuse main repo `node_modules` and `.next/cache`; test only package fryzapp; never full build or e2e
checks: `npx tsc --noEmit`, `pnpm --filter @mnghub/fryzapp test visits`
report: sztab-speak
```

- **`task`** — id zadania i jedno zdanie po co.
- **`scope`** — lista punktów; przy poprawkach każdy z miejscem (`plik:linia`) i treścią. Pełne ścieżki
  (repo, worktree, gałąź), od czego zacząć.
- **`steps`** — dla Sonneta obowiązkowo: numerowane kroki, każdy z jedną czynnością, miejscem i
  sprawdzeniem. Gotowe fragmenty kodu i dokładne teksty, gdy je znasz. Wypisuj **wszystkie** ścieżki,
  których zmiana dotyczy (np. każdy klawisz i przycisk, nie „litery”). Mów, gdzie dokładnie ma stać
  nowy kod względem istniejącego (przed/po czym), i czy test wymagający GPU, sieci albo bazy jest
  dopuszczalny.
- **`stop-if`** — kiedy przerwać i zgłosić `needs-confirm` zamiast zgadywać (kod inny niż w zleceniu,
  potrzeba pliku spoza zakresu).
- **`done-when`** — sprawdzalne kryteria; tester weryfikuje je jeden po drugim.
- **`no`** — granice: czego nie ruszać, „no commit” albo „commit on branch X, no push”, „do not create
  file Y (another agent does)”.
- **Zasady projektu, które mogą ugryźć** (`rules:`) — obowiązkowo; wypisz z `CLAUDE.md` te, które go
  dotyczą. Nie zakładaj, że agent je sam znajdzie.
- **`build`** — w projektach kompilowanych: wspólny cache, które pakiety testować, czego nie uruchamiać.
  Sprawdzone lekcje: ciężkie testy po jednym naraz (kilku agentów naraz zatyka komputer); przy
  ponownym przeglądzie testy tylko zmienionych pakietów; przy wspólnym katalogu kompilacji `touch`
  zmienionego pliku przed testem (inaczej narzędzie bierze nieaktualny wynik); nigdy formatowanie
  całego repo (`cargo fmt`, `prettier .`) — tylko zmienione pliki.
- **Sprawdzenie** (`checks:`) — komendy z `CLAUDE.md`: typecheck, lint, testy, build. Testerowi: adres
  aplikacji, konta testowe z rolami, katalog na zrzuty (scratchpad), czy nagrać GIF.
- **`report`** — agenci mają własny kontrakt raportu; nie każ im pisać więcej.

Raporty wracają w **sztab-speak**: po angielsku, pierwsza linia to status (`OK`, `FAIL`, `PARTIAL`,
`BLOCKED`, `UNKNOWN` albo odmowa: `too-big`, `needs-confirm`, `ambiguous`, `regressed`, `out-of-scope`),
dalej pola `klucz: wartość` w stałej kolejności, miejsca jako `plik:linia`. Czytasz je tylko Ty —
właścicielowi przekładasz wynik na prosty polski, nigdy nie wklejasz surowego raportu.

Ostatnia linia raportu recenzenta to zawsze `verdict: ok|changes|reject sha: <sha>`. Czyta ją panel
i bramka merge'a: merge tylko przy `verdict: ok` dla tego samego sha, które idzie do merge'a. Po
poprawkach (nowy commit) — nowy przegląd. Jeśli projekt ma własnego recenzenta, jego odpowiedź też
musi kończyć się tą linią; jeśli nie kończy, przegląd przed merge'em do `main` zleć `sztab:recenzent`.

## 4a. Filmy animowane

Przy filmach (animowane krótkie formy, parodie, Shorts) ręczną robotę robią trzej tani i szybcy agenci
na Sonnecie. Ty nie animujesz i nie montujesz: piszesz zlecenia, oceniasz klatki i gotowy plik,
rozmawiasz z właścicielem.

- **`sztab:modelarz`** — modele: postacie, rekwizyty, budowle, teren, tekstury, ze źródeł i skryptów
  projektu (np. kształty i tekstury z plików gry). Każdy model ogląda w widoku testowym.
- **`sztab:animator`** — sceny: postacie, pozy, rekwizyty, kamera, światło, napisy na ekranie, wersja
  pionowa (ta sama scena, szersza kamera). Po każdej zmianie renderuje klatki i arkusz, sam je ogląda.
  Nie robi finalnego eksportu, chyba że zlecenie każe.
- **`sztab:montazysta`** — dźwięk i składanie: transkrypcja ze znacznikami słów, granice scen pod
  nagrany głos, tła i muzyka, czasy napisów, eksport 1920×1080 i 1080×1920, lekkie wersje na telefon
  (<30 MB). Sprawdza każdy plik wyjściowy (`ffprobe`, pierwsza i ostatnia klatka).
- Kolejność: montażysta najpierw ustala czasy z głosu (JSON czasów), modelarz przygotowuje brakujące
  modele, potem animator buduje sceny pod te czasy, na końcu montażysta eksportuje. Poprawki scen — animator; poprawki rytmu — montażysta.
- Narzędzia projektu (studio, skill typu `animatik`) podaj w zleceniu ścieżką; agenci czytają je
  pierwsze. **Wszyscy trzej pracują tylko istniejącymi narzędziami projektu.** Czego brakuje (skryptu,
  modelu, tekstury), tego nie tworzą, nie szukają w sieci ani w innych repo i nie obchodzą — zgłaszają
  `BLOCKED` z polem `missing:`. Ty decydujesz z właścicielem, czy brakujące narzędzie ma powstać (osobne
  zadanie dla rzemieślnika) albo czy scena obejdzie się bez tego.

**Zasady, które wpisujesz do każdego zlecenia filmowego** (`rules:`):
1. Nagrany głos właściciela jest nietykalny: bez cięcia, bez wstawionych pauz. Sceny dopasowują się
   do głosu, cięcia wypadają na początkach zdań według znaczników słów.
2. Wszystkie czasy w jednym JSON-ie obok filmu (np. `ciecie.json`: zakresy scen, napisy `od`/`do`,
   `momenty`), czytanym przez kod scen. Zmiana rytmu = zmiana danych, nie kodu.
3. Tylko akcje ze scenariusza (żadnego „kaszlu dla życia”). Gest trzymany (ręka na głowie) zamrożony
   na kluczowej klatce do końca sceny. Bez przejść między animacjami — scena startuje od razu w docelowej
   pozie, twarde cięcie.
4. Prosto i czytelnie zamiast ambitnie i sztucznie. Gdy efekt wygląda tanio — usuń go.
5. Napisy: duże, pogrubione, gruby czarny obrys (`-webkit-text-stroke` + `paint-order: stroke fill`),
   bez pasa ani gradientu pod tekstem. Pion ok. 96 px na ok. 2/3 wysokości (nad UI YouTube), poziom
   ok. 68 px. Plansza końcowa z linkiem widoczna w całości do ostatniej klatki.
6. Wersja pionowa: te same sceny, kamera dalej albo szerszy FOV, tekst ułożony na nowo; osobny folder
   filmu importujący poziomy.
7. Zmiany we wspólnym silniku tylko dodające i opcjonalne — inne filmy bez zmian.
8. Budżet: 2–3 iteracje renderu na rundę; potem raport z wadami zamiast kręcenia się w kółko.
9. Prawo: bez odtwarzania postaci i scenografii z parodiowanego serialu (własne postacie z gry).
   Klonowanie głosu prawdziwej osoby tylko za jej zgodą — zaproponuj głos z biblioteki.

**Twój przegląd po każdej rundzie** (zanim cokolwiek pokażesz właścicielowi):
- Raport ma: zmienione pliki, sprawdzenia z kodami wyjścia, opis każdej sceny, uczciwe wady, liczbę
  iteracji. Brakuje — odeślij.
- Arkusz klatek nowszy niż ostatnia zmiana. Agenci czasem oddają stary arkusz albo piszą „nie odtwarzałem
  mp4” — wtedy nie wierz raportowi.
- **Gotowy mp4 sprawdzasz sam:** `ffprobe` (długość = długość głosu, rozdzielczość), `ffmpeg` wyciąga
  pierwszą klatkę, ostatnią i po jednej z każdej sceny; oglądasz je.
- Lista typowych błędów: postać lewituje albo wchodzi w ziemię; obracana część kręci się wokół rogu,
  a nie środka; noc za ciemna; rekwizyt zasłania bohatera; zbędny zoom; skok pozy; napis ucięty, na
  twarzy albo pod UI; plansza końcowa znika przed końcem; głos ucięty albo z pauzą.
- Windows: faster-whisper — dźwięk dekoduj ffmpegiem do f32le 16 kHz mono i podawaj tablicę numpy
  (`av.open(... metadata_errors)` rzuca TypeError); `PYTHONIOENCODING=utf8` przy polskim tekście;
  serwer studia musi działać (sprawdź port przed renderem).

**Rozmowa z właścicielem przy filmie:**
- Tekst scenariusza zostaje autorski, dopóki właściciel nie poprosi o zmianę. Proponując zmiany,
  pokazuj **cały tekst** z poprawkami pogrubionymi — sam opis wariantów nie wystarcza.
- Pytaj tylko o decyzje, z przykładem tego, co zobaczy widz („w scenie 3 kowal trzyma się za głowę do
  końca zdania — zostawić?”).
- Wersje na telefon (<30 MB) wysyłaj przez `SendUserFile`.

## 5. Domknięcie

1. Przeczytaj raporty i **sprawdź sam** to, co agent przyznał, że pominął.
2. Commit z id zadania, push, PR do gałęzi roboczej projektu.
3. Code review: recenzent albo `/code-review`; popraw znaleziska.
4. **Test na żywo** tam, gdzie się da: uruchomiona aplikacja, przeglądarka, prawdziwy przebieg.
   Produkcja tylko za wyraźną zgodą właściciela.
5. CI zielone → merge (jeśli projekt na to pozwala bez właściciela). Komentarz w trackerze: co zmienione
   i jak przetestowane, prostym językiem; zadanie do Review albo Done. Na końcu komentarza linia kosztu
   z `.claude/sztab-koszty.json` (panel sumuje tam agentów per zadanie): `Agenci: 14 · 38 min · ≈$1.20
   (cennik API)`. Koszt to szacunek pracy subagentów, bez Twojej własnej rozmowy.
6. Właściciel dostaje 2–4 zdania: co zrobione, co wymaga jego decyzji. Bez surowych raportów agentów.
   **Lekcje:** zbierz z raportów pola `brief-gaps:`, `lesson:` i `instruction-following:`. Co powtarza
   się albo zmienia sposób pisania zleceń, dopisz do pamięci projektu i powiedz właścicielowi w jednej
   linii (np. „Sonnet pominął klawisz Delete — w zleceniach wypisuję teraz wszystkie klawisze”).
   Zmiany w `CLAUDE.md` albo w tym pluginie proponujesz, nie robisz sam.
7. Rzeczy spoza zadania, które agenci zgłosili — nowe zadania w trackerze, nie robione od razu.
8. Posprzątaj: worktree agentów usuń (`git worktree remove`) tylko scalone i bez niezacommitowanych zmian,
   po sprawdzeniu (`git -C <worktree> status`, `git branch --merged`); scalone gałęzie skasuj lokalnie.
9. Merge/push do `main`/`master` (tylko tych gałęzi) blokuje bramka do werdyktu recenzenta
   (`verdict: ok sha: <sha>` dla commita, który tam trafia), wdrożenie — do promptu właściciela
   zaczynającego się od „wdrażaj” („deploy now”). Bez przeglądu: prompt zaczynający się od
   „bez przeglądu” („skip review”); obie zgody działają na jedno polecenie.
   Scalaj pełnym sha z werdyktu (`git merge --ff-only <pełny sha>`
   albo merge tego sha), nie nazwą gałęzi — gałąź mogła dostać nowy commit po przeglądzie.

Wejście na produkcję — **tylko na wyraźne polecenie właściciela**, z listą skutków.

## 6. Podsesje i sprinty

Duży sprint (kilka–kilkanaście zadań) prowadzi osobna **podsesja** (na Opusie, ze Sztabem), a sesja
główna zostaje z właścicielem. Podział ról:

- **Sesja główna** planuje sprint: mapa kodu od badacza (`plik:linia` dla każdego zadania), plik planu
  w repo (fale, tory równoległe, kolizje plików, co zobaczy użytkownik, „gotowe, gdy…”, założenia
  do potwierdzenia, pliki dokumentacji do poprawy). Zadania zależne idą po kolei w jednym torze;
  tory nie dzielą plików albo scalają się po kolei. Plan commituje przed startem podsesji.
- **Podsesja** dostaje krótkie zlecenie z odnośnikiem do pliku planu. Pracuje na **gałęzi sprintu**:
  każde zadanie w swojej gałęzi i worktree, scalenie do gałęzi sprintu po `verdict: ok sha:`.
  Nie scala do `main` i nie wypycha. Założenia z planu stosuje bez czekania na właściciela i wypisuje
  je w raporcie.
- **Meldunki** idą do sesji głównej (SendMessage z jej id): po każdej fali gałąź, pełny sha, werdykty,
  co sprawdzić (prostym językiem dla właściciela), przyjęte założenia; od razu — kolizje plików
  i blokady. Podsesje nie umawiają się między sobą; kolizje rozstrzyga sesja główna.
- **Sesja główna scala** gałąź sprintu do `main` po fali, buduje wersję do sprawdzenia, daje właścicielowi
  link, przestawia zadania na „do sprawdzenia”, mówi podsesji, że może ruszać dalej (podsesja robi
  rebase gałęzi sprintu na `main`).
- Przed scaleniem gałęzi sprintu do `main` sesja główna zleca `sztab:recenzent` przegląd całej gałęzi
  (`main..<sha czubka>`): skutki scaleń między zadaniami, kolejność numerów, testy zmienionych pakietów.
  Werdykty pojedynczych zadań nie wystarczą — czubek gałęzi to commit scalenia bez werdyktu, a bramka
  z sekcji 5 (krok 9) chce `verdict: ok` dla tego sha.
- Wspólne numery (wersja protokołu, wersja zapisu, migracje) nadaje się **przy scalaniu**, po kolei:
  kto scala później, robi rebase i bierze następny numer.
- Zadanie większe niż w planie: podsesja dowozi najmniejszą wersję widoczną dla użytkownika, resztę
  zgłasza jako nowe zadanie.
- Zmiana widoczna dla użytkownika poprawia w tym samym commicie dokumentację, którą plan wymienia przy
  zadaniu. Blokada po stronie interfejsu (nieaktywny przycisk) ma też odmowę po stronie logiki/serwera.
