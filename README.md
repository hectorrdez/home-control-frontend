# Home Control (frontend)

Private home panel for the home-control stack: a 3D house view with device control and telemetry.
Built with React 19, Vite, Tailwind 4 and Playwright.

## Scripts

- `npm run dev` - Vite dev server.
- `npm run build` - typecheck and production build.
- `npm run lint` - oxlint.
- `npx playwright test` - E2E specs (`e2e/specs`), served on port 5174.
- `node .claude/scripts/test.cjs` - full gate (typecheck, lint, build, E2E).

## Environment variables

- `VITE_API_URL` - backend base URL (empty = same origin).
- `VITE_API_TOKEN` - bearer token sent on every `/api` call.
- `VITE_API_MODE` - `live` or `mock`. Unset: `mock` in dev and Playwright, `live` in production builds (the mock is never in the prod bundle).
- `VITE_PROXY_TARGET` - backend the Vite dev proxy forwards `/api` to (default `http://localhost:3003`).

Mock scenarios (dev/Playwright, `?mock=`): `default`, `empty`, `error`, `slow`, `action-error`, `stream-drop`, `offline`, `unauthorized`, `no-history`, `alias-error` (alias writes fail with `aliases_write_failed`), `raw-names` (extra entities with raw HA-style names to exercise display-name cleanup). `?seed=<n>` changes the generated data.

## Design

- Rules: `.claude/DESIGN.md`.
- Reference: `design/stitch/` (open the `code.html` files in a browser).

## Deploy (homelab Dokploy)

- `Dockerfile`: multi-stage, `node:22-alpine` build then `nginx:1.27-alpine` serving `dist/` on `$PORT` (default 8080; Dokploy sets 3042) with SPA fallback (`nginx.conf.template`), `/healthz` and a container `HEALTHCHECK`. `scripts/check-bundle.mjs` runs at the end of the build and fails it if mock fixtures reach the bundle or three.js leaks out of its lazy chunk.
- Build args: `VITE_API_MODE` (default `live`; `mock` only for a demo build), `VITE_API_URL` (default empty = same origin), `VITE_API_TOKEN` (= backend `API_TOKEN`; set it in Dokploy build args, never commit it). It is baked into the bundle, so the panel must stay private (Tailscale + Caddy `import privado`).
- Dokploy: project `HomeControl`, app `home-control-frontend`, GitHub `hectorrdez/home-control-frontend` branch `dev`, Dockerfile build, env `PORT=3042`, host port `3042:3042`. `docker-compose.yml` runs the same image locally (`VITE_API_TOKEN=... docker compose up --build`).
- Caddy (`/home/hector/docker/caddy/Caddyfile`):

```
home-control.hectorrdez.es {
	import privado
	handle /api/* { reverse_proxy 192.168.50.200:3041 }
	handle { reverse_proxy 192.168.50.200:3042 }
}
```

  Reload with `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`. dnsmasq-ts resolves the hostname to the server's Tailscale IP.
