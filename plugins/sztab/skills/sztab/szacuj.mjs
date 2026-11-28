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
//   node szacuj.mjs --linie 400 --zapisz MNG-140   szacunek zapisany przy zadaniu (szacunki.jsonl)
//   node szacuj.mjs --zadanie MNG-140    faktyczny koszt zadania z logu wobec jego szacunku
//   node szacuj.mjs --zadania            zadania z kosztem z logu, szacunkiem i odchyleniem
//   node szacuj.mjs --zamknij MNG-140    zadanie skończone: zapisuje jego faktyczny koszt do kalibracji
//
// Kalibracja: przy co najmniej 3 zamkniętych zadaniach z szacunkiem każdy nowy szacunek dostaje
// wersję skorygowaną o medianę (faktyczny / szacowany) z tych zadań.
import { appendFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
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
const zapisz = opt('zapisz')
const zadanieId = opt('zadanie')
const listaZadan = args.includes('--zadania')
const zamknij = opt('zamknij')
const SZACUNKI = join(DIR, 'szacunki.jsonl')

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
// Koszt zadań liczymy z całego logu, niezależnie od filtrów --dni / --projekt.
const calyLog = wpisy
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

function czytajJsonl(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').filter(l => l.trim()).flatMap(l => {
      try {
        return [JSON.parse(l)]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

// Ostatni szacunek każdego zadania i zadania zamknięte (`--zamknij`).
const zapisy = czytajJsonl(SZACUNKI)
const szacunki = new Map(zapisy.filter(x => !x.zamkniete).map(x => [x.zadanie, x]))
const zamkniete = new Set(zapisy.filter(x => x.zamkniete).map(x => x.zadanie))

// Faktyczny koszt zadania: tury przypisane do niego w logu (`zadanie`). Tury z kilkoma zadaniami
// w toku (`zadania`) pokazujemy osobno jako niepewne, nie dzielimy ich.
function faktyczny(id) {
  const ws = calyLog.filter(w => w.zadanie === id)
  const niepewne = calyLog.filter(w => !w.zadanie && (w.zadania ?? []).includes(id))
  const t = ws.map(w => w.t).sort()
  return {
    zadanie: id,
    prompty: ws.length,
    usd: r(ws.reduce((a, w) => a + (w.usd ?? 0), 0)),
    tokeny: ws.reduce((a, w) => a + tok(w), 0),
    linie: ws.reduce((a, w) => a + lin(w), 0),
    commity: ws.reduce((a, w) => a + (w.commity ?? 0), 0),
    od: t[0],
    do: t[t.length - 1],
    niepewne: { prompty: niepewne.length, usd: r(niepewne.reduce((a, w) => a + (w.usd ?? 0), 0)) },
  }
}

function porownanie(id) {
  const f = faktyczny(id)
  const sz = szacunki.get(id)
  return { ...f, zamkniete: zamkniete.has(id), szacunek: sz, odchylenie: sz?.usd && f.usd ? r(f.usd / sz.usd) : undefined }
}

const zadaniaZLogu = [...new Set(calyLog.map(w => w.zadanie).filter(Boolean))]
const porownania = [...new Set([...zadaniaZLogu, ...szacunki.keys()])].map(porownanie)
// Zadanie w toku ma jeszcze niepełny koszt: do kalibracji tylko zamknięte.
const ilorazy = porownania.filter(p => p.zamkniete && p.odchylenie !== undefined).map(p => p.odchylenie)
const kalibracja = ilorazy.length >= 3 ? { mnoznik: r(kwantyl(ilorazy, 0.5)), zadan: ilorazy.length } : undefined

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

if (szacunek && kalibracja) {
  szacunek.skorygowany = {
    usd: r(szacunek.usd * kalibracja.mnoznik),
    usdZakres: szacunek.usdZakres.map(x => r(x * kalibracja.mnoznik)),
    ...kalibracja,
  }
}
if (szacunek) szacunek.wpisow = wpisy.length

if (zamknij) {
  const f = porownanie(zamknij)
  mkdirSync(DIR, { recursive: true })
  appendFileSync(SZACUNKI, `${JSON.stringify({ t: new Date().toISOString(), zadanie: zamknij, zamkniete: true, faktyczny: f.usd, prompty: f.prompty })}\n`)
  console.log(`Zamknięto ${zamknij}: ${f.prompty} promptów, $${f.usd ?? 0}` + (f.szacunek ? ` wobec szacunku $${f.szacunek.usd} (×${f.odchylenie ?? '—'}).` : ', bez szacunku.'))
  process.exit(0)
}

if (zapisz) {
  if (!szacunek) {
    console.error('--zapisz wymaga --linie albo --prompty i danych w logu.')
    process.exit(1)
  }
  mkdirSync(DIR, { recursive: true })
  appendFileSync(SZACUNKI, `${JSON.stringify({ t: new Date().toISOString(), zadanie: zapisz, projekt, ...szacunek })}\n`)
}

if (jakoJson) {
  const extra = zadanieId ? { zadanie: porownanie(zadanieId) } : listaZadan ? { zadania: porownania } : {}
  console.log(JSON.stringify({ katalog: DIR, filtr: { projekt, dni }, wszystko, naProjekt, szacunek, kalibracja, ...extra }, null, 2))
  process.exit(0)
}

const tysiace = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} mln` : n >= 1e3 ? `${Math.round(n / 1e3)} tys.` : String(n))
const dolary = n => (n === undefined ? '—' : `$${n}`)
function wierszZadania(p) {
  const sz =
    (p.zamkniete ? 'zamknięte, ' : 'w toku, ') +
    (p.szacunek ? `szacunek ${dolary(p.szacunek.usd)}` + (p.odchylenie ? `, faktycznie ×${p.odchylenie}` : '') : 'bez szacunku')
  const niep = p.niepewne.prompty ? ` (+${p.niepewne.prompty} promptów wspólnych z innymi zadaniami, ${dolary(p.niepewne.usd)})` : ''
  return `${p.zadanie}: ${p.prompty} promptów, ${dolary(p.usd)}, ${tysiace(p.tokeny)} tok., ${p.linie} linii, ${p.commity} commitów | ${sz}${niep}`
}
if (zadanieId) {
  console.log(wierszZadania(porownanie(zadanieId)))
  process.exit(0)
}
if (listaZadan) {
  if (!porownania.length) console.log('Brak zadań w logu: wpisy dostają id zadania z promptu albo z jedynego zadania w toku.')
  for (const p of porownania.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))) console.log(wierszZadania(p))
  if (kalibracja) console.log(`Kalibracja: faktyczny koszt = ×${kalibracja.mnoznik} szacunku (mediana z ${kalibracja.zadan} zadań).`)
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
      (szacunek.tokeny ? `, ~${tys(szacunek.tokeny)} tok. pętli głównej` : '') +
      ` [z ${szacunek.wpisow} wpisów]`,
  )
  if (szacunek.skorygowany) {
    console.log(
      `Po kalibracji (×${kalibracja.mnoznik}, ${kalibracja.zadan} zadań): ${usd(szacunek.skorygowany.usd)} ` +
        `(zakres ${usd(szacunek.skorygowany.usdZakres[0])}–${usd(szacunek.skorygowany.usdZakres[1])})`,
    )
  }
  if (zapisz) console.log(`Zapisano szacunek przy ${zapisz}.`)
}
