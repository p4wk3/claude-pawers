#!/usr/bin/env node
// Local copy of tracker tasks for the Sztab panel (it reads .claude/zadania.json in the current repo
// for titles and counts). The tracker stays the source of truth; keep this file out of git.
//
//   node zadanie.mjs MNG-140 w-toku "Lista wizyt"   add or update (title optional on update)
//   node zadanie.mjs MNG-140 do-sprawdzenia         change state only
//   node zadanie.mjs usun MNG-140                   drop from the panel
//   node zadanie.mjs                                print the file
//
// States: do-zrobienia (Todo), w-toku (In Progress), do-sprawdzenia (Review), zrobione (Done).
// Run it from the repo root; the file lands in <cwd>/.claude/zadania.json.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".claude");
const FILE = join(DIR, "zadania.json");
const STATES = ["do-zrobienia", "w-toku", "do-sprawdzenia", "zrobione"];
const ID = /^[A-Z][A-Z0-9]*-\d+$/;

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

const [a, b, c] = process.argv.slice(2);
const data = load();

if (!a) {
  console.log(JSON.stringify(data, null, 2));
} else if (a === "usun") {
  if (!ID.test(b ?? "")) fail(`Bad id: ${b}`);
  data.zadania = data.zadania.filter((z) => z.id !== b);
  save(data);
} else {
  if (!ID.test(a)) fail(`Bad id: ${a} (expected PREFIX-n, e.g. MNG-140)`);
  if (!STATES.includes(b))
    fail(`Bad state: ${b} (one of ${STATES.join(", ")})`);
  const existing = data.zadania.find((z) => z.id === a);
  if (existing) {
    existing.stan = b;
    if (c) existing.tytul = c;
  } else {
    if (!c) fail(`New task ${a} needs a title`);
    data.zadania.push({ id: a, tytul: c, stan: b });
  }
  save(data);
}
