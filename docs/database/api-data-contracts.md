# Wildlife Safety Network — API data contracts

Status: design for review. These contracts describe the data the future API may accept and return. They are not implemented in this change.

The HTTP API is a client of the `api` schema. Handlers use the `wsn_app_public` pool unless the authenticated user has a live role with `ref.roles.is_staff = true`, in which case the handler uses the `wsn_app_staff` pool. Choosing the staff pool is not itself authorization. Each staff function checks `ref.role_permissions` for the actor id set in the transaction.

Existing Express modules map onto this contract as follows. Folders stay where they are.

| Module | Contract |
| --- | --- |
| `src/modules/auth` | Register, login, logout |
| `src/modules/users` | Profile, follows, preferences, role grants |
| `src/modules/sightings` | Community and guide reports, confirmations, public alert reads |
| `src/modules/notifications` | Inbox and preference updates |

Restricted ranger operations can be added under a `reports` or `operations` module later. They call staff functions and do not reuse a public repository that selects from base tables.

Response envelope, matching the current health route style:

```json
{ "data": {} }
```

Errors use the existing error handler. A permission failure and a missing row both return 404 on staff-only resources, so a public caller cannot probe restricted ids. Validation failures return 400. Authentication failures return 401 with a single message for unknown email and bad password.

Identifiers in JSON are UUID strings. Timestamps are ISO-8601 in UTC. Coordinates in JSON are numbers: `latitude` and `longitude` in WGS84. The public meaning of those numbers is "center of a cell `precision_meters` wide" whenever they come from an alert.

## Data that must stay off public responses

The public pool cannot select these, and no public JSON body may include them:

| Data | Where it lives | Who can receive it |
| --- | --- | --- |
| Exact report position and device `accuracy_meters` | `sensitive.report_locations` | Staff with `report.read_sensitive_location`, via `api.read_report_location` |
| `alerting.public_alerts.report_id` | alerting | Staff functions that already show the report |
| Zone-hit rows | `reporting.report_zone_hits` | Staff |
| `password_hash` | `identity.users` | Nobody through the API. Login returns a session, not the hash. |
| Refresh token hash | `identity.auth_sessions` | Nobody. The raw refresh token is returned once, at login or refresh. |
| `visibility = 'restricted'` reports, their summaries, notes, and media | reporting | Staff with `report.read_restricted` |
| Verification `notes` | `reporting.verifications` | Staff with `report.verify` or `report.read_restricted` |
| Emergency contacts with `is_public = false` | `ref.emergency_contacts` | Staff with `emergency_contact.manage` |
| Profile `phone` and account `email` | identity | The account subject. Staff with a user-management path for email. Phone is not a public profile field. |
| Audit rows | `audit.audit_log` | `audit.read` |
| Object `storage_key` for report media | `reporting.report_media` | The API exchanges it for a short-lived URL after the view allows the photo. The key is not a response field. |
| Notification bodies that restate a raw coordinate | alerting | The composer never receives the raw point |

`publication_outcome` is safe for the reporter. It tells them "suppressed because the point fell in a protected area" without naming the polygon.

A public alert response may contain `latitude`, `longitude`, and `precision_meters`. Those are the generalized point. Document that in the client as a cell center. Do not label the field `exact_location`.

## Transactions

Each operation below is one database transaction unless the row says otherwise. The handler sets `wsn.actor_user_id` with `set_config(..., true)` so it clears at commit. It does not leave the setting on a pooled connection.

| Operation | Transaction contents |
| --- | --- |
| Register | `api.register_user`: user, profile, notification preferences, audit `user.registered` |
| Login | `api.authenticate`: session insert, `last_login_at`, audit `login.succeeded`. Failed password: audit `login.failed` in its own transaction, then 401. |
| Logout | `api.revoke_session` and audit `session.revoked` |
| Submit report | `api.submit_report`: report, exact location, zone hits, optional public alert, publication outcome, audit `report.submitted` and, when published, `alert.published` |
| Attach photograph | Outside the report transaction. Upload to object storage first. Then a short transaction calls `api.attach_report_media`. If that insert fails, delete the object. |
| Confirm | `api.confirm_report` and audit `report.confirmed` |
| Verify or withdraw | `api.verify_report` or `api.withdraw_alert`: verification row or alert status, report status, publication outcome, audit |
| Role grant or revoke | `api.grant_role` or `api.revoke_role` and audit |
| Profile, preferences, follow | The matching `api` function. Audit role changes and staff edits of another user. Self-service profile edits do not need an audit row at launch. |
| Notification fan-out | Separate transactions after the alert commits, batched by the worker. The user request does not wait for push providers. |
| Read exact location | `api.read_report_location` inserts `location.read` in the same transaction as the read |

Photo bytes, password plaintext, and provider HTTP calls stay out of the database transaction.

## Auth

### `POST /api/v1/auth/register`

Request:

| Field | Required | Rule |
| --- | --- | --- |
| `email` | yes | Valid email, max 254 |
| `username` | yes | `^[a-z0-9_]{3,30}$` |
| `password` | yes | At least 12 characters. Hashed before it reaches SQL. |
| `display_name` | yes | 1–80 characters |
| `account_kind` | yes | `resident`, `tourist`, `guide`, `wildlife_personnel` |

Response `data`: `user.id`, `user.username`, `user.display_name`, `token` (access JWT), `refresh_token`, `refresh_expires_at`.

The response omits `password_hash`, `email` echo is allowed on the subject's own auth response so the client can show what was registered. `account_kind` is returned and confers no role.

### `POST /api/v1/auth/login`

Request: `email`, `password`.

Response `data`: same session shape as register, plus `user.id`, `user.username`.

Unknown email and wrong password share one error. The audit row may store the attempted email in `details.email` for `login.failed`. It must not store the password.

### `POST /api/v1/auth/logout`

Requires the refresh token or an access token plus session id. Sets `revoked_at`.

### `POST /api/v1/auth/refresh`

Request: `refresh_token`. Response: new access token. Rotation, if added, revokes the presented session and inserts a new one in the same transaction.

## Users and social graph

### `GET /api/v1/users/:username`

Public. From `api.public_profiles_v`: `username`, `display_name`, `bio`, `locality`, `account_kind`, `organization`, avatar content type, and a short-lived avatar URL when a key exists.

Absent: `email`, `phone`, `status`, roles, password, sessions.

### `PATCH /api/v1/users/me`

Subject only. Writable: `display_name`, `bio`, `locality`, `account_kind`, `organization`, `phone`, avatar metadata after upload. `account_kind` still grants nothing.

### `PUT /api/v1/users/me/notification-preferences`

Writable: `nearby_alerts_enabled`, `radius_meters` (500–50000), `minimum_risk_code`, `in_app_enabled`, `push_enabled`, `email_enabled`, `quiet_hours_start`, `quiet_hours_end`, `muted_species_codes` as a full set (the function replaces mute rows).

### `POST /api/v1/users/:username/follow` and `DELETE`

Actor follows or unfollows that user. Response: `{ "following": true }` or false.

### `GET /api/v1/users/:username/followers` and `/following`

Pages of public profile summaries. Keyset on `(created_at, user_id)`. Default limit 30, max 50.

### `POST /api/v1/users/:id/roles`

Staff with `user.grant_role`. Request: `role_code`. Response: the live grant's `role_code` and `granted_at`.

### `DELETE /api/v1/users/:id/roles/:role_code`

Staff with `user.grant_role`. Sets `revoked_at`. Does not delete the history row.

## Reference data

### `GET /api/v1/species`

`api.public_species_v`. Fields: `code`, `common_name`, `scientific_name`, `species_group`, `default_risk_code`, `description`.

### `GET /api/v1/risk-levels`

`code`, `rank`, `label`, `public_summary` for active levels.

### `GET /api/v1/safety-instructions`

Query: `species_code`, `risk_code`, `activity_context`. The handler asks for the most specific active instruction and may return several rows in `sort_order`. Fields: `title`, `body`, `activity_context`, `species_code`, `risk_code`.

### `GET /api/v1/emergency-contacts`

Query optional `zone_id` is not offered publicly, because zone ids plus a point could help someone map the operational picture. Public list is every `is_public` contact: `name`, `organization`, `phone`, `email`, `contact_kind`, `priority`. Optional filter: `contact_kind`.

Staff directory, `GET /api/v1/staff/emergency-contacts`, includes `is_public = false` and `zone_id`, and requires `emergency_contact.manage`.

## Reports

### `POST /api/v1/reports`

Any active user. Public pool. Body:

| Field | Required | Rule |
| --- | --- | --- |
| `idempotency_key` | no | UUID |
| `species_code` | no | Active species. Required if `species_note` is empty. |
| `species_note` | no | 1–200 characters |
| `report_kind` | yes | `sighting`, `safety_incident`, `animal_injury`, `other`. `snare` and `fence_breach` are rejected here. |
| `observed_at` | yes | Within the last 7 days, not more than 5 minutes ahead |
| `animal_count` | no | Integer 1–500, default 1 |
| `activity_context` | no | Safety-instruction vocabulary, default `general` |
| `summary` | yes | 1–2000 characters. Must not contain the submitted coordinate pair. |
| `latitude` | yes | -90 to 90 |
| `longitude` | yes | -180 to 180 |
| `accuracy_meters` | no | 0 to 10000 |

There is no `risk_code` field and no `public_latitude` field.

Response `data`:

| Field | Meaning |
| --- | --- |
| `id` | Report id, for the reporter's subsequent photo upload and status poll |
| `publication_outcome` | One of the outcome codes |
| `public_alert` | Null, or `{ id, headline, precision_meters, latitude, longitude, verification_state, expires_at }` when published |

The response does not include the submitted coordinates again.

A repeated `idempotency_key` returns the original payload with HTTP 200.

### `POST /api/v1/staff/reports`

Staff pool. Additional fields: `visibility` (`public_candidate` or `restricted`), `report_kind` including `snare` and `fence_breach`, `source_code` limited to `ranger` or `authority` and checked against the caller's permissions. `observed_at` may be older than 7 days for backfill, still not in the future beyond 5 minutes.

`snare` and `fence_breach` with `public_candidate` fail validation. The database check is the backstop.

Response includes `publication_outcome`. For restricted kinds that outcome is `suppressed_restricted_kind` and `public_alert` is null. The response still does not echo a coordinate. The ranger's device already has it. A later explicit read is audited.

### `POST /api/v1/reports/:id/media`

Multipart or a completed upload reference. Metadata sent to SQL: `content_type`, `byte_size`, `width_px`, `height_px`, `sha256`, and `exif_stripped: true` only after the server has stripped the file. The server rejects the file if GPS EXIF remains, and it never forwards the original bytes.

Public callers can attach only to their own `public_candidate` reports. Media visibility is then `public` only when a public alert exists; otherwise the function stores `restricted` until an alert exists, or stores `public` and the public media view still hides it until an alert row exists. Prefer the view rule: the photograph is listed only when an alert exists and visibility is `public`.

Response: `id`, `content_type`, `width_px`, `height_px`. No `storage_key`.

### `POST /api/v1/reports/:id/confirmations`

Active user, not the reporter, report is `public_candidate` and has a public alert. Response: `confirmation_count`.

### `GET /api/v1/reports/mine`

Reporter's own headers: `id`, `report_kind`, `species_code`, `species_note`, `status`, `publication_outcome`, `observed_at`, `animal_count`, `summary`, `created_at`, and the public alert object when one exists.

This list is how the reporter sees a suppression reason. It is not available to other public users. Exact coordinates are absent.

### `GET /api/v1/staff/reports`

Requires `report.read_restricted` for restricted rows. Query: `visibility`, `report_kind`, `status`, keyset `(created_at, id)`, limit max 50.

Returns headers, `publication_outcome`, source, reporter username, and zone-hit policies (`alert_policy`, `zone_type_code`, zone `name`). It does not return `latitude` and `longitude`. Zone names on a staff screen are an operational choice: rangers need to know which corridor matched. That payload is staff-only.

### `GET /api/v1/staff/reports/:id/location`

Requires `report.read_sensitive_location`. Response: `latitude`, `longitude`, `accuracy_meters`, `recorded_at`.

Every successful call writes audit `location.read`. The route is separate so list screens cannot fetch dozens of exact points by accident. The client loads a location when an operator opens a report.

### `POST /api/v1/staff/reports/:id/verifications`

Requires `report.verify`. Body: `outcome`, optional `notes`, optional `risk_code`.

`notes` are stored and omitted from every public response. When `outcome` is `rejected`, the public alert becomes `withdrawn` in the same transaction.

Response: `report_status`, `verification_state`, `alert_status`.

### `POST /api/v1/staff/alerts/:id/withdraw`

Requires `alert.withdraw`. Body: optional `reason` stored in audit `details.reason` (text, max 500, no coordinates). Alert `status` becomes `withdrawn`. Report `publication_outcome` becomes `withdrawn`.

### `POST /api/v1/staff/reports/:id/publish`

Requires `alert.publish_manual`. No coordinate in the body. Optional `expires_at` inside the next 24 hours. The function recomputes the grid snap. It fails when any zone hit is `suppress` or the report is `restricted`.

## Public alerts

### `GET /api/v1/alerts`

Query:

| Field | Required | Rule |
| --- | --- | --- |
| `latitude` | yes | The person's current area, used only for `ST_DWithin`. Not written to a table by this design. |
| `longitude` | yes | Same |
| `radius_meters` | no | Default 5000, min 500, max 50000 |
| `minimum_risk` | no | Code. Default `unknown` so the map can show everything active. |
| `limit` | no | Default 30, max 50 |
| `cursor` | no | Opaque keyset of `published_at` plus `id` |

The query runs on `api.public_alerts_v` with `status = 'active'` and `expires_at > now()`.

Each item:

| Field | Meaning |
| --- | --- |
| `id` | Public alert id |
| `species_code`, `common_name` | Null species code when the animal was unidentified |
| `risk_code`, `risk_label`, `risk_rank` | |
| `zone_name` | Corridor or buffer name |
| `headline`, `summary` | |
| `status` | Always `active` on this route |
| `verification_state` | `unverified`, `verified`, or `disputed` |
| `precision_meters` | Draw a circle of this radius |
| `latitude`, `longitude` | Cell center |
| `observed_at`, `expires_at`, `published_at` | |
| `confirmation_count` | Community confirmations |

The request coordinate is not logged in `audit.details` and is not stored on the user. Access logs that record full query strings will capture it. The HTTP access log for this route should record radius and a truncated geohash or nothing, and it should not record the raw query latitude and longitude. That is an application logging rule, paired with the database rule.

### `GET /api/v1/alerts/:id`

One active alert, same shape. Withdrawn and expired ids return 404 on the public route. Staff can request history with `GET /api/v1/staff/alerts/:id`, which adds `status` and still omits `report_id` unless the caller has `report.read_restricted` or `report.verify`. Even then, `report_id` is acceptable on the staff payload because those callers can already open the report. The exact point remains on the location route only.

### `GET /api/v1/alerts/:id/media`

Public photos linked to that alert: `id`, `content_type`, `width_px`, `height_px`, and a short-lived read URL. Restricted media never appears.

## Notifications

### `GET /api/v1/notifications`

In-app rows for the actor. Keyset `(created_at, id)`, limit max 50.

Fields: `id`, `title`, `body`, `status`, `created_at`, `read_at`, `public_alert_id`.

`body` is the public wording. There is no coordinate field.

### `POST /api/v1/notifications/:id/read`

Sets `read_at` and `status = 'read'` for the recipient only.

Push and email delivery are worker updates: `status`, `sent_at`, `provider_message_id`. They are not public routes.

## Pagination

All collections use keyset pagination. The response includes `page.next_cursor` when another page may exist. Clients send it back as `cursor`. Offset and page numbers are not part of the contract. Limits above the stated maximum are coerced down, not rejected, so a buggy client cannot ask for an unbounded dump. A missing cursor means the first page.

## Idempotency and overlap

Report create accepts `idempotency_key` so a mobile timeout can be retried safely. The unique key is per reporter.

Two different people reporting the same animal produce two reports and can produce two public alerts in nearby cells. Deduplication is a later product feature. The schema does not merge them automatically. Rangers can withdraw a duplicate alert.

## What the first implementation should test at the database

Before any handler is considered done, a script connected as `wsn_app_public` should:

1. `SELECT` from `sensitive.report_locations` and receive a permission error.
2. `SELECT report_id FROM alerting.public_alerts` and receive a permission error.
3. Call `api.submit_report` with a point inside a `PROTECTED_PARK` fixture and observe `suppressed_protected_area` and zero rows visible in `api.public_alerts_v` for that event.
4. Call it with a point inside a `HUMAN_CORRIDOR` fixture and observe a public latitude/longitude at least 500 m of precision, different in the sense that the cell center is what the view returns, while `read_report_location` is not executable by this role.
5. Call `api.submit_report` with `report_kind = 'snare'` and receive an error.
6. Insert a public alert for a report that has a suppress hit, as owner, and observe the trigger reject it. Application roles cannot insert that table directly.

The same script as `wsn_app_staff`, with an actor who lacks `report.read_sensitive_location`, should fail `api.read_report_location`. With that permission, it should succeed and add one `location.read` audit row.
