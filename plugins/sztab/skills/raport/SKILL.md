---
name: raport
description: Raport na start sesji — kalendarz (wczoraj i dziś), otwarte zadania, porządek w repo i propozycja pierwszego zadania, na jednym ekranie telefonu. Uruchamiany komendą /raport; nie używaj go z własnej inicjatywy.
---

# Raport na start sesji

Właściciel zaczyna dzień i chce w minutę wiedzieć, co jest pilne i od czego zacząć. Zbierz dane po
cichu, a pokaż wynik, który **mieści się na jednym ekranie telefonu**. Niczego nie zmieniaj bez jego „tak”.

Szczegóły projektu (tracker, prefiks zadań, gałąź robocza) są w `CLAUDE.md` — trzymaj się ich.

## 1. Kalendarz

Jeśli masz narzędzia kalendarza Google (np. `list_events`, `search_events`), przeczytaj wydarzenia
z wczoraj i z dziś.

- Wyłap pilne i przypomnienia — zwłaszcza te z `/podsumowanie`: mają id zadania w tytule (`MNG-140 …`).
- Przy każdym takim sprawdź w zadaniach i w gicie (commity, PR-y), czy rzecz jest już zrobiona.
  Zrobione — napisz krótko „zrobione”. Niezrobione — to kandydat na pierwsze zadanie.
- Brak narzędzi kalendarza — pomiń sekcję bez komentarza.

## 2. Zadania

- Linear podłączony (narzędzia MCP Lineara) — pobierz zadania w toku, w Review i pilne do zrobienia.
- Inaczej — przeczytaj `.claude/zadania.json` (stany `w-toku`, `do-sprawdzenia`, `do-zrobienia`).
- Nic z tego — napisz jednym zdaniem, że nie ma źródła zadań, i zaproponuj `/pawers-setup`.

Pokaż najwyżej 3–4 zadania: id, tytuł, stan.

## 3. Porządek w repo

Sprawdź po cichu:

- `git status` — niezacommitowane zmiany;
- `git log @{u}..` — commity niewypchnięte (gałąź bez upstreamu też się liczy);
- bieżąca gałąź — czy stara (ostatni commit dawno) albo już scalona;
- `git worktree list` — pozostałe worktree agentów;
- `git branch --merged <gałąź robocza>` — lokalne gałęzie już scalone.

Wszystko czyste — jedno zdanie „repo czyste”. Jest bałagan — zaproponuj sprzątanie **jako jeden krok
do potwierdzenia** (lista: co usuniesz). Zasady:

- nic nie kasujesz bez „tak” właściciela;
- nigdy nie wyrzucasz niezacommitowanej pracy — taką najwyżej zgłaszasz albo proponujesz commit;
- worktree z niezacommitowanymi zmianami nie ruszasz.

## 4. Odpowiedź

Prosty język, krótkie zdania, bez żargonu. Kolejność:

1. **Kalendarz** — 1–2 linie (tylko gdy coś jest).
2. **Zadania** — 3–4 linie.
3. **Repo** — 1 linia albo propozycja sprzątania.
4. **Proponuję zacząć od:** jedno zadanie z jednym zdaniem dlaczego, i pytanie: „Zaczynamy?”.
5. `tl;dr` jako cytat: `> **tl;dr**` i jedno zdanie w linii `> …`.
