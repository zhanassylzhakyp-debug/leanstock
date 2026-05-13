FROM node:18-slim

# Устанавливаем зависимости для сборки бинарных модулей (argon2, prisma)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    openssl \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# Устанавливаем зависимости (они скомпилируются под Linux внутри контейнера)
RUN npm install

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD ["node", "server.js"]