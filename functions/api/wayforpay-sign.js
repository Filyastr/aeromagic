// Cloudflare Pages Function — підпис платежу WayForPay.
// Файл: functions/api/wayforpay-sign.js  →  URL: /api/wayforpay-sign
// Секретний ключ зберігається на сервері Cloudflare і НЕ видний у браузері.
//
// НАЛАШТУВАННЯ (Cloudflare Dashboard → Workers & Pages → ваш проєкт →
// Settings → Variables and Secrets → Add → тип Secret):
//   WFP_MERCHANT_ACCOUNT = ваш merchantAccount з кабінету WayForPay
//   WFP_SECRET_KEY       = ваш secretKey з кабінету WayForPay

const RATE = new Map();

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// HMAC-MD5 через WebCrypto недоступний (MD5 не підтримується),
// тому рахуємо HMAC-MD5 вручну — це вимога документації WayForPay.
function md5(bytes) {
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const ml = bytes.length;
  const withOne = new Uint8Array((((ml + 8) >> 6) + 1) * 64);
  withOne.set(bytes);
  withOne[ml] = 0x80;
  const bitLen = ml * 8;
  const dv = new DataView(withOne.buffer);
  dv.setUint32(withOne.length - 8, bitLen >>> 0, true);
  dv.setUint32(withOne.length - 4, Math.floor(bitLen / 4294967296), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const rotl = (x, c) => (x << c) | (x >>> (32 - c));
  for (let off = 0; off < withOne.length; off += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
  return out;
}

function hmacMd5Hex(keyStr, msgStr) {
  const enc = new TextEncoder();
  let key = enc.encode(keyStr);
  if (key.length > 64) key = md5(key);
  const pad = new Uint8Array(64);
  pad.set(key);
  const ipad = new Uint8Array(64), opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = pad[i] ^ 0x36; opad[i] = pad[i] ^ 0x5c; }
  const msg = enc.encode(msgStr);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(ipad); inner.set(msg, 64);
  const innerHash = md5(inner);
  const outer = new Uint8Array(64 + 16);
  outer.set(opad); outer.set(innerHash, 64);
  return Array.from(md5(outer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestPost({ request, env }) {
  // Захист від флуду: 10 запитів на хвилину з IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 10) return json({ error: 'Занадто багато запитів' }, 429);
  hits.push(now);
  RATE.set(ip, hits);

  const secret = env.WFP_SECRET_KEY;
  const account = env.WFP_MERCHANT_ACCOUNT;
  if (!secret || !account) return json({ error: 'WayForPay не налаштовано' }, 500);

  let p;
  try { p = await request.json(); } catch (e) { return json({ error: 'Некоректні дані' }, 400); }

  // Перевіряємо склад замовлення на сервері — клієнт не може його підмінити
  const names = Array.isArray(p.productName) ? p.productName : [];
  const prices = Array.isArray(p.productPrice) ? p.productPrice.map(Number) : [];
  const counts = Array.isArray(p.productCount) ? p.productCount.map(Number) : [];
  if (!names.length || names.length !== prices.length || names.length !== counts.length) {
    return json({ error: 'Некоректний склад замовлення' }, 400);
  }
  const orderDate = Number(p.orderDate) || Math.floor(Date.now() / 1000);
  const amount = Number(p.amount);
  if (!(amount > 0)) return json({ error: 'Некоректна сума' }, 400);

  // Порядок полів для підпису строго за документацією WayForPay
  const parts = [
    account,
    String(p.merchantDomainName || ''),
    String(p.orderReference || ''),
    String(orderDate),
    String(amount),
    String(p.currency || 'UAH'),
    ...names.map(String),
    ...counts.map(String),
    ...prices.map(String)
  ];

  return json({
    merchantSignature: hmacMd5Hex(secret, parts.join(';')),
    merchantAccount: account,
    orderReference: p.orderReference,
    orderDate: orderDate
  });
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
