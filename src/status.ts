import { type Day, type Theme, profile, toWeeks, monthTicks, esc, fmt, r, FONT, svgDoc, uptime, namespaceSvg, longDate, weekRange } from './lib.ts';

const PALETTE = {
  dark: {
    panel: '#161b22', border: '#30363d', grid: '#21262d',
    text: '#e6edf3', text2: '#9198a1', text3: '#6e7681',
    series: '#58a6ff', ok: '#3fb950', empty: '#21262d',
    ramp: ['#0d419d', '#1f6feb', '#58a6ff', '#a5d6ff'],
  },
  light: {
    panel: '#ffffff', border: '#d1d9e0', grid: '#eff2f5',
    text: '#1f2328', text2: '#59636e', text3: '#818b98',
    series: '#0969da', ok: '#1a7f37', empty: '#eff2f5',
    ramp: ['#b6e3ff', '#54aeff', '#0969da', '#0a3069'],
  },
};

const W = 900;
const GAP = 16;

function niceStep(max: number, lines: number) {
  const raw = max / lines;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

const check = (cx: number, cy: number, c: { ok: string; panel: string }) =>
  `<circle cx="${cx}" cy="${cy}" r="7" fill="${c.ok}"/><path d="M${cx - 3.2} ${cy + 0.2}l2.2 2.2 4.2-4.4" fill="none" stroke="${c.panel}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;

export function renderStatus(days: Day[], theme: Theme, opts: { middle?: { svg: string; height: number }; components?: boolean } = {}): string {
  const c = PALETTE[theme];
  const weeks = toWeeks(days);
  const today = days[days.length - 1].date;
  const total = days.reduce((s, d) => s + d.count, 0);
  const pk = weeks.reduce((m, w) => (w.total > m.total ? w : m), weeks[0]);
  const last30 = days.slice(-30).reduce((s, d) => s + d.count, 0);
  const last90 = days.slice(-90);
  const active90 = last90.filter((d) => d.count > 0).length;

  const out: string[] = [];
  let extraCss = '';
  let y = 0;
  let delay = 0;
  const group = (body: string, d = delay) => `<g class="in" style="animation-delay:${r(d)}s">${body}</g>`;
  const panel = (x: number, py: number, w: number, h: number) =>
    `<rect class="panel" x="${x + 0.5}" y="${py + 0.5}" width="${w - 1}" height="${h - 1}" rx="6"/>`;

  // ── nagłówek: pulsująca kropka statusu + nazwa ──────────────────────────
  const H_HEAD = 56;
  out.push(
    group(
      panel(0, y, W, H_HEAD) +
        `<circle class="pulse" cx="27" cy="${y + 28}" r="5" fill="${c.ok}"/>` +
        `<circle cx="27" cy="${y + 28}" r="5" fill="${c.ok}"/>` +
        `<text x="44" y="${y + 33.5}"><tspan class="name">${esc(profile.name)}</tspan><tspan class="sub" dx="10">·</tspan><tspan class="head" dx="10">All systems operational</tspan></text>` +
        `<text class="sub" x="${W - 22}" y="${y + 33}" text-anchor="end">${esc(profile.city)} · updated ${longDate(today)}</text>`,
      0,
    ),
  );
  y += H_HEAD + GAP;

  // ── kafelki ──────────────────────────────────────────────────────────────
  const H_TILE = 100;
  const tw = (W - 3 * GAP) / 4;
  const tiles = [
    { label: 'ROLE', value: profile.role, sub: profile.company, ok: false },
    { label: 'UPTIME', value: uptime(profile.githubSince, today), sub: `on GitHub since ${profile.githubSince.slice(0, 4)}`, ok: false },
    { label: 'CONTRIBUTIONS · 12 MO', value: fmt(total), sub: `${fmt(last30)} in the last 30 days`, ok: false },
    { label: 'INCIDENTS', value: '0 open', sub: 'all resolved', ok: true },
  ];
  tiles.forEach((t, i) => {
    const x = i * (tw + GAP);
    out.push(
      group(
        panel(x, y, tw, H_TILE) +
          `<text class="lbl" x="${r(x + 20)}" y="${y + 30}">${esc(t.label)}</text>` +
          `<text class="val" x="${r(x + 20)}" y="${y + 66}">${esc(t.value)}</text>` +
          `<text class="sub" x="${r(x + 20)}" y="${y + 86}">${esc(t.sub)}</text>` +
          (t.ok ? check(r(x + tw - 24), y + 26, c) : ''),
        0.12 + i * 0.08,
      ),
    );
  });
  y += H_TILE + GAP;

  if (opts.middle) {
    // osadzony panel (np. Wisła): elementy wstawione bezpośrednio, z prefiksem klas i id
    const ns = namespaceSvg(opts.middle.svg, 'w-');
    extraCss = ns.css;
    out.push(`<svg class="w-root" x="0" y="${y}" width="${W}" height="${opts.middle.height}" viewBox="0 0 ${W} ${opts.middle.height}">${ns.body}</svg>`);
    y += opts.middle.height + GAP;
  } else {
    // ── wykres tygodniowy ───────────────────────────────────────────────────
    const H_CHART = 184;
    const px0 = 56, px1 = W - 24, py0 = y + 52, py1 = y + 146;
    const peak = weeks.reduce((m, w, i) => (w.total > weeks[m].total ? i : m), 0);
    const step = niceStep(weeks[peak].total, 4);
    const yMax = weeks[peak].total * 1.12;
    const X = (i: number) => px0 + (i * (px1 - px0)) / (weeks.length - 1);
    const Y = (v: number) => py1 - (v / yMax) * (py1 - py0);
    const pts = weeks.map((w, i) => `${r(X(i))} ${r(Y(w.total))}`);
    const grid: string[] = [];
    for (let v = 0; v <= yMax; v += step) {
      grid.push(`<line class="grid" x1="${px0}" x2="${px1}" y1="${r(Y(v)) + 0.5}" y2="${r(Y(v)) + 0.5}"/>`);
      grid.push(`<text class="tick" x="${px0 - 10}" y="${r(Y(v)) + 3.5}" text-anchor="end">${fmt(v)}</text>`);
    }
    const months = monthTicks(weeks).map(
      (t) => `<text class="tick" x="${r(X(t.index))}" y="${y + 168}" text-anchor="middle">${t.label}</text>`,
    );
    const last = weeks.length - 1;
    const annotations =
      `<circle cx="${r(X(peak))}" cy="${r(Y(pk.total))}" r="4" fill="${c.series}" stroke="${c.panel}" stroke-width="2"/>` +
      `<text class="anno" x="${r(X(peak) - 10)}" y="${r(Y(pk.total)) + 4}" text-anchor="end"><tspan class="sub">peak · ${weekRange(pk)} ·</tspan> ${fmt(pk.total)}</text>` +
      (peak !== last
        ? `<circle class="pulse" cx="${r(X(last))}" cy="${r(Y(weeks[last].total))}" r="4" fill="${c.series}"/>` +
          `<circle cx="${r(X(last))}" cy="${r(Y(weeks[last].total))}" r="4" fill="${c.series}" stroke="${c.panel}" stroke-width="2"/>`
        : '');
    out.push(
      group(
        panel(0, y, W, H_CHART) +
          `<text class="t1" x="20" y="${y + 30}">Contributions per week</text>` +
          `<text class="sub" x="${W - 22}" y="${y + 30}" text-anchor="end">last 12 months · this week ${fmt(weeks[last].total)}</text>` +
          grid.join('') +
          months.join('') +
          `<path class="area" d="M${r(X(0))} ${py1}L${pts.join('L')}L${r(X(last))} ${py1}Z" fill="url(#area)"/>` +
          `<path class="line draw" pathLength="1" d="M${pts.join('L')}"/>` +
          `<g class="late">${annotations}</g>`,
        0.45,
      ),
    );
    y += H_CHART + GAP;
  }

  // ── paski aktywności (90 dni) ───────────────────────────────────────────
  const H_STRIP = 104;
  const bx0 = 20, bx1 = W - 20, slot = (bx1 - bx0 + 2) / last90.length, bw = slot - 2, bh = 30, by = y + 46;
  const bars = last90
    .map((d, i) => {
      const fill = d.level === 0 ? c.empty : c.ramp[d.level - 1];
      return `<rect class="bar" x="${r(bx0 + i * slot)}" y="${by}" width="${r(bw)}" height="${bh}" rx="2" fill="${fill}" style="animation-delay:${r(0.9 + i * 0.012)}s"><title>${d.date}: ${d.count}</title></rect>`;
    })
    .join('');
  const lx = W / 2 - 62;
  const legend =
    `<text class="tick" x="${lx - 8}" y="${by + bh + 22}" text-anchor="end">Less</text>` +
    [c.empty, ...c.ramp].map((f, i) => `<rect x="${lx + i * 13}" y="${by + bh + 13}" width="10" height="10" rx="2" fill="${f}"/>`).join('') +
    `<text class="tick" x="${lx + 5 * 13 + 6}" y="${by + bh + 22}">More</text>`;
  out.push(
    group(
      panel(0, y, W, H_STRIP) +
        `<text class="t1" x="20" y="${y + 30}">Active days</text>` +
        `<text class="sub" x="${W - 22}" y="${y + 30}" text-anchor="end">${active90} of the last 90 days</text>` +
        bars +
        `<text class="tick" x="${bx0}" y="${by + bh + 22}">90 days ago</text>` +
        `<text class="tick" x="${bx1}" y="${by + bh + 22}" text-anchor="end">today</text>` +
        legend,
      0.75,
    ),
  );
  y += H_STRIP + GAP;

  if (opts.components !== false) {
    // ── komponenty ──────────────────────────────────────────────────────────
    const H_COMP = 140;
    const colW = W / 2;
    const rows = profile.components
      .map((comp, i) => {
        const cx = (i % 2) * colW;
        const ry = y + 40 + Math.floor(i / 2) * 48;
        return (
          `<g class="in" style="animation-delay:${r(1.25 + i * 0.1)}s">` +
          `<text class="cname" x="${cx + 20}" y="${ry + 20}">${esc(comp.name)}</text>` +
          `<text class="sub" x="${cx + 20}" y="${ry + 36}">${esc(comp.stack)}</text>` +
          check(cx + colW - 108, ry + 24, c) +
          `<text class="sub" x="${cx + colW - 22}" y="${ry + 28}" text-anchor="end">Operational</text>` +
          `</g>`
        );
      })
      .join('');
    out.push(
      group(
        panel(0, y, W, H_COMP) +
          `<text class="t1" x="20" y="${y + 30}">Components</text>` +
          `<line class="grid" x1="20" x2="${W - 20}" y1="${y + 88.5}" y2="${y + 88.5}"/>` +
          `<line class="grid" x1="${colW + 0.5}" x2="${colW + 0.5}" y1="${y + 48}" y2="${y + H_COMP - 12}"/>` +
          rows,
        1.1,
      ),
    );
    y += H_COMP;
  } else {
    y -= GAP;
  }

  const style = `
text{font-family:${FONT};fill:${c.text}}
.panel{fill:${c.panel};stroke:${c.border}}
.name{font-size:18px;font-weight:600}
.head{font-size:15px;font-weight:500}
.t1{font-size:13px;font-weight:600}
.cname{font-size:13px;font-weight:600}
.lbl{font-size:11px;font-weight:600;letter-spacing:.06em;fill:${c.text2}}
.val{font-size:28px;font-weight:600;letter-spacing:-.01em}
.sub{font-size:12px;fill:${c.text2}}
.tick{font-size:10.5px;fill:${c.text3};font-variant-numeric:tabular-nums}
.anno{font-size:12px;font-weight:600}
.halo{paint-order:stroke;stroke:${c.panel};stroke-width:4px;stroke-linejoin:round}
.grid{stroke:${c.grid};stroke-width:1}
.line{fill:none;stroke:${c.series};stroke-width:2;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:1 2}
.in{animation:in .7s cubic-bezier(.2,.7,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(8px)}}
.draw{animation:draw 1.8s cubic-bezier(.45,0,.2,1) .7s both}
@keyframes draw{from{stroke-dashoffset:1}}
.area{animation:fade 1s ease-out 1.7s both}
.late{animation:fade .6s ease-out 2.3s both}
@keyframes fade{from{opacity:0}}
.bar{transform-box:fill-box;transform-origin:50% 100%;animation:grow .45s cubic-bezier(.2,.7,.2,1) both}
@keyframes grow{from{transform:scaleY(0)}}
.pulse{opacity:0;transform-box:fill-box;transform-origin:center;animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{opacity:.6;transform:scale(1)}80%,100%{opacity:0;transform:scale(3.2)}}
${extraCss}`;

  const defs = `<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${c.series}" stop-opacity="${theme === 'dark' ? 0.32 : 0.2}"/><stop offset="1" stop-color="${c.series}" stop-opacity="0"/></linearGradient></defs>`;

  return svgDoc({
    width: W,
    height: y,
    title: `${profile.name} — ${profile.role} at ${profile.company}`,
    desc: `Status page: ${fmt(total)} contributions in the last 12 months, peak week ${weekRange(pk)} with ${fmt(pk.total)}, ${active90} active days of the last 90. Stack: ${profile.components.map((x) => `${x.name} (${x.stack})`).join(', ')}.`,
    style,
    body: defs + out.join('\n'),
  });
}
