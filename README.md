# perform6-touchscreen

Perform6 app for **BrightSign players** — React, TypeScript, Tailwind, offline-first.

- **Startup:** [`brightsign/autorun.brs`](./brightsign/autorun.brs) (one file for all tenants)
- **Deploy:** `dist/` + `autorun.brs` to device, or OTA via R2 (no BSN)
- **Dev:** browser at http://localhost:5173 (no player required)

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173 — **Simulator Mode** (`VITE_RUNTIME_MODE=SIMULATOR`) shows the Runtime Simulator launcher.

| Route | Purpose |
|-------|---------|
| `/simulator` | Select XT2145 / XC4055 / HD226 profile |
| `/pairing` | Device status, pairing code, **credential injection** |
| `/dashboard` | Runtime dashboard (sync, heartbeat, manifest) |
| `/touch` | XT2145 Touch Screen UI (unchanged) |
| `/simulator/xt2145` | Touch UI + external display panel |
| `/simulator/xc4055` | Three HDMI output simulation |
| `/simulator/hd226/:member` | HD226 cluster member player |

See `.env.example` for all runtime configuration variables.

### Backend integration flow (Simulator)

1. Select profile → `POST /devices/pair` → show pairing code
2. Admin Portal: claim code → complete deployment register
3. Runtime auto-calls `POST /devices/pairings/credentials` (pairingId + serialNumber)
4. Simulator fallback: `POST /devices/credentials/resolve` (deviceId + serialNumber)
5. Runtime runs `POST /sync/check` → playback on `/simulator/xc4055`

## Docker

```bash
# Production-like preview (nginx on http://localhost:5173)
docker compose up -d --build

# Dev with hot reload
docker compose -f docker-compose.dev.yml up --build
```

BrightSign ZIP: `npm run release:zip -- 1.0.0`

## Build for player

```bash
npm run build
```

See [docs/deploy-to-player.md](./docs/deploy-to-player.md).

## Related repos

- [perform6-api](../perform6-api)
- [perform6-admin](../perform6-admin)
