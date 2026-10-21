# claude-pawers

Pluginy do [Claude Code](https://claude.com/claude-code): skille, agenci i mody, których używam na co dzień.
Repo jest marketplace'em — dodajesz je raz i instalujesz z niego, co chcesz.

```bash
claude plugin marketplace add p4wk3/claude-pawers
claude plugin install <plugin>@pawers
```

Wybierz zakres **user**, żeby plugin działał we wszystkich projektach (także w zakładce Code aplikacji
desktopowej). Aktualizacja wszystkich: `claude plugin marketplace update pawers`.

## Pluginy

| Plugin | Co daje |
|---|---|
| [`sztab`](plugins/sztab) | Orkiestrator z 5 subagentami (zwiadowca, badacz, rzemieślnik, recenzent, tester), panel `/sztab` z agentami, repo i kosztami, bramka przeglądu przed `main`, pasek MVP, `/raport` na start i `/podsumowanie` na koniec sesji. Zadania i pasek wymagają Lineara albo pliku `.claude/zadania.json` |
| [`mcp-per-workspace`](plugins/mcp-per-workspace) | Jeden skill: ten sam serwer MCP (Linear, Notion, Supabase…) w każdym repo pod innym workspace'em — osobna nazwa serwera w `.mcp.json`, osobna autoryzacja przez `/mcp` albo klucz API z `.env` |

## Zmiany i nowe pluginy

Każdy plugin to folder w `plugins/` z `.claude-plugin/plugin.json` i wpisem w `.claude-plugin/marketplace.json`.
Poprawki i pomysły — przez fork i pull request.

## Licencja

MIT
