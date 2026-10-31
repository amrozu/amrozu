import { mkdirSync, writeFileSync } from 'node:fs';
import { type Theme, loadDays } from './lib.ts';
import { renderStatus } from './status.ts';
import { renderWisla } from './wisla.ts';

const days = loadDays('data/contributions.json');
mkdirSync('out', { recursive: true });
for (const theme of ['light', 'dark'] as Theme[]) {
  const wisla = renderWisla(days, theme, { panel: true });
  writeFileSync(`out/profile-${theme}.svg`, renderStatus(days, theme, { middle: { svg: wisla, height: 500 }, components: false }));
}
console.log(`OK: ${days.length} dni, ${days.reduce((s, d) => s + d.count, 0)} kontrybucji → out/`);
