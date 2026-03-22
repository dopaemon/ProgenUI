FROM node:18-alpine

WORKDIR /app

ENV HOST=0.0.0.0

COPY package.json package-lock.json* .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .

CMD ["npm", "start"]
