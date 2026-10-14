#!/usr/bin/env node
// Local copy of tracker tasks for the Sztab panel and the MVP bar (both read .claude/zadania.json in the
// current repo). The tracker stays the source of truth; keep this file out of git.
//
//   node zadanie.mjs MNG-140 w-toku "Lista wizyt"            add or update (title optional on update)
//   node zadanie.mjs MNG-140 do-sprawdzenia                  change state only
//   node zadanie.mjs MNG-140 w-toku --mvp --priorytet 1      mark as an MVP task, tracker priority 1-4
//   node zadanie.mjs MNG-140 w-toku --bez-mvp                unmark
//   node zadanie.mjs usun MNG-140                            drop from the panel
//   node zadanie.mjs cel "MVP fryz.app" 2026-11-01           set the goal shown in the MVP bar (date optional)
//   node zadanie.mjs cel --usun                              drop the goal (the bar disappears)
//   node zadanie.mjs                                         print the file
//
// States: do-zrobienia (Todo), w-toku (In Progress), do-sprawdzenia (Review), zrobione (Done).
// Priority follows Linear: 1 urgent, 2 high, 3 medium, 4 low, 0 none.
// Titles starting with "--" go after a bare "--": node zadanie.mjs MNG-1 w-toku -- "--hotfix".
// Run it from the repo root. It writes the file the panel reads first: zadania/zadania.json when it
// exists, otherwise .claude/zadania.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = [
  join(process.cwd(), "zadania", "zadania.json"),
  join(process.cwd(), ".claude", "zadania.json"),
].find(existsSync) ?? join(process.cwd(), ".claude", "zadania.json");
const STATES = ["do-zrobienia", "w-toku", "do-sprawdzenia", "zrobione"];
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// A missing file starts empty; a broken one stops the script instead of being overwritten.
function load() {
  if (!existsSync(FILE)) return { zadania: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(FILE, "utf8"));
  } catch (err) {
    fail(`${FILE} is not valid JSON (${err.message}); fix it by hand first`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    fail(`${FILE} must hold a JSON object`);
  return data;
}

function isDate(iso) {
  if (!DATE.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function save(data) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
}

// Flags anywhere before a bare "--"; everything else (and everything after it) is positional.
const KNOWN = new Set(["--mvp", "--bez-mvp", "--usun"]);
const flags = new Set();
const positional = [];
let priorytet;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const x = argv[i];
  if (x === "--") {
    positional.push(...argv.slice(i + 1));
    break;
  }
  if (!x.startsWith("--")) {
    positional.push(x);
    continue;
  }
  const [name, inline] = x.split("=", 2);
  if (name === "--priorytet") {
    const raw = inline ?? argv[++i];
    priorytet = /^[0-4]$/.test(raw ?? "") ? Number(raw) : NaN;
    if (Number.isNaN(priorytet)) fail(`Bad priority: ${raw} (0-4)`);
  } else if (KNOWN.has(x)) {
    flags.add(x);
  } else {
    fail(`Unknown flag: ${x} (known: --mvp, --bez-mvp, --priorytet N, --usun, --)`);
  }
}
if (flags.has("--mvp") && flags.has("--bez-mvp")) fail("Pick one of --mvp and --bez-mvp");
const [a, b, c] = positional;
const data = load();
data.zadania ??= [];

if (!a) {
  console.log(JSON.stringify(data, null, 2));
} else if (a === "usun") {
  if (!ID.test(b ?? "")) fail(`Bad id: ${b}`);
  data.zadania = data.zadania.filter((z) => z.id !== b);
  save(data);
} else if (a === "cel") {
  if (flags.has("--usun")) {
    delete data.cel;
  } else {
    if (!b) fail('Goal needs a name: cel "MVP fryz.app" [YYYY-MM-DD]');
    if (c && !isDate(c)) fail(`Bad date: ${c} (expected a real YYYY-MM-DD)`);
    data.cel = c ? { nazwa: b, termin: c } : { nazwa: b };
  }
  save(data);
} else {
  if (!ID.test(a)) fail(`Bad id: ${a} (expected PREFIX-n, e.g. MNG-140)`);
  if (!STATES.includes(b))
    fail(`Bad state: ${b} (one of ${STATES.join(", ")})`);
  let task = data.zadania.find((z) => z.id === a);
  if (task) {
    task.stan = b;
    if (c) task.tytul = c;
  } else {
    if (!c) fail(`New task ${a} needs a title`);
    task = { id: a, tytul: c, stan: b };
    data.zadania.push(task);
  }
  if (flags.has("--mvp")) task.mvp = true;
  if (flags.has("--bez-mvp")) delete task.mvp;
  if (priorytet !== undefined) task.priorytet = priorytet;
  save(data);
}
