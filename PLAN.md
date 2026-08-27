# Marketplace Catalog — Design & Build Plan

A marketplace catalog where contributors submit listings and moderators curate what
gets published. The catalog is public and read-only to anonymous visitors; there is no
purchasing.

---

## 1. Roles

| Role | Capabilities |
|---|---|
| Public (anonymous) | Browse published listings, view detail pages |
| Contributor | Create listings, edit own listings, view own listings in any status |
| Moderator | View all listings in all statuses, approve/reject, edit or delete any listing |
| Admin | Everything a moderator can do, plus user management |

Roles are **ranked rather than parallel**:

```
CONTRIBUTOR (0)  <  MODERATOR (1)  <  ADMIN (2)
```

The guard compares rank, so `@Roles(MODERATOR)` admits an admin without every
moderation route having to name both. That is the entire implementation cost of the
third role — the alternative, `@Roles(MODERATOR, ADMIN)` repeated across routes and
tests, is where role systems rot as they grow.

### How accounts are created

There is **no public sign-up**. This is a curated catalog: accounts are provisioned by
an admin, not self-served.

- The **first admin comes from the seed** — nothing else can create it, and its
  credentials serve as demo access
- Everyone else is created through `POST /users`, which is admin-only
- Separating admin from moderator keeps user provisioning out of reach of the people
  who moderate content; a moderator cannot mint accounts

Self-registration is the obvious extension — a public `POST /auth/register` that can
only ever produce a `CONTRIBUTOR` — and is deliberately out of scope.

---

## 2. Architecture

```
                      ┌──────────────────────────────┐
  Browser ──HTTPS──▶  │  Caddy (TLS)                 │
                      │  · serves the built SPA      │
                      │  · proxies /api/*  ──────────┼──┐
                      └──────────────────────────────┘  │
                                                        │
                                            ┌───────────▼────┐
                                            │  api (NestJS)  │
                                            └───┬────────┬───┘
                                                │        │
                        ┌───────────────────────▼─┐   ┌──▼──────┐
                        │  Neon Postgres          │   │  SQS    │
                        │  (managed)              │   └──┬──────┘
                        └─────────────────────────┘      │
                                                         │
                                            ┌────────────▼─────┐
  Browser ──presigned PUT──▶ S3 ◀──reads──  │ pre-screen worker│
                                            └────────┬─────────┘
                                                     │
                                               Anthropic API
```

**Monorepo**
```
apps/api          NestJS REST API
apps/worker       SQS consumer (pre-screen)
apps/web          React SPA
packages/shared   Enums, field limits, and the API contract
docker-compose.yml        prod  — api, worker, caddy
docker-compose.dev.yml    dev   — postgres, LocalStack, api, web (Vite HMR)
```

In production there is **no web container**: `vite build` emits static assets that are
copied into the Caddy image, and Caddy serves them with an SPA fallback while proxying
`/api/*` to the API. One fewer moving part, and — more importantly — the SPA and the API
share an origin, which is what lets the auth cookie stay `SameSite=Lax`. Serving the SPA
from S3/CloudFront would split the origin, force `SameSite=None`, and give up that CSRF
protection; at scale the answer is CloudFront in front of *both*, not just the frontend.

`packages/shared` holds the API contract — request and response types imported by both
sides. One definition means a drift between what the API returns and what the frontend
expects is a compile error, not a runtime surprise, and it is what allows backend and
frontend work to proceed in parallel against mocked data.

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Runtime | Docker Compose on a single EC2 | One moving part. Containers are stateless and config is env-driven, so the ECS migration path stays open. |
| Database | Neon (managed Postgres) | Instant provisioning, no VPC work, stays up for the whole evaluation window at no cost. |
| ORM | TypeORM + `@nestjs/typeorm` | First-class Nest integration; QueryBuilder gives the control the keyset catalog query needs. `synchronize: false` everywhere — migrations are the only schema path. |
| Object storage | S3, browser uploads via presigned PUT | Image bytes never traverse the API — the seam that matters under load. |
| Queue | SQS (+ DLQ, 3 receives) | AWS-native, consistent with S3; LocalStack gives dev/prod parity. |
| Local AWS | LocalStack (S3 + SQS) | Develop and run CI with no real cloud credentials. |
| Auth | JWT in an httpOnly, Secure, SameSite=Lax cookie; 24h; role as claim | XSS cannot read the token; SameSite gives CSRF protection; stateless verification keeps the API horizontally scalable. |
| Pagination | Keyset on `(created_at, id)` | Stable under concurrent inserts; no OFFSET degradation as the catalog grows. |
| AI | Anthropic Claude — vision model for drafting, fast model for pre-screening | One SDK and key; structured outputs via tool schemas. |
| Frontend state | TanStack Query; filters held in the URL | Caching and dedupe for free; filter state is shareable and back-button correct. |

---

## 3. Domain model

### Listing lifecycle

```
                 ┌──────────────┐
  create ───────▶│   PENDING    │
                 └──┬────────┬──┘
        approve ────┘        └──── reject (reason required)
             │                          │
      ┌──────▼──────┐            ┌──────▼──────┐
      │  PUBLISHED  │            │  REJECTED   │
      └──────┬──────┘            └──────┬──────┘
             │                          │
   contributor edit                contributor edit
             │                          │
             └────────▶ PENDING ◀───────┘
```

- A contributor editing a `PUBLISHED` or `REJECTED` listing returns it to `PENDING` — an
  edit that skipped review would defeat moderation entirely
- A moderator edit never changes status (no self-review loop)
- Rejection requires a reason, surfaced to the contributor so the listing can be fixed
- Delete is soft (`deleted_at`), moderator-only, preserving the audit trail
- Public queries filter `status = PUBLISHED AND deleted_at IS NULL` **in the repository
  layer**, not the controller — so no route can leak an unpublished listing

### Tables

**users** — `id, email (unique), password_hash, role (CONTRIBUTOR|MODERATOR|ADMIN), is_active, created_at`

**listings**
```
id                 uuid pk
title              text
description        text
price              numeric(12,2)
condition          enum  NEW | LIKE_NEW | GOOD | FAIR | FOR_PARTS
category           enum  ELECTRONICS | FURNITURE | CLOTHING | VEHICLES
                         HOME_GARDEN | SPORTS_OUTDOORS | TOYS_GAMES | OTHER
is_negotiable      boolean
min_price          numeric(12,2) null     -- required iff is_negotiable
options            text[]                 -- DELIVERY_AVAILABLE | LOCAL_PICKUP | OPEN_TO_TRADES
                                          -- ORIGINAL_PACKAGING | WARRANTY_INCLUDED | BUNDLE_DEAL
status             enum  PENDING | PUBLISHED | REJECTED
rejection_reason   text null
contributor_id     uuid fk users
expires_at         timestamptz null       -- modelled; automation not built
deleted_at         timestamptz null
created_at / updated_at / published_at
```

**listing_photos** — `id, listing_id fk, s3_key, sort_order` (primary photo = `sort_order 0`)

**listing_risk** — `listing_id fk unique, level (LOW|MEDIUM|HIGH), reasons text[], flags text[], model, evaluated_at`

### Indexes

| Index | Serves |
|---|---|
| `(status, created_at DESC, id DESC) WHERE deleted_at IS NULL` | the catalog keyset query |
| `(status, category, created_at DESC, id DESC)` | category-filtered browse |
| `(contributor_id, created_at DESC)` | "my listings" |
| GIN on `options` | multi-select option filtering |
| `(price)` | price-range filtering |

---

## 4. Validation

Enforced at three layers, so a bug at one is not a data-integrity failure.

### Layer 1 — request DTOs (`class-validator`, rejects 400)

| Field | Rule |
|---|---|
| `title` | 3–120 chars, trimmed, non-empty after trim |
| `description` | 20–5000 chars |
| `price` | `> 0`, `<= 10,000,000`, max 2 decimals |
| `isNegotiable` | boolean, required |
| `minPrice` | required **iff** `isNegotiable`, forbidden otherwise; `> 0` and `<= price` |
| `condition` | member of the 5-value enum |
| `category` | member of the 8-value enum |
| `options` | subset of the 6-value enum, no duplicates, max 6 |
| `photoKeys` | 1–5 entries |

### Layer 2 — domain service (invariants, rejects 403/409/422)

**Photo ownership and existence.** Every submitted key must match
`listings/{userId}/{uuid}.{ext}` and be confirmed via S3 `HeadObject` with
`ContentLength <= 5MB` and an allowed content type. Because the browser uploads directly
to S3, the API never sees the bytes — without this check a contributor could attach
arbitrary S3 keys, including another user's photos, to their own listing.

**Legality and prohibited content.** A deterministic keyword and pattern screen over
title and description:
- **Hard hits** — weapons, drugs, counterfeit markers, adult content — reject the
  submission outright with an explanatory message
- **Soft hits** — contact details or URLs stuffed into the description, a price off by
  orders of magnitude for its category — are accepted but pre-flagged, so the listing
  surfaces high in the moderation queue

Subtler judgement is the AI pre-screen's job. This layer exists so the app still refuses
illegal listings when the AI is unavailable.

**Ownership.** A contributor may edit only their own listings; a moderator may edit any.

**Transitions.** Every status change is routed through the state machine; illegal
transitions throw rather than silently persisting.

### Layer 3 — database constraints

```sql
CHECK (price > 0)
CHECK (min_price IS NULL OR (is_negotiable AND min_price > 0 AND min_price <= price))
CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL)
CHECK (char_length(title) BETWEEN 3 AND 120)
```

---

## 5. API

```
POST   /auth/login                      sets httpOnly cookie
POST   /auth/logout
GET    /auth/me

GET    /listings                        public; keyset + filters
GET    /listings/:id                    public (published only unless owner/moderator)
POST   /listings                        contributor
PATCH  /listings/:id                    contributor (own) | moderator (any)
DELETE /listings/:id                    moderator; soft delete

POST   /uploads/presign                 contributor|moderator → presigned PUT

GET    /moderation/queue                moderator; pending, risk-sorted
POST   /moderation/:id/approve          moderator
POST   /moderation/:id/reject           moderator; { reason }

GET    /users                           admin
POST   /users                           admin; { email, password, role }
PATCH  /users/:id/deactivate            admin

POST   /ai/draft-listing                contributor; { photoKeys[] } → draft fields

GET    /health                          liveness
GET    /health/ready                    DB + SQS reachable
```

**Catalog query** — `cursor, limit, category, condition, minPrice, maxPrice, options[], negotiable`
**Response** — `{ items: [...], nextCursor: string | null }`

**Upload constraints** — max 5 photos, 5 MB each, `image/jpeg|png|webp`; enforced
client-side, in the presign policy, and again on submit (§4 Layer 2).

---

## 6. AI

### Photo → draft listing (synchronous)

The contributor uploads photos, then presses **Draft with AI**. A vision model returns
structured JSON that prefills title, description, category, condition, and a suggested
price *range*. Every field remains editable, marked as AI-suggested.

Failure handling: a 15-second hard timeout, an inline non-blocking error, and a form
that remains fully usable by hand. The application must work end to end with the AI
unavailable.

### Moderation pre-screen (asynchronous, via SQS)

On submit the API enqueues a job and returns immediately. The worker runs the
deterministic checks from §4, then a fast model returning
`{ level, reasons[], flags[] }` against the prohibited-items policy. The combined level
is the higher of the two.

The moderation queue shows a badge, a one-sentence reason, and the flags, sorting
high-risk listings to the top. It is advisory: it never auto-rejects, and the reasons
are always shown so the judgement is auditable rather than a black-box score.

| Level | Meaning |
|---|---|
| High | Prohibited or illegal item, obvious scam, photo/description mismatch, adult content |
| Medium | Thin or duplicated description, price wildly off for the category, stock or watermarked photo, contact details in the description |
| Low | Normal listing |

---

## 7. Observability

**Structured logging** — `nestjs-pino`; JSON in production, pretty-printed locally.

- **Correlation IDs** — `x-request-id` is accepted or generated per request and carried
  through `AsyncLocalStorage` onto every log line. The id travels on the SQS message
  body too, so a listing is traceable from submit → enqueue → pre-screen → risk written.
- **Redaction** — `authorization`, `cookie`, `set-cookie`, `password`
- **Domain events**, not just HTTP — listing submitted, status transition, moderation
  decision, AI latency and token usage, AI failures
- **Levels** — `info` on request completion, `warn` for handled rejections, `error` for
  unhandled, via a global exception filter that logs exactly once

**Shipping** — Docker's `awslogs` log driver sends container stdout directly to
CloudWatch Logs under the EC2 instance role. No agent, no sidecar, no third-party
signup. Queried with CloudWatch Logs Insights:

```
fields @timestamp, level, msg, reqId, listingId
| filter level >= 50
| sort @timestamp desc
```

One metric filter and alarm on the `level>=50` count covers basic alerting.

---

## 8. Secrets

Three environments, three mechanisms, nothing secret in git.

| Environment | Mechanism |
|---|---|
| Local dev | `.env`, gitignored; `.env.example` committed with dummy values. LocalStack accepts fake AWS credentials, so no real ones are needed to develop. |
| CI | GitHub Actions repository secrets. CI runs against LocalStack and an ephemeral Postgres service container, so it needs no cloud credentials at all. |
| Production | AWS SSM Parameter Store, `SecureString`, under `/marketplace/prod/*`. The container entrypoint fetches them at boot and exports them into the process environment. |

Secrets held: `JWT_SECRET`, `ANTHROPIC_API_KEY`, `DATABASE_URL`.

**There are no AWS credentials in production.** The EC2 instance role grants S3, SQS,
and SSM; the SDK reads temporary rotating credentials from instance metadata. No access
keys on the box, in the compose file, or in the image. IAM policies are scoped to the
specific bucket and queue ARNs.

---

## 9. Testing

Test-first where it pays, and honest about where it doesn't.

**Strict TDD** — red, green, refactor:
- the listing state machine
- validation rules and invariants (table-driven)
- deterministic pre-screen checks
- keyset cursor encoding and decoding

**Test-first at the API contract level** — the failing e2e precedes the implementation:
- auth guards, including the unpublished-listing leak case
- the moderation approve/reject flow

**Not TDD** — React components and styling; S3 presign and SQS plumbing, which are
integration-tested against LocalStack after the fact.

---

## 10. Epics

1. **Foundation** — monorepo, Compose, LocalStack, Neon, health checks, CI, logging
2. **Domain & Data** — entities, migrations, constraints, state machine, seed data
3. **Auth & RBAC** — JWT cookie, guards, roles, repository-layer enforcement
4. **Listings API** — CRUD, keyset pagination, filtering, presigned uploads, validation
5. **Moderation & Users** — queue, approve/reject, soft delete, user management
6. **AI** — photo→draft, pre-screen worker, failure handling
7. **Frontend** — catalog, detail, item form, moderation UI, design system
8. **Deploy & Docs** — EC2, Caddy, SSM, IAM scoping, README

---

## 11. Deliberately not built

| Not built | Why | What it would take |
|---|---|---|
| Stale-listing automation | `expires_at` is modelled, but expiry policy is a product decision, not a technical one | A scheduled job transitioning expired listings out of the public catalog |
| Full-text / semantic search | The filter bar satisfies the requirement; search is explicitly bonus | Postgres FTS, or pgvector embeddings for semantic search |
| Facet counts on filters | A second aggregate query per request, which compounds as filters combine | `GROUP BY` alongside the paginated query, cached |
| Refresh-token rotation | Access-only tokens are sufficient for the exercise; the cost is that a role change takes up to 24h to take effect | Refresh endpoint, rotation, and a revocation list — plugging into the existing guard layer |
| Redis cache, read replicas, CDN | Premature at this scale; the seams that make them cheap to add are already in place | Cache the catalog query, route reads to replicas, serve photos via CloudFront |
| ECS / autoscaling | One box is the right size for now | The containers are already stateless and env-driven, so this is a task-definition exercise |
| Distributed tracing | Disproportionate for a single host; correlation IDs already cover the need | OpenTelemetry, with the correlation ID becoming the trace ID |
