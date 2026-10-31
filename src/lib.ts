import { readFileSync } from 'node:fs';

export type Day = { date: string; level: number; count: number };
export type Week = { start: string; end: string; days: Day[]; total: number };
export type Theme = 'light' | 'dark';

/** Wszystko, co widać w tekstach na grafikach. Liczby liczą się z danych. */
export const profile = {
  name: 'Łukasz Amroz',
  role: 'Tech Lead',
  company: 'Property Group',
  city: 'Warszawa',
  githubSince: '2016-01-17',
  components: [
    { name: 'Frontend', stack: 'TypeScript · React · Panda CSS' },
    { name: 'Backend', stack: 'Python · Django · Node.js' },
    { name: 'Infrastructure', stack: 'Kubernetes · GitLab CI · Grafana' },
    { name: 'Mobile', stack: 'iOS · Android' },
  ],
};

export const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function loadDays(path: string): Day[] {
  const days = JSON.parse(readFileSync(path, 'utf8')) as Day[];
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** Kalendarz GitHuba zaczyna się w niedzielę, więc dzielimy po 7 dni. */
export function toWeeks(days: Day[]): Week[] {
  const weeks: Week[] = [];
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7);
    weeks.push({
      start: chunk[0].date,
      end: chunk[chunk.length - 1].date,
      days: chunk,
      total: chunk.reduce((s, d) => s + d.count, 0),
    });
  }
  return weeks;
}

/** Etykieta miesiąca nad pierwszym tygodniem, który zaczyna się w tym miesiącu (jak na GitHubie). */
export function monthTicks(weeks: Week[]): { index: number; label: string }[] {
  const ticks: { index: number; label: string }[] = [];
  let prev = -1;
  weeks.forEach((w, i) => {
    const m = Number(w.start.slice(5, 7)) - 1;
    if (m !== prev) {
      ticks.push({ index: i, label: MONTHS[m] });
      prev = m;
    }
  });
  // pierwszy, niepełny miesiąc wypada, jeśli zaraz po nim jest kolejna etykieta
  if (ticks.length > 1 && ticks[1].index - ticks[0].index < 3) ticks.shift();
  return ticks;
}

export function shortDate(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

export function longDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

export function weekRange(w: Week): string {
  const sameMonth = w.start.slice(5, 7) === w.end.slice(5, 7);
  return sameMonth ? `${shortDate(w.start)}–${Number(w.end.slice(8, 10))}` : `${shortDate(w.start)} – ${shortDate(w.end)}`;
}

export function uptime(since: string, until: string): string {
  const [y1, m1, d1] = since.split('-').map(Number);
  const [y2, m2, d2] = until.split('-').map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  return `${Math.floor(months / 12)}y ${months % 12}m`;
}

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const fmt = (n: number) => n.toLocaleString('en-US');

/** Zaokrąglenie do 2 miejsc, żeby SVG nie puchło. */
export const r = (n: number) => Math.round(n * 100) / 100;

/** Deterministyczny generator losowy: ten sam input daje ten sam obrazek. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function svgDoc(o: { width: number; height: number; title: string; desc: string; style: string; body: string }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}" role="img" aria-labelledby="t d">
<title id="t">${esc(o.title)}</title>
<desc id="d">${esc(o.desc)}</desc>
<style>${o.style}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}</style>
${o.body}
</svg>
`;
}

/**
 * Wstawia jeden nasz SVG do drugiego jako zwykłe elementy (nie <image> — zagnieżdżone obrazy
 * się nie animują). Klasy, id i nazwy animacji dostają prefiks, żeby style się nie gryzły.
 */
export function namespaceSvg(svg: string, p: string): { css: string; body: string } {
  const css0 = svg.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
  const body0 = svg.slice(svg.indexOf('</style>') + 8, svg.lastIndexOf('</svg>'));
  const frames = [...css0.matchAll(/@keyframes ([\w-]+)/g)].map((m) => m[1]);
  const css = css0
    .replace(/@media \(prefers-reduced-motion: reduce\)\{\*\{animation:none!important\}\}/, '')
    .replace(/(^|\n)text\{/g, `$1.${p}root text{`)
    .replace(/\.([a-zA-Z][\w-]*)/g, `.${p}$1`)
    .replace(/@keyframes ([\w-]+)/g, `@keyframes ${p}$1`)
    .replace(/animation:([^;}]+)/g, (_, v: string) =>
      `animation:${v.replace(/[\w-]+/g, (t) => (frames.includes(t) ? p + t : t))}`);
  const body = body0
    .replace(/ id="([^"]+)"/g, ` id="${p}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${p}$1"`)
    .replace(/class="([^"]+)"/g, (_, v: string) => `class="${v.split(/\s+/).map((t) => p + t).join(' ')}"`);
  return { css, body };
}
