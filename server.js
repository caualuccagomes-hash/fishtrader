const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

async function lookupRoblox(username) {
  const userResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!userResponse.ok) throw new Error(`Roblox users API returned ${userResponse.status}`);
  const userData = await userResponse.json();
  const user = userData.data?.[0];
  if (!user) return null;

  const avatarUrl = new URL('https://thumbnails.roblox.com/v1/users/avatar-headshot');
  avatarUrl.search = new URLSearchParams({ userIds: String(user.id), size: '150x150', format: 'Png', isCircular: 'false' });
  const avatarResponse = await fetch(avatarUrl);
  if (!avatarResponse.ok) throw new Error(`Roblox thumbnails API returned ${avatarResponse.status}`);
  const avatarData = await avatarResponse.json();
  return { id: user.id, name: user.name, displayName: user.displayName, imageUrl: avatarData.data?.[0]?.imageUrl || null };
}

async function getCollectibles(userId) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 10; page++) {
    const endpoint = new URL(`https://inventory.roblox.com/v1/users/${userId}/assets/collectibles`);
    endpoint.searchParams.set('limit', '100');
    endpoint.searchParams.set('sortOrder', 'Asc');
    if (cursor) endpoint.searchParams.set('cursor', cursor);
    const response = await fetch(endpoint, { headers: { 'user-agent': 'FishTrader/1.0' } });
    if (response.status === 403) return { private: true, items: [] };
    if (!response.ok) throw new Error(`Roblox inventory API returned ${response.status}`);
    const pageData = await response.json();
    items.push(...(pageData.data || []));
    cursor = pageData.nextPageCursor;
    if (!cursor || !pageData.data?.length) break;
  }

  const rap = items.reduce((sum, item) => sum + (Number(item.recentAveragePrice) || 0), 0);
  const thumbnails = new Map();
  for (let offset = 0; offset < items.length; offset += 100) {
    const batch = items.slice(offset, offset + 100);
    const thumbnailUrl = new URL('https://thumbnails.roblox.com/v1/assets');
    thumbnailUrl.search = new URLSearchParams({ assetIds: batch.map(item => item.assetId).join(','), size: '150x150', format: 'Png', isCircular: 'false' });
    try {
      const thumbResponse = await fetch(thumbnailUrl);
      if (thumbResponse.ok) {
        const thumbData = await thumbResponse.json();
        for (const thumb of thumbData.data || []) thumbnails.set(Number(thumb.targetId), thumb.imageUrl);
      }
    } catch (error) {
      console.error('Roblox item thumbnails lookup failed:', error.message);
    }
  }
  return {
    private: false,
    count: items.length,
    rap,
    items: items.map(item => ({
      assetId: item.assetId,
      name: item.name,
      rap: Number(item.recentAveragePrice) || 0,
      serial: item.serialNumber || null,
      imageUrl: thumbnails.get(Number(item.assetId)) || null,
    })),
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === 'GET' && url.pathname === '/api/roblox/user') {
    const username = (url.searchParams.get('username') || '').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'invalid_username' }));
    }
    try {
      const user = await lookupRoblox(username);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ user }));
    } catch (error) {
      console.error('Roblox lookup failed:', error.message);
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'roblox_unavailable' }));
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/roblox/inventory') {
    const userId = Number(url.searchParams.get('userId'));
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'invalid_user_id' }));
    }
    try {
      const inventory = await getCollectibles(userId);
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(JSON.stringify(inventory));
    } catch (error) {
      console.error('Roblox inventory lookup failed:', error.message);
      res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: 'inventory_unavailable' }));
    }
  }

  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(root, `.${requested}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`Fish Trader rodando em http://localhost:${port}`));
