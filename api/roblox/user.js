const https = require('https');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const username = req.query.username;
  if (!username || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    res.status(400).json({ error: 'invalid_username' });
    return;
  }

  try {
    const userResponse = await fetchRoblox('https://users.roblox.com/v1/usernames/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
    });

    const userData = await userResponse.json();
    const user = userData.data?.[0];
    if (!user) {
      res.status(200).json({ user: null });
      return;
    }

    const thumbUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png&isCircular=false`;
    const thumbResponse = await fetchRoblox(thumbUrl, { method: 'GET' });
    const thumbData = await thumbResponse.json();

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName || user.name,
        imageUrl: thumbData.data?.[0]?.imageUrl || null
      }
    });
  } catch (error) {
    res.status(502).json({ error: 'roblox_unavailable' });
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