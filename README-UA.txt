AEROMAGIC — САЙТ НА CLOUDFLARE PAGES
════════════════════════════════════

ЩО В ПАПЦІ
  index.html                        головна сторінка
  katalog.html                      каталог + кошик + оплата
  products.json                     ТОВАРИ — редагуйте цей файл
  admin.html                        АДМІНКА: товари, замовлення, клієнти (/admin)
  functions/api/crm-order.js        заявки та замовлення → база, пошта, CRM (/api/crm-order)
  functions/api/products.js         товари для сайту й адмінки      (/api/products)
  functions/api/orders.js           замовлення та клієнти + CSV     (/api/orders)
  functions/api/wayforpay-sign.js   підпис платежів WayForPay       (/api/wayforpay-sign)
  _headers                          заголовки безпеки (CSP, HSTS тощо)
  _redirects                        короткі URL + сумісність зі старими адресами
  wrangler.toml                     налаштування проєкту Cloudflare
  robots.txt, sitemap.xml           SEO

1. ДЕПЛОЙ (5 хвилин)
────────────────────
Варіант А — через GitHub (рекомендовано):
  1. Завантажте вміст цієї папки у репозиторій GitHub (у корінь).
  2. Cloudflare Dashboard → Workers & Pages → Create → Pages →
     Connect to Git → оберіть репозиторій.
  3. Build command: залиште порожнім.
     Build output directory: /   (корінь)
  4. Save and Deploy. Кожен push у main оновлює сайт автоматично.

Варіант Б — через Wrangler (без GitHub):
     npm i -g wrangler
     wrangler login
     wrangler pages deploy . --project-name=aeromagic

Варіант В — drag-and-drop у Pages теж працює: папка functions/
     підхоплюється автоматично.

2. КЛЮЧІ (Secrets)
──────────────────
Cloudflare → ваш проєкт → Settings → Variables and Secrets → Add,
тип «Secret» (щоб значення не було видно):

  WFP_MERCHANT_ACCOUNT   merchantAccount з merchant.wayforpay.com
  WFP_SECRET_KEY         secretKey звідти ж
  CRM_PROVIDER           keycrm   (або webhook)
  KEYCRM_API_KEY         ключ KeyCRM → Налаштування → API
  KEYCRM_SOURCE_ID       1
  WEBHOOK_URL            якщо CRM_PROVIDER=webhook
  TELEGRAM_BOT_TOKEN     необовʼязково — дублювання заявок у Telegram
  TELEGRAM_CHAT_ID       необовʼязково
  ADMIN_PASSWORD         пароль для входу в /admin (придумайте складний)
  RESEND_API_KEY         ключ resend.com — щоб замовлення приходили на пошту
  ORDER_EMAIL_TO         куди слати листи, напр. zakaz@aeromagic.kyiv.ua
                         (кілька адрес — через кому)
  ORDER_EMAIL_FROM       від кого, напр. Aeromagic <orders@aeromagic.kyiv.ua>
                         адресу-відправника треба підтвердити у Resend

Після додавання ключів натисніть Retry deployment — інакше функції
працюватимуть зі старими значеннями.

3. ДОМЕН aeromagic.kyiv.ua
──────────────────────────
  1. Cloudflare → Add a site → aeromagic.kyiv.ua → план Free.
  2. У реєстратора домену замініть NS-сервери на ті, що покаже Cloudflare.
  3. Проєкт Pages → Custom domains → Set up a custom domain →
     aeromagic.kyiv.ua і www.aeromagic.kyiv.ua.
  4. SSL/TLS → Overview → режим Full (strict).
     SSL/TLS → Edge Certificates → Always Use HTTPS = On,
     Automatic HTTPS Rewrites = On, HSTS = On (max-age 6 місяців).

4. ЗАХИСТ (усе на безкоштовному плані)
──────────────────────────────────────
  Security → WAF → Managed rules: Cloudflare Managed Ruleset = On.
  Security → WAF → Rate limiting rules:
      Шлях /api/*  →  10 запитів за 60 секунд з IP  →  Block.
      Шлях /admin* →  20 запитів за 60 секунд з IP  →  Block.
  Security → Bots → Bot Fight Mode = On.
  Security → Settings → Security Level = Medium.
  Speed → Optimization → Auto Minify та Brotli = On.
  Caching → Configuration → Caching Level = Standard.
  Під час атаки: Security → Settings → «Under Attack Mode».

5. БАЗА ДАНИХ (KV) — обовʼязково для адмінки
────────────────────────────────────────────
  1. Cloudflare → Storage & Databases → KV → Create namespace, назва aeromagic.
  2. Ваш проєкт Pages → Settings → Bindings → Add → KV namespace:
        Variable name: AEROMAGIC
        KV namespace:  aeromagic
  3. Retry deployment.
Без цього сайт працює, але замовлення не зберігаються і адмінка
показуватиме помилку «KV не підключено».

6. АДМІНКА  →  https://ваш-домен/admin
──────────────────────────────────────
  Товари     додати, редагувати назву/ціну/категорію/бейдж/наявність,
             змінити фото, дублювати, видалити. «Зберегти зміни» —
             і сайт одразу показує новий список (products.json більше
             не потрібно редагувати вручну).
             «Імпорт списком» — вставте рядки
                 Назва; ціна; категорія; посилання на фото
             по одному товару в рядок — або готовий JSON.
             «Завантажити products.json» — резервна копія.
  Замовлення весь список із товарами, сумою, доставкою й коментарем,
             кнопка «Вивантажити CSV» (відкривається в Excel).
  Клієнти    база: імʼя, телефон, email, кількість замовлень, сума,
             дата останнього. Теж вивантажується у CSV.

  Вхід за паролем ADMIN_PASSWORD. Для додаткового захисту увімкніть
  Cloudflare Access на /admin* (Zero Trust → Access → Applications).

7. ЛИСТИ ПРО ЗАМОВЛЕННЯ
───────────────────────
  1. Зареєструйтеся на resend.com (безкоштовно до 3000 листів/міс).
  2. Domains → Add domain → aeromagic.kyiv.ua → додайте DNS-записи
     (вони вже в Cloudflare, тому додаються в пару кліків).
  3. API Keys → Create → скопіюйте ключ у змінну RESEND_API_KEY.
  4. Вкажіть ORDER_EMAIL_TO і ORDER_EMAIL_FROM. Готово — кожне
     замовлення й заявка на дзвінок приходять листом; кнопка
     «Відповісти» пише одразу клієнту (якщо він залишив email).

8. ТОВАРИ ФАЙЛОМ (запасний варіант)
───────────────────────────────────
Файл products.json — це весь асортимент. Формат одного товару:

  {
    "id": 40,
    "name": "Набір «Єдиноріг»",
    "cat": "nabory",
    "price": 850,
    "img": "https://aeromagic.ks.ua/…/photo.jpg",
    "stock": true,
    "rating": 5,
    "badge": "Новинка",
    "desc": "Короткий опис для сторінки товару."
  }

  cat: latex | foil | nabory | bukety | gender | dekor
  id мусить бути унікальним. stock:false — «Немає в наявності».
  badge можна прибрати (порожній рядок).

Додати одразу багато товарів: вставте кілька обʼєктів підряд через кому
у масив products — сайт підхопить їх після оновлення сторінки
(кеш 5 хвилин, див. _headers). Жодного передеплою не потрібно, якщо
оновлюєте файл через GitHub — Pages перезбере сайт сам.

9. ПЕРЕХІД ІЗ NETLIFY
─────────────────────
Адреси функцій змінилися на /api/crm-order і /api/wayforpay-sign.
Старі адреси /.netlify/functions/* перенаправляються у _redirects,
тож нічого не зламається під час перемикання DNS.
