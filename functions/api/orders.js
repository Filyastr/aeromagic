import { json, checkAdmin, kv } from '../_lib/auth.js';

// GET /api/orders            — останні замовлення (пароль адміністратора)
// GET /api/orders?view=clients — база клієнтів: імʼя, телефон, email, сума
// GET /api/orders?format=csv   — вивантаження у CSV для Excel

export async function onRequestGet({ request, env }) {
  const err = checkAdmin(request, env);
  if (err) return json({ error: err }, 401);
  const store = kv(env);
  if (!store) return json({ error: 'KV не підключено (binding AEROMAGIC)' }, 500);

  const url = new URL(request.url);
  const view = url.searchParams.get('view') || 'orders';

  if (view === 'clients') {
    const list = await store.list({ prefix: 'client:', limit: 1000 });
    const clients = [];
    for (const k of list.keys) {
      const c = await store.get(k.name, 'json');
      if (c) clients.push(c);
    }
    clients.sort((a, b) => (b.lastOrderAt || '').localeCompare(a.lastOrderAt || ''));
    if (url.searchParams.get('format') === 'csv') return csv(
      ['Імʼя', 'Телефон', 'Email', 'Замовлень', 'Сума, грн', 'Останнє замовлення'],
      clients.map(c => [c.name, c.phone, c.email || '', c.ordersCount, c.totalSpent, c.lastOrderAt]),
      'clients.csv'
    );
    return json({ clients });
  }

  const list = await store.list({ prefix: 'order:', limit: 300 });
  const orders = [];
  for (const k of list.keys) {
    const o = await store.get(k.name, 'json');
    if (o) orders.push(o);
  }
  orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (url.searchParams.get('format') === 'csv') return csv(
    ['Номер', 'Дата', 'Клієнт', 'Телефон', 'Email', 'Сума, грн', 'Доставка', 'Оплата', 'Товари', 'Коментар'],
    orders.map(o => [
      o.orderNo, o.createdAt, o.client.name, o.client.phone, o.client.email || '',
      o.amount, o.delivery || '', o.payment || '',
      (o.items || []).map(i => i.name + ' x' + i.qty).join('; '), o.note || ''
    ]),
    'orders.csv'
  );
  return json({ orders });
}

function csv(head, rows, filename) {
  const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const body = [head, ...rows].map(r => r.map(esc).join(';')).join('\r\n');
  return new Response('\ufeff' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + filename + '"'
    }
  });
}

// DELETE /api/orders?key=order:... — прибрати запис
export async function onRequestDelete({ request, env }) {
  const err = checkAdmin(request, env);
  if (err) return json({ error: err }, 401);
  const store = kv(env);
  if (!store) return json({ error: 'KV не підключено' }, 500);
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!/^(order|client):/.test(key)) return json({ error: 'Некоректний ключ' }, 400);
  await store.delete(key);
  return json({ ok: true });
}
