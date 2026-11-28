#!/usr/bin/env node
// Metryka pracy z globalnego logu Sztabu (~/.claude/pawers/log-RRRR-MM.jsonl): ile kosztuje
// prompt i ile kosztuje zmiana kodu, w USD i tokenach, na prawdziwych danych ze wszystkich projektów.
//
//   node szacuj.mjs                      podsumowanie: wszystkie projekty i podział na projekty
//   node szacuj.mjs --linie 400          szacunek zmiany o ~400 linii (dodane + usunięte)
//   node szacuj.mjs --prompty 12         szacunek pracy na ~12 promptów
//   node szacuj.mjs --projekt mnghub     tylko jeden projekt (też razem z --linie / --prompty)
//   node szacuj.mjs --dni 30             tylko ostatnie 30 dni
//   node szacuj.mjs --json               to samo jako JSON
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DIR = join(homedir(), '.claude', 'pawers')

const args = process.argv.slice(2)
const opt = name => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? undefined : args[i + 1]
}
const projekt = opt('projekt')
const linieCel = Number(opt('linie')) || undefined
const promptyCel = Number(opt('prompty')) || undefined
const dni = Number(opt('dni')) || undefined
const jakoJson = args.includes('--json')

let wpisy = []
let pliki = []
try {
  pliki = readdirSync(DIR).filter(f => /^log-\d{4}-\d{2}\.jsonl$/.test(f))
} catch {
  // brak katalogu: brak danych
}
for (const f of pliki) {
  for (const line of readFileSync(join(DIR, f), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      wpisy.push(JSON.parse(line))
    } catch {
      // ucięta linia: pomijamy
    }
  }
}
if (dni) {
  const od = Date.now() - dni * 86400000
  wpisy = wpisy.filter(w => Date.parse(w.t) >= od)
}
if (projekt) wpisy = wpisy.filter(w => w.projekt === projekt)

const tok = w => (w.tokWe ?? 0) + (w.tokWy ?? 0)
const lin = w => (w.plus ?? 0) + (w.minus ?? 0)

function kwantyl(xs, q) {
  if (!xs.length) return undefined
  const s = [...xs].sort((a, b) => a - b)
  const i = (s.length - 1) * q
  const lo = Math.floor(i)
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)
}

const r = (n, d = 2) => (n === undefined ? undefined : Math.round(n * 10 ** d) / 10 ** d)

function statystyki(ws) {
  const zKosztem = ws.filter(w => w.usd !== undefined)
  // Tury, które zmieniły kod: na nich liczymy koszt linii.
  const kodowe = zKosztem.filter(w => lin(w) > 0)
  const sumUsdKod = kodowe.reduce((a, w) => a + w.usd, 0)
  const sumLin = kodowe.reduce((a, w) => a + lin(w), 0)
  const sumTokKod = kodowe.reduce((a, w) => a + tok(w), 0)
  const naLinie = kodowe.map(w => w.usd / lin(w))
  return {
    prompty: ws.length,
    promptyKodowe: kodowe.length,
    usd: r(zKosztem.reduce((a, w) => a + w.usd, 0)),
    tokeny: ws.reduce((a, w) => a + tok(w), 0),
    linie: { plus: ws.reduce((a, w) => a + (w.plus ?? 0), 0), minus: ws.reduce((a, w) => a + (w.minus ?? 0), 0) },
    commity: ws.reduce((a, w) => a + (w.commity ?? 0), 0),
    usdNaPrompt: { p25: r(kwantyl(zKosztem.map(w => w.usd), 0.25), 3), mediana: r(kwantyl(zKosztem.map(w => w.usd), 0.5), 3), p75: r(kwantyl(zKosztem.map(w => w.usd), 0.75), 3) },
    tokNaPrompt: r(kwantyl(ws.map(tok), 0.5), 0),
    // Średnia ważona (suma USD / suma linii) jest stabilniejsza niż mediana ilorazów przy małych diffach.
    usdNa100Linii: sumLin ? r((sumUsdKod / sumLin) * 100, 3) : undefined,
    usdNa100LiniiP25P75: [r(kwantyl(naLinie, 0.25) * 100, 3), r(kwantyl(naLinie, 0.75) * 100, 3)],
    tokNa100Linii: sumLin ? r((sumTokKod / sumLin) * 100, 0) : undefined,
    liniiNaPrompt: r(kwantyl(kodowe.map(lin), 0.5), 0),
  }
}

const wszystko = statystyki(wpisy)
const naProjekt = {}
for (const p of [...new Set(wpisy.map(w => w.projekt))].sort()) naProjekt[p] = statystyki(wpisy.filter(w => w.projekt === p))

let szacunek
if (linieCel && wszystko.usdNa100Linii !== undefined) {
  // Zakres z kwartyli ilorazów, rozciągnięty tak, by obejmował średnią ważoną.
  const c = wszystko.usdNa100Linii
  const lo = Math.min(wszystko.usdNa100LiniiP25P75[0] ?? c, c)
  const hi = Math.max(wszystko.usdNa100LiniiP25P75[1] ?? c, c)
  const prompty = wszystko.liniiNaPrompt ? Math.max(1, Math.round(linieCel / wszystko.liniiNaPrompt)) : undefined
  szacunek = {
    linie: linieCel,
    usd: r((wszystko.usdNa100Linii * linieCel) / 100),
    usdZakres: [r((lo * linieCel) / 100), r((hi * linieCel) / 100)],
    tokeny: wszystko.tokNa100Linii ? Math.round((wszystko.tokNa100Linii * linieCel) / 100) : undefined,
    prompty,
  }
} else if (promptyCel && wszystko.usdNaPrompt.mediana !== undefined) {
  szacunek = {
    prompty: promptyCel,
    usd: r(wszystko.usdNaPrompt.mediana * promptyCel),
    usdZakres: [r(wszystko.usdNaPrompt.p25 * promptyCel), r(wszystko.usdNaPrompt.p75 * promptyCel)],
    tokeny: wszystko.tokNaPrompt ? wszystko.tokNaPrompt * promptyCel : undefined,
  }
}

if (jakoJson) {
  console.log(JSON.stringify({ katalog: DIR, filtr: { projekt, dni }, wszystko, naProjekt, szacunek }, null, 2))
  process.exit(0)
}

if (!wpisy.length) {
  console.log(`Brak danych w ${DIR}. Log zapełnia mod Sztabu: jedna linia na każdy prompt głównej sesji.`)
  process.exit(0)
}

const tys = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} mln` : n >= 1e3 ? `${Math.round(n / 1e3)} tys.` : String(n))
const usd = n => (n === undefined ? '—' : `$${n}`)
function wiersz(nazwa, s) {
  return (
    `${nazwa}: ${s.prompty} promptów (${s.promptyKodowe} zmieniało kod), ${usd(s.usd)}, ${tys(s.tokeny)} tok., ` +
    `+${s.linie.plus} −${s.linie.minus} linii, ${s.commity} commitów | prompt: mediana ${usd(s.usdNaPrompt.mediana)} ` +
    `(${usd(s.usdNaPrompt.p25)}–${usd(s.usdNaPrompt.p75)}), ${tys(s.tokNaPrompt ?? 0)} tok. | 100 linii: ${usd(s.usdNa100Linii)}, ` +
    `${tys(s.tokNa100Linii ?? 0)} tok.`
  )
}
console.log(wiersz(projekt ?? 'Wszystkie projekty', wszystko))
if (!projekt) for (const [p, s] of Object.entries(naProjekt)) console.log(`  ${wiersz(p, s)}`)
if (szacunek) {
  console.log(
    `Szacunek: ${szacunek.linie ? `~${szacunek.linie} linii, ` : ''}${szacunek.prompty ? `~${szacunek.prompty} promptów, ` : ''}` +
      `${usd(szacunek.usd)} (zakres ${usd(szacunek.usdZakres[0])}–${usd(szacunek.usdZakres[1])})` +
      (szacunek.tokeny ? `, ~${tys(szacunek.tokeny)} tok. pętli głównej` : ''),
  )
}
