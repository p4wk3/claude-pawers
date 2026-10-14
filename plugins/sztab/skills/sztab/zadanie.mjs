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
// Run it from the repo root; the file lands in <cwd>/.claude/zadania.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".claude");
const FILE = join(DIR, "zadania.json");
const STATES = ["do-zrobienia", "w-toku", "do-sprawdzenia", "zrobione"];
const ID = /^[A-Z][A-Z0-9]*-\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function load() {
  try {
    return JSON.parse(readFileSync(FILE, "utf8"));
  } catch {
    return { zadania: [] };
  }
}

function save(data) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((x) => x.startsWith("--")));
const prioAt = argv.indexOf("--priorytet");
const priorytet = prioAt >= 0 ? Number(argv[prioAt + 1]) : undefined;
const [a, b, c] = argv.filter(
  (x, i) => !x.startsWith("--") && (prioAt < 0 || i !== prioAt + 1),
);
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
    if (c && !DATE.test(c)) fail(`Bad date: ${c} (expected YYYY-MM-DD)`);
    data.cel = c ? { nazwa: b, termin: c } : { nazwa: b };
  }
  save(data);
} else {
  if (!ID.test(a)) fail(`Bad id: ${a} (expected PREFIX-n, e.g. MNG-140)`);
  if (!STATES.includes(b))
    fail(`Bad state: ${b} (one of ${STATES.join(", ")})`);
  if (priorytet !== undefined && !(priorytet >= 0 && priorytet <= 4))
    fail(`Bad priority: ${argv[prioAt + 1]} (0-4)`);
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
