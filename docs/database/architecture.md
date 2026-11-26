# Wildlife Safety Network — database architecture

Status: design for review. This document does not authorize migrations, role creation, or API implementation.

The database is the authority for what the public can learn about wildlife locations. Application code and clients sit behind it. A public HTTP handler that "forgets" a column is not a sufficient control.

## 1. What already exists

Inspected layout:

| Path | Relevance |
| --- | --- |
| `apps/backend` | Express modular monolith. ES modules. `pg` pool in `src/config/db.js`. |
| `src/modules/auth` | Signup and login sketched around `email`, `username`, and a bcrypt password hash. Routes are not mounted with working handlers. |
| `src/modules/users`, `sightings`, `notifications` | Module folders reserved. No queries and no table definitions. |
| `apps/backend/docker-compose.yml` | PostgreSQL 17 Alpine, database `wsn_dev`, user `wsn_local`, host port `127.0.0.1:5435`. Named volume `postgres_data`. |
| `src/config/env.js` | Requires `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. |

There are no SQL migrations, no PostGIS usage, and no tables to preserve. The first migration, when this design is approved, creates the schema from scratch.

Preserve these choices when implementation starts:

- Environment variable names and the compose service name `postgres`.
- Host port `5435`, so a locally installed Postgres on `5432` does not collide.
- Module boundaries `auth`, `users`, `sightings`, and `notifications`. Sightings becomes the community-report use case of the `reporting` schema. Restricted ranger workflows can live beside it without a second database.

Required infrastructure change before any spatial migration runs:

- Replace image `postgres:17-alpine` with `postgis/postgis:17-3.5` (PostgreSQL 17 and PostGIS 3.5). The Alpine image cannot create the PostGIS extension.
- If volume `postgres_data` was already initialized by the Alpine image, create a new volume when switching images. PostGIS cannot be added to that data directory merely by changing the image tag.
- Fix `src/config/db.js`, which currently sets the pool `port` from `config.database.host`. That is an application defect, independent of this design, and it will make the health check fail against the real port.

`apps/backend/.env.example` does not yet list `DB_*`. The running config and Compose already require them. Update the example file during implementation, without copying secrets into git.

## 2. Design goals

Victoria Falls is a small operating area: town, river frontage, buffer, and protected park. The workload that justifies this schema is thousands to low millions of reports over several years, not a national tracking platform on day one.

The schema has to:

1. Accept reports from residents, tourists, guides, rangers, authorities, and later from sensors, through one ingest path.
2. Alert people when wildlife is in a human corridor or buffer.
3. Keep park-interior detections and raw GPS out of public query results.
4. Keep snare and fence-breach reports off public endpoints.
5. Stay understandable as one Postgres database behind one Node process that can later run as several stateless instances.

Horizontal scale, when it is needed, is more API instances sharing this primary. Sharding, logical replication, and partitioning are not part of the launch design. Section 10 states the thresholds that would change that.

## 3. Schema layout

Application tables are not created in `public`. PostGIS may install into `public`; that schema stays reserved for the extension.

| Schema | Owner | Contents |
| --- | --- | --- |
| `ref` | `wsn_owner` | Species, risk levels, zone types, zones, safety instructions, emergency contacts, roles, permissions, data sources. |
| `identity` | `wsn_owner` | Accounts, profiles, follows, role grants, refresh sessions, notification preferences. |
| `reporting` | `wsn_owner` | Report headers, media metadata, community confirmations, official verifications, zone-match audit. No coordinates. |
| `sensitive` | `wsn_owner` | `report_locations` only: the exact `geography` point for each report. |
| `alerting` | `wsn_owner` | Public alerts with generalized positions, and notification rows. |
| `audit` | `wsn_owner` | Append-only audit log. |
| `api` | `wsn_owner` | Views and `SECURITY DEFINER` functions. The only surface granted to application roles. |

`sensitive` contains one table on purpose. A dedicated schema is what makes `REVOKE ALL` stick. A column buried on `reporting.reports` will eventually be selected by `SELECT *`, an ORM, or a debug dump.

### Why these tables exist

Each table below earns its place by ownership or by a different access rule. Lookup tables exist where the row carries attributes the application must read (rank, alert policy, staff flag), not merely to avoid an enum.

| Table | Why it is a table |
| --- | --- |
| `ref.risk_levels` | Ordered scale plus the short public wording shown on an alert. |
| `ref.zone_types` | Holds the publication policy (`suppress` or `generalize`) and the default snap precision. Adding a zone type later is a row, once the code is reviewed. |
| `ref.species` | Shared catalog. Reports, alerts, instructions, and mutes all point here. |
| `ref.data_sources` | Distinguishes community, verified guide, ranger, authority, and future sensor ingest. Trust rank is data. |
| `ref.roles`, `ref.permissions`, `ref.role_permissions` | Staff powers are data the API checks, and they stay independent of self-described profile fields. |
| `ref.geographic_zones` | Polygons for park, buffer, and human corridor, with a GiST index for point-in-polygon. |
| `ref.safety_instructions` | Guidance varies by species, risk, and activity. Those are real filters, not a blob of JSON. |
| `ref.emergency_contacts` | Public numbers and unlisted operational numbers share a shape and differ by `is_public`. |
| `identity.users` | Login identity and password hash. Kept apart from the public profile so profile reads never touch the hash. |
| `identity.user_profiles` | Display data, self-described account kind, optional phone, avatar metadata. |
| `identity.user_follows` | Directed follow graph for guide updates. |
| `identity.user_roles` | Granted roles with history (`revoked_at`). A boolean on the user would erase who granted access and when. |
| `identity.auth_sessions` | Hash of the refresh token so a ranger session can be revoked. Short-lived access JWTs are not stored. |
| `identity.notification_preferences` | Per-user radius, minimum risk, and channels. |
| `identity.notification_species_mutes` | A mute list is many species per user. A text array would be harder to constrain with a foreign key. |
| `reporting.reports` | One header for sightings, safety incidents, and restricted ranger reports. Kind and visibility differ; the lifecycle is the same. |
| `sensitive.report_locations` | Exact point, isolated so ordinary grants cannot see it. One row per report. |
| `reporting.report_zone_hits` | Which zones contained the point at ingest time, including the policy copied onto the row. This is the record of why an alert was or was not published. Later edits to a polygon do not rewrite history. |
| `reporting.report_media` | Object-storage metadata for report photographs. Bytes stay out of Postgres. |
| `reporting.confirmations` | A second person confirms they saw the same animal. This is not an official verification. |
| `reporting.verifications` | Official review by a user who holds `report.verify`. Notes stay off public views. |
| `alerting.public_alerts` | The only wildlife location the public role can read. Position is produced inside the database by grid snap. |
| `alerting.notifications` | What was queued or delivered to a user. Also the in-app inbox. |
| `audit.audit_log` | Who viewed a raw location, who granted a role, who withdrew an alert. |

Deliberately absent:

- A sensor-device registry. `data_sources.code = 'sensor'` is the extension point. Add `reporting.sensor_devices` when a real integration has credentials and a device id.
- A second geometry column stored in a projected CRS. Projection is used inside the snap function and discarded.
- A polymorphic `media` table shared by avatars and report photos. Avatars are public profile data. Report photos follow the report's visibility and must record EXIF stripping. Mixing them creates one table with two security stories.
- Partitioned tables, replicas, and a message-broker outbox. Pending notifications are rows with `status = 'pending'`.
- JSON document columns for reports, zones, or preferences. The one JSONB column is `audit.audit_log.details`, because audit payloads are heterogeneous and are not a relational store. A trigger rejects coordinate keys inside that JSON.

## 4. How the main records relate

```text
user 1──1 profile
user 1──* reports (as reporter)
user *──* user (follows)
user *──* role (grants, with revocation history)

species 1──* reports
species 1──* safety instructions (null species_id means "any species")
data source 1──* reports

report 1──1 sensitive location
report 1──* zone hits
report 1──* media
report 1──* community confirmations
report 1──* official verifications
report 0──1 public alert

zone type 1──* zones
zone 1──* zone hits
zone 0──* public alerts (the corridor or buffer named in the alert)
zone 0──* emergency contacts

public alert 1──* notifications
user 1──* notifications
user 1──1 notification preferences
user *──* species (mutes)
```

A report is the fact that someone reported an animal or an incident. The sensitive location is where the device said it was. Zone hits are the geofence result. The public alert is a separate, coarser fact that exists only when publication rules pass. Verification does not move the coordinate. Verification can mark the alert verified or withdraw it.

`account_kind` on the profile (`resident`, `tourist`, `guide`, `wildlife_personnel`) is a label the user chooses. It grants nothing. Permissions come only from `identity.user_roles` joined to `ref.role_permissions`.

## 5. Geospatial strategy

### Geography for stored coordinates

Stored positions and zone boundaries use `geography` with SRID 4326:

| Column | Type |
| --- | --- |
| `sensitive.report_locations.position` | `geography(Point, 4326)` |
| `ref.geographic_zones.boundary` | `geography(MultiPolygon, 4326)` |
| `alerting.public_alerts.public_position` | `geography(Point, 4326)` |

`geography` makes `ST_DWithin` and `ST_Distance` return meters on the spheroid. Callers pass a radius in meters and do not choose a projection. That matches "alerts within 5 km of me" and stays correct if the mapped area later extends along the Zambezi.

`geometry` is the right tool for planar grid math. Victoria Falls sits near 17.9°S, 25.8°E, in UTM zone 35S (EPSG:32735). The publication function transforms a copy of the raw point to EPSG:32735, snaps it to a cell, and transforms the cell center back to a 4326 geography. The projected value is not stored. One persisted coordinate system avoids a second source of truth.

GiST indexes:

- `sensitive.report_locations (position)` — staff "what is near this point" and the ingest overlap test.
- `ref.geographic_zones (boundary)` — `ST_Covers` at ingest.
- `alerting.public_alerts (public_position)` — public nearby-alert queries.

`ST_Covers(boundary, point)` is the point-in-polygon test, and it includes the boundary. Points on the park fence follow the park rule.

Zone polygons are public knowledge (the town corridor and the park outline). The secret is which animals were detected inside them, and the exact point. Zone rows therefore live in `ref`, not in `sensitive`.

### Zone catalog

Seeded `ref.zone_types`:

| Code | `alert_policy` | Default precision |
| --- | --- | --- |
| `PROTECTED_PARK` | `suppress` | unused, because nothing is published |
| `BUFFER_ZONE` | `generalize` | 1000 m |
| `HUMAN_CORRIDOR` | `generalize` | 500 m |

The check constraint on `alerting.public_alerts.precision_meters` rejects anything finer than 500 m even if a future zone type is misconfigured.

Polygons themselves are operational data loaded from an authority boundary (ZimParks or a surveyed corridor), not invented in a migration. The schema is ready before those shapes exist. Until a corridor polygon is loaded, ingest still stores the report and publishes nothing, because publication requires a `generalize` hit.

### Publication rule

Evaluated inside `api.submit_report` after the exact point is stored:

1. Insert every active zone where `ST_Covers(boundary, position)` into `reporting.report_zone_hits`, copying `zone_type_code` and `alert_policy` onto the hit.
2. If any hit has `alert_policy = 'suppress'`, set `publication_outcome = 'suppressed_protected_area'` and stop. Overlap with a corridor does not override a park.
3. If `visibility = 'restricted'` (snare, fence breach, or any staff report marked restricted), set `publication_outcome = 'suppressed_restricted_kind'` and stop.
4. If there is no `generalize` hit, set `publication_outcome = 'suppressed_outside_corridor'` and stop. Wilderness detections stay in the operational store.
5. Otherwise insert one `alerting.public_alerts` row.
   - Precision is `GREATEST(500, MAX(default_precision_meters))` across the matched generalize zones.
   - `public_position` is the center of that grid cell.
   - `zone_id` is the generalize zone with the finest precision, used only to name the place ("town corridor").
   - `verification_state` starts as `unverified`.

The snap is deterministic. Republishing the same report lands on the same public point. A random offset would jump between publishes and is harder to explain to a reviewer. Anyone who knows the cell size can recover the cell. That is the public precision we intend to reveal. They cannot recover the raw point from `public_alerts`, because it is not stored there. Park detections produce no public row at all, so the snap algorithm reveals nothing about them.

`api.publish_alert` and `api.withdraw_alert`, granted only to the staff role, are the manual controls. `publish_alert` refuses when any hit is `suppress` or the report is `restricted`. It does not accept a coordinate argument. Staff cannot "correct" a public point back to the raw GPS.

Risk shown on a new alert comes from `ref.species.default_risk_code`. The public submit function ignores a client-supplied risk level. An unknown species (`species_id` null, `species_note` present) is stored as `unknown`. Staff change risk only through `api.verify_report`, which writes an audit row.

Community reports in a generalize zone publish immediately, labeled unverified, so a corridor alert is not held for an office review that may come too late. A ranger withdraws a bad alert. This timing is a product decision recorded here so it can be challenged before implementation: if the project would rather hold community reports until one official verification, only the function changes. The tables already separate "report stored" from "alert published".

### Nearby public query

The public list uses the generalized column and a meter radius:

```sql
SELECT id, headline, summary, precision_meters,
       ST_Y(public_position::geometry) AS latitude,
       ST_X(public_position::geometry) AS longitude,
       published_at
FROM api.public_alerts_v
WHERE status = 'active'
  AND expires_at > now()
  AND ST_DWithin(
        public_position,
        ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326)::geography,
        :radius_meters
      )
  AND (published_at, id) < (:cursor_published_at, :cursor_id)
ORDER BY published_at DESC, id DESC
LIMIT :limit;
```

`:limit` is capped at 50. Pagination is keyset on `(published_at, id)`. Offset pagination drifts when new alerts arrive at the top of the list.

The GiST index supports `ST_DWithin` on geography. A btree on `(status, expires_at)` supports the active-window predicate. At Victoria Falls volumes the planner can bitmap-and these. Partial index `WHERE status = 'active'` can be added later if the active fraction of the table becomes small. It is unnecessary while the table is young.

Clients plot `public_position` with a circle of `precision_meters`. The API contract calls that field a generalized location.

## 6. Security model

### Database roles

| Role | Login | Purpose |
| --- | --- | --- |
| `wsn_owner` | from migrations and break-glass DBeaver only | Owns objects. `SECURITY DEFINER` functions run as this role. |
| `wsn_app_public` | the pool for anonymous and ordinary user requests | `EXECUTE` on public functions, `SELECT` on public views. |
| `wsn_app_staff` | a second pool, used only after the API has confirmed a staff role | Public rights, plus staff functions. |

`wsn_local` from Compose can remain the local superuser used to create roles. The Node process must not use the superuser, the migration owner, or a role that can read `sensitive` by table grant.

Two pools are the control. Row Level Security that depends on every request remembering `SET LOCAL` fails open when someone adds a query and forgets the setting. A missing staff pool fails closed: the public pool's `EXECUTE` on `api.read_report_location` is revoked, so the call errors.

The staff pool is still only half of the control. The function also requires `current_setting('wsn.actor_user_id', true)` and checks that this user holds the relevant permission in `identity.user_roles`. The setting is applied with `set_config('wsn.actor_user_id', $id, true)` so it dies at commit. The API sets it from the authenticated session, inside the same transaction as the call.

DBeaver administrators connect as `wsn_owner` or the local superuser. That connection is an operational privilege, equivalent to production shell access, and it is not the application account.

### Grants

`REVOKE ALL ON SCHEMA sensitive FROM PUBLIC` and the same for `reporting`, `identity`, `alerting`, `audit`, and `ref`.

Then grant narrowly:

| Object | `wsn_app_public` | `wsn_app_staff` |
| --- | --- | --- |
| `api` public views (`public_alerts_v`, species, safety instructions, public emergency contacts) | `SELECT` | `SELECT` |
| `api.submit_report`, `api.confirm_report`, identity self-service functions | `EXECUTE` | `EXECUTE` |
| `api.read_report_location`, `api.verify_report`, `api.publish_alert`, `api.withdraw_alert`, `api.list_restricted_reports` | none | `EXECUTE` |
| `sensitive.report_locations` | none | none |
| Base tables in `reporting`, `alerting`, `identity`, `ref` | none | none |

Both application roles reach base tables through owner-defined functions, except for the public views in the `api` schema: active-alert listings, species, safety instructions, public emergency contacts, public profiles, and public report photographs. Those views contain no exact coordinates, no `report_id`, and no restricted rows. They are `security_invoker`, so the public role is granted `SELECT` only on the underlying columns those views read. `alerting.public_alerts.report_id` is not among them. The public role has no table-level `SELECT`, so `SELECT *` on a base table fails.

`report_id` is omitted from `api.public_alerts_v`. A public client that cannot see internal ids cannot join a public alert back to a report header or a zone-hit row.

Direct `SELECT` on `sensitive.report_locations` is revoked from both application roles. The staff read path is:

```text
api.read_report_location(report_id)
  → confirm session user is wsn_app_staff
  → confirm actor holds report.read_sensitive_location
  → insert audit.audit_log action 'location.read'
  → return latitude, longitude, accuracy
```

The function is `SECURITY DEFINER`, owned by `wsn_owner`, with `search_path` fixed to `sensitive, audit, pg_temp`. That pattern is repeated for every definer function so a caller cannot shadow objects.

`audit.audit_log` grants `INSERT` to the owner only (functions run as owner). `UPDATE` and `DELETE` are revoked from application roles. Corrections to the audit trail are new rows.

### Rules the functions enforce

These are database rules. The HTTP layer repeats them so users get clean errors, and the database still enforces them if a route is wrong.

1. A point covered by any active `PROTECTED_PARK` zone does not create a public alert.
2. The raw point is inserted only into `sensitive.report_locations`.
3. Application roles have no table privilege on that relation. Staff read it through the audited function.
4. `public_position` is the snapped cell center. `precision_meters` is at least 500.
5. Public views expose `public_position` and `precision_meters`. They do not expose `sensitive.report_locations`, zone hits, verification notes, or `report_id`.
6. `report_kind IN ('snare', 'fence_breach')` implies `visibility = 'restricted'` (check constraint). The public submit function rejects those kinds outright. Restricted reports never enter `alerting.public_alerts` (trigger on insert).
7. Sensor ingest is the same function with `source_code = 'sensor'` and a null reporter. The exact point still lands in `sensitive`. Automation does not get a shortcut table with looser grants.
8. The reporter's own `GET` returns `publication_outcome` and the public alert when one exists. It does not return the stored raw point. The device that created the report already has the GPS fix. Returning it from the API would let a stolen public token replay exact history.
9. Report photos require `exif_stripped = true` before insert. The API strips EXIF, including GPS tags, before upload. Restricted reports can only attach `visibility = 'restricted'` media. Public media views join through `public_alerts`, so a suppressed report's photograph has no public path.
10. Notification `title` and `body` are composed in the function from the headline and zone name. The function rejects a body that contains the raw latitude and longitude submitted with the report.

Profile `phone` is personal data. It is readable through `api.read_own_profile` for the subject, and through a staff function for users with `user.manage`. It is absent from public profile views. Follow lists return `username` and `display_name`.

Password hashes and refresh-token hashes are readable by none of the application roles. Login is `api.authenticate`, which compares the hash inside the definer function and returns the user id plus a new session row. The Node service still verifies the password with `bcrypt` if the team prefers to keep the hash comparison in the application. In that case the only query that selects `password_hash` is a definer function `api.lock_user_for_login(email)` granted to the public role, returning the hash solely for that comparison, and the application must not log the result. Preferred option at implementation time: compare inside the database function so the hash never enters Node memory except inside Postgres. The sketch in `auth.service.js` compares in Node. Either option is acceptable if the hash cannot be selected by a normal repository query. Decide before writing the repository, and record the choice in the migration comments.

### Triggers that back the functions

Functions can be bypassed by `wsn_owner`. Triggers still protect the public table if a future migration inserts alerts directly.

- `alerting.public_alerts` BEFORE INSERT: raise if the report has a `suppress` hit, `visibility = 'restricted'`, or `publication_outcome` is a suppressed state.
- `alerting.public_alerts` BEFORE INSERT OR UPDATE: raise if `precision_meters < 500`.
- `audit.audit_log` BEFORE INSERT: raise if `details` contains a key matching `latitude`, `longitude`, `position`, `coordinates`, or `raw_location`.
- `reporting.report_media` BEFORE INSERT: raise unless `exif_stripped`, and unless restricted reports use restricted media.

Check constraints cover the same precision and visibility rules so a trigger disable is not the only line.

## 7. Integrity

- Primary keys: `uuid` via `gen_random_uuid()` for entities that are created in more than one place or exposed indirectly. Lookup codes (`risk_levels.code`, `roles.code`, `data_sources.code`, `zone_types.code`, `permissions.code`) are `text` primary keys so foreign keys stay readable in DBeaver and in audit rows.
- `audit.audit_log.id` is `bigint GENERATED ALWAYS AS IDENTITY`. The log is append-only and local; a UUID adds nothing.
- Foreign keys default to `ON DELETE RESTRICT` for species, users who have reports, and alerts. Accounts are deactivated (`users.status`), not deleted, while reports exist.
- Cascades: profile, follows, sessions, preferences, and mutes cascade from the user. Location, zone hits, media, and confirmations cascade from the report. A report that already has a public alert does not cascade into the alert; the foreign key is `RESTRICT`. Withdraw the alert, then correct the report.
- `UNIQUE NULLS NOT DISTINCT` on safety instructions so two "any species / any risk / walking" rows with the same title cannot both exist. PostgreSQL 15+ treats nulls as equal under that clause. PostgreSQL 17 satisfies it.
- Partial unique index on active role grants: one live `(user_id, role_code)`.
- Idempotency: unique `(reporter_user_id, idempotency_key)` where the key is not null, so a mobile retry does not create a second animal.
- Sensor reports must have a null reporter. Every other source must have a reporter. One check constraint.
- All timestamps are `timestamptz`, stored in UTC. Quiet hours are interpreted in `Africa/Harare` by the notification worker, not by changing the database timezone.
- `updated_at` is maintained by one shared trigger function.

Transaction boundaries the API must use (one `BEGIN` … `COMMIT`, actor id set locally):

| Operation | Writes |
| --- | --- |
| Register | `users`, `user_profiles`, `notification_preferences`, audit |
| Login | `auth_sessions` insert, `users.last_login_at`, audit `login.succeeded` or `login.failed` |
| Submit report | report, sensitive location, zone hits, optional public alert, `publication_outcome`, audit |
| Attach photo | `report_media` after object storage has the object. If the insert fails, delete the object. Bytes are not in the transaction. |
| Confirm | `confirmations` plus audit |
| Verify | `verifications`, report status, alert `verification_state` or status, risk change, audit |
| Grant or revoke role | `user_roles`, audit |
| Preference change | `notification_preferences` or mute rows, audit only for staff acting on another user |

`submit_report` is a single function call and is atomic by itself. Photo attachment is a second transaction because the file is stored outside Postgres. Do not hold a database transaction open during the upload.

Isolation level is `READ COMMITTED`, the Postgres default. Withdraw and verify use `UPDATE … WHERE status = 'active'` so a double review does not reopen a withdrawn alert.

## 8. Performance and reliability

Indexes follow the queries we will actually run:

- Point-in-polygon at ingest, and nearby public alerts (`GiST`).
- Active alerts by time (`status`, `expires_at`, and the keyset `(published_at, id)`).
- A user's reports, a user's inbox, a report's verifications.
- Audit by time, actor, action, and entity id.

Partial index for the inbox: in-app notifications with `read_at IS NULL`.

Expected launch traffic is well inside a single PostgreSQL 17 primary with a GiST index. Do not partition, replicate, or introduce Citus as a starting point.

Add them when measurements say so:

| Feature | When it becomes appropriate |
| --- | --- |
| Monthly partitions on `audit.audit_log` | Sustained growth past roughly 20 million audit rows, or vacuum of the log starts to dominate. Location reads are the row to watch. |
| Monthly partitions on `reporting.reports` | Past roughly 10 million reports, or retention deletes of old operational data cause unacceptable bloat. |
| Streaming replica | A production availability target that requires automatic failover, or read load that a single primary cannot serve. The API can already run as multiple stateless Node instances on one primary. |
| Logical replication or a warehouse | When analysts need unrestricted historical queries away from the operational primary. The warehouse inherits the same sensitivity rules. |
| `pg_cron` | When retention and alert expiry should run inside the database. Until then, a scheduled Node command or system cron is enough. |

Retention, implemented as an owner-only function and audited:

| Data | Starting policy |
| --- | --- |
| Report headers, public alerts, verifications | Keep. Alerts move to `expired` or `resolved`. |
| Exact community and guide locations | Delete the geography 90 days after `observed_at` by removing the `sensitive` row's coordinates through an owner function that writes audit `location.expired`. The report and any public alert remain. |
| Exact locations for restricted reports | Keep 24 months, then review with the wildlife authority before deletion. |
| Notifications | Delete rows older than 180 days. |
| Expired refresh sessions | Delete 30 days after expiry. |
| Audit log | Keep at least 24 months. `location.read` rows are included. |

These periods are review points, especially the 90-day community coordinate lifetime. They are short enough to limit exposure and long enough for a ranger to investigate a recent corridor incident.

Backups:

- Development: the Docker volume is not a backup.
- Production: encrypted `pg_dump -Fc` daily, plus base backups and WAL archiving once the service is hosted. Backups contain raw coordinates. Access to backup storage matches access to `wsn_owner`.
- Restore into a scratch instance on a schedule and run a query that public roles still cannot read `sensitive`.
- Take backups before every migration.

Migrations, when implementation is approved:

- Tool: dbmate or node-pg-migrate, files in `apps/backend/db/migrations`, applied by `wsn_owner`.
- Order: extensions (`postgis`, `citext`) → schemas and roles → tables and indexes → triggers → functions and grants → reference seed (risk levels, zone types, roles, permissions, data sources, an initial species list).
- Zone polygons ship as a reviewed data migration, separate from the DDL, with a named source and a date.
- Expand/contract for later changes: add a nullable column, deploy code, backfill, then add `NOT NULL`. Avoid rewriting `public_alerts` in place.

Connection pool: the existing pool cap of 10 is a reasonable start for one public pool. Add a staff pool with a small cap (2–5). Each API instance multiplies those numbers. Stay under Postgres `max_connections` with headroom for migrations and DBeaver.

## 9. Decision log

| Decision | Choice | Alternative rejected |
| --- | --- | --- |
| Report model | One `reporting.reports` row with `report_kind` and `visibility` | Separate sighting and ranger tables that would drift |
| Exact GPS | Own schema and table | A column on `reports` hidden only in the SELECT list |
| Public coordinate | Deterministic grid snap in EPSG:32735, result stored as geography 4326 | Random jitter, which changes when an alert is rebuilt; storing both CRS versions |
| Park overlap | Any `suppress` hit blocks publication | Publishing a snapped point because a buffer also matched |
| Outside all zones | Store the report, do not publish | Publishing a very coarse point for the whole district |
| Who sets risk | Species default, staff may change it on verify | Client-supplied severity |
| When to publish | Immediately for community corridor reports, labeled unverified | Holding every alert for ranger approval |
| Manual publish | Function recomputes the snap and takes no coordinate argument | Staff-drawn public pins |
| API database access | Two roles, writes through definer functions | A single superuser connection plus middleware checks |
| Reporter reads back GPS | Not provided by the API | A "my exact history" endpoint on the public role |
| Sensors | Same ingest function and the same sensitive table | A parallel ingest table "for later" |
| Profile photos | Columns on `user_profiles` | Shared media table with report evidence |
| Lookup keys | Natural `text` codes | UUIDs for five-row catalogs |
| Audit identity | `bigint` identity | UUID |
| JSON | Only `audit_log.details`, with a denylist of coordinate keys | JSONB report payloads |
| Partitioning and replicas | Documented thresholds, not built | Launch-day infrastructure that this workload will not stress |
| Password check | Prefer comparison inside `api.authenticate` so `password_hash` has no application `SELECT` | Leaving a repository query that returns the hash. Acceptable only if that query is the single audited function. |

## 10. Review checklist

Confirm or adjust these before writing migrations:

1. Minimum public precision of 500 m, buffer default 1000 m.
2. Immediate publication of unverified community alerts inside generalize zones.
3. 90-day deletion of exact community coordinates, 24-month hold for restricted locations.
4. The authority that will supply `PROTECTED_PARK`, `BUFFER_ZONE`, and `HUMAN_CORRIDOR` polygons, and whether those boundaries are themselves public.
5. Password comparison inside Postgres versus the bcrypt comparison already sketched in `auth.service.js`.
6. Species list for the first seed (elephant, buffalo, hippo, crocodile, lion, and whatever else Victoria Falls response treats as routine).

After approval, implementation order is: PostGIS image and a fresh volume, roles, DDL, functions and grants, a privilege test that connects as `wsn_app_public` and fails to read `sensitive`, then API handlers. No API work is part of the current step.
