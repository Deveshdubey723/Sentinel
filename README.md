# Sentinel

Sentinel is a monitoring and incident-reporting application built with React, Express, and MongoDB/Mongoose. It stores users, resources, metric samples, alert rules, incidents, events, and per-user settings in MongoDB Atlas when `MONGODB_URI` is configured. Without a URI, development runs against seeded in-memory demo data.

## Requirements

- Node.js 20+
- npm 10+
- MongoDB Atlas (for persistent data)

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `JWT_SECRET` to a long random secret.
4. For Atlas persistence, set `MONGODB_URI` to the Atlas connection string and optionally set `MONGODB_DB` (defaults to `sentinel_db`). Leave the URI empty to use demo mode.
5. Run `npm run dev`; open http://localhost:5173.
6. Check API and database readiness at http://localhost:3001/api/v1/health and http://localhost:3001/api/v1/health/ready.

When `MONGODB_URI` is set, startup waits for Atlas and required indexes. A failed connection stops startup rather than silently switching to temporary memory storage. Production startup also requires both `MONGODB_URI` and `JWT_SECRET`.

## Atlas configuration

1. Create a MongoDB Atlas cluster and database user.
2. Add the application host's outbound IP to the Atlas network access list. Avoid `0.0.0.0/0` except for temporary testing.
3. Copy the Atlas SRV connection URI and add it as `MONGODB_URI`. URL-encode special characters in the database user's password.
4. Set `MONGODB_DB=sentinel_db` unless you want a different database name.
5. Restart the service and verify the health endpoints report `mongodb` / `connected`.
6. Register a new account. For local development only, set `SEED_DEMO_DATA=true` to create the demo account and sample resources in Atlas. Never enable this in production.

## Vercel and Render deployment

The repository includes [vercel.json](./vercel.json) for the Vite frontend and [render.yaml](./render.yaml) for the Express API.

### Render backend

Create a Render Web Service from this repository, or use the Blueprint configuration:

- Root directory: repository root
- Build command: `npm ci`
- Start command: `npm start`
- Health check: `/api/v1/health`

Set these Render environment variables:

- `NODE_ENV=production`
- `JWT_SECRET` — a long random secret
- `MONGODB_URI` — the MongoDB Atlas SRV URI
- `MONGODB_DB=sentinel_db`
- `FRONTEND_URLS` — the exact Vercel origin, for example `https://sentinel.example.vercel.app`; comma-separate additional trusted origins

### Vercel frontend

Import the same repository into Vercel:

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Environment variable: `VITE_API_BASE=https://<your-render-service>.onrender.com/api/v1`

After the Vercel domain is known, set that exact origin in Render's `FRONTEND_URLS`. Production authentication uses secure, `SameSite=None` HTTP-only cookies, so the frontend must call the HTTPS Render URL and retain credentials.

Do not set `VITE_API_BASE` to localhost in Vercel. Do not commit `.env` or any secret values.

## Monitoring data and alert rules

Create a resource from the Monitoring page. Authorized collectors can submit metric samples using the authenticated user's session or the bearer token returned by login:

```http
POST /api/v1/resources/{resourceId}/metrics
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "metric": "response_time",
  "value": 725,
  "unit": "ms",
  "observedAt": "2026-10-25T10:00:00.000Z"
}
```

Allowed metric names are `cpu`, `memory`, `response_time`, and `error_rate`. Rule conditions are evaluated on incoming samples; Sentinel does not poll resource URLs itself. Configure alert rules in the Alerts page or through:

- `GET/POST /api/v1/alert-rules`
- `PATCH/DELETE /api/v1/alert-rules/:id`
- `POST /api/v1/resources/:id/metrics`

Rules support a resource scope (or all resources), comparison operator and threshold, severity, consecutive matching checks, and a cooldown. Matching samples update one active incident per rule/resource instead of flooding the alert list. Incidents can be acknowledged, resolved, filtered by status/severity, and are included in reports.

## Analytics and reports

`GET /api/v1/reports/summary?days=7` returns observed sample averages and p95 values, six time buckets, alert counts by severity/status, resource coverage, and mean time to resolve. `days` must be 1–90. `GET /api/v1/reports/export?days=7` downloads a CSV containing resource, metric, and incident records. The Analytics and Reports pages expose the selectable time range.

## Commands

- `npm run dev` — Express API and Vite development server
- `npm test` — API and alerting tests
- `npm run lint` — Oxlint
- `npm run build` — production frontend build
- `npm start` — production Express server and built frontend

## Render deployment

Create a Render Web Service connected to this repository:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- Set `NODE_ENV=production`, `JWT_SECRET`, `MONGODB_URI`, and optionally `MONGODB_DB`.
- Confirm Atlas network access permits the Render service and verify `/api/v1/health/ready` after deployment.

Never commit `.env` or production credentials. Sentinel uses HttpOnly session cookies, user-scoped database queries, input validation, and endpoint URL restrictions. Host-level CPU and memory metrics require an authorized collector to send samples.
