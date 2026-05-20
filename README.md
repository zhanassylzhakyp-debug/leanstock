# LeanStock API

Производственный бэкенд **учёта запасов в стиле lean**: мультитенантность, роли, ACID-операции перемещения без сырого SQL (только Prisma), фоновые задачи через **Redis + BullMQ**, письма через **Nodemailer** (асинхронно из очереди).

## Стек

- Node.js 18+, Express 4  
- PostgreSQL 15, Prisma 5 (ORM **без** `$queryRaw` / `$executeRaw` в коде приложения)  
- Redis 7 — rate limiting и очереди  
- JWT (access) + opaque refresh с **ротацией**  
- BullMQ — email и maintenance jobs  
- Jest — unit + integration тесты  

## Быстрый старт

### 1. Полный стек одной командой (рекомендуется для финальной сдачи)

```bash
cp .env.example .env
# Заполните JWT_*, SMTP_* (SendGrid/Mailgun), CORS_ORIGINS
docker compose up --build
```

Поднимается: **postgres**, **redis**, **api**, **worker**, **frontend**.

- Frontend demo: `http://localhost:8080`
- API / Swagger: `http://localhost:3000/docs` (или через frontend proxy `/docs`)

### 1b. Только инфраструктура (локальная разработка)

```bash
docker compose up -d postgres redis
```

### 2. Переменные окружения

```bash
cp .env.example .env
# Заполните JWT_*, DATABASE_URL, SMTP_* (или DISABLE_EMAIL_SEND=true для отладки без почты)
```

Приложение **не стартует**, если не заданы критичные переменные (см. валидацию в `src/config/env.js`).

### 3. Миграции и сиды

```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run seed
```

История SQL-миграций: **`prisma/migrations/`** (см. также `migrations/README.md`).

### 4. Запуск API

```bash
npm run dev
# или
npm start
```

- HTTP: `http://localhost:3000`  
- Swagger UI: **`http://localhost:3000/docs`**  
- OpenAPI файл (сдача): **`openapi.yaml`** в корне репозитория  

### 5. Фоновый воркер (обязателен для писем и задач из очереди)

В отдельном терминале:

```bash
npm run worker
```

Воркер обрабатывает очереди:

- `{QUEUE_PREFIX}-email` — верификация, сброс пароля, low stock, уведомление о перемещении, welcome manager  
- `{QUEUE_PREFIX}-maintenance` — `dead-stock-decay`, `low-stock-scan`, `reservation-expiry`  

**Cron (в процессе API):**

- `02:00` — постановка в очередь `dead-stock-decay`  
- `08:00` — постановка в очередь `low-stock-scan`  
- `*/5 * * * *` — `reservation-expiry` (авто-освобождение просроченных резервов)

Ручной триггер (роль **ADMIN** в своём тенанте): `POST /api/v1/admin/jobs/dead-stock-decay`, `POST /api/v1/admin/jobs/low-stock-scan`.  
Статистика очередей: `GET /api/v1/admin/jobs/queue-stats`.

## Роли (RBAC)

| Роль      | Возможности (кратко) |
|-----------|----------------------|
| **ADMIN** | Товары CRUD, локации, установка остатков, создание MANAGER, триггеры jobs, создание тенантов (глобальный список) |
| **MANAGER** | Перемещения, продажи, suppliers/PO, forecast, резервы, чтение отчётов |
| **USER**  | Чтение каталога, отчётов, создание резервов (checkout) |

Несоответствие роли → **403**. Публичная регистрация создаёт только **USER**.

## Auth-поток

1. `POST /api/v1/auth/register` → письмо VERIFY_EMAIL  
2. `GET /api/v1/auth/verify-email?token=...`  
3. `POST /api/v1/auth/login` → JWT + refresh  
4. `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`  
5. `POST /api/v1/auth/forgot-password` → `POST /api/v1/auth/reset-password`

## LeanStock — ключевые фичи (финальная сдача)

| Фича | Endpoint |
|------|----------|
| Forecast (moving average) | `GET /api/v1/inventory/forecast` |
| Reservations + Redis lock | `POST /api/v1/reservations`, `POST .../confirm`, `DELETE .../id` |
| Suppliers CRUD | `GET/POST/PATCH/DELETE /api/v1/suppliers` |
| Purchase orders | `POST /api/v1/purchase-orders`, `POST .../send`, `POST .../receive` |
| Configurable decay rules | `GET/PUT /api/v1/admin/decay-rules` |
| Frontend demo | `frontend/` — SPA на vanilla JS, прокси через nginx |

## Письма (бизнес-события, ≥3)

Отправка **только из воркера**, API лишь ставит job в Redis:

1. Верификация email  
2. Сброс пароля  
3. Алерт низкого остатка (`low-stock-scan`)  
4. Подтверждение перемещения (TRANSFER_COMPLETE)  
5. Приветствие нового MANAGER  
6. **Подтверждение заказа поставщику (PURCHASE_ORDER_CONFIRM)**

## Пагинация

- **Cursor:** `GET /api/v1/products`, `GET /api/v1/inventory/report`  
- **Offset:** `GET /api/v1/locations`, `GET /api/v1/tenants`, `GET /api/v1/admin/users`  

## Тесты

```bash
npm test
```

Нужны `DATABASE_URL` и запущенный Postgres (Redis в тестах для rate limit не обязателен — используется in-memory store).

## Архитектурные решения

- **Перенос остатков:** транзакция уровня изоляции `Serializable` + `updateMany` с условием `quantity >= qty` вместо `SELECT FOR UPDATE` на сыром SQL (требование курса: ORM-only).  
- **Email:** API не ждёт SMTP — только постановка в BullMQ.  
- **Секреты:** только через env, шаблон — `.env.example`.  

## Деплой на DeployRocks

1. Залейте репозиторий на GitHub (`zhanassylzhakyp-debug/leanstock`).
2. Зарегистрируйтесь на [dashboard.deployrocks.com](https://dashboard.deployrocks.com), подключите GitHub.
3. Выберите репозиторий, deployment type: **Docker Compose**.
4. Задайте env vars из `.env.example` (особенно `JWT_SECRET_KEY`, `SMTP_*`, `CORS_ORIGINS`, `APP_PUBLIC_URL`).
5. После деплоя сохраните URL в **`DEPLOYED_URL.txt`** и ссылку на видео в **`VIDEO_LINK.txt`**.

## Postman / устная защита

Подготовьте отдельные вкладки: auth, products, locations, inventory, forecast, reservations, suppliers, purchase-orders, admin/jobs. Откройте live frontend + Swagger + Postman на защите.

## Лицензия

Учебный проект.
