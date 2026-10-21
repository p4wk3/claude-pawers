---
name: mcp-per-workspace
description: Podpięcie serwera MCP (Linear, Notion, Supabase, Sentry…) per repo do konkretnego workspace'u, gdy ten sam serwis ma w różnych repo różne workspace'y. Użyj, gdy człowiek mówi „Linear ma być pod workspace X w tym repo”, narzędzia MCP widzą zły workspace, serwer trzeba autoryzować osobno przez /mcp albo wpiąć kluczem API z .env.
---

# Serwer MCP per repo, per workspace

Problem: serwis SaaS (Linear, Notion, Supabase…) ma jeden serwer MCP, a logowanie OAuth wiąże token
z **jednym** workspace'em wybranym w oknie logowania. Gdy repo A pracuje w workspace `mnghub`, a repo B
w `infra-pawke`, jeden wspólny wpis `linear` w konfiguracji użytkownika zawsze pokazuje zły workspace
w którymś z nich.

Rozwiązanie: **osobna nazwa serwera na każdy workspace, zapisana w repo**. Claude Code trzyma token
OAuth per nazwa serwera, więc `linear-mnghub` i `linear-infra` logują się niezależnie i każde repo
dostaje swój workspace. Nazwa to `<serwis>-<workspace>` — krótko, małymi literami.

## 1. Stan przed zmianą

Sprawdź po cichu:

- `.mcp.json` w katalogu repo — co już tam jest;
- wpisy projektu i użytkownika w `~/.claude.json`:
  ```bash
  python3 -c "
  import json,os;d=json.load(open(os.path.expanduser('~/.claude.json')))
  print('user:',list(d.get('mcpServers',{})))
  p=d.get('projects',{}).get(os.getcwd(),{});print('projekt:',list(p.get('mcpServers',{})))"
  ```
- jak to zrobiono w sąsiednich repo tego samego człowieka (np. `~/Projects/*/.mcp.json`) — trzymaj
  się istniejącej konwencji nazw;
- czy `.mcp.json` jest w `.gitignore` repo (`git check-ignore .mcp.json`). Wpis OAuth nie zawiera
  sekretów, więc może być śledzony; wtedy dostaną go wszyscy klonujący repo.

Jeden serwis pod **dwiema** nazwami w jednej sesji (np. stary `linear` + nowy `linear-mnghub`) to
dwa zestawy identycznych narzędzi — usuń stary wpis, zanim dodasz nowy.

## 2. Wariant A — OAuth (domyślny)

Dopisz do `.mcp.json` repo (scal z istniejącą treścią, nie nadpisuj):

```json
{
  "mcpServers": {
    "linear-mnghub": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp"
    }
  }
}
```

To samo z CLI: `claude mcp add --transport http --scope project linear-mnghub https://mcp.linear.app/mcp`.

Usuń stary wpis o ogólnej nazwie z `~/.claude.json` (zrób kopię pliku) albo `claude mcp remove linear`.

Potem człowiek musi sam:
1. zrestartować sesję — serwery MCP ładują się na starcie;
2. wpisać `/mcp`, wybrać nowy serwer i w oknie logowania serwisu wskazać właściwy workspace.

Ty nie uruchomisz OAuth za niego. Powiedz to wprost, jednym zdaniem, i zakończ turę.

## 3. Wariant B — klucz API z `.env` (gdy OAuth nie pasuje)

Gdy token ma być deterministyczny (druga maszyna, skrypty, workspace, do którego connector nie ma
dostępu), użyj `headersHelper`: polecenie, które przy starcie zwraca nagłówki jako JSON.

`.mcp.json`:
```json
{
  "mcpServers": {
    "linear-infra": {
      "type": "http",
      "url": "https://mcp.linear.app/mcp",
      "headersHelper": "bash scripts/linear-naglowek"
    }
  }
}
```

`scripts/linear-naglowek` (wykonywalny, `chmod +x`):
```bash
#!/bin/bash
# Nagłówek z kluczem Linear dla serwera MCP (headersHelper w .mcp.json). Klucz z .env repo.
set -euo pipefail
cd "$(dirname "$0")/.."
klucz=$(grep -E '^LINEAR_API_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'"'"'\r')
[ -n "$klucz" ] || { echo "brak LINEAR_API_KEY w $(pwd)/.env" >&2; exit 1; }
printf '{"Authorization": "Bearer %s"}\n' "$klucz"
```

Klucz tworzy człowiek (Linear: Settings → Security & access → Personal API keys, w **właściwym**
workspace) i wkleja do `.env` sam — ty nie wpisujesz sekretów. `.env` musi być w `.gitignore`.
Nazwa nagłówka i prefiks (`Bearer` czy goły klucz) zależą od serwisu — sprawdź w jego dokumentacji
MCP; REST API Lineara bierze goły klucz, serwer MCP Lineara `Bearer`.

## 4. Sprawdzenie

Po restarcie narzędzia nazywają się `mcp__<nazwa-serwera>__*`. Zawołaj narzędzie, które zwraca
tożsamość workspace'u (Linear: `get_workspace`; inne serwisy: `get_self`, `whoami`, `list_teams`)
i porównaj nazwę z oczekiwaną. Dopiero wtedy mów „działa”.

Jeśli skille albo `CLAUDE.md` w repo odwołują się do narzędzi po nazwie serwera
(`mcp__linear__get_issue`), popraw je na nową nazwę.
