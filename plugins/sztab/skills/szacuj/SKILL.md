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

## 3. Odpowiedź

Prosty język, krótkie zdania. Dla planu (albo każdego wariantu):

1. **Koszt:** `≈$3–4` (zakres, cennik API).
2. **Tokeny i prompty:** `~1 mln tok. · ~5 promptów`.
3. **Podstawa:** z ilu wpisów logu (i którego projektu albo całego logu).
4. **Największe ryzyko kosztu:** np. testy w przeglądarce, przegląd Opusem, workflow.
5. Warianty: jedna linia porównania, który tańszy i o ile.

## 4. Zasady

- **Nigdy godziny, dni ani tygodnie.** Miarą są USD, tokeny i prompty.
- Wynik `--prompty` dotyczy pracy głównej sesji. Planowany **workflow** kosztuje ekstra: pomnóż przez
  liczbę agentów, przyjmując medianę kosztu na prompt jako dolną granicę, i powiedz, że to zgrubne.
- Pusty log — podaj rozmiar w liniach i promptach **bez kwot** i napisz, że log zapełnia się sam
  z każdym promptem.
