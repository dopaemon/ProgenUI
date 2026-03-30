FROM node:18-alpine

WORKDIR /app

ENV HOST=0.0.0.0

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

CMD ["npm", "start"]
