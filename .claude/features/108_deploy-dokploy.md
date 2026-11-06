---
id: "108"
slug: deploy-dokploy
title: Production deploy on Dokploy
role: frontend
type: feature
extends: null
---

# Production deploy on Dokploy

## Description
Static production image on the homelab Dokploy, served behind Caddy with the API routed to the backend.

## Requirements
- Dockerfile (multi-stage: node build, nginx static) with SPA fallback; `.dockerignore`.
- Config via build args `VITE_API_URL` (default empty, same origin), `VITE_API_MODE` (default `live` in the image; `mock` only for a demo build) and `VITE_API_TOKEN` (= API_TOKEN; set it in Dokploy build args, never commit it).
- Verify the production bundle contains no mock fixtures (110) and three stays in its lazy chunk (106).
- Dokploy app with GitHub repo; document Caddy: `home-control.hectorrdez.es` with `import privado`, `/api/*` to the backend, rest to this app; dnsmasq-ts entry to the Tailscale IP.
- README deploy section.

## Touches existing endpoints
no (needs backend 006 deployed for /api)

## Done when
- Deployed on Dokploy, reachable over Tailscale, panel loads and talks to the backend.
- README documents deploy.
- test.cjs is green (the real gate; mark-ended.cjs enforces it).
