# Wildlife Safety Network — data dictionary

This dictionary explains fields a developer can misuse. `created_at` means the row was inserted. `updated_at` means the last update, set by trigger, except where a table below says otherwise. Both are `timestamptz` in UTC.

Lookup `code` columns are stable identifiers. They are primary keys. Do not rename a code after data references it. Add a new code and deactivate the old row where `is_active` exists.

## Risk, zones, and species

### ref.risk_levels

| Field | Meaning |
| --- | --- |
| `code` | Stable risk id: `unknown`, `low`, `moderate`, `high`, `critical`. |
| `rank` | Sort and comparison key. `unknown` is 0. A preference of `moderate` does not treat an unidentified animal as severe. Notification filtering uses rank. |
| `label` | Short name shown in the client. |
| `public_summary` | Wording that may be shown to anyone. Keep operational detail, such as a den, a snare, or directions to an animal, out of this text. |
| `is_active` | Inactive levels stay on old alerts. The ingest function refuses them for new reports. |

### ref.zone_types

| Field | Meaning |
| --- | --- |
| `code` | `PROTECTED_PARK`, `BUFFER_ZONE`, or `HUMAN_CORRIDOR`. |
| `alert_policy` | `suppress` stores the report and creates no public alert. `generalize` allows one public alert at `default_precision_meters` or coarser. |
| `default_precision_meters` | Grid cell size for this class. The publication function takes the maximum across matched generalize zones, then applies a floor of 500. |
| `description` | Why this class exists, for administrators. |

### ref.species

| Field | Meaning |
| --- | --- |
| `code` | Slug used by clients and seeds, for example `african_elephant`. |
| `common_name` | Name shown on alerts and in the species picker. |
| `scientific_name` | Optional taxonomic name. |
| `species_group` | Coarse group for filters: `mammal`, `reptile`, `bird`, `other`. Not a taxonomy tree. |
| `default_risk_code` | Risk copied onto a new report. Reporters do not set this. |
| `is_active` | Hidden from the public species list when false. Historical reports still resolve the name. |
| `description` | Public species note: behavior and general safety context, not recent locations. |

### ref.data_sources

| Field | Meaning |
| --- | --- |
| `code` | `community`, `verified_guide`, `ranger`, `authority`, or `sensor`. |
| `is_automated` | True only for `sensor`. A check constraint ties the flag to that code. |
| `trust_rank` | Relative trust for display and, later, for ranking nearby alerts. It does not bypass publication rules. A ranger report inside a park is still suppressed. |
| `is_active` | Disables new ingest from that source. |

### ref.geographic_zones

| Field | Meaning |
| --- | --- |
| `name` | Human name used in alert headlines, for example "Victoria Falls town corridor". |
| `zone_type_code` | Policy class. The policy is copied onto each zone-hit row at ingest. |
| `boundary` | MultiPolygon in WGS84 geography. Includes holes when the source data has them. |
| `is_active` | Inactive boundaries are ignored by `ST_Covers` during ingest and kept for history. |
| `source_note` | Provenance: organisation, date, and file or survey name. Required so a bad polygon can be traced. |
| `description` | Optional operator note. |

### ref.safety_instructions

| Field | Meaning |
| --- | --- |
| `species_id` | Null means the instruction applies to every species. |
| `risk_code` | Null means every risk level. |
| `activity_context` | What the person is doing: `general`, `walking`, `driving`, `camping`, `river`, `night`. |
| `title` | Short heading. |
| `body` | The instruction shown to the user. |
| `sort_order` | Order inside the same specificity bucket. |
| `is_active` | The public view hides inactive rows. The row stays so later review can see retired wording. |

Specificity is a query rule: prefer a row that matches species and risk over a row that matches only the activity.

### ref.emergency_contacts

| Field | Meaning |
| --- | --- |
| `name` | Person or desk name. |
| `organization` | Agency or station. |
| `phone` | Number the caller should use. Public rows are genuinely public. |
| `email` | Optional. |
| `zone_id` | Preferred contact for this zone. Null means the whole Victoria Falls operating area. |
| `contact_kind` | `police`, `wildlife_authority`, `medical`, `ranger_station`, or `general`. |
| `priority` | Lower numbers are offered first. |
| `is_public` | False marks an operational number. Staff read it through a staff function. It is absent from `api.public_emergency_contacts_v`, and the public role has no `SELECT` on the base table. |
| `is_active` | False removes the contact from selection and keeps the row. |

## Identity and access

### identity.users

| Field | Meaning |
| --- | --- |
| `email` | Login name. Case-insensitive. |
| `username` | Public handle, lowercase, 3–30 characters: letters, digits, underscore. |
| `password_hash` | Password hashing output only. The plaintext password is never stored. Application roles are not granted `SELECT` on this column. |
| `status` | `active` can sign in and report. `pending_verification` is reserved for an email check. `suspended` is an administrative block. `deactivated` means the person closed the account. Report foreign keys keep the user id in every state. |
| `email_verified_at` | Null until the address is confirmed. |
| `last_login_at` | Last successful authentication. |

### identity.user_profiles

| Field | Meaning |
| --- | --- |
| `user_id` | Same value as `identity.users.id`. |
| `display_name` | Name shown beside a report when the reporter is identified. Public surfaces use this or `username`, and they do not use email. |
| `bio` | Optional short text, max 500 characters. |
| `locality` | A place name such as "Victoria Falls". This is not a home coordinate. The schema has no home point. |
| `account_kind` | How the person describes themselves: `resident`, `tourist`, `guide`, `wildlife_personnel`. A person who picks `wildlife_personnel` has no staff permission until `identity.user_roles` contains a live grant. |
| `organization` | Free-text affiliation, such as a guiding company. Not proof of that affiliation. |
| `phone` | Personal phone. Returned to the subject, and to staff through a management function. Omitted from `api.public_profiles_v`. |
| `avatar_storage_key` | Object-storage key of the current profile picture. |
| `avatar_content_type` | `image/jpeg` or `image/png`. |
| `avatar_byte_size` | Size in bytes, capped at 5 MB. |
| `avatar_updated_at` | When the current avatar was set. Clients can use it as a cache buster. |

Avatar key, content type, and size are written together. Profile pictures do not use `reporting.report_media`.

### identity.user_follows

| Field | Meaning |
| --- | --- |
| `follower_id` | User who wants updates. |
| `followee_id` | User being followed, typically a guide. |
| `created_at` | When the follow started. |

A user cannot follow themselves. The pair is the primary key. Unfollow deletes the row. Follows are not an authorization decision, so the table does not keep a revocation history. Role grants do.

### identity.user_roles

| Field | Meaning |
| --- | --- |
| `role_code` | `verified_guide`, `ranger`, `wildlife_authority`, or `administrator`. |
| `granted_by` | Staff user who granted it. Null only for a bootstrap administrator created by a migration. |
| `granted_at` | When the grant became effective. |
| `revoked_at` | When it stopped. Null means the grant is live. |
| `revoked_by` | Staff user who revoked it. Set together with `revoked_at`. |

The partial unique index allows a later re-grant after revocation. Authorization queries filter `revoked_at IS NULL`. `ref.roles.is_staff` tells the API whether the request must use the staff database pool.

### ref.permissions and ref.role_permissions

| Field | Meaning |
| --- | --- |
| `permissions.code` | One staff capability, such as `report.read_sensitive_location` or `alert.withdraw`. |
| `permissions.description` | What that capability allows. |
| `role_code` and `permission_code` | The capability set of a role. Functions read these rows. A second hard-coded list in Node will drift, so the function is the check that matters. |

### identity.auth_sessions

| Field | Meaning |
| --- | --- |
| `token_hash` | SHA-256 hex of the refresh token. The token is returned once at login and is not stored. |
| `expires_at` | After this time the session cannot be refreshed. |
| `revoked_at` | Logout or administrative revoke. |
| `user_agent` | Client hint for a session list. |
| `client_ip` | Address observed at login, for abuse review. |

Access JWTs are stateless and short-lived. They are not rows. Revoking a session stops refresh. An access token that was already issued remains valid until its own expiry, which should be minutes.

### identity.notification_preferences

| Field | Meaning |
| --- | --- |
| `nearby_alerts_enabled` | Master switch for alert fan-out to this user. |
| `radius_meters` | How near a public alert's generalized point must be, between 500 m and 50 km, before a notification is created. |
| `minimum_risk_code` | Alerts below this rank are not queued. Default `moderate`. |
| `in_app_enabled` | Create inbox rows. |
| `push_enabled` | Create push rows. Default false until device tokens exist as their own design. |
| `email_enabled` | Create email rows. |
| `quiet_hours_start` and `quiet_hours_end` | Civil time in Africa/Harare. Both empty means no quiet hours. The worker interprets the zone. The columns do not store a time zone. |

This design does not store a home GPS or a last-seen user location. Nearby map queries take a coordinate from the request and discard it. Background alerting, if added later, needs an explicit consented field and its own retention.

### identity.notification_species_mutes

| Field | Meaning |
| --- | --- |
| `user_id` | User who does not want notifications for a species. |
| `species_id` | Species skipped during fan-out. |

A mute does not hide the public alert from the map. It only skips notification inserts.

## Reports and evidence

### reporting.reports

| Field | Meaning |
| --- | --- |
| `reporter_user_id` | Account that submitted the report. Null only when `source_code` is `sensor`. |
| `species_id` | Catalog species, when the reporter identified it. |
| `species_note` | Free text when the species is unknown, or a short qualifier when it is known. At least one of `species_id` and `species_note` is required. |
| `report_kind` | `sighting`, `safety_incident`, `snare`, `fence_breach`, `animal_injury`, or `other`. Snare and fence breach require `visibility = 'restricted'`. |
| `source_code` | Who produced the report. The ingest function sets it from the caller's roles. The client does not choose `ranger` or `sensor` on the public endpoint. |
| `visibility` | `public_candidate` may become a public alert if zone policy allows. `restricted` never becomes one. |
| `status` | Review workflow: `submitted`, `under_review`, `verified`, `rejected`, `closed`. Independent of whether an alert was published. |
| `risk_code` | Taken from the species at insert, or changed later by `api.verify_report`. |
| `publication_outcome` | Geofence result the reporter may see: `pending`, `published`, `suppressed_protected_area`, `suppressed_restricted_kind`, `suppressed_outside_corridor`, `withdrawn`. It explains the decision and does not include a polygon id. |
| `observed_at` | When the animal or incident was seen. Public submit rejects times more than 7 days old or more than 5 minutes in the future. |
| `animal_count` | How many animals the reporter reports, from 1 to 500. |
| `activity_context` | What people were doing nearby. Same vocabulary as safety instructions. |
| `summary` | Reporter narrative, 1–2000 characters. Ingest rejects a summary that contains the latitude and longitude sent in the same request. |
| `idempotency_key` | Optional client UUID. The same user and key return the original report. |

### sensitive.report_locations

| Field | Meaning |
| --- | --- |
| `report_id` | Report this fix belongs to. Primary key: one exact point per report. |
| `position` | Exact WGS84 point from the device or sensor. |
| `accuracy_meters` | Horizontal accuracy reported by the device, when the client sent it. A 5 m device accuracy does not change the public cell size. |
| `recorded_at` | When the database stored the point. Distinct from `reports.observed_at`. |

The public role and the staff role have no privilege on this table. Staff receive the point from `api.read_report_location`, which inserts an audit row with action `location.read`. Retention deletes the row through an owner function and audits `location.expired`.

### reporting.report_zone_hits

| Field | Meaning |
| --- | --- |
| `report_id` | Report that was tested against the zones. |
| `zone_id` | Zone whose boundary covered the exact point. |
| `zone_type_code` | Zone type copied at match time. |
| `alert_policy` | `suppress` or `generalize`, copied at match time. Later edits to zone types do not republish historical park detections. |

Overlapping zones produce one row per zone. Any copied `suppress` policy blocks the public alert.

### reporting.report_media

| Field | Meaning |
| --- | --- |
| `storage_key` | Key in the object store. Not a long-lived public URL. |
| `content_type` | `image/jpeg`, `image/png`, or `image/webp` after processing. |
| `byte_size` | Size of the stored object, max 15 MB. |
| `width_px` and `height_px` | Pixel size after processing, when known. |
| `sha256` | Hash of the stored bytes. |
| `visibility` | `public` may be shown with a public alert. `restricted` is required when the parent report is restricted. |
| `exif_stripped` | Must be true. The application removes GPS EXIF before upload. The check constraint refuses a row that does not attest that. The database never sees the object bytes, so tests must prove stripping with a fixture image. |

### reporting.confirmations

| Field | Meaning |
| --- | --- |
| `report_id` | Report a second person is confirming. |
| `user_id` | That person. The reporter cannot confirm their own report. |
| `created_at` | When they confirmed. |

One row per user per report. Confirmations do not set `verification_state`. The public alert view exposes the count of these rows as `confirmation_count`.

### reporting.verifications

| Field | Meaning |
| --- | --- |
| `verifier_user_id` | Staff user holding `report.verify`. |
| `outcome` | `confirmed`, `disputed`, `rejected`, or `needs_more_evidence`. |
| `notes` | Operational note for staff. It can mention follow-up and must not be copied into the public summary. |
| `created_at` | When this review was recorded. The latest row is the current official outcome. Older rows remain. |

`confirmed` sets the report to `verified` and the alert's `verification_state` to `verified`. `rejected` sets the report to `rejected` and withdraws a public alert. `disputed` and `needs_more_evidence` leave the report `under_review`. `disputed` also marks the alert disputed.

## Alerts and notifications

### alerting.public_alerts

| Field | Meaning |
| --- | --- |
| `report_id` | Internal link to the originating report. Unique. The public role is not granted this column, and `api.public_alerts_v` does not select it. |
| `species_id` | Species on the alert. Null when the report had only a species note. |
| `risk_code` | Risk shown to the public. Verification may update it in the same transaction as the review. |
| `zone_id` | Corridor or buffer named in the headline. |
| `public_position` | Center of the snapped grid cell. |
| `precision_meters` | Cell size in meters, from 500 to 20000. This is the uncertainty the client should draw. |
| `headline` | Sentence generated in the database. The client does not supply it. |
| `summary` | Reporter narrative after the raw coordinate pair has been rejected. |
| `status` | `active` on the map, `resolved` when the situation ended, `expired` when the window passed, `withdrawn` when staff pulled it. |
| `verification_state` | `unverified` at publication, then `verified` or `disputed`. |
| `observed_at` | Copy of the report time, so public reads do not join `reporting.reports`. |
| `starts_at` | When the alert may be shown. Normally the publication time. |
| `expires_at` | When it leaves the active map. Default is 12 hours after `observed_at`. |
| `published_at` | When the public row was created. Keyset pages use `(published_at, id)`. |

### alerting.notifications

| Field | Meaning |
| --- | --- |
| `recipient_user_id` | Account that should receive the message. |
| `public_alert_id` | Alert the message describes. |
| `channel` | `in_app`, `push`, or `email`. |
| `title` and `body` | Text built from the public headline and zone name. A notification is not more precise than the alert. |
| `status` | `pending` until the worker runs, then `sent` or `failed`. `read` is the in-app inbox state. |
| `sent_at` | When the provider accepted it. |
| `read_at` | When the user opened an in-app notification. Only in-app rows use this. |
| `provider_message_id` | Id from the push or email provider. |

## Audit

### audit.audit_log

| Field | Meaning |
| --- | --- |
| `id` | Monotonic `bigint` identity. |
| `occurred_at` | When the action was recorded. |
| `actor_user_id` | User the API declared for the transaction. No foreign key, so the log survives account changes. Null for a retention job; those actions start with `system.`. |
| `actor_session_id` | Refresh session when the request had one. |
| `action` | `noun.verb`, including `report.submitted`, `alert.published`, `alert.withdrawn`, `location.read`, `location.expired`, `role.granted`, `role.revoked`, `login.succeeded`, `login.failed`. |
| `entity_schema` and `entity_table` | Relation the action concerns. |
| `entity_id` | That row's uuid, when the subject has a uuid. |
| `request_id` | Correlation id from the HTTP request. |
| `client_ip` | Caller address. |
| `details` | JSON object for context that is not its own column, such as old and new `risk_code`. A trigger rejects the keys `latitude`, `longitude`, `position`, `coordinates`, and `raw_location`. |

Application roles do not update or delete audit rows. A correction is a new row.

## Fields that are intentionally absent

| Absent field | Reason |
| --- | --- |
| Exact latitude and longitude on `reporting.reports` or `alerting.public_alerts` | The exact point is `sensitive.report_locations.position`. The public point is `public_position`. |
| Home or last-seen coordinates on the user | Map queries take a request coordinate and do not store it. |
| Client-supplied risk on public submit | Risk comes from the species, then from staff verification. |
| Client-supplied public coordinate | Only the snap function writes `public_position`. |
| Stored EXIF document | Photographs are accepted after GPS metadata is removed. |
| Sensor device registry | Wait until a real integration exists. `data_sources.code = 'sensor'` is the hook. |
