#!/bin/sh
export DATABASE_URL="postgres://postgres:08b4f13674e57e14ad5cf270788f2615@dokku-postgres-zhanassylzhakyp-debug-leanstock-postgres:5432/zhanassylzhakyp_debug_leanstock_postgres"
export REDIS_URL="redis://:7cd28f74bf559876add9632c79b75389d20dd7b09772bafa23f5821af2e61263@dokku-redis-zhanassylzhakyp-debug-leanstock-redis:6379"
npx prisma migrate deploy
exec node src/workers/index.js