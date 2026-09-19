// Спільні помічники для адмін-API.
export function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

// Перевірка пароля адміністратора (env ADMIN_PASSWORD).
export function checkAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) return 'Адмінку не налаштовано: додайте ADMIN_PASSWORD';
  const given = request.headers.get('X-Admin-Password') || '';
  if (given !== env.ADMIN_PASSWORD) return 'Невірний пароль';
  return null;
}

// KV: у Cloudflare Pages прив'яжіть namespace під іменем AEROMAGIC.
export function kv(env) {
  return env.AEROMAGIC || null;
}
