// Relais PMU pour l'appli « Suivi Paris » — à coller dans un Cloudflare Worker (gratuit).
// Il récupère les données publiques du PMU et ajoute l'autorisation qui manque
// pour que le navigateur puisse les lire. Il n'accepte que les adresses du PMU.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const target = new URL(request.url).searchParams.get('url') || '';
    if (!/^https:\/\/(online|offline)\.turfinfo\.api\.pmu\.fr\//.test(target)) {
      return new Response('Adresse non autorisée', { status: 400, headers: CORS });
    }
    const r = await fetch(target, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (SuiviParis)' },
      cf: { cacheTtl: 30 },
    });
    return new Response(await r.text(), {
      status: r.status,
      headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
  },
};
