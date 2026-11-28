---
name: szacuj
description: Szacunek kosztu planowanej implementacji (USD, tokeny, prompty) z metryk globalnego logu promptów. Uruchamiany komendą /szacuj albo gdy właściciel pyta, ile coś będzie kosztować; to też skill do wczytania, gdy właściciel przyjmie zaproponowane sprawdzenie kosztu względem metryk.
---

# Szacunek kosztu implementacji

Właściciel planuje pracę i chce wiedzieć, ile będzie kosztować — według prawdziwych metryk z logu, nie
z wyczucia. Wynik ma **mieścić się na jednym ekranie telefonu**. Niczego nie zmieniaj w repo.

## 1. Zakres

Z planu albo zadania (z rozmowy; brak planu — zapytaj o cel jednym zdaniem) wypisz zmiany per plik
i oszacuj linie zmiany (dodane + usunięte) oraz liczbę promptów pracy. Podaj **przedział**, nie jedną liczbę.

## 2. Metryki

Skrypt leży w skillu `sztab` (obok tego skilla), uruchom go z katalogu repo:

```bash
node <katalog tego skilla>/../sztab/szacuj.mjs --linie N --projekt <nazwa repo>
node <katalog tego skilla>/../sztab/szacuj.mjs --linie N      # cały log, wszystkie projekty
```

- `--prompty N` zamiast `--linie`, gdy łatwiej ocenić rozmiar w promptach; `--json`, gdy trzeba
  przeliczyć albo porównać warianty.
- Projekt ma mniej niż ~20 wpisów w logu — użyj całego logu i powiedz to wprost.
- Plan z wariantami — policz każdy wariant osobno.
- Zadanie ma id w trackerze (`MNG-140`) — zapisz wybrany wariant przy nim, dopisując
  `--zapisz MNG-140` (razem z `--projekt <nazwa repo>`, żeby id z innych repo się nie mieszały). Przy domknięciu orkiestrator porówna go z faktycznym kosztem (`--zamknij`).
- Wynik ma linię „Po kalibracji” (gdy są co najmniej 3 zamknięte zadania z szacunkiem) — podawaj ją
  jako główną liczbę: to szacunek poprawiony o to, ile dotąd faktycznie kosztowały zadania wobec szacunków.

## 3. Odpowiedź

Prosty język, krótkie zdania. Dla planu (albo każdego wariantu):

1. **Koszt:** `≈$3–4` (zakres, cennik API; po kalibracji, jeśli jest).
2. **Tokeny i prompty:** `~1 mln tok. · ~5 promptów`.
3. **Podstawa:** z ilu wpisów logu (i którego projektu albo całego logu), czy z kalibracją.
4. **Największe ryzyko kosztu:** np. testy w przeglądarce, przegląd Opusem, workflow.
5. Warianty: jedna linia porównania, który tańszy i o ile.

## 4. Zasady

- **Nigdy godziny, dni ani tygodnie.** Miarą są USD, tokeny i prompty.
- Wynik `--prompty` dotyczy pracy głównej sesji. Planowany **workflow** kosztuje ekstra: pomnóż przez
  liczbę agentów, przyjmując medianę kosztu na prompt jako dolną granicę, i powiedz, że to zgrubne.
- Pusty log — podaj rozmiar w liniach i promptach **bez kwot** i napisz, że log zapełnia się sam
  z każdym promptem.
