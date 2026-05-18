export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const isNumber = /^\d+$/.test(q.trim());
    const queryStr = isNumber ? `number:${q.trim()}` : `name:"${q.trim()}"`;
    const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}&pageSize=20&orderBy=-set.releaseDate`;

    const apiRes = await fetch(url);
    const data = await apiRes.json();

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
