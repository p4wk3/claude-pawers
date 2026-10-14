// Awatary agentów w formacie kształtów Vintage Story (shapes/*.json): elementy
// jako prostopadłościany `from`/`to` w jednostkach bloku (16 = jeden blok),
// twarze z odnośnikiem do tekstury. Różnica: zamiast ścieżek do plików
// tekstur `textures` trzyma kolory, bo panel rysuje płaskie ściany.
// Silnik modów nie importuje .json, dlatego kształty mieszkają w .ts.

export type Face = { texture: string }
export type Element = {
  name: string
  from: [number, number, number]
  to: [number, number, number]
  faces?: Partial<Record<'north' | 'east' | 'south' | 'west' | 'up' | 'down', Face>>
  children?: Element[]
}
export type Shape = { textures: Record<string, string>; elements: Element[] }

const all = (texture: string) => ({
  north: { texture }, east: { texture }, south: { texture },
  west: { texture }, up: { texture }, down: { texture },
})

function el(name: string, from: Element['from'], to: Element['to'], texture: string): Element {
  return { name, from, to, faces: all(texture) }
}

// Wspólna postać: nogi, tułów, ręce, głowa, oczy.
function body(tunic: string): Element[] {
  return [
    el('NogaL', [5, 0, 7], [7.5, 5, 9], '#spodnie'),
    el('NogaP', [8.5, 0, 7], [11, 5, 9], '#spodnie'),
    el('Tulow', [5, 5, 6], [11, 11, 10], tunic),
    el('RekaL', [3, 5.5, 7], [5, 11, 9], tunic),
    el('RekaP', [11, 5.5, 7], [13, 11, 9], tunic),
    el('Glowa', [5, 11, 5], [11, 17, 11], '#skora'),
    el('OkoL', [6.2, 13.2, 11], [7.4, 14.4, 11.2], '#oko'),
    el('OkoP', [8.6, 13.2, 11], [9.8, 14.4, 11.2], '#oko'),
  ]
}

const BASE = { skora: '#e2b48c', oko: '#2b2320', spodnie: '#4a3b2c' }

export const KSZTALTY: Record<string, Shape> = {
  // Kaptur i lupa: szuka i sprawdza źródła.
  badacz: {
    textures: { ...BASE, plaszcz: '#4f7d4a', kaptur: '#3f6a3b', drewno: '#7a5532', mosiadz: '#c9a03f', szklo: '#9fd4e8' },
    elements: [
      ...body('#plaszcz'),
      el('Kaptur', [4.5, 16, 4.5], [11.5, 18, 11.5], '#kaptur'),
      el('KapturTyl', [4.5, 11, 4.5], [11.5, 16, 6], '#kaptur'),
      el('Raczka', [12.5, 7, 9], [13.5, 10, 10], '#drewno'),
      el('Obrecz', [11.5, 10, 9], [14.5, 13, 10], '#mosiadz'),
      el('Szklo', [12, 10.5, 10], [14, 12.5, 10.2], '#szklo'),
    ],
  },
  // Fartuch, broda i młot: robi robotę.
  rzemieslnik: {
    textures: { ...BASE, koszula: '#b9824f', fartuch: '#6b4a2e', wlosy: '#5a3a22', drewno: '#7a5532', zelazo: '#8d949c' },
    elements: [
      ...body('#koszula'),
      el('Fartuch', [5.5, 3, 10], [10.5, 10, 10.4], '#fartuch'),
      el('Wlosy', [5, 16, 5], [11, 17.5, 11], '#wlosy'),
      el('Broda', [5.8, 11, 11], [10.2, 13, 11.5], '#wlosy'),
      el('Trzonek', [13, 4, 8], [14, 12, 9], '#drewno'),
      el('Obuch', [12, 11, 6.5], [15, 13.5, 10.5], '#zelazo'),
    ],
  },
  // Karmazynowa szata, biret i księga: czyta i ocenia.
  recenzent: {
    textures: { ...BASE, szata: '#9b2d30', biret: '#2a2226', okladka: '#3b2a1c', karty: '#efe3c4' },
    elements: [
      el('Szata', [4.5, 0, 6], [11.5, 11, 10.5], '#szata'),
      el('RekaL', [3, 5.5, 7], [4.5, 11, 9], '#szata'),
      el('RekaP', [11.5, 5.5, 7], [13, 11, 9], '#szata'),
      el('Glowa', [5, 11, 5], [11, 17, 11], '#skora'),
      el('OkoL', [6.2, 13.2, 11], [7.4, 14.4, 11.2], '#oko'),
      el('OkoP', [8.6, 13.2, 11], [9.8, 14.4, 11.2], '#oko'),
      el('Biret', [4.5, 16.5, 4.5], [11.5, 18.5, 11.5], '#biret'),
      el('Karty', [5.8, 6, 10.5], [10.2, 9, 11.8], '#karty'),
      el('Okladka', [5.5, 6, 11.8], [10.5, 9.5, 12.3], '#okladka'),
    ],
  },
  // Szara peleryna i latarnia: idzie przodem.
  zwiadowca: {
    textures: { ...BASE, peleryna: '#6d7378', kaptur: '#5b6166', zelazo: '#3d3f44', plomien: '#f2c14e' },
    elements: [
      ...body('#peleryna'),
      el('Kaptur', [4.5, 16, 4.5], [11.5, 18, 11.5], '#kaptur'),
      el('KapturTyl', [4.5, 11, 4.5], [11.5, 16, 6], '#kaptur'),
      el('Ucho', [13.2, 7.5, 9.2], [14.2, 9, 10.2], '#zelazo'),
      el('Latarnia', [12.2, 3.5, 8.2], [15.2, 7.5, 11.2], '#plomien'),
      el('Daszek', [12, 7.5, 8], [15.4, 8, 11.4], '#zelazo'),
    ],
  },
  // Turkusowa kurtka, czapka z daszkiem i podkładka z listą: klika i odhacza.
  tester: {
    textures: { ...BASE, kurtka: '#2f8f8a', czapka: '#e07a2e', deska: '#8a5a32', kartka: '#f4f1e8', ptaszek: '#3fa34d' },
    elements: [
      ...body('#kurtka'),
      el('Czapka', [5, 16.5, 5], [11, 18, 11], '#czapka'),
      el('Daszek', [5.5, 16.5, 11], [10.5, 17, 13], '#czapka'),
      el('Deska', [11.5, 5, 9], [15, 10.5, 9.6], '#deska'),
      el('Kartka', [12, 5.5, 9.6], [14.5, 10, 9.8], '#kartka'),
      el('Ptaszek', [12.5, 7.5, 9.8], [13.5, 8.5, 10], '#ptaszek'),
    ],
  },
  // Zwykły kolonista: każdy inny agent.
  kolonista: {
    textures: { ...BASE, tunika: '#8a8f98', wlosy: '#3a2b20' },
    elements: [
      ...body('#tunika'),
      el('Wlosy', [5, 16, 5], [11, 17.5, 11], '#wlosy'),
    ],
  },
}

// Typ agenta -> awatar i nazwa w panelu. Wbudowani i z wtyczek dostają
// awatar najbliższej roli.
export const POSTACIE: Record<string, { shape: string; label: string }> = {
  badacz: { shape: 'badacz', label: 'Badacz' },
  rzemieslnik: { shape: 'rzemieslnik', label: 'Rzemieślnik' },
  recenzent: { shape: 'recenzent', label: 'Recenzent' },
  zwiadowca: { shape: 'zwiadowca', label: 'Zwiadowca' },
  tester: { shape: 'tester', label: 'Tester' },
  Explore: { shape: 'zwiadowca', label: 'Zwiadowca (Explore)' },
  'caveman:cavecrew-investigator': { shape: 'zwiadowca', label: 'Zwiadowca (cavecrew)' },
  'caveman:cavecrew-builder': { shape: 'rzemieslnik', label: 'Rzemieślnik (cavecrew)' },
  'caveman:cavecrew-reviewer': { shape: 'recenzent', label: 'Recenzent (cavecrew)' },
  Plan: { shape: 'badacz', label: 'Planista' },
}
