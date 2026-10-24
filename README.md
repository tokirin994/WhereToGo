# TravelAtlas

TravelAtlas is a map-first place library and trip planner. It includes persistent place and trip APIs, an editable itinerary, and a standalone SmartLedger handoff for travel expenses.

## Current capabilities

- Responsive map workspace with category filtering, search, selectable markers, a place detail card, and light/dark theme toggle.
- Load, create, edit, and delete places through the API. When the API is unavailable, place changes are cached locally in this browser and the UI says so.
- Create, edit, switch, and delete trips. Trips and date ordered itinerary stops are stored by the Java API and PostgreSQL; local demo and offline trips are promoted to the API when edited while connected.
- Plan by day, add a saved place as an itinerary stop, set its time and duration, add notes, reorder or remove stops, and export a printable HTML itinerary.
- Open the selected trip's independent SmartLedger book through a signed trip handoff; SmartLedger performs the API request using its own authenticated session.
- Keep sample cards and the schematic map explicitly marked as demo data. Real API coordinates are retained but not plotted on the schematic map.
- Java 8 Spring Boot API with health, place CRUD/map-window, and trip/itinerary endpoints.
- PostgreSQL/PostGIS schema managed by Flyway.

AMap, live route calculation, link import, model planning, and live weather still require external provider integrations. The illustrated map and sample place cards are labeled demo content and do not represent navigation or verified coordinates.

SmartLedger is a separate app under [`smartledger/`](smartledger/) with its own backend and PostgreSQL database. See [the SmartLedger integration design](docs/SmartLedger功能迁移方案.md).

## Requirements

- Node.js 20.19+ (Node 24 recommended) and npm.
- Python 3 for generating the ignored local `.env` file.
- Java 8 JDK for the API build. The checked-in Maven Wrapper downloads a checksum-verified Maven distribution.
- PostgreSQL 16 with PostGIS for the local database. Docker Compose remains available as an optional deployment path.

## Start the web prototype

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local address (normally `http://localhost:5173`).
For the SmartLedger integration endpoint, copy `frontend/.env.example` to `frontend/.env.local` and set the API URL.

## Start the local full stack on Windows

After installing PostgreSQL 16/PostGIS and building both APIs, run `scripts/start-local.ps1` from PowerShell. It starts the local database, both Spring Boot APIs, both Vite frontends, and the loopback-only SmartLedger demo OIDC provider. Open WhereToGo at `http://localhost:5173` and SmartLedger at `http://localhost:5174`; SmartLedger automatically uses the local mock superadmin `admin@localhost` without a password. The mock identity is for development only and must not be exposed to a network.

Build and type-check the frontend:

```bash
cd frontend
npm run build
```

Run the frontend checks:

```bash
npm test
```

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

The current API uses a seeded local demo user and supports place CRUD plus a PostGIS viewport query. The frontend loads API places and writes newly added places to the API; sample places and offline fallback data remain browser-local. Authentication and multi-user login are not implemented.

Stop services with `docker compose down`. To also delete the local database volume, use `docker compose down -v` (this removes saved local development data).

## Configuration and data

- Keep local values in `.env`; do not commit it. `.env.example` contains placeholders only.
- No AMap or LLM key is needed for the current prototype.
- Coordinates accepted by the current API must be WGS-84 and are explicitly marked as user-confirmed; external map-provider conversion and verified geocoding are future work.
- Demo place data is stored in browser `localStorage`; API-created places are persisted in PostgreSQL and cached in the browser for offline display.

## Project plan

See [docs/实施方案.md](docs/实施方案.md) for the architecture, data model, security boundaries, milestones, and acceptance checks.

For a free-tier deployment of the frontend, API, and PostGIS database, see [docs/部署指南.md](docs/部署指南.md). Free plans may sleep, pause, or remove data; the guide lists the current limits and is intended for demos and personal trials.
