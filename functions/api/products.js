import { json, checkAdmin, kv } from '../_lib/auth.js';

// GET  /api/products  — список товарів (спершу з KV, далі з products.json)
// PUT  /api/products  — зберегти список (потрібен пароль адміністратора)

export async function onRequestGet({ env, request }) {
  const store = kv(env);
  if (store) {
    const saved = await store.get('products', 'json');
    if (saved && Array.isArray(saved.items)) return json(saved);
  }
  const url = new URL(request.url);
  const file = await fetch(new URL('/products.json', url.origin));
  if (file.ok) return json(await file.json());
  return json({ items: [] });
}

export async function onRequestPut({ request, env }) {
  const err = checkAdmin(request, env);
  if (err) return json({ error: err }, 401);
  const store = kv(env);
  if (!store) return json({ error: 'KV не підключено (binding AEROMAGIC)' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'Некоректні дані' }, 400); }
  if (!body || !Array.isArray(body.items)) return json({ error: 'Очікується { items: [...] }' }, 400);
  const items = body.items.slice(0, 2000).map(i => ({
    id: Number(i.id),
    name: String(i.name || '').slice(0, 200),
    price: Number(i.price) || 0,
    cat: String(i.cat || 'sets'),
    badge: String(i.badge || '').slice(0, 20),
    rating: Number(i.rating) || 50,
    stock: !!i.stock,
    img: String(i.img || '').slice(0, 500)
  }));
  await store.put('products', JSON.stringify({ items, updatedAt: new Date().toISOString() }));
  return json({ ok: true, count: items.length });
}
