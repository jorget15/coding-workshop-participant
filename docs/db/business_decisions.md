# ACME Team Management — Business Decisions & Schema Rationale

This document records the key business decisions, trade-offs, and design rationale behind the `acme_team_mgmt` database schema. It is intended as a living reference for developers, product owners, and future maintainers.

---

## 1. No Separate Organizations Collection

**Decision:** Teams track their reporting line via `reportingHistory[].orgLeaderId`, which directly references an individual rather than routing through an organizational entity.

**Why:**
- An intermediary organizations entity would add a layer of indirection with no clear value for the MVP. Every query about "who does this team report to?" would require a join through that entity to reach the actual person.
- Senior leaders (CTO, COO, Division Heads) already exist in the `individuals` collection. Referencing them directly from the team's `reportingHistory` is simpler and more flexible.
- If the business later needs formal organizational units (e.g., budgets tied to a division, org-level metadata), a collection can be introduced without breaking the team schema — the `orgLeaderId` field on `reportingHistory` would simply gain an additional lookup path.

**Trade-off:** There is no place to attach metadata (description, budget codes) to an organizational division at the database level. For the MVP this is acceptable — the focus is on team composition and performance, not org-chart management.

---

## 2. Soft Deletion Policy (Rule R5)

**Decision:** Records are never physically deleted from the database. To "delete" a record, the application sets `isDeleted: true` and `deletedAt` to the current ISO date string. All standard queries must include `{ isDeleted: false }`.

**Why:**
- **Referential integrity.** Achievements reference teams, teams reference individuals, and team history references all of the above. Hard-deleting a record would orphan downstream references and break historical reports.
- **Audit trail.** The business needs to answer questions like "who was on this team last quarter?" and "what achievements did we log before the reorg?" Soft deletion preserves this data.
- **Recoverability.** Accidental deletions can be reversed by flipping `isDeleted` back to `false`.

**Application responsibility:** Every query that surfaces data to users must filter on `{ isDeleted: false }` unless the user is explicitly viewing an audit or history screen. This is a critical contract between the database and the application layer.

**Exception:** The `teamHistory` collection has no `isDeleted` field at all. It is an append-only audit log and records are never deleted or modified (see Rule R6).

---

## 3. Team Size Cap — Max 5 Members Excluding the Leader (Rule R1)

**Decision:** Each team may have at most 5 active members with the role `"Member"`. The Team Leader does not count toward this cap. The Delegate role (if present) also does not count.

**Why:**
- This cap reflects ACME's operating philosophy that small, focused teams are more effective. Five members plus a dedicated leader keeps teams lean enough for close collaboration while large enough to handle meaningful workstreams.
- The cap applies only to **active** members (those with `endDate: null`). Historical/closed entries (where a member departed and `endDate` is set) remain in the array for audit purposes and do not count.

**Schema enforcement:** The schema does **not** use `maxItems` on the members array. A hard `maxItems` ceiling would count both active and closed entries — after even one person left a team (creating a closed entry that stays in the array for audit purposes), the cap would block adding a replacement. The 5-member limit is enforced purely at the application layer by counting entries where `memberRole === "Member" && endDate === null`.

---

## 4. Single Active Team Leader (Rule R2)

**Decision:** Exactly one member entry with `memberRole: "Team Leader"` and `endDate: null` may exist per team at any point in time.

**Why:**
- Clear accountability. Every team has one person who owns the team's direction, membership decisions, and achievement logging.
- MongoDB's `$jsonSchema` can constrain the `memberRole` enum values but cannot enforce uniqueness of a specific value within an embedded array. This rule is enforced at the application layer.

**Leadership transitions:** When a leader changes, the application must set `endDate` on the outgoing leader's entry, push a new entry for the incoming leader, and write a `leader_changed` event to `teamHistory`.

---

## 5. Multi-Team Membership (Rule R3)

**Decision:** An individual with the role `"Member"` or `"Delegate"` can be an active member of multiple teams simultaneously. There is no uniqueness constraint on `personId` across team documents for these roles. **This does not apply to Team Leaders** — see Decision #15 for the leader exclusivity rule.

**Why:**
- ACME operates in a matrix-style environment where specialists (e.g., data analysts, compliance experts) contribute to multiple teams. Blocking this would force the business to create duplicate individual records or artificial team structures.
- The seed data exercises this explicitly — for example, person_202 (Elena Russo) is active in both "Data Platform" and "Core Infrastructure."

**Reporting implication:** When computing non-direct ratios or headcount reports, the application must decide whether to count a multi-team individual once (global headcount) or per-team (team-level composition). Both are valid views and should be supported.

---

## 6. Controlled Location References (Rule R4)

**Decision:** Locations are stored in a dedicated `locations` collection with a controlled set of `_id` slugs (e.g., `loc_miami`, `loc_london`). Teams and individuals reference these by `_id`. Free-text city or country names are never used as location identifiers.

**Why:**
- Free-text locations lead to inconsistent data ("New York" vs "NYC" vs "New York City") that breaks grouping, filtering, and region-based dashboards.
- The four-region enum (`NAM`, `LATAM`, `EU`, `APAC`) maps to ACME's global operating structure and enables region-level aggregation.
- Adding a new office requires inserting a new `locations` document — a deliberate, auditable action rather than an accidental typo creating a phantom location.

---

## 7. Staff Type Snapshot (Rule R7)

**Decision:** When a person joins a team, their current `staffType` (`"direct"` or `"non-direct"`) is copied into the team member entry as `staffTypeSnapshot`. This snapshot is **never updated** after insert, even if the individual's classification changes.

**Why:**
- Historical accuracy. The business needs to answer questions like "what was the non-direct ratio of this team in Q3 2025?" If snapshots were synced with the individual's current `staffType`, reclassifying a contractor to full-time would retroactively alter all historical reports.
- The individual's `staffType` field remains the source of truth for the person's **current** classification. The snapshot captures what it was at the time they joined the team.

**Trade-off:** If a person's classification changes, the team member entry will show the old value. This is intentional and by design. The application can always look up the individual's current `staffType` when a real-time view is needed.

---

## 8. Reporting Line History (Rule R8)

**Decision:** Each team has a `reportingHistory` array that tracks which senior leader the team reports to over time. This is an append-only structure — on a reorg, the current entry is closed (by setting `endDate`) and a new entry is pushed.

**Why:**
- Organizational restructures are a fact of life. The business needs to know not just who a team reports to **now**, but who they reported to **previously** and when the change occurred.
- The append-only pattern avoids destructive updates and pairs naturally with the `teamHistory` audit log (Rule R6).

**Design choice — no separate organizations collection:** The `orgLeaderId` field references an `individuals._id` directly. See Decision #1 above for the rationale.

---

## 9. Delegate Role (Rule R9)

**Decision:** The `memberRole` enum includes `"Delegate"` in addition to `"Team Leader"` and `"Member"`. A Delegate does not count toward the 5-member cap and there can be at most 1 active Delegate per team.

**Why:**
- When a Team Leader is on extended leave (parental leave, medical, sabbatical), the business needs a way to designate temporary coverage without formally transferring leadership.
- A Delegate can perform day-to-day team management actions (logging achievements, approving membership changes) while the official Team Leader retains their position.
- This avoids the churn of leader_changed → leader_changed_back events in the audit trail for temporary absences.

**Application responsibility:** The application must enforce that at most 1 active Delegate exists per team at any time.

---

## 10. Embedded Members vs. Referenced Members

**Decision:** Team members are embedded directly in the team document's `members` array rather than stored in a separate `teamMembers` collection with references.

**Why:**
- Team membership is always read alongside the team itself. There is no UI view that shows a team without its members. Embedding avoids a `$lookup` (join) on every team page load.
- The team document size stays manageable because teams are capped at 5 active members plus a leader, and even with historical entries, a team with moderate turnover would have perhaps 10-15 entries over several years.

**Trade-off:** Updates to an individual's personal attributes (name, email, location) do not propagate to existing team member entries. The team stores `personId` and `staffTypeSnapshot` — for current name/email/location, the application must look up the individual. This is intentional (see Rule R7 for `staffTypeSnapshot`).

---

## 11. Team History as Immutable Audit Log (Rule R6)

**Decision:** The `teamHistory` collection is append-only. Records are never modified or soft-deleted. Unlike all other collections, `teamHistory` has no `isDeleted` field.

**Why:**
- This collection serves as the audit trail for all structural team changes. If audit records could be deleted or modified, the trail would be untrustworthy.
- The application must write a `teamHistory` record for every team creation, update, deletion, membership change, leadership change, and reporting line change.

**Schema note:** The `previousState` and `newState` fields are free-form objects (`bsonType: ["object", "null"]`). Their internal structure varies by `eventType` — for example, a `member_added` event stores the new member entry in `newState`, while a `reporting_changed` event stores the old and new reporting line entries.

---

## 12. RBAC Roles (Application-Level)

**Decision:** The `individuals.roles` array supports four application-level roles: `system_admin`, `team_lead`, `editor`, `viewer`. A person can hold multiple roles.

**Why:**
- These roles map to UI-level permissions, not organizational hierarchy. A system admin can manage all data; a team lead can manage their own team; an editor can contribute to teams they belong to; a viewer has read-only access.
- Senior leaders (person_001 through person_004) are given `system_admin` + `viewer` roles because they need full visibility across all teams but primarily operate in a read capacity.

---

## 13. Achievement Month as YYYY-MM Pattern

**Decision:** The `achievementMonth` field is constrained by a regex pattern (`^\d{4}-\d{2}$`) to enforce the `YYYY-MM` format.

**Why:**
- Achievements are grouped and displayed by calendar month. If this field allowed free-text dates, inconsistencies like "March 2026" vs "2026-03" vs "03/2026" would break monthly grouping queries.
- The month reflects **when the work occurred**, not when the record was created. The `createdAt` field handles the latter.

---

## 15. Team Leader Exclusivity (Rule R10)

**Decision:** A Team Leader may not simultaneously hold the `"Team Leader"` role (with `endDate: null`) on more than one team, and may not appear as an active `"Member"` or `"Delegate"` on any other team while they are an active leader.

**Why:**
- Leadership requires full accountability for one team. Splitting leadership across two teams, or having a leader also counted as a member elsewhere, creates ambiguity about where their primary obligation lies.
- This keeps headcount reporting clean — a leader is associated with exactly one team at any point in time, removing the edge cases that multi-team leadership would introduce in dashboards and ratio calculations.
- The simplicity constraint is intentional for the MVP. If a restructure requires a person to temporarily cover two teams, the Delegate role (Rule R9) exists for that purpose.

**Application responsibility:** Before inserting or updating a member entry that would set `memberRole: "Team Leader"` with `endDate: null`, the application must verify that the same `personId` has no other active `"Team Leader"` entry across all teams, and no active `"Member"` or `"Delegate"` entry on any other team. This is enforced at the application layer.

---

## 14. Non-Direct Ratio Threshold

**Decision:** The business considers a non-direct-to-employee ratio above 20% (among active members, excluding the leader) to be a flag worth surfacing in reports.

**Why:**
- A high proportion of non-direct staff (contractors, consultants) on a team may indicate vendor dependency, knowledge retention risk, or budget structure issues that management wants to monitor.
- The 20% threshold is a soft guideline, not a hard enforcement. The smoke tests in the setup script flag teams above this threshold, but the schema does not prevent it.

**Calculation:** Non-direct ratio = (count of active members with `staffTypeSnapshot: "non-direct"`) / (total count of active members with `memberRole: "Member"`). The Team Leader is excluded from this calculation.

---

## Summary of Schema vs. Application Enforcement

| Rule | What | Enforced By |
|------|------|-------------|
| R1 | Max 5 active members per team | Application layer |
| R2 | Exactly 1 active Team Leader per team | Application layer |
| R3 | Multi-team membership allowed | Schema (no constraint) |
| R4 | Locations referenced by `_id` only | Schema (`required` + no free-text) |
| R5 | Soft deletion — never hard-delete | Application layer (query filter) |
| R6 | Team history is append-only | Application layer (no update/delete) |
| R7 | Staff type snapshot never updated | Application layer (no sync) |
| R8 | Reporting history is append-only | Application layer (no overwrite) |
| R9 | Max 1 active Delegate per team | Application layer |
| R10 | Team Leader cannot lead or be a member of any other team | Application layer |
| — | Email uniqueness | Schema (unique index) |
| — | Region enum (NAM/LATAM/EU/APAC) | Schema (enum constraint) |
| — | Achievement month format (YYYY-MM) | Schema (regex pattern) |
| — | Member role enum | Schema (enum constraint) |
| — | Staff type enum | Schema (enum constraint) |

---

## Reporting Requirements

The following questions must be answerable from the data and surfaced in the application's reporting views.

| # | Question | Key fields |
|---|----------|------------|
| Q1 | Who are the members of each team? | `teams.members` (active entries where `endDate === null`) cross-referenced with `individuals` for name/location |
| Q2 | Where are the teams located? | `teams.primaryLocation` → `locations._id` / `locations.locationName` |
| Q3 | What are the key achievements of each team on a monthly basis? | `achievements.teamId`, `achievements.achievementMonth` (YYYY-MM) |
| Q4 | How many teams have a Team Leader not co-located with their team members? | Compare Team Leader's `individuals.primaryLocation` against each active member's `individuals.primaryLocation`; count teams where at least one member differs |
| Q5 | How many teams have a Team Leader who is non-direct staff? | Look up the active Team Leader's `individuals.staffType`; count teams where `staffType === "non-direct"` |
| Q6 | How many teams have a non-direct staff to employee ratio above 20%? | Among active `"Member"` entries, count `staffTypeSnapshot === "non-direct"` / total; flag teams above 20% (see Decision #14) |
| Q7 | How many teams are reporting to an organisation leader? | Count teams with at least one active entry in `reportingHistory` (i.e., `reportingHistory` array is non-empty and the latest entry has `endDate === null`) |