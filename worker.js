// Stock Book notifier – Cloudflare Worker
// Sends a push notification to every phone that turned on notifications in Stock Book.
const PUBLIC_KEY = 'BANEvvQER9SxZbvtUMxGkQEPU1dFBEltyW5luxXseHR9J-RBbFseHYo_TIA8M1Y2ev2KcvffSSvZ5AJS-hq1HyY';
const PRIVATE_JWK = {"kty": "EC", "crv": "P-256", "x": "A0S-9ARH1LFlu-1QzEaRAQ9TV0UESW3JbmW7Fex4dH0", "y": "J-RBbFseHYo_TIA8M1Y2ev2KcvffSSvZ5AJS-hq1HyY", "d": "I5_XOwl8M5d0gWX4Z_HeLyP2N1xYxCu5IB6thRoHc3Y"};
const SUBJECT = 'https://mohamedjameel1006-gif.github.io/Flower-stock/';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = obj => b64u(new TextEncoder().encode(JSON.stringify(obj)));
let keyPromise;

async function vapidJwt(aud) {
  keyPromise = keyPromise || crypto.subtle.importKey('jwk', PRIVATE_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const key = await keyPromise;
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: SUBJECT });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return unsigned + '.' + b64u(sig);
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return new Response('Stock Book notifier is running ✓', { headers: CORS });
    let body;
    try { body = JSON.parse(await req.text()); } catch { return new Response('bad request', { status: 400, headers: CORS }); }
    const db = String(body.db || '').replace(/\/+$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/.test(db)) return new Response('bad database', { status: 400, headers: CORS });
    const subs = (await (await fetch(db + '/push.json')).json()) || {};
    const jwts = {};
    let sent = 0, failed = 0;
    await Promise.all(Object.entries(subs).map(async ([id, v]) => {
      if (id === body.from || !v || !v.sub || !v.sub.endpoint) return;
      try {
        const ep = v.sub.endpoint, aud = new URL(ep).origin;
        jwts[aud] = jwts[aud] || vapidJwt(aud);
        const r = await fetch(ep, { method: 'POST', headers: { TTL: '86400', Urgency: 'high', 'Content-Length': '0', Authorization: `vapid t=${await jwts[aud]}, k=${PUBLIC_KEY}` } });
        if (r.status === 404 || r.status === 410) await fetch(db + '/push/' + id + '.json', { method: 'DELETE' });
        r.ok ? sent++ : failed++;
      } catch (e) { failed++; }
    }));
    return new Response(JSON.stringify({ sent, failed }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
};
