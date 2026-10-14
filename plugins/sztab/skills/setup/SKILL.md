---
name: setup
description: Konfiguracja Sztabu w bieżącym repo — źródło zadań (Linear albo lokalny plik JSON), cel MVP do paska nad promptem, wpis w CLAUDE.md i .gitignore. Uruchamiana komendą /pawers-setup; nie używaj jej z własnej inicjatywy.
---

# Konfiguracja Sztabu

Prowadzisz człowieka przez konfigurację w tym repo. Pytaj po jednej rzeczy naraz, krótko, z propozycją
domyślnej odpowiedzi. Niczego nie zapisuj, zanim nie pokażesz podsumowania i nie dostaniesz „tak”.

Panel `/sztab` i pasek MVP czytają **jeden plik**: `.claude/zadania.json` w katalogu repo. Bez niego
panel pokazuje tylko agentów i kontekst, a paska nie ma. Plik zasila albo tracker (Linear), albo
człowiek ręcznie — innego źródła nie ma. Powiedz to wprost na początku.

Skrypt do pliku: `zadanie.mjs` w folderze skilla `sztab` (obok tego skilla: `../sztab/zadanie.mjs`
względem „Base directory” tego skilla). Uruchamiaj go zawsze z katalogu repo.

## 1. Stan

Sprawdź po cichu, zanim zapytasz:
- `node --version` — skrypt potrzebuje Node.js 18+. Brak Node'a: powiedz, że panel i pasek zadziałają
  dopiero po jego instalacji (nodejs.org), i zakończ, chyba że człowiek chce wpisać plik ręcznie;
- czy jest `.claude/zadania.json` albo `zadania/zadania.json` — jeśli tak, pokaż, co w nim jest. Panel
  i skrypt używają `zadania/zadania.json`, gdy istnieje; wtedy konfiguruj **ten** plik;
- czy `CLAUDE.md` już wspomina Sztab;
- czy masz narzędzia Linear MCP (np. `list_issues`, `get_issue`) — od tego zależy pytanie 2.

## 2. Źródło zadań

Zapytaj, skąd mają być zadania:

- **Linear** — tylko gdy narzędzia Linear MCP działają w tej sesji. Ustal zespół i prefiks (`MNG`), i jak
  rozpoznać zadania MVP: domyślnie **etykieta `MVP`**; alternatywy: milestone albo projekt o danej nazwie.
  Brak Linear MCP, a człowiek go chce — powiedz, że najpierw trzeba podłączyć connector Linear
  (claude.ai → ustawienia → connectors, albo `/mcp`), i zaproponuj na razie plik.
- **Plik JSON** — zadania prowadzi człowiek albo orkiestrator, bez trackera. Ustal krótki prefiks
  (2–4 wielkie litery, np. `APP`).

## 3. Cel MVP

Zapytaj o nazwę celu (np. „MVP fryz.app”) i opcjonalny termin (`RRRR-MM-DD`). Brak celu = brak paska;
to też poprawna odpowiedź.

## 4. Podsumowanie i zapis

Pokaż, co zrobisz, i poczekaj na „tak”. Potem:

1. `.gitignore` repo: dopisz `.claude/zadania.json`, `.claude/sztab-koszty.json` i `.claude/sztab-przeglady.json`,
   jeśli ich nie ma.
2. Cel: `node <zadanie.mjs> cel "<nazwa>" [termin]`.
3. Zadania:
   - Linear: pobierz otwarte zadania zespołu (Todo, In Progress, Review) i dla każdego
     `node <zadanie.mjs> <ID> <stan> "<tytuł>" [--mvp] --priorytet <0-4>`; `--mvp`, gdy pasuje do reguły
     z kroku 2. Stany: Todo/Backlog → `do-zrobienia`, In Progress → `w-toku`, In Review → `do-sprawdzenia`.
     Do tego **wszystkie zamknięte zadania MVP** (Done) jako `zrobione --mvp` — bez nich pasek liczyłby
     postęp od zera. Tytuł zaczynający się od `--` podaj po samym `--`: `… w-toku -- "--hotfix"`.
   - Plik: zapytaj, czy człowiek chce od razu wpisać kilka zadań MVP; dodaj je skryptem z `--mvp`.
     Bez żadnego zadania MVP pasek pokaże tylko cel i podpowiedź, jak je oznaczyć.
4. `CLAUDE.md` repo: dopisz krótką sekcję (albo zaktualizuj istniejącą):
   ```markdown
   ## Sztab
   Pracuj jako orkiestrator według skilla `sztab:sztab`.
   - Zadania: <Linear, zespół X, prefiks X-n | plik .claude/zadania.json, prefiks X-n>.
   - MVP: <etykieta MVP | milestone … | oznaczane ręcznie>; cel „<nazwa>”<, termin RRRR-MM-DD>.
   ```
5. Pokaż wynik `node <zadanie.mjs>` w skrócie (liczby, cel) i powiedz, że pasek pojawi się nad promptem
   po następnej odpowiedzi, a panel otwiera `/sztab`.
