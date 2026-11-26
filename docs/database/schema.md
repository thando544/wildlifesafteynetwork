# Wildlife Safety Network — schema catalog

Status: design for review. These relations are not created yet. Names below are the contract for the first migration.

Conventions:

- Entity primary keys are `uuid` `DEFAULT gen_random_uuid()` unless this catalog says otherwise.
- Lookup primary keys are `text` codes.
- `created_at` and `updated_at` are `timestamptz NOT NULL DEFAULT now()`. `updated_at` is maintained by trigger `ref.touch_updated_at()`.
- Timestamps are UTC.
- Foreign keys are `ON DELETE RESTRICT` and `ON UPDATE NO ACTION` unless a column says otherwise.
- Application roles have no direct table DML. Section "Access surface" lists the exceptions and the functions.

Extensions: `postgis` (installed in `public`), `citext`.

## Schemas

`ref`, `identity`, `reporting`, `sensitive`, `alerting`, `audit`, `api`.

`sensitive` contains only `report_locations`.

---

## ref.risk_levels

Ordered risk scale and the short public sentence for that level.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | | PK. `unknown`, `low`, `moderate`, `high`, `critical` |
| `rank` | `smallint` | no | | Unique. Higher is more severe. `unknown` is 0. |
| `label` | `text` | no | | Display name |
| `public_summary` | `text` | no | | One or two sentences safe to show on an alert |
| `is_active` | `boolean` | no | `true` | |

Checks: `code = lower(code)`, `rank >= 0`, `char_length(label) BETWEEN 1 AND 40`.

---

## ref.zone_types

Publication policy for a class of polygon.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | | PK. `PROTECTED_PARK`, `BUFFER_ZONE`, `HUMAN_CORRIDOR` |
| `label` | `text` | no | | |
| `alert_policy` | `text` | no | | `suppress` or `generalize` |
| `default_precision_meters` | `integer` | no | | Used when policy is `generalize` |
| `description` | `text` | no | | |

Checks: `alert_policy IN ('suppress', 'generalize')`, `default_precision_meters >= 500`. The public-alert check uses the same 500 m floor, so a zone type cannot be configured finer than an alert is allowed to show.

Seed: park `suppress` / 1000 (unused), buffer `generalize` / 1000, human corridor `generalize` / 500. The public alert check still enforces a floor of 500.

---

## ref.species

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `code` | `text` | no | | Unique stable slug, e.g. `african_elephant` |
| `common_name` | `text` | no | | Unique |
| `scientific_name` | `text` | yes | | |
| `species_group` | `text` | no | | `mammal`, `reptile`, `bird`, `other` |
| `default_risk_code` | `text` | no | | FK → `ref.risk_levels(code)` |
| `is_active` | `boolean` | no | `true` | Inactive species remain for old reports |
| `description` | `text` | yes | | Public natural-history note, not a location |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks: `code ~ '^[a-z0-9_]{2,40}$'`, `species_group IN ('mammal', 'reptile', 'bird', 'other')`.

Index: unique `code`, unique `common_name`, btree `(is_active)`.

---

## ref.data_sources

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | | PK. `community`, `verified_guide`, `ranger`, `authority`, `sensor` |
| `label` | `text` | no | | |
| `description` | `text` | no | | |
| `is_automated` | `boolean` | no | `false` | `true` only for `sensor` |
| `trust_rank` | `smallint` | no | | Higher means more trusted. Unique. |
| `is_active` | `boolean` | no | `true` | |

Checks: `is_automated = (code = 'sensor')`.

---

## ref.roles

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | | PK. `verified_guide`, `ranger`, `wildlife_authority`, `administrator` |
| `label` | `text` | no | | |
| `description` | `text` | no | | |
| `is_staff` | `boolean` | no | | Staff pool required when true |

`verified_guide.is_staff` is false. The other three are true. A user with no row in `identity.user_roles` is a normal account.

---

## ref.permissions

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `code` | `text` | no | | PK |
| `description` | `text` | no | | |

Seed codes:

| Code | Held by |
| --- | --- |
| `report.submit_restricted` | ranger, wildlife_authority, administrator |
| `report.read_restricted` | ranger, wildlife_authority, administrator |
| `report.read_sensitive_location` | ranger, wildlife_authority, administrator |
| `report.verify` | ranger, wildlife_authority, administrator |
| `alert.withdraw` | ranger, wildlife_authority, administrator |
| `alert.publish_manual` | wildlife_authority, administrator |
| `zone.manage` | wildlife_authority, administrator |
| `species.manage` | wildlife_authority, administrator |
| `safety_instruction.manage` | wildlife_authority, administrator |
| `emergency_contact.manage` | wildlife_authority, administrator |
| `user.grant_role` | administrator |
| `audit.read` | administrator |

Ordinary reporting and self-service do not have permission rows. Any active user may call `api.submit_report` for non-restricted kinds. The function checks `users.status = 'active'`.

---

## ref.role_permissions

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `role_code` | `text` | no | | PK, FK → `ref.roles(code)` |
| `permission_code` | `text` | no | | PK, FK → `ref.permissions(code)` |

---

## ref.geographic_zones

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `name` | `text` | no | | Unique among active zones |
| `zone_type_code` | `text` | no | | FK → `ref.zone_types(code)` |
| `boundary` | `geography(MultiPolygon, 4326)` | no | | |
| `is_active` | `boolean` | no | `true` | Inactive polygons are ignored at ingest |
| `source_note` | `text` | no | | Who supplied the polygon and when |
| `description` | `text` | yes | | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks: `char_length(name) BETWEEN 1 AND 120`, `ST_IsValid(boundary::geometry)`.

Indexes: GiST `(boundary)`, btree `(zone_type_code) WHERE is_active`, unique `(name) WHERE is_active`.

---

## ref.safety_instructions

One instruction can apply to all species (`species_id` null), all risk levels (`risk_code` null), or one of each. The API resolves the most specific match: species+risk+activity, then species+activity, then risk+activity, then activity with both nulls.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `species_id` | `uuid` | yes | | FK → `ref.species(id)` `ON DELETE RESTRICT` |
| `risk_code` | `text` | yes | | FK → `ref.risk_levels(code)` |
| `activity_context` | `text` | no | | See check |
| `title` | `text` | no | | |
| `body` | `text` | no | | |
| `sort_order` | `smallint` | no | `0` | |
| `is_active` | `boolean` | no | `true` | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks: `activity_context IN ('general', 'walking', 'driving', 'camping', 'river', 'night')`, `char_length(title) BETWEEN 1 AND 160`, `char_length(body) BETWEEN 1 AND 4000`.

Unique: `UNIQUE NULLS NOT DISTINCT (species_id, risk_code, activity_context, title)`.

Index: btree `(species_id, activity_context, risk_code) WHERE is_active`.

---

## ref.emergency_contacts

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `name` | `text` | no | | |
| `organization` | `text` | no | | |
| `phone` | `text` | no | | E.164 preferred |
| `email` | `citext` | yes | | |
| `zone_id` | `uuid` | yes | | FK → `ref.geographic_zones(id)`. Null means the whole operating area. |
| `contact_kind` | `text` | no | | `police`, `wildlife_authority`, `medical`, `ranger_station`, `general` |
| `priority` | `smallint` | no | `100` | Lower sorts first |
| `is_public` | `boolean` | no | `true` | Public view filters `true` |
| `is_active` | `boolean` | no | `true` | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks: `contact_kind` in the list above, `char_length(phone) BETWEEN 3 AND 32`.

Index: btree `(is_public, is_active, priority)`, btree `(zone_id)`.

---

## identity.users

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `email` | `citext` | no | | Unique |
| `username` | `citext` | no | | Unique. Stored lowercase. |
| `password_hash` | `text` | no | | bcrypt or argon2 string. Never selected by a public view. |
| `status` | `text` | no | `'active'` | `active`, `suspended`, `pending_verification`, `deactivated` |
| `email_verified_at` | `timestamptz` | yes | | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |
| `last_login_at` | `timestamptz` | yes | | |

Checks:

- `status IN ('active', 'suspended', 'pending_verification', 'deactivated')`
- `username ~ '^[a-z0-9_]{3,30}$'`
- `char_length(email) BETWEEN 6 AND 254` and `email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'`
- `char_length(password_hash) BETWEEN 50 AND 200`

Indexes: unique `email`, unique `username`, btree `(status)`.

Deactivation keeps the row so report foreign keys remain valid. A deactivated account cannot pass `api.submit_report` or `api.authenticate`.

---

## identity.user_profiles

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE CASCADE` |
| `display_name` | `text` | no | | |
| `bio` | `text` | yes | | |
| `locality` | `text` | yes | | Town or suburb name. Not a coordinate. |
| `account_kind` | `text` | no | | Self-described. Grants no permission. |
| `organization` | `text` | yes | | |
| `phone` | `text` | yes | | Personal. Omitted from public profile views. |
| `avatar_storage_key` | `text` | yes | | Object storage key |
| `avatar_content_type` | `text` | yes | | `image/jpeg` or `image/png` |
| `avatar_byte_size` | `integer` | yes | | |
| `avatar_updated_at` | `timestamptz` | yes | | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks:

- `account_kind IN ('resident', 'tourist', 'guide', 'wildlife_personnel')`
- `char_length(display_name) BETWEEN 1 AND 80`
- `bio IS NULL OR char_length(bio) <= 500`
- Avatar key, content type, and byte size are all null or all present
- `avatar_content_type IS NULL OR avatar_content_type IN ('image/jpeg', 'image/png')`
- `avatar_byte_size IS NULL OR avatar_byte_size BETWEEN 1 AND 5000000`

No home latitude or longitude column exists.

---

## identity.user_follows

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `follower_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE CASCADE` |
| `followee_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | no | `now()` | |

Check: `follower_id <> followee_id`.

Index: btree `(followee_id)` for "who follows this guide".

---

## identity.user_roles

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | | FK → `identity.users(id)` `ON DELETE RESTRICT` |
| `role_code` | `text` | no | | FK → `ref.roles(code)` |
| `granted_by` | `uuid` | yes | | FK → `identity.users(id)` `ON DELETE RESTRICT` |
| `granted_at` | `timestamptz` | no | `now()` | |
| `revoked_at` | `timestamptz` | yes | | |
| `revoked_by` | `uuid` | yes | | FK → `identity.users(id)` `ON DELETE RESTRICT` |

Checks: `revoked_at IS NULL OR revoked_at >= granted_at`, and `revoked_at` / `revoked_by` are both null or both set.

Index: unique `(user_id, role_code) WHERE revoked_at IS NULL`. Btree `(role_code) WHERE revoked_at IS NULL`.

---

## identity.auth_sessions

Server-side refresh sessions. Access tokens are short-lived JWTs and are not rows.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `user_id` | `uuid` | no | | FK → `identity.users(id)` `ON DELETE CASCADE` |
| `token_hash` | `text` | no | | Unique. SHA-256 hex of the refresh token. |
| `expires_at` | `timestamptz` | no | | |
| `revoked_at` | `timestamptz` | yes | | |
| `created_at` | `timestamptz` | no | `now()` | |
| `user_agent` | `text` | yes | | Truncate at 300 characters in the function |
| `client_ip` | `inet` | yes | | |

Checks: `expires_at > created_at`, `char_length(token_hash) = 64`.

Indexes: unique `token_hash`, btree `(user_id, expires_at)`.

---

## identity.notification_preferences

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE CASCADE` |
| `nearby_alerts_enabled` | `boolean` | no | `true` | |
| `radius_meters` | `integer` | no | `5000` | |
| `minimum_risk_code` | `text` | no | `'moderate'` | FK → `ref.risk_levels(code)` |
| `in_app_enabled` | `boolean` | no | `true` | |
| `push_enabled` | `boolean` | no | `false` | |
| `email_enabled` | `boolean` | no | `false` | |
| `quiet_hours_start` | `time` | yes | | Local civil time, Africa/Harare |
| `quiet_hours_end` | `time` | yes | | Both null or both set |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks: `radius_meters BETWEEN 500 AND 50000`. Quiet hours both null or both non-null. Created with the user in the register transaction. There is no separate `created_at`; the user row has it.

---

## identity.notification_species_mutes

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `user_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE CASCADE` |
| `species_id` | `uuid` | no | | PK, FK → `ref.species(id)` `ON DELETE CASCADE` |
| `created_at` | `timestamptz` | no | `now()` | |

A muted species is skipped when the worker inserts `alerting.notifications`. The public alert itself is unchanged.

---

## reporting.reports

Header for every sighting, safety incident, and restricted report. Coordinates are not on this table.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `reporter_user_id` | `uuid` | yes | | FK → `identity.users(id)` `ON DELETE RESTRICT`. Null only for sensors. |
| `species_id` | `uuid` | yes | | FK → `ref.species(id)` `ON DELETE RESTRICT` |
| `species_note` | `text` | yes | | Required when `species_id` is null. Optional qualifier when it is set. |
| `report_kind` | `text` | no | | See check |
| `source_code` | `text` | no | | FK → `ref.data_sources(code)` |
| `visibility` | `text` | no | | `public_candidate` or `restricted` |
| `status` | `text` | no | `'submitted'` | `submitted`, `under_review`, `verified`, `rejected`, `closed` |
| `risk_code` | `text` | no | | FK → `ref.risk_levels(code)`. Set from the species by the function. |
| `publication_outcome` | `text` | no | `'pending'` | See check |
| `observed_at` | `timestamptz` | no | | When the reporter says they saw the animal |
| `animal_count` | `integer` | no | `1` | |
| `activity_context` | `text` | no | `'general'` | Same set as safety instructions |
| `summary` | `text` | no | | Reporter narrative |
| `idempotency_key` | `uuid` | yes | | Client retry key |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks:

- `report_kind IN ('sighting', 'safety_incident', 'snare', 'fence_breach', 'animal_injury', 'other')`
- `visibility IN ('public_candidate', 'restricted')`
- `status IN ('submitted', 'under_review', 'verified', 'rejected', 'closed')`
- `publication_outcome IN ('pending', 'published', 'suppressed_protected_area', 'suppressed_restricted_kind', 'suppressed_outside_corridor', 'withdrawn')`
- `activity_context IN ('general', 'walking', 'driving', 'camping', 'river', 'night')`
- `animal_count BETWEEN 1 AND 500`
- `char_length(summary) BETWEEN 1 AND 2000`
- `species_note IS NULL OR char_length(species_note) BETWEEN 1 AND 200`
- `species_id IS NOT NULL OR species_note IS NOT NULL`
- `(source_code = 'sensor' AND reporter_user_id IS NULL) OR (source_code <> 'sensor' AND reporter_user_id IS NOT NULL)`
- `report_kind NOT IN ('snare', 'fence_breach') OR visibility = 'restricted'`
- `observed_at <= now() + interval '5 minutes'`
- `observed_at > now() - interval '7 days'` for rows inserted by the public function (enforced in the function, not as a table check, so staff can backfill an older ranger report)

Indexes:

- btree `(reporter_user_id, created_at DESC)`
- btree `(status, observed_at DESC)`
- btree `(species_id)`
- btree `(visibility, report_kind)`
- unique `(reporter_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

---

## sensitive.report_locations

The exact fix. One row per report. No application role is granted this table.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `report_id` | `uuid` | no | | PK, FK → `reporting.reports(id)` `ON DELETE CASCADE` |
| `position` | `geography(Point, 4326)` | no | | |
| `accuracy_meters` | `numeric(6,1)` | yes | | Device-reported accuracy, if the client sent it |
| `recorded_at` | `timestamptz` | no | `now()` | When the row was written, not when the animal was seen |

Checks: `accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 10000`.

Index: GiST `(position)`.

Retention deletes this row's data through an owner function. It does not leave a nullable position behind, because a null would look like a missing ingest. The function deletes the row and audits `location.expired`. The report header remains.

---

## reporting.report_zone_hits

Geofence result copied at ingest so later polygon edits do not change history.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `report_id` | `uuid` | no | | PK, FK → `reporting.reports(id)` `ON DELETE CASCADE` |
| `zone_id` | `uuid` | no | | PK, FK → `ref.geographic_zones(id)` `ON DELETE RESTRICT` |
| `zone_type_code` | `text` | no | | Copy of the type at match time |
| `alert_policy` | `text` | no | | Copy of `suppress` or `generalize` |

Checks: `alert_policy IN ('suppress', 'generalize')`.

Index: btree `(zone_id)`.

Staff-only through `api.list_report_zone_hits`. The reporter receives `publication_outcome`, not the hit list, so a suppressed report does not reveal which park polygon matched.

---

## reporting.report_media

Metadata only. Objects live in object storage under `storage_key`.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `report_id` | `uuid` | no | | FK → `reporting.reports(id)` `ON DELETE CASCADE` |
| `storage_key` | `text` | no | | Unique |
| `content_type` | `text` | no | | `image/jpeg`, `image/png`, `image/webp` |
| `byte_size` | `integer` | no | | |
| `width_px` | `integer` | yes | | |
| `height_px` | `integer` | yes | | |
| `sha256` | `text` | no | | Hex |
| `visibility` | `text` | no | | `public` or `restricted` |
| `exif_stripped` | `boolean` | no | | Must be true |
| `created_at` | `timestamptz` | no | `now()` | |

Checks:

- `content_type IN ('image/jpeg', 'image/png', 'image/webp')`
- `byte_size BETWEEN 1 AND 15000000`
- `exif_stripped = true`
- `visibility IN ('public', 'restricted')`
- `char_length(sha256) = 64`
- `width_px IS NULL OR width_px BETWEEN 1 AND 20000`, same for height

Trigger: if the parent report is `restricted`, `visibility` must be `restricted`.

Indexes: unique `storage_key`, btree `(report_id)`.

---

## reporting.confirmations

A community user states they saw the same situation. This does not change `verification_state`.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `report_id` | `uuid` | no | | PK, FK → `reporting.reports(id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` | no | | PK, FK → `identity.users(id)` `ON DELETE RESTRICT` |
| `created_at` | `timestamptz` | no | `now()` | |

The function rejects a confirmation where `user_id` equals `reporter_user_id`, and it rejects confirmations on `restricted` reports from callers without `report.read_restricted`.

Index: the primary key, plus btree `(user_id)`.

Public alerts expose `confirmation_count` as `COUNT(*)` from this table through the view. A cached counter is not stored until a measurement says the count is hot.

---

## reporting.verifications

Official review. Several rows per report are allowed; the latest is current.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `report_id` | `uuid` | no | | FK → `reporting.reports(id)` `ON DELETE RESTRICT` |
| `verifier_user_id` | `uuid` | no | | FK → `identity.users(id)` `ON DELETE RESTRICT` |
| `outcome` | `text` | no | | `confirmed`, `disputed`, `rejected`, `needs_more_evidence` |
| `notes` | `text` | yes | | Staff only. Max 4000 characters. |
| `created_at` | `timestamptz` | no | `now()` | |

Checks: `outcome` in the list above, `notes IS NULL OR char_length(notes) BETWEEN 1 AND 4000`.

Index: btree `(report_id, created_at DESC)`.

`api.verify_report` maps outcomes onto the report and the alert:

| Outcome | Report status | Public alert |
| --- | --- | --- |
| `confirmed` | `verified` | `verification_state = 'verified'` when an alert exists |
| `disputed` | `under_review` | `verification_state = 'disputed'` |
| `needs_more_evidence` | `under_review` | unchanged |
| `rejected` | `rejected` | status `withdrawn`, report `publication_outcome = 'withdrawn'` |

Risk changes travel in the same function arguments and the same transaction, and only when `outcome = 'confirmed'` or the caller also passes an explicit risk override. The audit row records previous and new `risk_code` inside `details` (codes only, no coordinates).

---

## alerting.public_alerts

The public location record. `report_id` is internal and is excluded from the public view grant via column privileges.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `report_id` | `uuid` | no | | Unique, FK → `reporting.reports(id)` `ON DELETE RESTRICT` |
| `species_id` | `uuid` | yes | | FK → `ref.species(id)` `ON DELETE RESTRICT` |
| `risk_code` | `text` | no | | FK → `ref.risk_levels(code)` |
| `zone_id` | `uuid` | yes | | FK → `ref.geographic_zones(id)`. Corridor or buffer used in the headline. |
| `public_position` | `geography(Point, 4326)` | no | | Grid-cell center |
| `precision_meters` | `integer` | no | | |
| `headline` | `text` | no | | Generated by the function |
| `summary` | `text` | no | | Reporter summary after the coordinate-text check |
| `status` | `text` | no | `'active'` | `active`, `resolved`, `expired`, `withdrawn` |
| `verification_state` | `text` | no | `'unverified'` | `unverified`, `verified`, `disputed` |
| `observed_at` | `timestamptz` | no | | Copied from the report so the public view need not join `reporting.reports` |
| `starts_at` | `timestamptz` | no | `now()` | |
| `expires_at` | `timestamptz` | no | | Function sets `observed_at + interval '12 hours'` unless staff pass a shorter window |
| `published_at` | `timestamptz` | no | `now()` | |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | |

Checks:

- `precision_meters >= 500 AND precision_meters <= 20000`
- `status IN ('active', 'resolved', 'expired', 'withdrawn')`
- `verification_state IN ('unverified', 'verified', 'disputed')`
- `expires_at > starts_at`
- `char_length(headline) BETWEEN 1 AND 180`
- `char_length(summary) BETWEEN 1 AND 2000`

Trigger BEFORE INSERT: parent report has no `suppress` zone hit, `visibility = 'public_candidate'`, and `publication_outcome` is `pending` or `published`.

Indexes:

- GiST `(public_position)`
- unique `(report_id)`
- btree `(status, expires_at)`
- btree `(published_at DESC, id DESC)`

---

## alerting.notifications

Delivery record and in-app inbox. No geography column.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | PK |
| `recipient_user_id` | `uuid` | no | | FK → `identity.users(id)` `ON DELETE CASCADE` |
| `public_alert_id` | `uuid` | yes | | FK → `alerting.public_alerts(id)` `ON DELETE RESTRICT` |
| `channel` | `text` | no | | `in_app`, `push`, `email` |
| `title` | `text` | no | | |
| `body` | `text` | no | | Composed from headline and zone name |
| `status` | `text` | no | `'pending'` | `pending`, `sent`, `failed`, `read` |
| `created_at` | `timestamptz` | no | `now()` | |
| `sent_at` | `timestamptz` | yes | | |
| `read_at` | `timestamptz` | yes | | |
| `provider_message_id` | `text` | yes | | Provider id for push or email. Not a JSON payload. |

Checks:

- `channel IN ('in_app', 'push', 'email')`
- `status IN ('pending', 'sent', 'failed', 'read')`
- `char_length(title) BETWEEN 1 AND 180`
- `char_length(body) BETWEEN 1 AND 1000`
- `read_at IS NULL OR channel = 'in_app'`

Indexes:

- btree `(recipient_user_id, created_at DESC)`
- partial btree `(recipient_user_id, created_at DESC) WHERE channel = 'in_app' AND read_at IS NULL`
- btree `(status, created_at) WHERE status = 'pending'`

Fan-out runs after the submit transaction commits, in a worker that reads new active alerts and preference rows. Putting thousands of notification inserts in the user-facing request is unnecessary at launch and can be moved without a schema change because the alert row is already committed. The worker's inserts are their own short transactions per recipient batch.

A followed verified guide does not get a separate feed table. The worker may also notify followers when `source_code = 'verified_guide'` and an alert was published. Followers who muted the species or disabled nearby alerts are skipped. Follower notifications still contain only the public headline.

---

## audit.audit_log

Append-only. Primary key is `bigint` because the log is local, ordered, and high volume relative to other tables.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `bigint` | no | identity | PK, `GENERATED ALWAYS AS IDENTITY` |
| `occurred_at` | `timestamptz` | no | `now()` | |
| `actor_user_id` | `uuid` | yes | | Logical id. No foreign key, so history survives user changes. |
| `actor_session_id` | `uuid` | yes | | |
| `action` | `text` | no | | Dot-separated verb, e.g. `location.read`, `report.submitted`, `role.granted`, `login.failed` |
| `entity_schema` | `text` | no | | |
| `entity_table` | `text` | no | | |
| `entity_id` | `uuid` | yes | | |
| `request_id` | `uuid` | yes | | From the HTTP middleware |
| `client_ip` | `inet` | yes | | |
| `details` | `jsonb` | no | `'{}'` | Object. Coordinate keys rejected by trigger. |

Checks: `details` is a JSON object, `char_length(action) BETWEEN 3 AND 80`, `entity_schema` and `entity_table` match `^[a-z_]{1,40}$`.

Indexes:

- btree `(occurred_at DESC)`
- btree `(entity_schema, entity_table, entity_id)`
- btree `(actor_user_id, occurred_at DESC)`
- btree `(action, occurred_at DESC)`

Grants: `INSERT` via owner functions only. `UPDATE` and `DELETE` revoked from `wsn_app_public` and `wsn_app_staff`.

---

## api views

Views are `security_invoker`. Column lists are the entire public contract.

### api.public_alerts_v

From `alerting.public_alerts` joined to `ref.species`, `ref.risk_levels`, and `ref.geographic_zones` for names.

Columns: `id`, `species_code`, `common_name`, `risk_code`, `risk_label`, `risk_rank`, `zone_name`, `headline`, `summary`, `status`, `verification_state`, `precision_meters`, `latitude`, `longitude`, `observed_at`, `starts_at`, `expires_at`, `published_at`, `confirmation_count`.

`latitude` and `longitude` are `ST_Y` / `ST_X` of `public_position`. The view has no `report_id`, no `public_position` raw dump beyond those two numbers, and no join to `sensitive` or `reporting.reports`.

`wsn_app_public` is granted `SELECT` on these columns of `alerting.public_alerts` and on the lookup name columns. It is not granted `SELECT (report_id)`.

Filter in the query, not in the view: `status = 'active' AND expires_at > now()`, so staff can still read withdrawn alerts through a different function.

### api.public_species_v

`id`, `code`, `common_name`, `scientific_name`, `species_group`, `default_risk_code`, `description` where `is_active`.

### api.public_safety_instructions_v

Instruction columns plus species common name and risk label, where `is_active`.

### api.public_emergency_contacts_v

Contact columns where `is_public AND is_active`. Excludes nothing else; unlisted contacts are simply not in the view's WHERE clause, and the public role is not granted `SELECT` on the base table.

### api.public_profiles_v

`user_id`, `username`, `display_name`, `bio`, `locality`, `account_kind`, `organization`, avatar key and content type. Excludes `phone`, email, and password hash.

### api.public_report_media_v

Media columns for rows whose report has a row in `alerting.public_alerts` and whose `visibility = 'public'`. Returns `id`, `public_alert_id` (not `report_id`), `content_type`, `width_px`, `height_px`. `storage_key` is not public; the API issues a short-lived URL server-side after checking the view. If object storage is public-read by key, keys must be unguessable. Prefer private buckets.

---

## api functions

All are `SECURITY DEFINER`, owned by `wsn_owner`, with a pinned `search_path`. Each writes one audit row unless noted.

| Function | Grant | Effect |
| --- | --- | --- |
| `api.register_user(email, username, password_hash, display_name, account_kind)` | public | Inserts user, profile, default preferences. Hash is produced in Node or in the function; plaintext password is not a column. |
| `api.authenticate(email, password)` | public | Preferred: compares the hash inside the function, inserts `auth_sessions`, returns user id, username, session id, and the refresh token once. |
| `api.revoke_session(session_id)` | public | Revokes if the actor owns the session. |
| `api.submit_report(...)` | public | Arguments: actor, idempotency key, species id or note, kind, observed_at, animal_count, activity, summary, longitude, latitude, accuracy. Sets source from roles (`verified_guide` else `community`). Rejects restricted kinds. Writes location, hits, and maybe a public alert. Returns report id, publication outcome, and public alert id when published. Does not return the raw point. |
| `api.attach_report_media(...)` | public | Reporter-owned public-candidate reports, or staff for restricted. Requires `exif_stripped`. |
| `api.confirm_report(report_id)` | public | Inserts a confirmation on a public-candidate report. |
| `api.update_own_profile(...)` | public | Profile fields including phone and avatar metadata. |
| `api.update_notification_preferences(...)` | public | Preferences and mute set. |
| `api.follow_user(followee_id)` / `api.unfollow_user` | public | |
| `api.read_report_location(report_id)` | staff | Returns longitude, latitude, accuracy. Requires `report.read_sensitive_location`. Audits `location.read`. |
| `api.list_restricted_reports(...)` | staff | Headers only, for `report.read_restricted`. Location is a separate call. |
| `api.list_report_zone_hits(report_id)` | staff | |
| `api.verify_report(...)` | staff | Requires `report.verify`. |
| `api.withdraw_alert(alert_id)` | staff | Requires `alert.withdraw`. |
| `api.publish_alert(report_id)` | staff | Requires `alert.publish_manual`. Recomputes snap. Refuses suppress and restricted. Takes no coordinate. |
| `api.grant_role` / `api.revoke_role` | staff | Requires `user.grant_role`. |
| `api.read_audit(...)` | staff | Requires `audit.read`. |

`api.submit_report` assigns `source_code` itself:

- caller has active `ranger` or `wildlife_authority` → the staff function `api.submit_staff_report` must be used instead, and it can set `ranger` or `authority` and `restricted`
- caller has active `verified_guide` and uses the public function → `verified_guide`
- otherwise → `community`

Sensor callers use `api.submit_sensor_report`, granted later to a dedicated `wsn_ingest` role, not to `wsn_app_public`. Same body as submit, `source_code` forced to `sensor`, reporter forced null. That role is not created in the first migration. The function can be added with the first sensor. The table shape does not change.

Staff report function arguments include `visibility`. The check constraint still forces snare and fence breach to `restricted`. The function refuses `visibility = 'public_candidate'` for those kinds before the insert, so the error is clear.

---

## Access summary by role

| Relation | Public role | Staff role | Owner |
| --- | --- | --- | --- |
| `sensitive.report_locations` | no privilege | no privilege | full, plus the audited function |
| `reporting.reports` restricted rows | no direct select | via list function | full |
| `alerting.public_alerts` except `report_id` | select through view | select through view and staff functions | full |
| `alerting.public_alerts.report_id` | no select | via staff functions | full |
| `identity.users.password_hash` | no select | no select | full |
| `identity.auth_sessions.token_hash` | no select | no select | full |
| `audit.audit_log` | no select, no update, no delete | select via `api.read_audit` if permission holds | insert via functions, no update from app roles |
| `ref.emergency_contacts` where `is_public` is false | no select | via staff contact function | full |

---

## Shared trigger functions

| Function | Use |
| --- | --- |
| `ref.touch_updated_at()` | BEFORE UPDATE, sets `updated_at = now()` |
| `alerting.reject_unsafe_public_alert()` | Blocks insert of an alert for a suppressed, restricted, or park-hitting report |
| `audit.reject_coordinates_in_details()` | Blocks coordinate keys in `details` |
| `reporting.reject_unstripped_or_leaked_media()` | Requires EXIF stripped and restricted media on restricted reports |

---

## Reference seed (first migration, after DDL)

Risk levels, zone types, data sources, roles, permissions, role_permissions, and a short species list. Geographic zones, safety instructions, and emergency contacts are data migrations with a named source, reviewed separately, because a wrong park boundary changes who gets alerted and what stays suppressed.
