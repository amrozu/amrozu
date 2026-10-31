import { readFileSync } from 'node:fs';
import { type Day, type Theme, profile, toWeeks, monthTicks, esc, fmt, r, FONT, svgDoc, longDate, weekRange } from './lib.ts';

type Pt = [number, number];
type Geo = { poland: Pt[]; vistula: Pt[]; rivers: Record<string, Pt[][]>; neighbours: Pt[][] };

const PALETTE = {
  dark: {
    bg: ['#0d1117', '#0c1524'], land: '#121821', landStroke: '#3d444d', dots: '#2a313b',
    neighbour: '#10151c', neighbourStroke: '#262c35', grat: '#1a2029',
    context: '#388bfd', contextOpacity: 0.32,
    river: '#58a6ff', glow: 0.55, flow: '#d6ecff',
    text: '#e6edf3', text2: '#9198a1', text3: '#6e7681', border: '#30363d', accent: '#ff7b72', halo: '#0d1117',
  },
  light: {
    bg: ['#ffffff', '#f3f7fb'], land: '#ffffff', landStroke: '#8c959f', dots: '#d6dde5',
    neighbour: '#f6f8fa', neighbourStroke: '#e1e6eb', grat: '#eaeef2',
    context: '#54aeff', contextOpacity: 0.55,
    river: '#0969da', glow: 0, flow: '#b6e3ff',
    text: '#1f2328', text2: '#59636e', text3: '#6e7781', border: '#d1d9e0', accent: '#cf222e', halo: '#ffffff',
  },
};

const W = 900, H = 500;
const MAP = { x: 372, y: 30, w: 500, h: 440 };
const MIN_W = 1.4, MAX_W = 18;
const CITIES: { name: string; lon: number; lat: number; dx: number; dy: number; anchor: string; home?: boolean }[] = [
  { name: 'Kraków', lon: 19.9366, lat: 50.0614, dx: 0, dy: -9, anchor: 'middle' },
  { name: 'Warszawa', lon: 21.0122, lat: 52.2297, dx: 12, dy: 4, anchor: 'start', home: true },
  { name: 'Toruń', lon: 18.5984, lat: 53.0138, dx: -9, dy: 4, anchor: 'end' },
  { name: 'Gdańsk', lon: 18.6466, lat: 54.352, dx: -9, dy: -6, anchor: 'end' },
];

export function renderWisla(days: Day[], theme: Theme, opts: { panel?: boolean } = {}, geoPath = 'data/geo.json'): string {
  // panel: wersja do osadzenia w status page — tło i ramka jak panele, bez imienia i dużej liczby
  const PANEL = { dark: { fill: '#161b22', border: '#30363d' }, light: { fill: '#ffffff', border: '#d1d9e0' } }[theme];
  const c = opts.panel ? { ...PALETTE[theme], bg: [PANEL.fill, PANEL.fill], halo: PANEL.fill, border: PANEL.border } : PALETTE[theme];
  const RX = opts.panel ? 6 : 12;
  const geo = JSON.parse(readFileSync(geoPath, 'utf8')) as Geo;
  const weeks = toWeeks(days);
  const n = weeks.length;
  const total = days.reduce((s, d) => s + d.count, 0);
  const today = days[days.length - 1].date;
  const peak = weeks.reduce((m, w, i) => (w.total > weeks[m].total ? i : m), 0);
  const peakVal = weeks[peak].total;

  // ── rzutowanie: prostokątne z poprawką cos(52°), dopasowane do ramki mapy ──
  const COS = Math.cos((52 * Math.PI) / 180);
  const lons = geo.poland.map((p) => p[0]), lats = geo.poland.map((p) => p[1]);
  const [lon0, lon1, lat0, lat1] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const k = Math.min(MAP.w / ((lon1 - lon0) * COS), MAP.h / (lat1 - lat0));
  const ox = MAP.x + (MAP.w - (lon1 - lon0) * COS * k) / 2;
  const oy = MAP.y + (MAP.h - (lat1 - lat0) * k) / 2;
  const P = ([lon, lat]: Pt): Pt => [ox + (lon - lon0) * COS * k, oy + (lat1 - lat) * k];
  const path = (pts: Pt[], close = false) =>
    pts.map((p, i) => { const [x, y] = P(p); return `${i ? 'L' : 'M'}${r(x)} ${r(y)}`; }).join('') + (close ? 'Z' : '');
  const center = P([(lon0 + lon1) / 2, (lat0 + lat1) / 2]);

  // ── Wisła: równomierne próbkowanie po długości ────────────────────────────
  const raw = geo.vistula.map(P);
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = (s: number): Pt => {
    let i = cum.findIndex((v) => v >= s);
    if (i <= 0) return raw[Math.max(i, 0)];
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return [raw[i - 1][0] + t * (raw[i][0] - raw[i - 1][0]), raw[i - 1][1] + t * (raw[i][1] - raw[i - 1][1])];
  };
  const N = 600;
  const pts = Array.from({ length: N }, (_, i) => at((i / (N - 1)) * L));
  const normal = (i: number): Pt => {
    const a = pts[Math.max(0, i - 4)], b = pts[Math.min(N - 1, i + 4)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [-dy / len, dx / len];
  };
  // szerokość: kontrybucje w tygodniu, płynnie interpolowane między środkami tygodni
  const widthAt = (f: number) => {
    const pos = f * n - 0.5;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(pos)));
    const i1 = Math.min(n - 1, i0 + 1);
    const u = Math.max(0, Math.min(1, pos - i0));
    const s = u * u * (3 - 2 * u);
    const v = weeks[i0].total * (1 - s) + weeks[i1].total * s;
    return MIN_W + (v / peakVal) * (MAX_W - MIN_W);
  };
  const left: string[] = [], right: string[] = [];
  pts.forEach((p, i) => {
    const [nx, ny] = normal(i);
    const hw = widthAt(i / (N - 1)) / 2;
    left.push(`${r(p[0] + nx * hw)} ${r(p[1] + ny * hw)}`);
    right.push(`${r(p[0] - nx * hw)} ${r(p[1] - ny * hw)}`);
  });
  const ribbon = `M${left.join('L')}L${right.reverse().join('L')}Z`;
  const center_d = `M${pts.map((p) => `${r(p[0])} ${r(p[1])}`).join('L')}`;
  const pointAt = (f: number) => {
    const i = Math.round(f * (N - 1));
    return { p: pts[i], nrm: normal(i), hw: widthAt(f) / 2 };
  };

  // ── podpis „Wisła” wzdłuż nurtu (kartograficznie, po zachodniej stronie) ──
  const lbl = pts.slice(Math.round(N * 0.3), Math.round(N * 0.44)).map((p, j, arr) => {
    const i = Math.round(N * 0.3) + j;
    const [nx, ny] = normal(i);
    return `${j ? 'L' : 'M'}${r(p[0] - nx * 9)} ${r(p[1] - ny * 9)}`;
  }).join('');

  // ── kreski miesięcy na rzece, zapalane, gdy dociera do nich nurt ──────────
  const REVEAL_START = 0.9, REVEAL_DUR = 3.4;
  const placed: Pt[] = [pts[0]]; // etykieta „source” zajmuje początek rzeki
  const ticks = monthTicks(weeks).map((t, j) => {
    const f = t.index / n;
    const { p, nrm, hw } = pointAt(f);
    const side = 1; // strona zachodnia przy płynięciu na północ
    const a = [p[0] + nrm[0] * side * (hw + 2), p[1] + nrm[1] * side * (hw + 2)];
    const b = [p[0] + nrm[0] * side * (hw + 7), p[1] + nrm[1] * side * (hw + 7)];
    const tx = p[0] + nrm[0] * side * (hw + 10), ty = p[1] + nrm[1] * side * (hw + 10);
    const anchor = nrm[0] * side < -0.3 ? 'end' : nrm[0] * side > 0.3 ? 'start' : 'middle';
    if (placed.some((q) => Math.hypot(q[0] - tx, q[1] - ty) < 26)) return ''; // za blisko poprzedniej
    placed.push([tx, ty]);
    return `<g class="pop" style="animation-delay:${r(REVEAL_START + REVEAL_DUR * f)}s"><line x1="${r(a[0])}" y1="${r(a[1])}" x2="${r(b[0])}" y2="${r(b[1])}" stroke="${c.text3}" stroke-width="1"/><text class="tick halo" x="${r(tx)}" y="${r(ty + 3.5)}" text-anchor="${anchor}">${t.label}</text></g>`;
  });

  // ── miasta ────────────────────────────────────────────────────────────────
  const cities = CITIES.map((ct) => {
    const [x, y] = P([ct.lon, ct.lat]);
    const dot = ct.home
      ? `<circle class="pulse" cx="${r(x)}" cy="${r(y)}" r="3.2" fill="${c.accent}"/><circle cx="${r(x)}" cy="${r(y)}" r="3.2" fill="${c.accent}" stroke="${c.halo}" stroke-width="1.5"/>`
      : `<circle cx="${r(x)}" cy="${r(y)}" r="2.4" fill="${c.text2}" stroke="${c.halo}" stroke-width="1.2"/>`;
    return `<g class="in" style="animation-delay:${ct.home ? 1.6 : 1.2}s">${dot}<text class="${ct.home ? 'city home' : 'city'} halo" x="${r(x + ct.dx)}" y="${r(y + ct.dy)}" text-anchor="${ct.anchor}">${ct.name}</text></g>`;
  }).join('');

  // ── adnotacje: źródło, szczyt, ujście ─────────────────────────────────────
  const src = pts[0], mouth = pts[N - 1];
  const pk = pointAt((peak + 0.5) / n);
  const annotations =
    `<g class="in" style="animation-delay:${REVEAL_START}s"><circle cx="${r(src[0])}" cy="${r(src[1])}" r="2" fill="${c.river}"/>` +
    `<text class="small halo" x="${r(src[0] - 8)}" y="${r(src[1] + 14)}" text-anchor="end">source · ${longDate(weeks[0].start)}</text></g>` +
    `<g class="in" style="animation-delay:${r(REVEAL_START + REVEAL_DUR)}s"><text class="small halo" x="${r(mouth[0] + 10)}" y="${r(mouth[1] + 8)}">mouth · this week</text></g>` +
    `<g class="in" style="animation-delay:${r(REVEAL_START + REVEAL_DUR + 0.2)}s">` +
    `<line x1="${r(pk.p[0] - pk.hw - 3)}" y1="${r(pk.p[1])}" x2="${r(pk.p[0] - pk.hw - 22)}" y2="${r(pk.p[1])}" stroke="${c.text3}"/>` +
    `<text class="anno halo" x="${r(pk.p[0] - pk.hw - 27)}" y="${r(pk.p[1] + 1)}" text-anchor="end"><tspan class="small">busiest week</tspan> ${fmt(peakVal)}</text>` +
    `<text class="small halo" x="${r(pk.p[0] - pk.hw - 27)}" y="${r(pk.p[1] + 15)}" text-anchor="end">${weekRange(weeks[peak])}</text>` +
    `</g>` +
    `<text class="sea" x="${MAP.x + 20}" y="${MAP.y + 18}">Morze Bałtyckie</text>`;

  // ── tło: sąsiedzi, siatka, inne rzeki ─────────────────────────────────────
  const neighbours = geo.neighbours.map((ring) => `<path d="${path(ring, true)}"/>`).join('');
  const grat: string[] = [];
  for (let lat = 49; lat <= 55; lat += 1) { const y = P([0, lat])[1]; grat.push(`M${MAP.x - 80} ${r(y)}H${W}`); }
  for (let lon = 14; lon <= 25; lon += 2) { const x = P([lon, 0])[0]; grat.push(`M${r(x)} 0V${H}`); }
  const context = Object.values(geo.rivers).flat().map((l) => `<path d="${path(l)}"/>`).join('');

  // ── kolumna tekstu ────────────────────────────────────────────────────────
  // ── legenda: Wisła wyprostowana — ta sama skala szerokości co na mapie, oś czasu pod spodem ──
  const ux0 = 28, ux1 = 336, uy = 262, UK = 2;
  const US = 160;
  const top: string[] = [], bot: string[] = [];
  for (let i = 0; i <= US; i++) {
    const f = i / US, x = ux0 + f * (ux1 - ux0), hw = (widthAt(f) * UK) / 2;
    top.push(`${r(x)} ${r(uy - hw)}`);
    bot.push(`${r(x)} ${r(uy + hw)}`);
  }
  const uPeakX = ux0 + ((peak + 0.5) / n) * (ux1 - ux0);
  const uTicks = monthTicks(weeks)
    .filter((_, i) => i % 2 === 0)
    .map((t) => {
      const x = ux0 + (t.index / n) * (ux1 - ux0);
      return `<line x1="${r(x)}" x2="${r(x)}" y1="${uy + 22}" y2="${uy + 26}" stroke="${c.text3}"/><text class="tick" x="${r(x)}" y="${uy + 38}" text-anchor="middle">${t.label}</text>`;
    }).join('');
  const unrolledLegend =
    `<text class="lbl" x="${ux0}" y="${uy - 62}">THE RIVER, STRAIGHTENED · 2× WIDTH</text>` +
    `<g class="unroll"><path d="M${top.join('L')}L${bot.reverse().join('L')}Z" fill="${c.river}"/></g>` +
    `<line x1="${ux0}" x2="${ux1}" y1="${uy + 22.5}" y2="${uy + 22.5}" stroke="${c.grat}"/>` + uTicks +
    `<g class="in" style="animation-delay:${r(REVEAL_START + REVEAL_DUR)}s">` +
    `<line x1="${r(uPeakX)}" x2="${r(uPeakX)}" y1="${r(uy - MAX_W - 3)}" y2="${uy - 26}" stroke="${c.text3}"/>` +
    `<text class="small" x="${r(uPeakX - 4)}" y="${uy - 30}" text-anchor="end">busiest week · ${fmt(peakVal)}</text>` +
    `<text class="small" x="${ux0}" y="${uy - 8}">quiet weeks</text></g>`;
  const legendRows = [10, 100, 300].map((v, i) => {
    const h = MIN_W + (v / peakVal) * (MAX_W - MIN_W);
    const y = (opts.panel ? 232 : 372) + i * 26;
    return `<rect x="28" y="${r(y - h / 2)}" width="64" height="${r(h)}" rx="${r(Math.min(h / 2, 4))}" fill="${c.river}"/><text class="tick" x="102" y="${y + 3.5}">${v}</text>`;
  }).join('');
  const intro = opts.panel ? `<g class="intro">
<text class="t1" x="20" y="30">The year, as the Wisła</text>
<text class="body" x="28" y="72">Source: a year ago, in the Beskids.</text>
<text class="body" x="28" y="92">Mouth: this week, on the Baltic.</text>
<text class="body" x="28" y="120">The river's width at every bend is the</text>
<text class="body" x="28" y="140">number of contributions that week.</text>
${unrolledLegend}
<text class="foot" x="28" y="${H - 22}">map: Natural Earth</text>
</g>` : `<g class="intro">
<text class="name" x="28" y="58">${esc(profile.name)}</text>
<text class="role" x="28" y="83">${esc(`${profile.role} · ${profile.company} · ${profile.city}`)}</text>
<text class="body" x="28" y="126">A year of my work, drawn as the Wisła.</text>
<text class="body" x="28" y="146">The source is a year ago, in the Beskids;</text>
<text class="body" x="28" y="166">the mouth is this week, on the Baltic.</text>
<text class="body" x="28" y="186">Its width at every bend is the number of</text>
<text class="body" x="28" y="206">contributions I made that week.</text>
<text class="big" x="28" y="266">${fmt(total)}</text>
<text class="small" x="28" y="288">contributions in the last 12 months</text>
<text class="lbl" x="28" y="340">WIDTH = CONTRIBUTIONS / WEEK</text>
${legendRows}
<text class="foot" x="28" y="${H - 22}">updated ${longDate(today)} · map: Natural Earth</text>
</g>`;

  const mx = MAP.x - 40;
  const defs = `<defs>
<clipPath id="card"><rect width="${W}" height="${H}" rx="${RX}"/></clipPath>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg[0]}"/><stop offset="1" stop-color="${c.bg[1]}"/></linearGradient>
<radialGradient id="fadeG" gradientUnits="userSpaceOnUse" cx="${r(center[0])}" cy="${r(center[1])}" r="330"><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect x="${mx}" width="${W - mx}" height="${H}" fill="url(#fadeG)"/></mask>
<pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r=".8" fill="${c.dots}"/></pattern>
<clipPath id="pl"><path d="${path(geo.poland, true)}"/></clipPath>
<mask id="reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><path class="reveal" d="${center_d}" pathLength="100" fill="none" stroke="#fff" stroke-width="${MAX_W + 10}" stroke-linejoin="round"/></mask>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4"/></filter>
<path id="lblpath" d="${lbl}"/>
</defs>`;

  const plPath = path(geo.poland, true);
  const body = `${defs}
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<g mask="url(#fade)">
<g class="in" style="animation-delay:.2s" fill="${c.neighbour}" stroke="${c.neighbourStroke}" stroke-width=".7">${neighbours}</g>
<path class="in" style="animation-delay:.2s" d="${grat.join('')}" stroke="${c.grat}" stroke-width="1" fill="none"/>
</g>
<path class="in" style="animation-delay:.3s" d="${plPath}" fill="${c.land}"/>
<path class="in" style="animation-delay:.5s" d="${plPath}" fill="url(#dots)"/>
<path class="outline" d="${plPath}" pathLength="100" fill="none" stroke="${c.landStroke}" stroke-width="1" stroke-linejoin="round"/>
<g class="in" style="animation-delay:.7s" clip-path="url(#pl)" fill="none" stroke="${c.context}" stroke-opacity="${c.contextOpacity}" stroke-width=".9" stroke-linejoin="round" stroke-linecap="round">${context}</g>
<g mask="url(#reveal)">
${c.glow ? `<path d="${ribbon}" fill="${c.river}" opacity="${c.glow}" filter="url(#glow)"/>` : ''}
<path d="${ribbon}" fill="${c.river}"/>
</g>
<path class="flow" d="${center_d}" pathLength="100" fill="none" stroke="${c.flow}" stroke-width="1.1" stroke-linecap="round"/>
<text class="river in" style="animation-delay:${r(REVEAL_START + REVEAL_DUR * 0.4)}s"><textPath href="#lblpath" startOffset="50%" text-anchor="middle">W i s ł a</textPath></text>
${ticks.join('')}
${cities}
${annotations}
${intro}
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${RX}" fill="none" stroke="${c.border}"/>`;

  const style = `
text{font-family:${FONT};fill:${c.text}}
.t1{font-size:13px;font-weight:600}
.name{font-size:26px;font-weight:600;letter-spacing:-.01em}
.role{font-size:14px;fill:${c.text2}}
.body{font-size:13px;fill:${c.text2}}
.big{font-size:34px;font-weight:600;letter-spacing:-.01em}
.small{font-size:11.5px;fill:${c.text2}}
.lbl{font-size:10.5px;font-weight:600;letter-spacing:.06em;fill:${c.text3}}
.tick{font-size:10px;fill:${c.text3};font-variant-numeric:tabular-nums}
.foot{font-size:10.5px;fill:${c.text3}}
.anno{font-size:12px;font-weight:600}
.city{font-size:11.5px;fill:${c.text2}}
.home{font-weight:600;fill:${c.text}}
.sea{font-size:10.5px;font-style:italic;letter-spacing:.12em;fill:${c.text3}}
.river{font-size:10px;font-style:italic;letter-spacing:.08em;fill:${c.river}}
.halo{paint-order:stroke;stroke:${c.halo};stroke-width:3px;stroke-linejoin:round}
.intro{animation:in .9s ease-out both}
.unroll{transform-box:fill-box;transform-origin:0 50%;animation:unroll ${REVEAL_DUR}s linear ${REVEAL_START}s both}
@keyframes unroll{from{transform:scaleX(0)}}
.in{animation:in .8s ease-out both}
.pop{animation:in .5s ease-out both}
@keyframes in{from{opacity:0}}
.outline{animation:draw 2.2s cubic-bezier(.45,0,.2,1) .1s both}
@keyframes draw{from{stroke-dasharray:100 100;stroke-dashoffset:100}to{stroke-dasharray:100 100;stroke-dashoffset:0}}
.reveal{stroke-dasharray:100 200;animation:reveal ${REVEAL_DUR}s linear ${REVEAL_START}s both}
@keyframes reveal{from{stroke-dashoffset:100}}
.flow{stroke-dasharray:.3 1.7;opacity:.85;animation:flow 1.6s linear infinite,fadein 1s ease-out ${r(REVEAL_START + REVEAL_DUR)}s both}
@keyframes flow{to{stroke-dashoffset:-2}}
@keyframes fadein{from{opacity:0}}
.pulse{opacity:0;transform-box:fill-box;transform-origin:center;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{opacity:.7;transform:scale(1)}80%,100%{opacity:0;transform:scale(3.4)}}`;

  return svgDoc({
    width: W,
    height: H,
    title: `${profile.name} — ${profile.role} at ${profile.company}, ${profile.city}`,
    desc: `A map of Poland with the Vistula drawn as the last 12 months of GitHub activity: it flows from its source (November) to the Baltic Sea (October), and its width is the number of contributions each week. ${fmt(total)} contributions in total; the busiest week, ${weekRange(weeks[peak])}, had ${fmt(peakVal)}.`,
    style,
    body,
  });
}
