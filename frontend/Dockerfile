FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_STYLEGUIDE=false
ENV VITE_STYLEGUIDE=$VITE_STYLEGUIDE
# Sentry (gói free) cho lỗi phía trình duyệt. Để trống thì không nạp Sentry.
ARG VITE_SENTRY_DSN=
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ARG VITE_SENTRY_RELEASE=local
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE
RUN npm run build

# Caddy phục vụ thẳng file tĩnh và proxy /api tới backend (cấu hình: deploy/Caddyfile, mount qua docker-compose.yml).
FROM caddy:2-alpine

COPY --from=builder /app/dist /srv

EXPOSE 80 443
