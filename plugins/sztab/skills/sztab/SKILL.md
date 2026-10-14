---
name: sztab
description: Sposób pracy orkiestratora — główna sesja rozdziela robotę między subagentów (zwiadowca, badacz, rzemieślnik, recenzent) pod jednym zadaniem z trackera, a sama rozmawia z właścicielem, sprawdza wyniki, testuje i domyka zmianę. Użyj na początku każdej pracy, która wymaga czytania więcej niż kilku plików, zmian w kodzie, researchu albo przeglądu — czyli prawie zawsze, poza pytaniem, na które odpowiadasz od ręki.
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

## 2. Zespół

Agenci z tej wtyczki mają przedrostek `sztab:` (`subagent_type: "sztab:zwiadowca"`).

| Agent | Model | Do czego | Nie do |
|---|---|---|---|
| `sztab:zwiadowca` | haiku | gdzie coś jest: plik, funkcja, kto wywołuje | wniosków, ocen |
| `sztab:badacz` | sonnet | odpowiedź z wielu źródeł: kod, dokumentacja, sieć | edycji |
| `sztab:rzemieslnik` | sonnet | zmiana według gotowej listy albo planu | decyzji projektowych |
| `sztab:recenzent` | sonnet | przegląd diffu albo planu przed PR-em i merge'em | pisania poprawek |

- Kod wymagający projektowania (nowy moduł, schemat bazy, uprawnienia, wspólne pakiety) — rzemieślnik
  z `model: "opus"`. Mechaniczne rzeczy (testy według instrukcji, teksty, dokumentacja z listy) —
  sonnet albo haiku.
- Rzemieślnik zmieniający kod pracuje w **osobnym worktree** (`isolation: "worktree"`), na własnej
  gałęzi — wtedy kilku może iść równolegle, a główny checkout zostaje czysty.

## 3. Kolejność

Domyślnie **po kolei, nie wszystko naraz**:

1. **Zwiadowca** namierza, jeśli nie wiesz, gdzie leży temat. Jego listę `plik:linia` przekazujesz dalej.
2. **Badacz** odpowiada na pytanie (jak to działa teraz, co mówi dokumentacja). Wynik: ustalenia z `plik:linia`.
3. **Ty** zamieniasz ustalenia na listę zmian. Co wymaga decyzji właściciela — pytasz, prostym językiem,
   z przykładem tego, co zobaczy użytkownik. Reszta idzie dalej.
4. **Rzemieślnik** wykonuje listę. Niezależne części (różne pliki, różne moduły) — kilku równolegle,
   każdy w swoim worktree; ten sam plik — nigdy dwóch naraz.
5. **Recenzent** dostaje diff gałęzi i sprawdza go z `CLAUDE.md` i dokumentacją domeny. Recenzuje wynik,
   nie wejście.
6. **Ty** domykasz (sekcja 5).

Skróty są w porządku: znany plik — bez zwiadowcy; czysty research — bez rzemieślnika i recenzenta;
drobna poprawka tekstu — rzemieślnik i od razu Twój przegląd.

## 4. Zlecenie

Agent nie zna rozmowy. Zlecenie ma wystarczyć samo:

- **Repo i pliki** — pełne ścieżki, od czego zacząć.
- **Cel** — jedno zdanie po co, z id zadania.
- **Co dokładnie** — lista punktów; przy poprawkach każdy z miejscem (`plik:linia`) i treścią.
- **Zasady projektu, które go dotyczą** — wypisz z `CLAUDE.md` te, które mogą go ugryźć. Nie zakładaj,
  że agent je sam znajdzie.
- **Granice** — czego nie ruszać, „nie commituj” albo „commituj na gałęzi X, nie pushuj”, „nie twórz
  pliku Y (robi go inny agent)”.
- **Sprawdzenie** — czym zweryfikować: typecheck, lint, testy, build — komendy z `CLAUDE.md`.
- **Raport** — agenci mają własny format; nie każ im pisać więcej.

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
7. Rzeczy spoza zadania, które agenci zgłosili — nowe zadania w trackerze, nie robione od razu.
8. Posprzątaj: worktree agentów po merge'u usuń (`git worktree remove`), scalone gałęzie skasuj lokalnie.

Wejście na produkcję — **tylko na wyraźne polecenie właściciela**, z listą skutków.
