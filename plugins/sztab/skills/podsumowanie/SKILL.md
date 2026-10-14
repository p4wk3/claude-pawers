---
name: podsumowanie
description: Podsumowanie na koniec sesji — co zrobione, co zostało, propozycje nowych zadań i przypomnienie w kalendarzu na jutro, na jednym ekranie telefonu. Uruchamiane komendą /podsumowanie; nie używaj go z własnej inicjatywy.
---

# Podsumowanie na koniec sesji

Właściciel kończy pracę i chce wiedzieć, co się stało i co zostało na jutro. Zbierz dane po cichu,
a pokaż wynik, który **mieści się na jednym ekranie telefonu**. Niczego nie twórz ani nie zmieniaj
w trackerze czy kalendarzu bez jego wyraźnego „tak”.

Szczegóły projektu (tracker, prefiks zadań, gałąź robocza) są w `CLAUDE.md` — trzymaj się ich.

## 1. Co zrobione w tej sesji

- Commity i PR-y z tej sesji (`git log`, `gh pr list` — jeśli projekt używa GitHuba).
- Zmiany stanu zadań (tracker albo `.claude/zadania.json`).
- Koszt na zadanie z `.claude/sztab-koszty.json`, jeśli plik jest: `MNG-140 · 14 agentów · ≈$1.20`.

## 2. Co zostało

- Niezacommitowane zmiany i niewypchnięte commity.
- Zadania w toku.
- Worktree i scalone gałęzie do posprzątania (`git worktree list`, `git branch --merged`).
- Rzeczy, które agenci zgłosili jako spoza zadania — zaproponuj z nich nowe zadania. Zakładaj je
  (Linear albo `zadanie.mjs` w `.claude/zadania.json`) **dopiero po „tak”**.

## 3. Przypomnienie na jutro

Zaproponuj jedno wydarzenie w kalendarzu Google na jutro rano:

- tytuł z id zadania na początku: `MNG-140 Dokończyć listę wizyt` (po tym `/raport` je jutro znajdzie);
- w opisie link do zadania i 1–2 zdania, co zrobić.

Twórz je **tylko po wyraźnym „tak”**, narzędziem kalendarza (np. `create_event`). Brak narzędzia
kalendarza — podaj gotowy tekst do skopiowania.

## 4. Notatka przekazania

Jeśli projekt prowadzi notatki przekazania (`CLAUDE.md` wspomina o handoffie), zaproponuj ich
uzupełnienie o to, co zrobione i co zostało. Pisz po „tak”.

## 5. Odpowiedź

Prosty język, krótkie zdania, bez żargonu. Kolejność:

1. **Zrobione** — 2–4 linie.
2. **Zostało** — 1–3 linie.
3. **Propozycje** — najwyżej 2, różne od siebie (np. przypomnienie na jutro i nowe zadanie albo
   sprzątanie), i pytanie: „Zrobić którąś?”.
4. `tl;dr` — jedno zdanie.
