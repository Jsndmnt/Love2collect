const TCGDEX = 'https://api.tcgdex.net/v2/fr';
const MAX_RESULTS = 20;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  const term = q.trim();
  const isNumber = /^\d+$/.test(term);

  try {
    // Recherche directe en francais : plus besoin de traduire quoi que ce soit.
    // Le filtre par defaut est "laxiste" (recherche partielle).
    // Un double egal (name==) forcerait la correspondance exacte.
    const filter = isNumber
      ? `localId=${encodeURIComponent(term)}`
      : `name=${encodeURIComponent(term)}`;

    const listRes = await fetch(`${TCGDEX}/cards?${filter}`);
    if (!listRes.ok) throw new Error(`TCGdex list ${listRes.status}`);

    const briefs = await listRes.json();
    if (!Array.isArray(briefs) || briefs.length === 0) {
      return res.status(200).json({ data: [] });
    }

    // L'endpoint /cards ne renvoie que des resumes (id, localId, name, image).
    // Il faut un second appel par carte pour la rarete et le set.
    const details = await Promise.all(
      briefs.slice(0, MAX_RESULTS).map(async (b) => {
        try {
          const r = await fetch(`${TCGDEX}/cards/${b.id}`);
          return r.ok ? await r.json() : null;
        } catch {
          return null;
        }
      })
    );

    // On remet la reponse au format attendu par App.jsx pour ne rien casser cote client.
    const data = details.filter(Boolean).map((c) => ({
      id: c.id,
      name: c.name,
      number: c.localId,
      rarity: c.rarity || '',
      set: {
        id: c.set?.id || '',
        name: c.set?.name || '',
        printedTotal: c.set?.cardCount?.official ?? null,
        total: c.set?.cardCount?.total ?? null,
      },
      images: {
        small: c.image ? `${c.image}/low.webp` : null,
        large: c.image ? `${c.image}/high.png` : null,
      },
    }));

    // Cartes les plus recentes en premier (approximation via l'id de set).
    data.sort((a, b) => (b.set.id || '').localeCompare(a.set.id || ''));

    res.status(200).json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
