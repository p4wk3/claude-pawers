# mcp-per-workspace

Skill do [Claude Code](https://claude.com/claude-code): ten sam serwer MCP (Linear, Notion,
Supabase, Sentry…) podpięty w każdym repo do **innego workspace'u**.

Logowanie OAuth wiąże token z jednym workspace'em, a Claude Code trzyma token per **nazwa serwera**.
Wystarczy więc w `.mcp.json` każdego repo dać serwerowi osobną nazwę (`linear-mnghub`, `linear-infra`)
i każdy zalogować osobno przez `/mcp`. Gdy OAuth nie pasuje, skill pokazuje wariant z kluczem API
czytanym z `.env` przez `headersHelper`.

Skill uruchamia się sam, gdy prosisz „Linear ma być pod workspace X w tym repo” albo gdy narzędzia MCP
widzą zły workspace. Wymaga tylko Claude Code; sam OAuth i klucz API zostają po twojej stronie.
