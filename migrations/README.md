# История миграций БД

В этом проекте используется **Prisma Migrate**. SQL-миграции лежат в каталоге:

**`prisma/migrations/`**

Каждая подпапка (`YYYYMMDDHHMMSS_name/`) содержит файл `migration.sql` — это полная история схемы от первого спринта до финала, как требует задание.

Корневой каталог `migrations/` в репозитории зарезервирован под это пояснение (в некоторых курсах явно просят папку `migrations/` — у Prisma стандартный путь именно `prisma/migrations`).

Команды:

```bash
npm run migrate        # prisma migrate dev (разработка)
npm run migrate:deploy # prisma migrate deploy (CI / прод)
```
