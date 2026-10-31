// Jednorazowo: wyciąga z Natural Earth (10m) geometrie potrzebne mapie i zapisuje data/geo.json.
// Użycie: node src/geo-extract.ts <ne_10m_rivers_lake_centerlines.geojson> <ne_10m_admin_0_countries.geojson>
import { readFileSync, writeFileSync } from 'node:fs';

type Pt = [number, number];
type Line = Pt[];

const [riversPath, countriesPath] = process.argv.slice(2);
const rivers = JSON.parse(readFileSync(riversPath, 'utf8'));
const countries = JSON.parse(readFileSync(countriesPath, 'utf8'));

const BBOX = { w: 11.5, s: 47.8, e: 27.5, n: 56.2 };
const inBox = ([x, y]: Pt) => x >= BBOX.w && x <= BBOX.e && y >= BBOX.s && y <= BBOX.n;

const parts = (g: any): Line[] =>
  g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
const rings = (g: any): Line[] =>
  g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p: Line[]) => p[0]) : [];

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Douglas–Peucker w stopniach (mapa ma ~480 px na 10°, więc 0.004° ≈ 0.2 px)
function simplify(line: Line, tol: number): Line {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = line[a], [bx, by] = line[b];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * (line[i][0] - ax) - dx * (line[i][1] - ay)) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return line.filter((_, i) => keep[i]);
}
// zamknięty obrys: dzielimy w punkcie najdalszym od startu, inaczej odcinek bazowy ma długość 0
function simplifyRing(ring: Line, tol: number): Line {
  const far = ring.reduce((m, p, i) => (dist(p, ring[0]) > dist(ring[m], ring[0]) ? i : m), 0);
  const a = simplify(ring.slice(0, far + 1), tol);
  const b = simplify(ring.slice(far), tol);
  return a.concat(b.slice(1));
}
const round = (l: Line): Line => l.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);

// ── Wisła: łączymy wszystkie odcinki w jedną linię od źródła (najdalej na południe) do ujścia
const vistulaParts: Line[] = rivers.features
  .filter((f: any) => f.properties.name === 'Vistula')
  .flatMap((f: any) => parts(f.geometry));
let pool = vistulaParts.map((l) => [...l] as Line);
let start = pool.flatMap((l) => [l[0], l[l.length - 1]]).reduce((m, p) => (p[1] < m[1] ? p : m));
let chain: Line = [];
let cursor: Pt = start;
while (pool.length) {
  let best = 0, bestD = Infinity, flip = false;
  pool.forEach((l, i) => {
    const d0 = dist(cursor, l[0]), d1 = dist(cursor, l[l.length - 1]);
    if (d0 < bestD) { bestD = d0; best = i; flip = false; }
    if (d1 < bestD) { bestD = d1; best = i; flip = true; }
  });
  const seg = pool.splice(best, 1)[0];
  if (flip) seg.reverse();
  chain = chain.concat(chain.length ? seg.slice(1) : seg);
  cursor = chain[chain.length - 1];
}
console.log(`Wisła: ${vistulaParts.length} odcinki, ${chain.length} punktów, od ${chain[0]} do ${chain[chain.length - 1]}`);

const otherRivers: Record<string, Line[]> = {};
for (const name of ['Oder', 'Warta', 'Bug']) {
  otherRivers[name] = rivers.features
    .filter((f: any) => f.properties.name === name)
    .flatMap((f: any) => parts(f.geometry))
    .map((l: Line) => round(simplify(l, 0.004)));
}

const byCode = (code: string) => countries.features.find((f: any) => f.properties.ADM0_A3 === code);
const poland = rings(byCode('POL').geometry).sort((a, b) => b.length - a.length)[0];
const neighbours = ['DEU', 'CZE', 'SVK', 'UKR', 'BLR', 'LTU', 'RUS', 'LVA', 'AUT', 'HUN', 'DNK', 'SWE']
  .flatMap((c) => rings(byCode(c).geometry))
  .filter((r) => r.some(inBox))
  .map((r) => round(simplifyRing(r, 0.01)));

writeFileSync(
  'data/geo.json',
  JSON.stringify({
    source: 'Natural Earth 10m (public domain)',
    poland: round(simplifyRing(poland, 0.002)),
    vistula: round(simplify(chain, 0.002)),
    rivers: otherRivers,
    neighbours,
  }),
);
console.log('OK → data/geo.json');
