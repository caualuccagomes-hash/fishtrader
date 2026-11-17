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
    const items = [];
    let cursor = null;

    for (let page = 0; page < 5; page++) {
      const url = new URL(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?limit=100&sortOrder=Asc`);
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetchRoblox(url.toString(), {
        method: 'GET',
        headers: { 'user-agent': 'FishTrader/1.0' }
      });

      if (response.status === 403) {
        res.status(200).json({ private: true, items: [] });
        return;
      }

      const pageData = await response.json();
      items.push(...(pageData.data || []));
      cursor = pageData.nextPageCursor;
      if (!cursor || !pageData.data?.length) break;
    }

    const rap = items.reduce((sum, item) => sum + (Number(item.recentAveragePrice) || 0), 0);

    const thumbnails = new Map();
    for (let offset = 0; offset < items.length; offset += 100) {
      const batch = items.slice(offset, offset + 100);
      const thumbUrl = new URL('https://thumbnails.roblox.com/v1/assets');
      thumbUrl.search = new URLSearchParams({
        assetIds: batch.map(i => i.assetId).join(','),
        size: '150x150', format: 'Png', isCircular: 'false'
      });

      try {
        const thumbResponse = await fetchRoblox(thumbUrl.toString(), { method: 'GET' });
        const thumbData = await thumbResponse.json();
        for (const thumb of thumbData.data || []) thumbnails.set(Number(thumb.targetId), thumb.imageUrl);
      } catch (e) {}
    }

    res.status(200).json({
      private: false,
      count: items.length,
      rap,
      items: items.map(item => ({
        assetId: item.assetId,
        name: item.name,
        rap: Number(item.recentAveragePrice) || 0,
        serial: item.serialNumber || null,
        imageUrl: thumbnails.get(Number(item.assetId)) || null
      }))
    });
  } catch (error) {
    res.status(502).json({ error: 'inventory_unavailable' });
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