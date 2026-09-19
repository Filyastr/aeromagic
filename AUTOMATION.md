# Aeromagic — автоматический Cloudflare deploy

## Первый запуск

Откройте PowerShell в этой папке и выполните:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\setup-cloudflare.ps1
```

Скрипт:
- проверит Cloudflare login;
- найдёт KV `aeromagic` или создаст его;
- автоматически вставит KV ID в `wrangler.toml`;
- создаст Pages project `aeromagic`, если его нет;
- задеплоит сайт.

## Следующие обновления

После изменений:

```powershell
.\deploy.ps1
```

## Secrets

Пароли/API-ключи НЕ хранятся в коде и не добавляются в Git.
Их задайте один раз в Cloudflare:

Workers & Pages → Aeromagic → Settings → Variables and Secrets

Для текущего проекта используются секреты, связанные с WayForPay, CRM, email и админкой. Точные имена смотрите в `functions/api/*.js` и добавляйте только реально используемые.

## Важно

`wrangler.toml` не нужно загружать через Pages drag-and-drop. Этот проект рассчитан на деплой через Wrangler.
