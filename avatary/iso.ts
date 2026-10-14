import { KSZTALTY, POSTACIE } from './ksztalty'
import type { Element, Shape } from './ksztalty'

type P = [number, number, number]

const C = Math.cos(Math.PI / 6)
const S = Math.sin(Math.PI / 6)

// Rzut izometryczny: widz patrzy od strony +x, +y, +z.
function proj([x, y, z]: P): [number, number] {
  return [(x - z) * C, (x + z) * S - y]
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

function flat(els: Element[]): Element[] {
  return els.flatMap(e => [e, ...flat(e.children ?? [])])
}

function color(shape: Shape, el: Element, face: 'up' | 'east' | 'south'): string {
  const ref = el.faces?.[face]?.texture ?? el.faces?.north?.texture ?? '#'
  return shape.textures[ref.replace(/^#/, '')] ?? '#888888'
}

function depth(e: Element): number {
  return e.from[0] + e.to[0] + e.from[2] + e.to[2] + (e.from[1] + e.to[1]) * 0.5
}

// Rysuje widoczne ściany (góra, wschód, południe) od najdalszych elementów.
export function renderShape(shape: Shape): string {
  const polys: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const el of flat(shape.elements).sort((a, b) => depth(a) - depth(b))) {
    const [x0, y0, z0] = el.from
    const [x1, y1, z1] = el.to
    const faces: [P[], string][] = [
      [[[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], shade(color(shape, el, 'up'), 1.12)],
      [[[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], shade(color(shape, el, 'east'), 0.8)],
      [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color(shape, el, 'south')],
    ]
    for (const [pts, fill] of faces) {
      const xy = pts.map(proj)
      for (const [px, py] of xy) {
        minX = Math.min(minX, px); maxX = Math.max(maxX, px)
        minY = Math.min(minY, py); maxY = Math.max(maxY, py)
      }
      const d = xy.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ')
      polys.push(`<polygon points="${d}" fill="${fill}" stroke="#00000030" stroke-width="0.15" stroke-linejoin="round"/>`)
    }
  }
  const pad = 0.6
  const w = maxX - minX + 2 * pad
  const h = maxY - minY + 2 * pad
  const side = Math.max(w, h)
  const ox = minX - pad - (side - w) / 2
  const oy = minY - pad - (side - h) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox.toFixed(2)} ${oy.toFixed(2)} ${side.toFixed(2)} ${side.toFixed(2)}">${polys.join('')}</svg>`
}

// Lekkie podskakiwanie (SMIL) dla pracującego agenta; rysuje się tylko w Svg z isInteractive.
export function bounce(svg: string): string {
  return svg
    .replace(/^(<svg[^>]*>)/, '$1<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="0.9s" repeatCount="indefinite"/>')
    .replace(/<\/svg>$/, '</g></svg>')
}

const cache = new Map<string, string>()

export function avatarFor(type: string): { svg: string; label: string } {
  const who = POSTACIE[type] ?? POSTACIE[type.replace(/^sztab:/, '')]
  const key = who?.shape && KSZTALTY[who.shape] ? who.shape : 'kolonista'
  let svg = cache.get(key)
  if (!svg) {
    svg = renderShape(KSZTALTY[key]!)
    cache.set(key, svg)
  }
  return { svg, label: who?.label ?? type }
}
