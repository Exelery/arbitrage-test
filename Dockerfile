FROM node:18-alpine

WORKDIR /app

# Установка зависимостей для сборки
RUN apk add --no-cache python3 make g++

# Копирование package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install

# Копирование исходного кода
COPY . .

# Сборка TypeScript
RUN npm run build

# Очистка dev зависимостей
RUN npm prune --production

CMD ["npm", "start"] 