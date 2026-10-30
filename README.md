# Personal Space · WhereToGo & SmartLedger

TravelAtlas is a map-first place library and trip planner. It includes persistent place and trip APIs, an editable itinerary, and a standalone SmartLedger handoff for travel expenses.

## Current capabilities

- Personal portal at `/` with independent WhereToGo and SmartLedger application cards, system/light/dark appearance, and app switching from both workspaces. The trip planner lives at `/travel/`; all three applications have independent source and build artifacts, and each business app retains its own storage.
- Travel dashboard, searchable status cards, three-step trip wizard with pace/style/budget preferences, editable templates, and system/light/dark appearance.
- Real WGS84 Leaflet map with saved markers, manual map picking, daily numbered points, visible attribution and configurable tile service. Connecting lines are explicitly straight lines, not navigation routes.
- Load, create, edit, and delete places through the API. When the API is unavailable, place changes are cached locally in this browser and the UI says so.
- Create, edit, switch, and delete trips. Trips and date ordered itinerary stops are stored by the Java API and PostgreSQL; local demo and offline trips are promoted to the API when edited while connected.
- Plan by day, add a saved place as an itinerary stop, set its time and duration, add notes, reorder or remove stops, and export a printable HTML itinerary.
- Open the selected trip's independent SmartLedger book through a trip-context handoff without putting access tokens in URLs; SmartLedger performs the API request using its own authenticated session.
- Named place collections, cloud-backed favorites and visited flags, editable notes and HTTPS source links; new accounts start empty.
- Reviewable travel-material imports (PDF, DOCX, text and local image OCR), optional AI extraction, and independent hiking/cycling/citywalk/driving route collections. See [material import and route design](docs/travel-materials-and-route-library.md) for the Xiaohongshu connector requirements, limits, data model and interactions.
- Day-by-day drag/button reordering, completion, schedule overlap warnings, planned costs, preparation checklist and date shifting; duplicate trips, printable HTML, portable JSON import/export and local-time ICS export.
- Reviewable saved-place drafts, pluggable Chat Completions / Responses / Anthropic AI adapters, Photon name search, Open-Meteo weather and OSRM driving/walking routes.
- Java 8 Spring Boot API with health, place CRUD/map-window, and trip/itinerary endpoints.
- Both APIs require signed OIDC JWTs with issuer, audience, expiry and subject validation. Travel queries and browser caches are isolated by account. Personal deployments use an account allowlist by default.
- API policy pages, request IDs, bounded bodies/JSON complexity, per-peer/per-account request limits, private production API docs, and generated static security headers.
- PostgreSQL/PostGIS schema managed by Flyway.

Road routing, destination weather and name search now use bounded public provider calls; real-time navigation opens the external map app. Hotel search redirects to Booking.com with dates and adults; no in-app orders or payments are created. AI provider/model choice and a valid server key remain required. A public community is not integrated. See [service integration and installment acceptance](docs/旅游服务接入与分期验收.md) for configuration, verified scope and browser limitations.

SmartLedger has an independent frontend under [`apps/ledger/`](apps/ledger/) and its own Java backend and PostgreSQL database under [`smartledger/`](smartledger/). See [the SmartLedger integration design](docs/SmartLedger功能迁移方案.md).

## Requirements

- Node.js 20.19+ (Node 24 recommended) and npm.
- Python 3 for generating the ignored local `.env` file.
- Java 8 JDK for the API build. The checked-in Maven Wrapper downloads a checksum-verified Maven distribution.
- PostgreSQL 16 with PostGIS for the local database. Docker Compose remains available as an optional deployment path.

## Frontend applications and development

The frontends are independent npm workspaces: `apps/portal`, `apps/travel`, and `apps/ledger`. `packages/identity` owns the shared SSO lifecycle; `packages/platform` owns application registration and switching. The portal centralizes login and account management and never imports another application's business pages.

```bash
npm ci
npm run dev:portal  # localhost:5173
npm run dev:travel  # localhost:5175
npm run dev:ledger  # localhost:5174
```

For the Windows full stack, run `scripts/install-identity.ps1` once, then `scripts/start-local.ps1`. Existing Java 8 APIs and PostgreSQL data are retained. See [application architecture and split deployment](docs/门户与独立应用架构及拆分部署.md) for exact settings and migration notes.

```bash
npm run check:boundaries
npm test
node scripts/build-web.mjs --origin https://portal.example.com --out-dir .local/release/dist
npm run export:app -- ledger .local/ledger-export
```

A unified gateway serves three independent build artifacts at `/`, `/travel/`, and `/ledger/`. Each application can also be exported and deployed alone with `VITE_AUTH_MODE=standalone`; reuse the same identity realm to retain the unified account. Do not put secrets in frontend environment variables.

## Start the API and PostGIS

Create a local `.env` with a fresh random database password, then build the API and start the services:

```bash
./scripts/prepare-local-env.sh
cd backend
./mvnw test package
cd ..
docker compose up --build -d
```

The API listens on `http://localhost:8080`. Health: `GET /api/v1/health`. OpenAPI UI: `http://localhost:8080/swagger-ui/index.html`.

To run the API unit tests without building the container:

```bash
cd backend
./mvnw test
```

Both APIs authenticate JWTs. WhereToGo resolves a database user from the trusted `(issuer, subject)` identity and filters place, tag, trip and itinerary operations by that owner. Local development uses loopback Keycloak; the initial `admin` keeps subject `local-demo-user` and may adopt the previous demo user's records. Production identities never inherit local demo records.

Stop services with `docker compose down`. To also delete the local database volume, use `docker compose down -v` (this removes saved local development data).

## Configuration and data

- Keep local values in `.env`; do not commit it. `.env.example` contains placeholders only.
- No external AI or geocoding key is required for manual planning, map picking and saved-place drafting. Optional AI integrations use backend-only `TRAVEL_AI_*` settings. On Windows, `scripts/set-travel-ai.ps1` stores the key with current-user DPAPI encryption. Search, weather and road routing have configurable personal-use public defaults.
- API and Leaflet coordinates must be WGS84; GCJ-02/BD-09 coordinates are not silently converted. Operator-selected geocoding returns coordinates for the user to confirm.
- Places, trips, stop costs/completion and collections are persisted in PostgreSQL and cached per account for offline display. New-account demo injection is disabled. New local records are promoted when edited after connectivity recovers; cloud records require a successful write before updates are shown.

## Project plan

See [docs/实施方案.md](docs/实施方案.md) for the architecture, data model, security boundaries, milestones, and acceptance checks.

For a free-tier deployment of the frontend, API, and PostGIS database, see [docs/部署指南.md](docs/部署指南.md). Free plans may sleep, pause, or remove data; the guide lists the current limits and is intended for demos and personal trials.

See [security and API management](docs/安全与API管理.md) for production identity configuration, API policies, static headers, gateway deployment, runtime database roles and remaining Java 8 support constraints. Production builds reject mock authentication and non-HTTPS public service addresses. Use actual deployment settings when building; development `.env.local` files contain loopback Keycloak settings with mock authentication disabled.
## 生产部署入口

当前完整系统的推荐部署步骤见 [免费部署操作手册](docs/免费部署操作手册.md)：Cloudflare Pages 两个静态前端、Oracle A1 免费主机、三库隔离、统一账号、HTTPS、加密异地备份及空机恢复。脚本位于 `scripts/production/`，Compose 位于 `deploy/production/`。操作前先核对免费额度与域名成本，不要直接把本机开发端口公开到互联网。
