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

### 1. Инфраструктура

```bash
docker compose up -d
```

Поднимется Postgres (`leanstock`) и Redis.

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
- `{QUEUE_PREFIX}-maintenance` — `dead-stock-decay`, `low-stock-scan`  

**Cron (в процессе API):**

- `02:00` — постановка в очередь `dead-stock-decay`  
- `08:00` — постановка в очередь `low-stock-scan`  

Ручной триггер (роль **ADMIN** в своём тенанте): `POST /api/v1/admin/jobs/dead-stock-decay`, `POST /api/v1/admin/jobs/low-stock-scan`.  
Статистика очередей: `GET /api/v1/admin/jobs/queue-stats`.

## Роли (RBAC)

| Роль      | Возможности (кратко) |
|-----------|----------------------|
| **ADMIN** | Товары CRUD, локации, установка остатков, создание MANAGER, триггеры jobs, создание тенантов (глобальный список) |
| **MANAGER** | Перемещения, продажи/отгрузки (`/inventory/sale`), чтение отчётов |
| **USER**  | Чтение каталога и отчётов, без изменения остатков |

Несоответствие роли → **403**.

Публичная регистрация создаёт только **USER** (роль ADMIN/MANAGER — через seed или `POST /api/v1/admin/users`).

## Auth-поток для защиты

1. `POST /api/v1/auth/register` — создаёт пользователя, в очередь уходит письмо **VERIFY_EMAIL** (в `NODE_ENV=test` email считается подтверждённым сразу).  
2. `GET /api/v1/auth/verify-email?token=...` — подтверждение.  
3. `POST /api/v1/auth/login` — выдача JWT + refresh (без подтверждённого email — **403**).  
4. Защищённые маршруты: `Authorization: Bearer <access>`.  
5. `POST /api/v1/auth/refresh` — ротация refresh.  
6. `POST /api/v1/auth/logout` — отзыв refresh.  
7. Сброс пароля: `POST /forgot-password` → письмо → `POST /reset-password`.

## Письма (бизнес-события, ≥3)

Отправка **только из воркера**, API лишь ставит job в Redis:

1. Верификация email  
2. Сброс пароля  
3. Алерт низкого остатка (`low-stock-scan`)  
4. Подтверждение перемещения (TRANSFER_COMPLETE)  
5. Приветствие нового MANAGER  

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

## Postman / устная защита

Подготовьте отдельные вкладки: все маршруты `auth`, бизнес-логика (`products`, `locations`, `inventory`), `admin` + триггеры `jobs`, демонстрация воркера и письма в реальном ящике.

## Лицензия

Учебный проект.
