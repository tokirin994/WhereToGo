# TravelAtlas

TravelAtlas is a map-first place library and trip planner. The repository is being built in milestones; the current frontend is an interactive prototype and its map and itinerary use clearly labeled demo data.

## Current capabilities

- Responsive map workspace with category filtering, search, selectable markers, a place detail card, and light/dark theme toggle.
- Load persisted places from the API and create places through the API. When the API is unavailable, new places are saved locally in this browser and the UI says so.
- Keep sample cards and the schematic map explicitly marked as demo data. Real API coordinates are retained but not plotted on the schematic map.
- Spring Boot API scaffold with health and place CRUD/map-window endpoints.
- PostgreSQL/PostGIS schema managed by Flyway.

The AMap, live route, link import, model planning, trip editing, and HTML export integrations are planned milestones and are not implemented yet. The illustrated map and sample times/weather are not navigation or live data.

## Requirements

- Node.js 20.19+ (Node 24 recommended) and npm.
- Python 3 for generating the ignored local `.env` file.
- Java 21 JDK for the API build. The checked-in Maven Wrapper downloads a checksum-verified Maven distribution.
- Docker Engine with Docker Compose for PostGIS and the packaged API container.

## Start the web prototype

```bash
cd frontend
npm install
npm run dev
```

Vite prints the local address (normally `http://localhost:5173`).

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
