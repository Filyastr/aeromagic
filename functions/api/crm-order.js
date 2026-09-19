// Cloudflare Pages Function — заявки та замовлення → CRM.
// Файл: functions/api/crm-order.js  →  URL: /api/crm-order
//
// НАЛАШТУВАННЯ (Cloudflare → Workers & Pages → проєкт → Settings →
// Variables and Secrets, тип Secret):
//   CRM_PROVIDER     = keycrm            (або webhook)
//   KEYCRM_API_KEY   = ключ з KeyCRM → Налаштування → API
//   KEYCRM_SOURCE_ID = 1                 (id джерела «Сайт»)
//   WEBHOOK_URL      = https://...       (якщо CRM_PROVIDER=webhook)
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (необовʼязково)

import { kv } from '../_lib/auth.js';

const RATE = new Map();

// Лист про замовлення на пошту (Resend: env RESEND_API_KEY,
// ORDER_EMAIL_FROM = «Aeromagic <orders@ваш-домен>», ORDER_EMAIL_TO = куди слати).
async function sendEmail(env, data, name, phone, email, amount, items) {
  if (!env.RESEND_API_KEY || !env.ORDER_EMAIL_TO) return;
  const isCallback = data.type === 'callback';
  const rows = items.map(i => '<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">' + esc(i.name) +
    '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">' + (Number(i.qty) || 1) +
    '</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">' + (Number(i.price) || 0) + ' грн</td></tr>').join('');
  const html = '<div style="font:15px/1.6 -apple-system,Segoe UI,sans-serif;color:#53384A">' +
    '<h2 style="color:#E8478D;margin:0 0 12px">' + (isCallback ? 'Заявка на дзвінок' : 'Нове замовлення ' + esc(data.orderNo || '')) + '</h2>' +
    '<p style="margin:0 0 4px"><b>Клієнт:</b> ' + esc(name || '—') + '</p>' +
    '<p style="margin:0 0 4px"><b>Телефон:</b> <a href="tel:' + esc(phone) + '">' + esc(phone) + '</a></p>' +
    (email ? '<p style="margin:0 0 4px"><b>Email:</b> ' + esc(email) + '</p>' : '') +
    (data.address ? '<p style="margin:0 0 4px"><b>Адреса:</b> ' + esc(data.address) + '</p>' : '') +
    (data.delivery ? '<p style="margin:0 0 4px"><b>Доставка:</b> ' + esc(data.delivery) + ' · <b>Оплата:</b> ' + esc(data.payment || '') + '</p>' : '') +
    (data.note ? '<p style="margin:0 0 4px"><b>Коментар:</b> ' + esc(data.note) + '</p>' : '') +
    (rows ? '<table style="border-collapse:collapse;margin:14px 0;min-width:340px">' + rows + '</table>' : '') +
    (amount ? '<p style="font-size:18px"><b>Сума: ' + amount + ' грн</b></p>' : '') +
    '</div>';
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.ORDER_EMAIL_FROM || 'Aeromagic <onboarding@resend.dev>',
      to: env.ORDER_EMAIL_TO.split(',').map(s => s.trim()),
      reply_to: email || undefined,
      subject: (isCallback ? 'Заявка на дзвінок — ' : 'Замовлення ' + (data.orderNo || '') + ' — ') + (name || phone),
      html: html
    })
  });
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Запис у базу: замовлення + картка клієнта (KV binding AEROMAGIC)
async function saveToDb(env, data, name, phone, email, amount, items) {
  const store = kv(env);
  if (!store) return;
  const createdAt = data.createdAt || new Date().toISOString();
  const order = {
    orderNo: data.orderNo || ('AM-' + Date.now()),
    type: data.type || 'order',
    createdAt,
    client: { name, phone, email },
    amount, items,
    delivery: data.delivery || '', payment: data.payment || '',
    address: data.address || '', note: data.note || '', source: data.source || ''
  };
  await store.put('order:' + createdAt + ':' + order.orderNo, JSON.stringify(order));
  const key = 'client:' + phone;
  const prev = (await store.get(key, 'json')) || { ordersCount: 0, totalSpent: 0, firstOrderAt: createdAt };
  await store.put(key, JSON.stringify({
    phone,
    name: name || prev.name || '',
    email: email || prev.email || '',
    ordersCount: (prev.ordersCount || 0) + 1,
    totalSpent: (prev.totalSpent || 0) + amount,
    firstOrderAt: prev.firstOrderAt || createdAt,
    lastOrderAt: createdAt
  }));
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestPost({ request, env }) {
  // Rate limit: не більше 5 заявок за хвилину з однієї IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const hits = (RATE.get(ip) || []).filter(t => now - t < 60000);
  if (hits.length >= 5) return json({ error: 'Занадто багато запитів' }, 429);
  hits.push(now);
  RATE.set(ip, hits);

  let data;
  try { data = await request.json(); } catch (e) { return json({ error: 'Некоректні дані' }, 400); }

  // Валідація на сервері (не довіряємо браузеру)
  const phone = String((data.client && data.client.phone) || '').replace(/[^\d+]/g, '');
  if (!/^(\+?38)?0\d{9}$/.test(phone)) return json({ error: 'Некоректний телефон' }, 400);
  const name = String((data.client && data.client.name) || '').slice(0, 100);
  const email = String((data.client && data.client.email) || '').slice(0, 150);
  const items = Array.isArray(data.items) ? data.items.slice(0, 50) : [];
  const amount = Number(data.amount) || 0;
  const provider = env.CRM_PROVIDER || 'keycrm';

  // Своя база + лист на пошту — працюють незалежно від зовнішньої CRM
  try { await saveToDb(env, data, name, phone, email, amount, items); } catch (e) { console.error('DB', e.message); }
  try { await sendEmail(env, data, name, phone, email, amount, items); } catch (e) { console.error('MAIL', e.message); }

  try {
    if (provider === 'keycrm' && env.KEYCRM_API_KEY) {
      const body = {
        source_id: Number(env.KEYCRM_SOURCE_ID || 1),
        source_uuid: data.orderNo || ('cb-' + Date.now()),
        buyer_comment: [data.note, data.address].filter(Boolean).join(' | ').slice(0, 500),
        buyer: { full_name: name || 'Клієнт із сайту', phone: phone, email: email || undefined },
        products: items.map(i => ({
          price: Number(i.price) || 0,
          quantity: Number(i.qty) || 1,
          name: String(i.name || '').slice(0, 200)
        }))
      };
      if (data.address) {
        body.shipping = { delivery_service_id: null, shipping_address_city: String(data.address).slice(0, 200) };
      }
      const r = await fetch('https://openapi.keycrm.app/v1/order', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.KEYCRM_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error('KeyCRM ' + r.status);
    } else if (env.WEBHOOK_URL) {
      await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({}, data, { client: { name, phone }, amount, items }))
      });
    }

    if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      const lines = [
        data.type === 'callback' ? '📞 Заявка на дзвінок' : '🎈 Нове замовлення',
        'Клієнт: ' + (name || '—'),
        'Телефон: ' + phone
      ];
      if (email) lines.push('Email: ' + email);
      if (data.orderNo) lines.push('Номер: ' + data.orderNo);
      if (amount) lines.push('Сума: ' + amount + ' грн');
      if (data.address) lines.push('Адреса: ' + data.address);
      if (items.length) lines.push('Товари:\n' + items.map(i => '• ' + i.name + ' × ' + i.qty).join('\n'));
      if (data.note) lines.push('Коментар: ' + data.note);
      await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: lines.join('\n') })
      });
    }
    return json({ ok: true });
  } catch (err) {
    // Заявку не втрачаємо — пишемо у лог Cloudflare, клієнту віддаємо успіх
    console.error('CRM error:', err.message, JSON.stringify({ name, phone, amount }));
    return json({ ok: true, queued: true });
  }
}

export async function onRequest() {
  return new Response('Method Not Allowed', { status: 405 });
}
