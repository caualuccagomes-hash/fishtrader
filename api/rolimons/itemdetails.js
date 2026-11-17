const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const itemId = req.query.itemId;
  if (!itemId || !Number.isSafeInteger(Number(itemId)) || Number(itemId) <= 0) {
    res.status(400).json({ error: 'invalid_item_id' });
    return;
  }

  try {
    const url = `https://api.rolimons.com/items/v2/itemdetails?itemIds=${itemId}`;
    const response = await fetchRoblox(url, { method: 'GET', headers: { 'user-agent': 'FishTrader/1.0' } });
    const data = await response.json();

    if (!response.ok || !data || !data.details || data.details.length === 0) {
      res.status(404).json({ error: 'item_not_found' });
      return;
    }

    const detail = data.details[0];
    res.status(200).json({
      itemId: Number(itemId),
      name: detail.name || 'Item desconhecido',
      value: Number(detail.value || detail.value_estimate || 0),
      rap: Number(detail.rap || detail.recentAveragePrice || 0),
      demand: detail.demand || null,
      trend: detail.trend || null,
      imageUrl: detail.image_url || detail.imageUrl || null
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