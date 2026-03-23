FROM node:18-alpine AS builder

WORKDIR /app

ARG REACT_APP_API_BASE_URL=/api
ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}

COPY package.json package-lock.json* .npmrc ./
RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/build /usr/share/nginx/html
