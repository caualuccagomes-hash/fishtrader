const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const userId = req.query.userId;
  if (!userId || !Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) {
    res.status(400).json({ error: 'invalid_user_id' });
    return;
  }

  try {
    const url = `https://api.rolimons.com/players/v1/playerassets/${userId}?limit=100`;
    const response = await fetchRoblox(url, { method: 'GET', headers: { 'user-agent': 'FishTrader/1.0' } });
    const data = await response.json();

    if (!response.ok || !data || !data.items) {
      res.status(200).json({ private: true, items: [], error: 'items_unavailable' });
      return;
    }

    const items = (data.items || []).map(item => ({
      itemId: item.item_id || item.itemId || null,
      name: item.name || 'Item desconhecido',
      rap: Number(item.rap || item.recentAveragePrice || 0),
      value: Number(item.value || item.estimatedValue || 0),
      imageUrl: item.image_url || item.imageUrl || null,
      serial: item.serial || item.serialNumber || null
    }));

    res.status(200).json({
      private: false,
      count: items.length,
      rap: items.reduce((sum, i) => sum + i.rap, 0),
      items
    });
  } catch (error) {
    res.status(502).json({ error: 'rolimons_unavailable' });
  }
};

function fetchRoblox(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      ...options,
      headers: { 'user-agent': 'FishTrader/1.0', ...options.headers }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => JSON.parse(data) }));
    });
    if (options.body) req.write(options.body);
    req.end();
    req.on('error', reject);
  });
}