# ACME Team Management — Field Reference

> **Source of truth** for every field name across the database, backend, and frontend.
> When adding a new field or renaming an existing one, update **this file first**, then propagate to all three layers.

---

## Naming Convention

| Layer | Convention | Example |
|---|---|---|
| **MongoDB** (stored in DB) | camelCase | `personName`, `teamHomeLocation`, `achievementTitle` |
| **Backend Pydantic models** (API input) | snake_case | `person_name`, `team_home_location`, `achievement_title` |
| **Frontend TypeScript types** (API response) | camelCase (matches DB) | `personName`, `teamHomeLocation`, `achievementTitle` |
| **Frontend thunks** (API request body) | snake_case (matches Pydantic) | `person_name`, `location_id`, `achievement_title` |

---

## Enums

| Name | Values | Used in |
|---|---|---|
| **Region** | `NAM`, `LATAM`, `EMEA`, `APAC` | `locations.region`, `individuals.homeLocation.region` |
| **StaffType** | `direct`, `non-direct` | `individuals.staffType`, `teams.members[].staffTypeSnapshot` |
| **MemberRole** | `Team Leader`, `Member`, `Delegate` | `teams.members[].memberRole` |
| **App Role** | `system_admin`, `team_lead`, `viewer` | `individuals.roles[]` (only `system_admin` stored; `team_lead`/`viewer` derived at login from team membership) |
| **TeamHistory eventType** | `team_created`, `team_updated`, `team_deleted`, `member_added`, `member_removed`, `member_role_changed`, `leader_changed`, `reporting_changed` | `teamHistory.eventType` |
| **Individual changeHistory eventType** | `PROFILE_CREATED`, `JOINED_TEAM`, `LEFT_TEAM`, `DEACTIVATED` | `individuals.changeHistory[].eventType` |

---

## Collections

### 1. `locations`

| MongoDB field | Type | Required | Description | Backend Pydantic | Frontend TS |
|---|---|---|---|---|---|
| `_id` | `string` | ✅ | Slug, e.g. `loc_nyc_hq` | — (path param) | `Location._id` |
| `name` | `string` | ✅ | Display name, e.g. "ACME Global HQ" | `name` | `Location.name` |
| `city` | `string` | ✅ | City name | `city` | `Location.city` |
| `country` | `string` | ✅ | Country name | `country` | `Location.country` |
| `region` | `string` | ✅ | `NAM` / `LATAM` / `EMEA` / `APAC` | `region` | `Location.region` |
| `timezone` | `string` | ✅ | IANA timezone, e.g. `America/New_York` | `timezone` | `Location.timezone` |

**Pydantic models:** `LocationCreate`, `LocationUpdate`

---

### 2. `individuals`

| MongoDB field | Type | Required | Description | Backend Pydantic | Frontend TS |
|---|---|---|---|---|---|
| `_id` | `string` | ✅ | e.g. `ind_001` | — (path param) | `Individual._id` |
| `personName` | `string` | ✅ | Full display name | `person_name` | `Individual.personName` |
| `email` | `string` | ✅ | Unique email address | `email` | `Individual.email` |
| `homeLocation` | `object` | ✅ | Where they live (freeform) | `home_location: HomeLocation` | `Individual.homeLocation` |
| `homeLocation.city` | `string` | ✅ | City | `home_location.city` | `HomeLocation.city` |
| `homeLocation.country` | `string` | ✅ | Country | `home_location.country` | `HomeLocation.country` |
| `homeLocation.region` | `string` | ✅ | `NAM`/`LATAM`/`EMEA`/`APAC` | `home_location.region` | `HomeLocation.region` |
| `assignedOffice` | `string` | ❌ | Ref to `locations._id` (optional) | `assigned_office` | `Individual.assignedOffice` |
| `staffType` | `string` | ✅ | `direct` or `non-direct` | `staff_type` | `Individual.staffType` |
| `jobTitle` | `string` | ❌ | Free-text job title | `job_title` | `Individual.jobTitle` |
| `profilePicture` | `string` | ❌ | S3 key or URL for avatar | `profile_picture` | `Individual.profilePicture` |
| `roles` | `string[]` | ✅ | Only `["system_admin"]` or `[]` | `roles` | `Individual.roles` |
| `auth` | `object` | ❌ | Authentication block | — | — (never sent to frontend) |
| `auth.hashedPassword` | `string` | ❌ | PBKDF2-SHA256 hash | — | — |
| `auth.lastLogin` | `string` | ❌ | ISO 8601 timestamp | — | — |
| `changeHistory` | `object[]` | ❌ | Append-only audit trail | — (read via GET endpoint) | `Individual.changeHistory` |
| `changeHistory[].eventType` | `string` | ✅ | `PROFILE_CREATED` / `JOINED_TEAM` / `LEFT_TEAM` / `DEACTIVATED` | — | `ChangeEntry.eventType` |
| `changeHistory[].description` | `string` | ✅ | Human-readable summary | — | `ChangeEntry.description` |
| `changeHistory[].occurredAt` | `string` | ✅ | ISO 8601 timestamp | — | `ChangeEntry.occurredAt` |
| `changeHistory[].metadata` | `object` | ❌ | Context (e.g. `{ teamId, teamName }`) | — | `ChangeEntry.metadata` |
| `isDeleted` | `bool` | ✅ | Soft delete flag (R5) | — | `Individual.isDeleted` |
| `deletedAt` | `string\|null` | ❌ | ISO timestamp when deleted | — | — |
| `createdAt` | `string` | ✅ | ISO timestamp | — | `Individual.createdAt` |
| `updatedAt` | `string` | ✅ | ISO timestamp | — | `Individual.updatedAt` |

**Pydantic models:** `IndividualCreate`, `IndividualUpdate`, `HomeLocation`

---

### 3. `teams`

| MongoDB field | Type | Required | Description | Backend Pydantic | Frontend TS |
|---|---|---|---|---|---|
| `_id` | `string` | ✅ | e.g. `team_001` | — (path param) | `Team._id` |
| `teamName` | `string` | ✅ | Display name | `team_name` | `Team.teamName` |
| `description` | `string` | ❌ | Team description | `description` | `Team.description` |
| `teamHomeLocation` | `string` | ✅ | Ref to `locations._id` | `location_id` | `Team.teamHomeLocation` |
| `members` | `object[]` | ✅ | Embedded member roster | — (managed via add/remove endpoints) | `Team.members` |
| `members[].personId` | `string` | ✅ | Ref to `individuals._id` | `person_id` | `TeamMember.personId` |
| `members[].personName` | `string` | — | Denormalized display name | — | `TeamMember.personName` |
| `members[].memberRole` | `string` | ✅ | `Team Leader` / `Member` / `Delegate` | `member_role` | `TeamMember.memberRole` |
| `members[].staffTypeSnapshot` | `string` | ✅ | Frozen at join time (R7) | — | `TeamMember.staffTypeSnapshot` |
| `members[].startDate` | `string` | ✅ | `YYYY-MM-DD` | — | `TeamMember.startDate` |
| `members[].endDate` | `string\|null` | ✅ | `null` = active, `YYYY-MM-DD` = departed | — | `TeamMember.endDate` |
| `reportingHistory` | `object[]` | ✅ | Append-only (R8) | — | `Team.reportingHistory` |
| `reportingHistory[].orgLeaderId` | `string` | ✅ | Ref to `individuals._id` | — | — |
| `reportingHistory[].orgLeaderName` | `string` | ❌ | Denormalized display name | — | — |
| `reportingHistory[].startDate` | `string` | ✅ | `YYYY-MM-DD` | — | — |
| `reportingHistory[].endDate` | `string\|null` | ✅ | `null` = current | — | — |
| `isDeleted` | `bool` | ✅ | Soft delete flag (R5) | — | `Team.isDeleted` |
| `deletedAt` | `string\|null` | ❌ | ISO timestamp when closed | — | — |
| `createdAt` | `string` | ✅ | ISO timestamp | — | `Team.createdAt` |
| `updatedAt` | `string` | ✅ | ISO timestamp | — | `Team.updatedAt` |

**Pydantic models:** `TeamCreate`, `TeamUpdate`, `MemberEntry`

**⚠️ Note:** `TeamCreate.location_id` maps to `teamHomeLocation` in MongoDB (not `primaryLocation`).

---

### 4. `achievements`

| MongoDB field | Type | Required | Description | Backend Pydantic | Frontend TS |
|---|---|---|---|---|---|
| `_id` | `string` | ✅ | e.g. `ach_001` | — (path param) | `Achievement._id` |
| `teamId` | `string` | ✅ | Ref to `teams._id` | `team_id` | `Achievement.teamId` |
| `achievementTitle` | `string` | ✅ | Title | `achievement_title` | `Achievement.achievementTitle` |
| `achievementDescription` | `string` | ❌ | Description | `achievement_description` | `Achievement.achievementDescription` |
| `achievementMonth` | `string` | ✅ | `YYYY-MM` format | `achievement_month` | `Achievement.achievementMonth` |
| `impactMetric` | `string` | ❌ | Quantifiable result | — | `Achievement.impactMetric` |
| `tags` | `string[]` | ❌ | Free-form tags | — | `Achievement.tags` |
| `contributors` | `string[]` | ❌ | Refs to `individuals._id` | `contributors` | `Achievement.contributors` |
| `proofLink` | `string` | ❌ | URL to Jira/Confluence/PR | — | `Achievement.proofLink` |
| `createdBy` | `string` | ✅ | Ref to `individuals._id` | — (from JWT) | `Achievement.createdBy` |
| `isDeleted` | `bool` | ✅ | Soft delete flag (R5) | — | `Achievement.isDeleted` |
| `deletedAt` | `string\|null` | ❌ | ISO timestamp when deleted | — | — |
| `createdAt` | `string` | ✅ | ISO timestamp | — | `Achievement.createdAt` |

**Pydantic models:** `AchievementCreate`, `AchievementUpdate`

---

### 5. `teamHistory`

| MongoDB field | Type | Required | Description | Backend Pydantic | Frontend TS |
|---|---|---|---|---|---|
| `_id` | `string` | ✅ | Auto-generated UUID | — | `TeamHistoryEntry._id` |
| `teamId` | `string` | ✅ | Ref to `teams._id` | — | `TeamHistoryEntry.teamId` |
| `eventType` | `string` | ✅ | See enum above | — | `TeamHistoryEntry.eventType` |
| `changedBy` | `string` | ✅ | Ref to `individuals._id` | — | `TeamHistoryEntry.changedBy` |
| `changedAt` | `string` | ✅ | `YYYY-MM-DD` | — | `TeamHistoryEntry.changedAt` |
| `description` | `string` | ✅ | Human-readable summary | — | `TeamHistoryEntry.description` |
| `previousState` | `object\|null` | ❌ | Before snapshot | — | `TeamHistoryEntry.previousState` |
| `newState` | `object\|null` | ❌ | After snapshot | — | `TeamHistoryEntry.newState` |

**No Pydantic models** — this collection is append-only, written by `make_history_entry()` in `shared/__init__.py`.

---

## API → DB Field Mapping (snake_case → camelCase)

These are the non-obvious translations where the API field name differs from the MongoDB field name:

| API input (snake_case) | MongoDB stored (camelCase) | Collection |
|---|---|---|
| `person_name` | `personName` | individuals |
| `staff_type` | `staffType` | individuals |
| `home_location` | `homeLocation` | individuals |
| `assigned_office` | `assignedOffice` | individuals |
| `job_title` | `jobTitle` | individuals |
| `profile_picture` | `profilePicture` | individuals |
| `team_name` | `teamName` | teams |
| `location_id` | `teamHomeLocation` | teams |
| `person_id` | `personId` | teams.members[] |
| `member_role` | `memberRole` | teams.members[] |
| `achievement_title` | `achievementTitle` | achievements |
| `achievement_description` | `achievementDescription` | achievements |
| `achievement_month` | `achievementMonth` | achievements |
| `team_id` | `teamId` | achievements |

---

## Business Rules Quick Reference

| Rule | Summary | Enforced in |
|---|---|---|
| **R1** | Max 5 active Members per team (Leader + Delegate excluded from count) | `teams/function.py` |
| **R2** | Exactly 1 active Team Leader per team | `teams/function.py` |
| **R3** | An individual can be on multiple teams simultaneously | No constraint needed |
| **R4** | Teams must reference a `locations._id` via `teamHomeLocation`; individuals have freeform `homeLocation` | Schema validator + app |
| **R5** | Soft deletion only (`isDeleted: true`, never hard-delete) | All routes |
| **R6** | `teamHistory` is append-only, never modified | `shared/__init__.py` |
| **R7** | `staffTypeSnapshot` frozen at join time, never updated | `teams/function.py` |
| **R8** | `reportingHistory` is append-only (close current, push new on reorg) | `teams/function.py` |
| **R9** | Max 1 active Delegate per team | `teams/function.py` |
| **R10** | A Team Leader can also be Member/Delegate on another team, but cannot lead two teams | `teams/function.py`, `auth/function.py` |
| **R11** | Co-location = compare `homeLocation.region` against team office region | `useMetrics.ts` |
