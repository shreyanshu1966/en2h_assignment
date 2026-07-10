# EN2H Booking Platform API

A REST API for managing services and customer bookings, built with NestJS, TypeORM, and PostgreSQL as a technical assignment for the EN2H Software Engineer Intern (NestJS) role.

## Project Overview

The API supports:

- **JWT authentication** (register, login, refresh, logout) with refresh-token rotation and revocation.
- **Service management** (CRUD), restricted to authenticated users.
- **Booking management** — public booking creation, with listing/status updates/cancellation restricted to authenticated users (bookings carry customer PII, so read/write access on existing bookings is treated as a staff-facing operation; see [Assumptions](#assumptions-made)).
- Business rules: a booking must reference an existing, active service; booking dates cannot be in the past; a cancelled booking can never be marked completed; duplicate bookings for the same service/date/time slot are rejected.
- Pagination, filtering, and search on list endpoints; a global validation pipe and a uniform JSON error shape from a global exception filter; full Swagger/OpenAPI documentation.

## Tech Stack

- NestJS 11 + TypeScript
- PostgreSQL + TypeORM (migration-based schema, `synchronize` disabled)
- Passport JWT (access + refresh tokens), bcryptjs for password hashing, SHA-256 for refresh-token storage
- class-validator / class-transformer for request validation
- Swagger (`@nestjs/swagger`) for API documentation
- Jest for unit tests
- Docker + Docker Compose

## Project Structure

```
src/
  auth/            # register/login/refresh/logout, JWT strategies & guards
  users/           # User entity + service
  services/        # Service entity, CRUD (auth required)
  bookings/        # Booking entity, business rules, CRUD
  common/          # shared DTOs, filters, decorators, validators
  migrations/       # TypeORM migrations
  data-source.ts   # TypeORM CLI data source
  app.module.ts
  main.ts
```

## Installation Steps

Prerequisites: Node.js 20+, npm, and either Docker Desktop **or** a local PostgreSQL instance.

```bash
git clone <repository-url>
cd en2h
npm install
cp .env.example .env   # then edit values as needed
```

## Environment Variables

See [.env.example](.env.example). Copy it to `.env` and adjust as needed.

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port the API listens on | `3000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | PostgreSQL username | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | `postgres` |
| `DB_NAME` | PostgreSQL database name | `en2h_booking` |
| `JWT_SECRET` | Secret used to sign access tokens | — (required) |
| `JWT_EXPIRES_IN` | Access token lifetime (e.g. `15m`, `1h`) | `15m` |
| `JWT_REFRESH_SECRET` | Secret used to sign refresh tokens | — (required) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime (e.g. `7d`) | `7d` |

## Database Setup

**Option A — Docker (recommended):**

```bash
docker compose up -d postgres
```

This starts PostgreSQL on `localhost:5432` with the credentials from `.env` (falls back to sane defaults if unset).

**Option B — local PostgreSQL:** create a database matching `DB_NAME` and point the `DB_*` variables at it.

## Running Migrations

```bash
npm run migration:run       # apply all pending migrations
npm run migration:revert    # roll back the most recent migration
npm run migration:generate -- src/migrations/<Name>   # generate a new migration from entity changes
```

The initial migration (`src/migrations/*-InitSchema.ts`) creates all tables, the `bookings_status_enum` type, foreign keys, and the unique `(service_id, booking_date, booking_time)` index used to reject duplicate bookings.

## Running the Application

**Locally:**

```bash
npm run migration:run
npm run start:dev      # watch mode
# or
npm run build && npm run start:prod
```

**With Docker Compose (API + PostgreSQL):**

```bash
docker compose up --build
```

The `api` service waits for PostgreSQL's healthcheck, runs migrations, then starts the app. The API is available at `http://localhost:3000`.

## Running Tests

```bash
npm run test        # unit tests
npm run test:cov    # unit tests with coverage
npm run test:e2e    # e2e tests (requires a running Postgres, see Database Setup)
```

Unit tests cover `BookingsService` (status-transition matrix, past-date rejection, duplicate-slot rejection) and `AuthService` (register/login/refresh, including a regression test for refresh-token reuse after rotation). The e2e suite boots the real `AppModule`, so it needs a reachable database (`docker compose up -d postgres` + `npm run migration:run`) — it currently just covers the health-check route as a smoke test.

## API Documentation

- **Swagger UI:** `http://localhost:3000/api/docs` (once the app is running)
- **OpenAPI JSON:** `http://localhost:3000/api/docs-json`

All endpoints are under the `/api/v1` prefix. Bearer JWT auth is documented per-endpoint in Swagger.

### Endpoint summary

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | — | Register a new user |
| POST | `/api/v1/auth/login` | — | Log in |
| POST | `/api/v1/auth/refresh` | refresh token (body) | Rotate access/refresh tokens |
| POST | `/api/v1/auth/logout` | required | Revoke all active refresh tokens |
| POST | `/api/v1/services` | required | Create a service |
| GET | `/api/v1/services` | required | List services (paginated, filter by `isActive`) |
| GET | `/api/v1/services/:id` | required | Get a service |
| PATCH | `/api/v1/services/:id` | required | Update a service |
| DELETE | `/api/v1/services/:id` | required | Delete a service |
| POST | `/api/v1/bookings` | — | Create a booking |
| GET | `/api/v1/bookings` | required | List bookings (paginated, filter by `status`, `search`) |
| GET | `/api/v1/bookings/:id` | required | Get a booking |
| PATCH | `/api/v1/bookings/:id/status` | required | Update booking status |
| PATCH | `/api/v1/bookings/:id/cancel` | required | Cancel a booking |

## Assumptions Made

- **Booking read/write on existing records requires authentication.** The spec only states booking *creation* is public; since bookings store customer PII (email, phone), listing/viewing/updating/cancelling existing bookings is treated as a staff-facing operation behind the JWT guard.
- **Inactive services cannot be booked.** Creating a booking against a service with `isActive: false` returns `400 Bad Request`.
- **Status transitions are restricted to a fixed state machine:** `PENDING → CONFIRMED | CANCELLED`, `CONFIRMED → COMPLETED | CANCELLED`. `CANCELLED` and `COMPLETED` are terminal. This enforces the "cancelled bookings cannot be completed" rule and also blocks skipping straight from `PENDING` to `COMPLETED`.
- **Duplicate-booking prevention** is scoped to `(serviceId, bookingDate, bookingTime)` and ignores cancelled bookings (a previously cancelled slot can be rebooked), enforced both at the service layer (clean `409`) and via a DB unique index as a safety net.
- Any authenticated user can manage any service (no per-user resource ownership) — the spec doesn't require multi-tenant service ownership.
- Refresh tokens are stored server-side as a SHA-256 hash of the token, not bcrypt — bcrypt truncates input at 72 bytes, and JWTs commonly exceed that, causing incorrect matches; SHA-256 is standard practice for hashing high-entropy opaque tokens (as opposed to low-entropy user passwords, which still use bcrypt here).

## Future Improvements

- Role-based access control (e.g. distinguish admin/staff users from a future "customer account" concept).
- Rate limiting on public endpoints (`/auth/*`, `POST /bookings`).
- E2E test suite covering the full HTTP surface (currently only unit tests are included given the assignment's time box).
- Soft-delete for services instead of hard delete, to preserve booking history referential integrity beyond the current `RESTRICT` FK.
- Structured logging and request correlation IDs.

## Postman / Swagger

A Postman collection can be exported directly from the running Swagger JSON (`http://localhost:3000/api/docs-json`) via Postman's "Import" feature, or the Swagger UI can be used directly for interactive testing.
