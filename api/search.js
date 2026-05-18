export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const isNumber = /^\d+$/.test(q.trim());
    let searchTerm = q.trim();

    // Si ce n'est pas un numéro, on traduit via Claude
    if (!isNumber) {
      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{
            role: 'user',
            content: `Traduis ce nom de Pokémon en anglais (nom exact utilisé dans le jeu de cartes anglais). Réponds UNIQUEMENT avec le nom anglais, rien d'autre. Si c'est déjà en anglais, retourne-le tel quel. Nom : "${q.trim()}"`
          }]
        })
      });

      if (claudeRes.ok) {
        const claudeData = await claudeRes.json();
        const translated = claudeData.content?.[0]?.text?.trim();
        if (translated) searchTerm = translated;
      }
    }

    // Recherche exacte d'abord
    const queryStr = isNumber ? `number:${searchTerm}` : `name:"${searchTerm}"`;
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}&pageSize=20&orderBy=-set.releaseDate`;
    const apiRes = await fetch(url);
    const data = await apiRes.json();

    // Fallback : recherche partielle si aucun résultat
    if (!data.data?.length && !isNumber) {
      const fallbackUrl = `https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(searchTerm + '*')}&pageSize=20&orderBy=-set.releaseDate`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      return res.status(200).json(fallbackData);
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
