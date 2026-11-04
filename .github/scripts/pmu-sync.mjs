// Copie les données publiques du PMU (programme, partants, rapports) dans le dossier ./out
// pour que l'appli « Suivi Paris » puisse les lire depuis GitHub (le PMU bloque la lecture directe par un site web).
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const API = process.env.PMU_API || 'https://online.turfinfo.api.pmu.fr/rest/client/1/programme/';
const OUT = 'out/pmu';
const PREV = 'prev/pmu'; // copie précédente (pour ne pas tout re-télécharger)
const KEEP_DAYS = 7;

const parisDate = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * 864e5);
  const [y, m, j] = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(d).split('-');
  return `${j}${m}${y}`;
};
const exists = (p) => access(p).then(() => true, () => false);
async function save(path, data) {
  const f = join(OUT, path + '.json');
  await mkdir(dirname(f), { recursive: true });
  await writeFile(f, typeof data === 'string' ? data : JSON.stringify(data));
}
async function reuse(path) {
  const f = join(PREV, path + '.json');
  if (!(await exists(f))) return null;
  const txt = await readFile(f, 'utf8');
  await save(path, txt);
  return txt;
}
async function get(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(API + path, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (SuiviParis)' } });
      if (r.status === 204 || r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      if (i === 2) { console.warn('échec', path, e.message); return null; }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}
async function pool(jobs, n = 6) {
  const run = async () => { while (jobs.length) await jobs.shift()(); };
  await Promise.all(Array.from({ length: n }, run));
}

let count = 0;
for (let off = -(KEEP_DAYS - 1); off <= 1; off++) {
  const day = parisDate(off);
  const live = off >= 0; // aujourd'hui et demain : on rafraîchit
  let prog = live ? null : await reuse(day);
  if (prog) prog = JSON.parse(prog);
  else { prog = await get(day); if (!prog) continue; await save(day, prog); }
  const jobs = [];
  for (const r of prog.programme?.reunions || []) {
    for (const c of r.courses || []) {
      const base = `${day}/R${r.numOfficiel}/C${c.numOrdre}`;
      const finished = Array.isArray(c.ordreArrivee) && c.ordreArrivee.length > 0;
      jobs.push(async () => {
        // partants : on garde l'ancienne copie pour les courses terminées, sinon on recharge (cotes)
        if (!(finished && (await reuse(base + '/participants')))) {
          const p = await get(base + '/participants');
          if (p) await save(base + '/participants', p);
        }
        if (finished && !(await reuse(base + '/rapports-definitifs'))) {
          const rp = await get(base + '/rapports-definitifs');
          if (rp) await save(base + '/rapports-definitifs', rp);
        }
        count++;
      });
    }
  }
  await pool(jobs);
  console.log(day, 'ok');
}
await writeFile('out/maj.json', JSON.stringify({ maj: new Date().toISOString(), courses: count }));
console.log('Courses copiées :', count);
