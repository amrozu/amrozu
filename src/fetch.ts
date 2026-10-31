// Pobiera publiczny kalendarz kontrybucji (bez tokenu). Jeśli w ustawieniach profilu
// włączone jest „Private contributions”, liczby obejmują też prywatne repozytoria.
import { mkdirSync, writeFileSync } from 'node:fs';

const user = process.argv[2] ?? 'amrozu';
const html = await (await fetch(`https://github.com/users/${user}/contributions`)).text();

const cells = new Map<string, { date: string; level: number; count: number }>();
for (const m of html.matchAll(/<td([^>]*)>/g)) {
  const a = m[1];
  const date = a.match(/data-date="([^"]+)"/)?.[1];
  const id = a.match(/id="([^"]+)"/)?.[1];
  const level = a.match(/data-level="(\d)"/)?.[1];
  if (date && id && level) cells.set(id, { date, level: Number(level), count: 0 });
}
for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
  const cell = cells.get(m[1]);
  const n = m[2].match(/^(\d[\d,]*) contribution/);
  if (cell) cell.count = n ? Number(n[1].replace(/,/g, '')) : 0;
}
const days = [...cells.values()].sort((a, b) => a.date.localeCompare(b.date));
if (days.length < 300) throw new Error(`Za mało dni (${days.length}) — GitHub zmienił HTML kalendarza?`);
mkdirSync('data', { recursive: true });
writeFileSync('data/contributions.json', JSON.stringify(days, null, 0));
console.log(`OK: ${days.length} dni, ${days.reduce((s, d) => s + d.count, 0)} kontrybucji`);
