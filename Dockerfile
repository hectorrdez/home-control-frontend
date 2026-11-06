# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Baked into the bundle (VITE_*). Token is visible to anyone who can load the panel: keep access private.
ARG VITE_API_MODE=live
ARG VITE_API_URL=
ARG VITE_API_TOKEN=
ENV VITE_API_MODE=$VITE_API_MODE VITE_API_URL=$VITE_API_URL VITE_API_TOKEN=$VITE_API_TOKEN
RUN npm run build && node scripts/check-bundle.mjs

FROM nginx:1.27-alpine
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1
