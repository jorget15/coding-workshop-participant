// =============================================================
// ACME Inc. — Team Management DB Setup (v3)
// Run with: mongosh "mongodb://localhost:27017" --file acme_setup.js
//
// PURPOSE:
//   Initializes the "acme_team_mgmt" database with validated
//   collections, indexes, and representative seed data.
//   This is a destructive script — it drops all collections
//   before recreating them.
//
// BUSINESS RULES ENFORCED IN THIS FILE:
//
//   [R1] Team Size Cap
//        Max 5 active members per team. The Team Leader is excluded
//        from this count. "Active" means endDate is null.
//        This cap is enforced at the APPLICATION layer by counting
//        active members with memberRole === "Member" before inserts.
//        The schema does NOT cap the members array length because
//        historical/closed entries (endDate !== null) are preserved
//        in place for audit purposes, which would cause a hard
//        maxItems cap to block future additions after turnover.
//
//   [R2] Single Active Leader
//        Exactly 1 member entry with memberRole === "Team Leader"
//        and endDate === null may exist per team at any point in time.
//        Schema constrains the enum but cannot enforce uniqueness of
//        a role value within an array — this is enforced at the
//        APPLICATION layer when adding or changing members.
//
//   [R3] Multi-Team Membership
//        An individual can be an active member of multiple teams
//        simultaneously. There is no uniqueness constraint on
//        personId across team documents. This supports matrix-style
//        collaboration (e.g., a data analyst contributing to both
//        Business Intelligence and Credit Card Analytics).
//
//   [R4] Controlled Location References
//        Locations are grouped into four global regions:
//        NAM, LATAM, EMEA, APAC. Free-text city/country names
//        are NOT allowed as location references in teams or
//        individuals. Always reference a locations._id value.
//
//   [R5] Soft Deletion Policy
//        Records are NEVER physically deleted from the database.
//        To "delete" a record, set isDeleted: true and deletedAt
//        to the current ISO date string. All application queries
//        must include the filter { isDeleted: false } unless
//        building an explicit audit or history view.
//        This preserves referential integrity and supports
//        historical reporting without data loss.
//
//   [R6] Team History / Audit Trail
//        Every structural change to a team (membership, leadership,
//        reporting line) must produce a teamHistory record at the
//        application layer. The teamHistory collection is
//        append-only — records are never soft-deleted or modified.
//        This is the immutable audit trail.
//
//   [R7] Staff Type Snapshot
//        When a person joins a team, their current staffType
//        ("direct" or "non-direct") is copied into the member
//        entry as staffTypeSnapshot. This snapshot is intentionally
//        never updated after insert, even if the person's
//        classification changes later. This ensures historical
//        ratio reports remain accurate and reclassification does
//        not retroactively alter past team composition data.
//
//   [R8] Reporting Line History
//        Each team tracks who it reports to via the reportingHistory
//        array. This is an append-only dated list. On a reorg,
//        set endDate on the current entry and push a new entry
//        with endDate: null. The orgLeaderId references an
//        individual (not a separate organizations collection)
//        to keep the model simple. Never overwrite existing entries.
//
//   [R9] Delegate Role
//        The "Delegate" member role is available for temporary
//        coverage scenarios — e.g., when a Team Leader is on
//        extended leave, a Delegate can be appointed to act
//        on their behalf without transferring leadership.
//        A Delegate does NOT count toward the 5-member cap [R1].
//        There can be at most 1 active Delegate at a time
//        (enforced at the application layer).
// =============================================================

const DB_NAME = "acme_team_mgmt";
const acme = db.getSiblingDB(DB_NAME);

print("\n========================================");
print(" ACME Team Management — DB Setup v3");
print("========================================\n");

// =============================================================
// CLEAN SLATE — drop all collections before recreating.
// In production, migrations would be used instead of drops.
// =============================================================
[
  "locations", "individuals",
  "teams", "achievements", "teamHistory"
].forEach(name => {
  acme[name].drop();
  print("Dropped (if existed): " + name);
});

// =============================================================
// 1. LOCATIONS
//
// The canonical list of office locations. Every team and individual
// must reference one of these by _id rather than using free text.
// This ensures consistent grouping, filtering, and region-based
// reporting across the application.
//
// Regions: NAM | LATAM | EMEA | APAC
// These four regions map to ACME's global operating structure.
// =============================================================
print("\n--- Creating: locations ---");

acme.createCollection("locations", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "name", "city", "country", "region", "timezone"],
      additionalProperties: false,
      properties: {
        // Human-readable slug used as the primary key.
        // Convention: loc_<city_lowercase>, e.g. "loc_miami_latam".
        _id:      { bsonType: "string", description: "e.g. loc_miami_latam — used as FK in teams and individuals" },

        // Display name shown in the UI, e.g. "Miami HQ".
        name:     { bsonType: "string" },

        // Raw city and country for display and geocoding.
        city:     { bsonType: "string" },
        country:  { bsonType: "string" },

        // [R4] Region must be one of the four approved global regions.
        // Adding a new region requires a schema migration.
        region:   { bsonType: "string", enum: ["NAM", "LATAM", "EMEA", "APAC"] },

        // IANA timezone string (e.g. "America/New_York").
        // Used for displaying local times in team dashboards.
        timezone: { bsonType: "string", description: "IANA timezone, e.g. America/New_York" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Index on region supports the "teams by region" dashboard view.
acme.locations.createIndex({ region: 1 });
// Index on country supports filtering by country in search UI.
acme.locations.createIndex({ country: 1 });
print("Collection + indexes created: locations");

// =============================================================
// 2. INDIVIDUALS
//
// Source of truth for all person-level attributes: name, email,
// location, staff classification, job title, and application roles.
//
// KEY DESIGN DECISIONS:
//
// - staffType reflects the person's CURRENT classification.
//   For the value at the time they joined a team, see the
//   staffTypeSnapshot field on the team's members array [R7].
//
// - roles[] is the application-level RBAC list. A person can
//   hold multiple roles (e.g., a team lead who is also an editor).
//   These roles drive UI permissions, not org-chart hierarchy.
//
// - auth is optional. If present, it holds a bcrypt-hashed
//   password and last login timestamp. In production this would
//   likely be replaced by SSO/OAuth, but the schema supports
//   standalone auth for the MVP.
//
// - [R3] There is no constraint preventing the same individual
//   from appearing in multiple teams. That is intentional.
//
// - [R5] Soft deletion applies. Never hard-delete individuals.
// =============================================================
print("\n--- Creating: individuals ---");

acme.createCollection("individuals", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "personName", "email", "primaryLocation",
        "staffType", "roles", "isDeleted", "createdAt", "updatedAt"
      ],
      additionalProperties: false,
      properties: {
        // Convention: person_<NNN>, e.g. "person_101".
        _id:             { bsonType: "string" },
        personName:      { bsonType: "string" },

        // Basic email validation. More rigorous checks happen
        // at the application layer.
        email:           { bsonType: "string", pattern: "^.+@.+\\..+$" },

        // [R4] Must be a ref to locations._id, never a free-text city name.
        primaryLocation: { bsonType: "string", description: "ref to locations._id" },

        // Current staff classification.
        // "direct" = full-time employee on ACME payroll.
        // "non-direct" = contractor, consultant, or vendor staff.
        // For the historical value captured when this person joined
        // a specific team, see members[].staffTypeSnapshot [R7].
        staffType: {
          bsonType: "string",
          enum: ["direct", "non-direct"],
          description: "Current classification. See members.staffTypeSnapshot for point-in-time value."
        },

        // Free-text job title for display purposes.
        jobTitle: { bsonType: "string" },

        // S3 object key for the person's profile picture.
        // Default points to a shared placeholder avatar.
        // Full URL is constructed at the application layer using the S3 bucket base URL.
        profilePicture: {
          bsonType: "string",
          description: "S3 object key for profile picture. Default: avatars/defaults/default_01.png"
        },

        // Application-level roles for RBAC.
        //   system_admin — full system access, user management
        //   team_lead    — can edit their own team's members and achievements
        //   editor       — can edit data within teams they belong to
        //   viewer       — read-only access
        roles: {
          bsonType: "array",
          description: "App-level RBAC roles. A person can hold multiple roles.",
          items: {
            bsonType: "string",
            enum: ["system_admin", "team_lead", "editor", "viewer"]
          }
        },

        // Optional authentication block for standalone MVP auth.
        // In production, this would be replaced by an external
        // identity provider (e.g., Okta, Azure AD).
        auth: {
          bsonType: "object",
          properties: {
            hashedPassword: { bsonType: "string" },
            lastLogin:      { bsonType: "string" }
          }
        },

        // [R5] Soft delete fields. Query { isDeleted: false }
        // for all standard lookups.
        isDeleted: { bsonType: "bool" },
        deletedAt: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Unique email — prevents duplicate accounts.
acme.individuals.createIndex({ email: 1 }, { unique: true });
// Supports "who is at this location?" queries.
acme.individuals.createIndex({ primaryLocation: 1 });
// Supports non-direct ratio reports.
acme.individuals.createIndex({ staffType: 1 });
// Supports role-based access lookups.
acme.individuals.createIndex({ roles: 1 });
// [R5] Supports filtering out soft-deleted records efficiently.
acme.individuals.createIndex({ isDeleted: 1 });
print("Collection + indexes created: individuals");

// =============================================================
// 3. TEAMS
//
// Central entity of the application. Each team has:
//   - A home location (office where the team is primarily based)
//   - A members array (embedded, not referenced) containing
//     the leader, members, and optionally a delegate
//   - A reporting history tracking which senior leader the
//     team reports to over time
//
// WHY EMBED MEMBERS INSTEAD OF REFERENCING?
//   Team membership is always read alongside the team itself
//   (no team view exists without its members). Embedding avoids
//   a $lookup on every team page load. The trade-off is that
//   updates to an individual's staffType do not propagate to
//   existing team entries — this is intentional [R7].
//
// MEMBER ARRAY RULES:
//   [R1] Application must count active entries where
//        memberRole === "Member" && endDate === null.
//        If count >= 5, reject the insert.
//        NOTE: The schema does NOT enforce maxItems because
//        historical (closed) entries with endDate !== null
//        are kept in the array for audit trail purposes.
//        A hard cap would block new additions after turnover.
//
//   [R2] Only 1 active "Team Leader" (endDate === null) at a time.
//        Application must verify before inserting or role-changing.
//
//   [R3] Same personId may appear in this AND other team docs.
//
//   [R7] staffTypeSnapshot is captured at join time and never
//        updated, even if the individual's staffType changes.
//
//   [R9] At most 1 active "Delegate" at a time. Delegates do
//        not count toward the 5-member cap.
//
// REPORTING HISTORY (reportingHistory array):
//   [R8] Append-only dated array. On reorg, set endDate on
//        current entry and push a new one. Never overwrite.
//        orgLeaderId references an individual who serves as
//        the reporting-line leader for the team.
// =============================================================
print("\n--- Creating: teams ---");

acme.createCollection("teams", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "teamName", "teamHomeLocation",
        "members", "reportingHistory", "isDeleted", "createdAt", "updatedAt"
      ],
      additionalProperties: false,
      properties: {
        // Convention: team_<NNN>, e.g. "team_001".
        _id:              { bsonType: "string" },
        teamName:         { bsonType: "string" },

        // [R4] Must reference locations._id. Determines the team's
        // "home base" for co-location reports.
        teamHomeLocation: { bsonType: "string", description: "ref to locations._id" },

        // Embedded member roster. Contains both current (endDate: null)
        // and historical (endDate: "YYYY-MM-DD") entries.
        // No maxItems — historical entries must be preserved [R1].
        members: {
          bsonType: "array",
          description: "All current and historical members. Active = endDate is null. See [R1][R2][R3][R7][R9].",
          items: {
            bsonType: "object",
            required: ["personId", "memberRole", "staffTypeSnapshot", "startDate", "endDate"],
            additionalProperties: false,
            properties: {
              // [R3] Not unique across teams — same person can be in multiple team docs.
              personId:   { bsonType: "string", description: "ref to individuals._id" },

              // [R2] Application ensures only 1 active "Team Leader" per team.
              // [R9] Application ensures only 1 active "Delegate" per team.
              // "Member" is the standard role for team participants.
              memberRole: { bsonType: "string", enum: ["Team Leader", "Member", "Delegate"] },

              // [R7] Intentional snapshot of staffType at join time.
              // Do NOT sync this with individuals.staffType after insert.
              // Used for historical non-direct ratio reports.
              staffTypeSnapshot: {
                bsonType: "string",
                enum: ["direct", "non-direct"],
                description: "Captured at join time. Never updated after insert [R7]."
              },

              // ISO date strings (YYYY-MM-DD).
              startDate: { bsonType: "string", description: "YYYY-MM-DD — date the person joined the team" },

              // null = currently active on the team.
              // A date string = the person has departed. The entry is
              // kept for historical / audit purposes [R5][R6].
              endDate:   { bsonType: ["string", "null"], description: "null = active, YYYY-MM-DD = departed" }
            }
          }
        },

        // [R8] Append-only. endDate: null = current reporting line.
        // Tracks which senior leader the team reports to over time.
        // On reorg: close current entry (set endDate), push new entry.
        reportingHistory: {
          bsonType: "array",
          description: "Dated reporting chain. Append new entries on reorg. Never overwrite [R6][R8].",
          items: {
            bsonType: "object",
            required: ["orgLeaderId", "startDate", "endDate"],
            additionalProperties: false,
            properties: {
              // References an individual who serves as the team's
              // reporting-line leader. This is a direct reference
              // to individuals._id (no separate organizations collection).
              orgLeaderId: { bsonType: "string", description: "ref to individuals._id — the leader this team reports to" },
              startDate:   { bsonType: "string", description: "YYYY-MM-DD" },
              endDate:     { bsonType: ["string", "null"], description: "null = current, YYYY-MM-DD = ended" }
            }
          }
        },

        // [R5] Soft delete. Deleted teams remain queryable for
        // historical and audit views.
        isDeleted: { bsonType: "bool" },
        deletedAt: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "string" },
        updatedAt: { bsonType: "string" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Supports team name search and uniqueness checks.
acme.teams.createIndex({ teamName: 1 });
// Supports "teams at this location" dashboard.
acme.teams.createIndex({ teamHomeLocation: 1 });
// [R3] Supports "which teams is this person on?" queries.
acme.teams.createIndex({ "members.personId": 1 });
// Supports filtering by role (e.g., find all Team Leaders).
acme.teams.createIndex({ "members.memberRole": 1 });
// Supports non-direct ratio reports.
acme.teams.createIndex({ "members.staffTypeSnapshot": 1 });
// Supports date-range queries on membership history.
acme.teams.createIndex({ "members.startDate": 1, "members.endDate": 1 });
// Supports "teams reporting to this leader" queries.
acme.teams.createIndex({ "reportingHistory.orgLeaderId": 1 });
// Supports date-range queries on reporting history.
acme.teams.createIndex({ "reportingHistory.startDate": 1, "reportingHistory.endDate": 1 });
// [R5] Supports filtering out soft-deleted teams efficiently.
acme.teams.createIndex({ isDeleted: 1 });
print("Collection + indexes created: teams");

// =============================================================
// 4. ACHIEVEMENTS
//
// Monthly log of team accomplishments. Each achievement is tied
// to a single team and a specific month (YYYY-MM format).
//
// WHY YYYY-MM FOR achievementMonth?
//   Achievements are grouped and displayed by calendar month.
//   Using a constrained pattern prevents inconsistent date
//   formats that would break monthly grouping queries.
//   The month reflects WHEN the work occurred, not when
//   the record was created (createdAt handles that).
//
// DESIGN NOTES:
//   - contributors[] references individuals who contributed to
//     the achievement. They may belong to different teams [R3].
//   - tags[] is a free-form array for categorization and search.
//   - proofLink is optional — not all achievements will have
//     a Jira ticket or Confluence page.
//   - [R5] Soft deletion applies. Never hard-delete achievements.
// =============================================================
print("\n--- Creating: achievements ---");

acme.createCollection("achievements", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "_id", "teamId", "achievementMonth", "achievementTitle",
        "createdBy", "isDeleted", "createdAt"
      ],
      additionalProperties: false,
      properties: {
        // Convention: ach_<NNN>, e.g. "ach_001".
        _id:    { bsonType: "string" },

        // The team this achievement belongs to.
        teamId: { bsonType: "string", description: "ref to teams._id" },

        // Pattern enforces YYYY-MM — prevents free-text that
        // would break monthly grouping and sorting.
        achievementMonth: {
          bsonType: "string",
          pattern: "^\\d{4}-\\d{2}$",
          description: "YYYY-MM only. The month the work occurred, not when it was entered."
        },

        achievementTitle:       { bsonType: "string" },
        achievementDescription: { bsonType: "string" },

        // Quantifiable result, e.g. "35% latency reduction".
        impactMetric:           { bsonType: "string" },

        // Free-form tags for categorization and search.
        tags:         { bsonType: "array", items: { bsonType: "string" } },

        // [R3] Contributors can belong to different teams.
        contributors: {
          bsonType: "array",
          items: { bsonType: "string" },
          description: "refs to individuals._id — contributors may span teams [R3]"
        },

        // Optional URL to a Jira ticket, Confluence page, or PR.
        proofLink: { bsonType: "string" },

        // The person who created this achievement record.
        createdBy: { bsonType: "string", description: "ref to individuals._id" },

        // [R5] Soft delete fields.
        isDeleted: { bsonType: "bool" },
        deletedAt: { bsonType: ["string", "null"] },
        createdAt: { bsonType: "string" }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Primary query path: "show me achievements for team X, newest month first."
acme.achievements.createIndex({ teamId: 1, achievementMonth: -1 });
// Supports cross-team monthly dashboard view.
acme.achievements.createIndex({ achievementMonth: -1 });
// Supports tag-based filtering and search.
acme.achievements.createIndex({ tags: 1 });
// Supports "what has this person contributed to?" queries.
acme.achievements.createIndex({ contributors: 1 });
// [R5] Supports filtering out soft-deleted records.
acme.achievements.createIndex({ isDeleted: 1 });
print("Collection + indexes created: achievements");

// =============================================================
// 5. TEAM HISTORY  [R6]
//
// Immutable, append-only audit log for all structural team changes.
//
// The application must write a history record whenever:
//   - A team is created, updated, or soft-deleted
//   - A member is added, removed, or changes role
//   - The team leader changes
//   - The reporting line changes (reorg)
//
// IMPORTANT: Records in this collection are NEVER soft-deleted
// or modified. They ARE the audit trail. Unlike every other
// collection, there is no isDeleted field here.
//
// previousState and newState are optional snapshots stored as
// free-form objects. They capture just enough context to
// reconstruct what changed without requiring a full diff.
// =============================================================
print("\n--- Creating: teamHistory ---");

acme.createCollection("teamHistory", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "teamId", "eventType", "changedBy", "changedAt", "description"],
      additionalProperties: false,
      properties: {
        // Convention: hist_<NNN>, e.g. "hist_001".
        _id:    { bsonType: "string" },
        teamId: { bsonType: "string", description: "ref to teams._id" },

        // Enumerated event type for filtering and reporting.
        eventType: {
          bsonType: "string",
          enum: [
            "team_created", "team_updated", "team_deleted",
            "member_added", "member_removed", "member_role_changed",
            "leader_changed", "reporting_changed"
          ]
        },

        // Who made the change. Ref to individuals._id.
        changedBy:    { bsonType: "string", description: "ref to individuals._id" },
        // When the change occurred.
        changedAt:    { bsonType: "string", description: "YYYY-MM-DD" },
        // Human-readable description of what happened.
        description:  { bsonType: "string" },

        // Optional before/after snapshots for detailed audit views.
        // These are free-form objects — structure varies by eventType.
        previousState: { bsonType: ["object", "null"] },
        newState:      { bsonType: ["object", "null"] }
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

// Primary query path: "show me the history for team X, newest first."
acme.teamHistory.createIndex({ teamId: 1, changedAt: -1 });
// Supports filtering by event type (e.g., "show all leader changes").
acme.teamHistory.createIndex({ eventType: 1 });
// Supports "what changes has this person made?" queries.
acme.teamHistory.createIndex({ changedBy: 1 });
print("Collection + indexes created: teamHistory");

// =============================================================
// SEED DATA
// =============================================================
print("\n--- Seeding data ---");

// ---------------------------------------------------------
// LOCATIONS — NAM x2, LATAM x1, EMEA x3, APAC x4 [R4]
//
// 10 offices across 4 regions. The _id slug is used as the FK
// in teams.teamHomeLocation and individuals.primaryLocation.
// ---------------------------------------------------------
acme.locations.insertMany([
  { _id: "loc_nyc_hq",        name: "Citi Global HQ (388 Greenwich)", city: "New York",    country: "US",      region: "NAM",   timezone: "America/New_York" },
  { _id: "loc_nyc_park",      name: "Citi Park Avenue Office",        city: "New York",    country: "US",      region: "NAM",   timezone: "America/New_York" },
  { _id: "loc_miami_latam",   name: "Citi LATAM Hub",                 city: "Miami",       country: "US",      region: "LATAM", timezone: "America/New_York" },
  { _id: "loc_london_cw",     name: "Citi EMEA HQ (Canary Wharf)",    city: "London",      country: "UK",      region: "EMEA",  timezone: "Europe/London" },
  { _id: "loc_dublin",        name: "Citibank Europe Plc HQ",         city: "Dublin",      country: "Ireland", region: "EMEA",  timezone: "Europe/Dublin" },
  { _id: "loc_frankfurt",     name: "Citi Frankfurt Office",          city: "Frankfurt",   country: "Germany", region: "EMEA",  timezone: "Europe/Berlin" },
  { _id: "loc_hong_kong",     name: "Citi Hong Kong HQ",              city: "Hong Kong",   country: "HK",      region: "APAC",  timezone: "Asia/Hong_Kong" },
  { _id: "loc_singapore",     name: "Citi Singapore Hub",             city: "Singapore",   country: "Singapore",region: "APAC",  timezone: "Asia/Singapore" },
  { _id: "loc_mumbai",        name: "Citi India HQ",                  city: "Mumbai",      country: "India",   region: "APAC",  timezone: "Asia/Kolkata" },
  { _id: "loc_sydney",        name: "Citi Australia Office",          city: "Sydney",      country: "Australia",region: "APAC",  timezone: "Australia/Sydney" }
]);
print("Seeded: locations (10 docs — NAM x2, LATAM x1, EMEA x3, APAC x4)");

// ---------------------------------------------------------
// INDIVIDUALS
//
// 20 people total, split into three tiers:
//   person_001–004 : Senior leaders (referenced in reportingHistory)
//   person_101–105 : Team Leaders (1 per team) [R2]
//   person_201–215 : Members (some in multiple teams [R3])
//
// Notable seed data patterns for testing:
//   - person_101 (Alice Smith) is a non-direct team leader
//     in a different city than her team's home location.
//     This exercises two business report flags at once:
//     "leader not co-located" and "leader is non-direct."
//   - Several members (person_202, 203, 204, 205, 207, 209,
//     210, 213, 214) appear in multiple teams to exercise [R3].
// ---------------------------------------------------------
acme.individuals.insertMany([

  // ---- Senior Leaders ----
  // These individuals appear in teams.reportingHistory[].orgLeaderId.
  // They are NOT team members — they sit above the team level.
  {
    _id: "person_001", personName: "Robert Kane",    email: "rkane@acme.com",
    primaryLocation: "loc_miami_latam",     staffType: "direct",
    jobTitle: "Chief Technology Officer",      roles: ["system_admin", "viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2020-01-01", updatedAt: "2020-01-01"
  },
  {
    _id: "person_002", personName: "Sandra Liu",     email: "sliu@acme.com",
    primaryLocation: "loc_singapore", staffType: "direct",
    jobTitle: "Chief Operating Officer",       roles: ["system_admin", "viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2020-01-01", updatedAt: "2020-01-01"
  },
  {
    _id: "person_003", personName: "Marcus Webb",    email: "mwebb@acme.com",
    primaryLocation: "loc_london_cw",    staffType: "direct",
    jobTitle: "Division Head, Credit Card",    roles: ["system_admin", "viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2020-01-01", updatedAt: "2020-01-01"
  },
  {
    _id: "person_004", personName: "Isabelle Morin", email: "imorin@acme.com",
    primaryLocation: "loc_frankfurt", staffType: "direct",
    jobTitle: "Division Head, Private Banking", roles: ["system_admin", "viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2020-01-01", updatedAt: "2020-01-01"
  },

  // ---- Team Leaders ----
  // [R2] Each person below is the sole active Team Leader for exactly one team.
  {
    // NOTE: Alice is in NYC (loc_nyc_hq) but leads team_001 based in Miami LATAM.
    // This flags "leader not co-located" in business reports.
    // She is also "non-direct" — flags "leader is non-direct."
    _id: "person_101", personName: "Alice Smith",    email: "asmith@acme.com",
    primaryLocation: "loc_nyc_hq",       staffType: "non-direct",
    jobTitle: "Engineering Lead",     roles: ["team_lead", "editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-06-01", updatedAt: "2026-01-15"
  },
  {
    _id: "person_102", personName: "Brian Torres",   email: "btorres@acme.com",
    primaryLocation: "loc_miami_latam",     staffType: "direct",
    jobTitle: "Infrastructure Lead",  roles: ["team_lead", "editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-01-15", updatedAt: "2023-01-15"
  },
  {
    _id: "person_103", personName: "Carmen Diaz",    email: "cdiaz@acme.com",
    primaryLocation: "loc_miami_latam",  staffType: "direct",
    jobTitle: "BI and Analytics Lead", roles: ["team_lead", "editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-03-01", updatedAt: "2023-03-01"
  },
  {
    _id: "person_104", personName: "Daniel Kim",     email: "dkim@acme.com",
    primaryLocation: "loc_singapore", staffType: "direct",
    jobTitle: "Wealth Tech Lead",     roles: ["team_lead", "editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-05-01", updatedAt: "2023-05-01"
  },
  {
    _id: "person_105", personName: "Eva Fischer",    email: "efischer@acme.com",
    primaryLocation: "loc_london_cw",    staffType: "direct",
    jobTitle: "Credit Tech Lead",     roles: ["team_lead", "editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-07-01", updatedAt: "2023-07-01"
  },

  // ---- Members ----
  // [R3] Several members appear in multiple teams (noted in team inserts below).
  {
    _id: "person_201", personName: "David Park",     email: "dpark@acme.com",
    primaryLocation: "loc_miami_latam",     staffType: "direct",
    jobTitle: "Senior Engineer",      roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-06-15", updatedAt: "2023-06-15"
  },
  {
    // non-direct — contributes to non-direct ratio in team_001 and team_002
    _id: "person_202", personName: "Elena Russo",    email: "erusso@acme.com",
    primaryLocation: "loc_miami_latam",     staffType: "non-direct",
    jobTitle: "Data Engineer",        roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-09-01", updatedAt: "2023-09-01"
  },
  {
    _id: "person_203", personName: "Frank Osei",     email: "fosei@acme.com",
    primaryLocation: "loc_miami_latam", staffType: "direct",
    jobTitle: "Backend Engineer",     roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-01-10", updatedAt: "2024-01-10"
  },
  {
    // non-direct — appears in team_003 and team_004
    _id: "person_204", personName: "Grace Yuen",     email: "gyuen@acme.com",
    primaryLocation: "loc_london_cw",    staffType: "non-direct",
    jobTitle: "Credit Analyst",       roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-02-01", updatedAt: "2024-02-01"
  },
  {
    _id: "person_205", personName: "Henry Blake",    email: "hblake@acme.com",
    primaryLocation: "loc_miami_latam",     staffType: "direct",
    jobTitle: "Platform Engineer",    roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-04-15", updatedAt: "2024-04-15"
  },
  {
    _id: "person_206", personName: "Iris Nakamura",  email: "inakamura@acme.com",
    primaryLocation: "loc_singapore", staffType: "direct",
    jobTitle: "Wealth Systems Engineer", roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2023-08-01", updatedAt: "2023-08-01"
  },
  {
    // non-direct — appears in team_003 and team_004
    _id: "person_207", personName: "James OBrien",   email: "jobrien@acme.com",
    primaryLocation: "loc_miami_latam",    staffType: "non-direct",
    jobTitle: "Data Analyst",         roles: ["viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2024-01-20", updatedAt: "2024-01-20"
  },
  {
    _id: "person_208", personName: "Karen Patel",    email: "kpatel@acme.com",
    primaryLocation: "loc_sydney",    staffType: "direct",
    jobTitle: "Full Stack Engineer",  roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-03-01", updatedAt: "2024-03-01"
  },
  {
    _id: "person_209", personName: "Luis Mendez",    email: "lmendez@acme.com",
    primaryLocation: "loc_miami_latam",    staffType: "direct",
    jobTitle: "DevOps Engineer",      roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-02-15", updatedAt: "2024-02-15"
  },
  {
    // non-direct — appears in team_004 and team_005
    _id: "person_210", personName: "Maya Chen",      email: "mchen@acme.com",
    primaryLocation: "loc_frankfurt", staffType: "non-direct",
    jobTitle: "Risk Analyst",         roles: ["viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2024-03-10", updatedAt: "2024-03-10"
  },
  {
    _id: "person_211", personName: "Noah Williams",  email: "nwilliams@acme.com",
    primaryLocation: "loc_london_cw",    staffType: "direct",
    jobTitle: "API Engineer",         roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-05-01", updatedAt: "2024-05-01"
  },
  {
    _id: "person_212", personName: "Olivia Santos",  email: "osantos@acme.com",
    primaryLocation: "loc_miami_latam", staffType: "direct",
    jobTitle: "BI Developer",         roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-06-01", updatedAt: "2024-06-01"
  },
  {
    // non-direct — appears in team_003 and team_004
    _id: "person_213", personName: "Pedro Alves",    email: "palves@acme.com",
    primaryLocation: "loc_miami_latam",    staffType: "non-direct",
    jobTitle: "Data Analyst",         roles: ["viewer"],
    isDeleted: false, deletedAt: null, createdAt: "2024-07-01", updatedAt: "2024-07-01"
  },
  {
    // Appears in team_001 and team_005; previously in team_002 (closed entry)
    _id: "person_214", personName: "Quinn Taylor",   email: "qtaylor@acme.com",
    primaryLocation: "loc_nyc_hq",       staffType: "direct",
    jobTitle: "ML Engineer",          roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-08-01", updatedAt: "2024-08-01"
  },
  {
    _id: "person_215", personName: "Rosa Martinez",  email: "rmartinez@acme.com",
    primaryLocation: "loc_singapore", staffType: "direct",
    jobTitle: "Quant Developer",      roles: ["editor"],
    isDeleted: false, deletedAt: null, createdAt: "2024-09-01", updatedAt: "2024-09-01"
  }
]);
print("Seeded: individuals (20 docs — 4 senior leaders, 5 team leaders, 11 members)");

// ---------------------------------------------------------
// TEAMS — 5 teams, each with 1 leader [R2] + up to 5 members [R1]
//
// SEED DATA DESIGNED TO EXERCISE BUSINESS REPORT SCENARIOS:
//
//   team_001 "Data Platform" (Miami LATAM — loc_miami_latam)
//     Leader: Alice Smith — NYC/loc_nyc_hq (NOT co-located) + non-direct
//     Non-direct members: 1 of 5 (Elena Russo)
//     => Non-direct ratio (members only): 1/5 = 20% (boundary)
//     => Flags: leader not co-located, leader is non-direct
//
//   team_002 "Core Infrastructure" (Miami LATAM — loc_miami_latam)
//     Leader: Brian Torres — Miami LATAM (co-located) + direct
//     Non-direct members: 1 of 4 active (Elena Russo)
//     => Non-direct ratio (members only): 1/4 = 25%
//     => Has a CLOSED member entry (Quinn Taylor, endDate set)
//        to demonstrate historical retention [R5][R6]
//     => Overlapping members with team_001 [R3]: person_202, 205, 209
//
//   team_003 "Business Intelligence" (Miami LATAM — loc_miami_latam)
//     Leader: Carmen Diaz — Miami LATAM (co-located) + direct
//     Non-direct members: 3 of 5 (James, Pedro, Grace)
//     => Non-direct ratio (members only): 3/5 = 60%
//
//   team_004 "Credit Card Analytics" (London — loc_london_cw)
//     Leader: Eva Fischer — London/loc_london_cw (co-located) + direct
//     Non-direct members: 4 of 5 (Grace, Maya, James, Pedro)
//     => Non-direct ratio (members only): 4/5 = 80%
//
//   team_005 "Digital Wealth Platform" (Singapore — loc_singapore)
//     Leader: Daniel Kim — Singapore (co-located) + direct
//     Non-direct members: 1 of 5 (Maya Chen)
//     => Non-direct ratio (members only): 1/5 = 20% (boundary)
// ---------------------------------------------------------
acme.teams.insertMany([
  {
    _id: "team_001",
    teamName: "Data Platform",
    teamHomeLocation: "loc_miami_latam",
    members: [
      // [R2] Exactly 1 Team Leader — Alice (loc_nyc_hq, non-direct) flags 2 business reports
      // [R1] Leader slot does not count toward the 5-member cap
      { personId: "person_101", memberRole: "Team Leader", staffTypeSnapshot: "non-direct", startDate: "2024-01-01", endDate: null },
      { personId: "person_201", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-01-01", endDate: null }, // 1 of 5
      { personId: "person_202", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-03-01", endDate: null }, // 2 of 5 — also in team_002 [R3]
      { personId: "person_205", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-04-15", endDate: null }, // 3 of 5 — also in team_002 [R3]
      { personId: "person_209", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-06-01", endDate: null }, // 4 of 5 — also in team_002 [R3]
      { personId: "person_214", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-08-01", endDate: null }  // 5 of 5 — MAX [R1] also in team_005 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: "person_001", startDate: "2024-01-01", endDate: null }
    ],
    isDeleted: false, deletedAt: null, createdAt: "2024-01-01", updatedAt: "2026-03-01"
  },
  {
    _id: "team_002",
    teamName: "Core Infrastructure",
    teamHomeLocation: "loc_miami_latam",
    members: [
      // Leader co-located (loc_miami_latam) + direct — no flags on business reports
      { personId: "person_102", memberRole: "Team Leader", staffTypeSnapshot: "direct",     startDate: "2023-01-15", endDate: null },
      { personId: "person_202", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2023-01-15", endDate: null }, // 1 of 4 active — also in team_001 [R3]
      { personId: "person_203", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2023-06-01", endDate: null }, // 2 of 4 active — also in team_003 [R3]
      { personId: "person_205", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-04-15", endDate: null }, // 3 of 4 active — also in team_001 [R3]
      { personId: "person_209", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-06-01", endDate: null }, // 4 of 4 active — also in team_001 [R3]
      // CLOSED entry — Quinn Taylor left the team 2025-03-31.
      // Retained for audit trail [R5][R6]. Does NOT count toward active 5 [R1].
      { personId: "person_214", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2023-01-15", endDate: "2025-03-31" }
    ],
    // Reorg example: reporting line confirmed after 2026 global restructure [R6][R8]
    reportingHistory: [
      { orgLeaderId: "person_001", startDate: "2023-01-15", endDate: "2025-12-31" },
      { orgLeaderId: "person_001", startDate: "2026-01-01", endDate: null }
    ],
    isDeleted: false, deletedAt: null, createdAt: "2023-01-15", updatedAt: "2026-01-01"
  },
  {
    _id: "team_003",
    teamName: "Business Intelligence",
    teamHomeLocation: "loc_miami_latam",
    members: [
      // Leader co-located (loc_miami_latam) + direct
      { personId: "person_103", memberRole: "Team Leader", staffTypeSnapshot: "direct",     startDate: "2023-03-01", endDate: null },
      { personId: "person_203", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-01-10", endDate: null }, // 1 of 5 — also in team_002 [R3]
      { personId: "person_207", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-01-20", endDate: null }, // 2 of 5 — also in team_004 [R3]
      { personId: "person_212", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-06-01", endDate: null }, // 3 of 5
      { personId: "person_213", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-07-01", endDate: null }, // 4 of 5 — also in team_004 [R3]
      { personId: "person_204", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-09-01", endDate: null }  // 5 of 5 — also in team_004 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: "person_002", startDate: "2023-03-01", endDate: null }
    ],
    isDeleted: false, deletedAt: null, createdAt: "2023-03-01", updatedAt: "2024-09-01"
  },
  {
    _id: "team_004",
    teamName: "Credit Card Analytics",
    teamHomeLocation: "loc_london_cw",
    members: [
      // Leader co-located (loc_london_cw) + direct
      { personId: "person_105", memberRole: "Team Leader", staffTypeSnapshot: "direct",     startDate: "2023-07-01", endDate: null },
      { personId: "person_204", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-02-01", endDate: null }, // 1 of 5 — also in team_003 [R3]
      { personId: "person_210", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-03-10", endDate: null }, // 2 of 5 — also in team_005 [R3]
      { personId: "person_211", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-05-01", endDate: null }, // 3 of 5
      { personId: "person_207", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-06-01", endDate: null }, // 4 of 5 — also in team_003 [R3]
      { personId: "person_213", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-07-01", endDate: null }  // 5 of 5 — also in team_003 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: "person_003", startDate: "2023-07-01", endDate: null }
    ],
    isDeleted: false, deletedAt: null, createdAt: "2023-07-01", updatedAt: "2024-07-01"
  },
  {
    _id: "team_005",
    teamName: "Digital Wealth Platform",
    teamHomeLocation: "loc_singapore",
    members: [
      // Leader co-located (loc_singapore) + direct
      { personId: "person_104", memberRole: "Team Leader", staffTypeSnapshot: "direct",     startDate: "2023-05-01", endDate: null },
      { personId: "person_206", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2023-08-01", endDate: null }, // 1 of 5
      { personId: "person_208", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-03-01", endDate: null }, // 2 of 5
      { personId: "person_210", memberRole: "Member",      staffTypeSnapshot: "non-direct", startDate: "2024-03-10", endDate: null }, // 3 of 5 — also in team_004 [R3]
      { personId: "person_215", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2024-09-01", endDate: null }, // 4 of 5
      { personId: "person_214", memberRole: "Member",      staffTypeSnapshot: "direct",     startDate: "2025-01-01", endDate: null }  // 5 of 5 — also in team_001 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: "person_004", startDate: "2023-05-01", endDate: null }
    ],
    isDeleted: false, deletedAt: null, createdAt: "2023-05-01", updatedAt: "2025-01-01"
  }
]);
print("Seeded: teams (5 docs — 1 leader + up to 5 members each)");

// ---------------------------------------------------------
// ACHIEVEMENTS — 2 per team
//
// Each team has one achievement for 2026-03 and one for 2026-02
// to support monthly grouping and filtering in the UI.
// [R5] All records seeded with isDeleted: false.
// ---------------------------------------------------------
acme.achievements.insertMany([
  // team_001
  {
    _id: "ach_001", teamId: "team_001", achievementMonth: "2026-03",
    achievementTitle: "Reduced query runtime by 35%",
    achievementDescription: "Rewrote finance reporting pipeline aggregation and added compound indexes.",
    impactMetric: "35% latency reduction — saves approx 4 hrs/week for finance team",
    tags: ["performance", "infrastructure"],
    contributors: ["person_101", "person_201"],
    proofLink: "https://jira.acme.com/DATA-441",
    createdBy: "person_101", isDeleted: false, deletedAt: null, createdAt: "2026-03-28"
  },
  {
    _id: "ach_002", teamId: "team_001", achievementMonth: "2026-02",
    achievementTitle: "Launched real-time data pipeline v2",
    achievementDescription: "Migrated batch ETL to streaming architecture using Kafka.",
    impactMetric: "Data freshness improved from 24h to under 5 minutes",
    tags: ["infrastructure", "streaming"],
    contributors: ["person_201", "person_202"],
    proofLink: "https://confluence.acme.com/data-pipeline-v2",
    createdBy: "person_101", isDeleted: false, deletedAt: null, createdAt: "2026-02-27"
  },
  // team_002
  {
    _id: "ach_003", teamId: "team_002", achievementMonth: "2026-03",
    achievementTitle: "Zero-downtime DB cluster migration",
    achievementDescription: "Migrated production DocumentDB to new VPC with no service interruption.",
    impactMetric: "0 min downtime, 40% cost reduction post-migration",
    tags: ["infrastructure", "aws", "cost"],
    contributors: ["person_102", "person_205"],
    proofLink: "https://jira.acme.com/INFRA-209",
    createdBy: "person_102", isDeleted: false, deletedAt: null, createdAt: "2026-03-31"
  },
  {
    _id: "ach_004", teamId: "team_002", achievementMonth: "2026-02",
    achievementTitle: "Automated DR failover testing",
    achievementDescription: "Built automated runbook to test disaster recovery failover monthly.",
    impactMetric: "RTO reduced from 4h to 22 minutes",
    tags: ["reliability", "automation"],
    contributors: ["person_102", "person_209"],
    createdBy: "person_102", isDeleted: false, deletedAt: null, createdAt: "2026-02-26"
  },
  // team_003
  {
    _id: "ach_005", teamId: "team_003", achievementMonth: "2026-03",
    achievementTitle: "Shipped executive dashboard v1",
    achievementDescription: "Delivered real-time KPI dashboard used by C-suite for monthly reviews.",
    impactMetric: "Eliminated 3 manual reporting decks — saves 12 hrs/month",
    tags: ["product", "analytics", "launch"],
    contributors: ["person_103", "person_212"],
    proofLink: "https://confluence.acme.com/bi-dashboard-v1",
    createdBy: "person_103", isDeleted: false, deletedAt: null, createdAt: "2026-03-29"
  },
  {
    _id: "ach_006", teamId: "team_003", achievementMonth: "2026-02",
    achievementTitle: "Completed LATAM data quality audit",
    achievementDescription: "Audited 14 upstream feeds across LATAM region and resolved 3 critical gaps.",
    impactMetric: "Data completeness improved from 81% to 97%",
    tags: ["data-quality", "latam"],
    contributors: ["person_207", "person_213"],
    createdBy: "person_103", isDeleted: false, deletedAt: null, createdAt: "2026-02-25"
  },
  // team_004
  {
    _id: "ach_007", teamId: "team_004", achievementMonth: "2026-03",
    achievementTitle: "Fraud detection model v3 deployed",
    achievementDescription: "Retrained fraud model with 18 months of new transaction data.",
    impactMetric: "False positive rate down 22%, saving approx 1.2M/yr in manual reviews",
    tags: ["ml", "fraud", "credit-card"],
    contributors: ["person_105", "person_210", "person_211"],
    proofLink: "https://jira.acme.com/CC-887",
    createdBy: "person_105", isDeleted: false, deletedAt: null, createdAt: "2026-03-30"
  },
  {
    _id: "ach_008", teamId: "team_004", achievementMonth: "2026-02",
    achievementTitle: "EU regulatory reporting automated",
    achievementDescription: "Automated monthly PSD2 compliance reports for 6 EU jurisdictions.",
    impactMetric: "40 hrs/month of manual effort eliminated",
    tags: ["compliance", "eu", "automation"],
    contributors: ["person_204", "person_211"],
    createdBy: "person_105", isDeleted: false, deletedAt: null, createdAt: "2026-02-24"
  },
  // team_005
  {
    _id: "ach_009", teamId: "team_005", achievementMonth: "2026-03",
    achievementTitle: "Launched client portfolio mobile view",
    achievementDescription: "Shipped responsive portfolio tracker for private banking mobile clients.",
    impactMetric: "28% increase in mobile app engagement in first 2 weeks",
    tags: ["product", "mobile", "private-banking"],
    contributors: ["person_104", "person_206", "person_215"],
    proofLink: "https://jira.acme.com/WLT-334",
    createdBy: "person_104", isDeleted: false, deletedAt: null, createdAt: "2026-03-27"
  },
  {
    _id: "ach_010", teamId: "team_005", achievementMonth: "2026-02",
    achievementTitle: "APAC market data feeds integrated",
    achievementDescription: "Connected 4 APAC exchange feeds into the unified wealth data layer.",
    impactMetric: "Latency from exchange to UI reduced from 8s to 400ms",
    tags: ["infrastructure", "apac", "market-data"],
    contributors: ["person_208", "person_214"],
    createdBy: "person_104", isDeleted: false, deletedAt: null, createdAt: "2026-02-22"
  }
]);
print("Seeded: achievements (10 docs — 2 per team)");

// ---------------------------------------------------------
// TEAM HISTORY — [R6] seed creation events + 1 change per team
//
// In production the application writes these automatically
// on every structural change. These seed entries establish
// the initial audit trail.
// ---------------------------------------------------------
acme.teamHistory.insertMany([
  {
    _id: "hist_001", teamId: "team_001", eventType: "team_created",
    changedBy: "person_001", changedAt: "2024-01-01",
    description: "Team Data Platform created. Reports to Robert Kane (CTO).",
    previousState: null,
    newState: { teamName: "Data Platform", teamHomeLocation: "loc_miami_latam", orgLeaderId: "person_001" }
  },
  {
    _id: "hist_002", teamId: "team_001", eventType: "member_added",
    changedBy: "person_101", changedAt: "2024-08-01",
    description: "Quinn Taylor (person_214) added as Member.",
    previousState: null,
    newState: { personId: "person_214", memberRole: "Member", staffTypeSnapshot: "direct", startDate: "2024-08-01", endDate: null }
  },
  {
    _id: "hist_003", teamId: "team_002", eventType: "team_created",
    changedBy: "person_001", changedAt: "2023-01-15",
    description: "Team Core Infrastructure created. Reports to Robert Kane (CTO).",
    previousState: null,
    newState: { teamName: "Core Infrastructure", teamHomeLocation: "loc_miami_latam", orgLeaderId: "person_001" }
  },
  {
    // Example of a member departure — closed entry [R5][R6]
    _id: "hist_004", teamId: "team_002", eventType: "member_removed",
    changedBy: "person_102", changedAt: "2025-03-31",
    description: "Quinn Taylor (person_214) departed. endDate set to 2025-03-31.",
    previousState: { personId: "person_214", memberRole: "Member", staffTypeSnapshot: "direct", startDate: "2023-01-15", endDate: null },
    newState:      { personId: "person_214", memberRole: "Member", staffTypeSnapshot: "direct", startDate: "2023-01-15", endDate: "2025-03-31" }
  },
  {
    // Example of a reporting line refresh after a reorg [R8]
    _id: "hist_005", teamId: "team_002", eventType: "reporting_changed",
    changedBy: "person_001", changedAt: "2026-01-01",
    description: "Reporting line refreshed after 2026 global reorg. Still reports to Robert Kane.",
    previousState: { orgLeaderId: "person_001", startDate: "2023-01-15", endDate: "2025-12-31" },
    newState:      { orgLeaderId: "person_001", startDate: "2026-01-01", endDate: null }
  },
  {
    _id: "hist_006", teamId: "team_003", eventType: "team_created",
    changedBy: "person_002", changedAt: "2023-03-01",
    description: "Team Business Intelligence created. Reports to Sandra Liu (COO).",
    previousState: null,
    newState: { teamName: "Business Intelligence", teamHomeLocation: "loc_miami_latam", orgLeaderId: "person_002" }
  },
  {
    _id: "hist_007", teamId: "team_004", eventType: "team_created",
    changedBy: "person_003", changedAt: "2023-07-01",
    description: "Team Credit Card Analytics created. Reports to Marcus Webb (Div Head).",
    previousState: null,
    newState: { teamName: "Credit Card Analytics", teamHomeLocation: "loc_london_cw", orgLeaderId: "person_003" }
  },
  {
    _id: "hist_008", teamId: "team_005", eventType: "team_created",
    changedBy: "person_004", changedAt: "2023-05-01",
    description: "Team Digital Wealth Platform created. Reports to Isabelle Morin (Div Head).",
    previousState: null,
    newState: { teamName: "Digital Wealth Platform", teamHomeLocation: "loc_singapore", orgLeaderId: "person_004" }
  }
]);
print("Seeded: teamHistory (8 docs)");

// =============================================================
// SMOKE TESTS
//
// Quick validation that seed data respects business rules.
// These are NOT unit tests — they are sanity checks for the
// setup script. Real validation lives in the application layer.
// =============================================================
print("\n--- Smoke tests ---");
print("  locations:     " + acme.locations.countDocuments() + " docs");
print("  individuals:   " + acme.individuals.countDocuments() + " docs");
print("  teams:         " + acme.teams.countDocuments() + " docs");
print("  achievements:  " + acme.achievements.countDocuments() + " docs");
print("  teamHistory:   " + acme.teamHistory.countDocuments() + " docs");

// [R1] Verify no team has more than 5 active members (excluding leader)
print("\n--- [R1] Member cap check (max 5 active members, leader excluded) ---");
acme.teams.find({ isDeleted: false }).forEach(function(t) {
  var activeMembers = t.members.filter(function(m) {
    return m.memberRole === "Member" && m.endDate === null;
  }).length;
  var flag = activeMembers > 5 ? " OVER LIMIT" : "";
  print("  " + t.teamName + ": " + activeMembers + " active members" + flag);
});

// [R2] Verify exactly 1 active leader per team
print("\n--- [R2] Leader uniqueness check (must be exactly 1) ---");
acme.teams.find({ isDeleted: false }).forEach(function(t) {
  var leaders = t.members.filter(function(m) {
    return m.memberRole === "Team Leader" && m.endDate === null;
  }).length;
  var flag = leaders !== 1 ? " EXPECTED 1, GOT " + leaders : "";
  print("  " + t.teamName + ": " + leaders + " active leader" + flag);
});

// [R3] Show individuals active in more than one team
print("\n--- [R3] Multi-team members ---");
acme.teams.aggregate([
  { $match: { isDeleted: false } },
  { $unwind: "$members" },
  { $match: { "members.endDate": null, "members.memberRole": { $ne: "Team Leader" } } },
  { $group: { _id: "$members.personId", teams: { $push: "$teamName" }, count: { $sum: 1 } } },
  { $match: { count: { $gt: 1 } } },
  { $lookup: { from: "individuals", localField: "_id", foreignField: "_id", as: "p" } },
  { $unwind: "$p" },
  { $project: { _id: 0, person: "$p.personName", teams: 1 } }
]).forEach(function(r) {
  print("  " + r.person + ": [" + r.teams.join(", ") + "]");
});

// Non-direct ratio check — flags teams above 20% threshold
print("\n--- Non-direct ratio check (members only, threshold > 20%) ---");
acme.teams.find({ isDeleted: false }).forEach(function(t) {
  var activeMembers = t.members.filter(function(m) {
    return m.memberRole === "Member" && m.endDate === null;
  });
  var nonDirect = activeMembers.filter(function(m) {
    return m.staffTypeSnapshot === "non-direct";
  }).length;
  var total = activeMembers.length;
  var ratio = total > 0 ? Math.round((nonDirect / total) * 100) : 0;
  var flag = ratio > 20 ? " ABOVE THRESHOLD" : "";
  print("  " + t.teamName + ": " + nonDirect + "/" + total + " = " + ratio + "%" + flag);
});

// Leader co-location check
print("\n--- Leader co-location check ---");
acme.teams.find({ isDeleted: false }).forEach(function(t) {
  var leader = t.members.find(function(m) {
    return m.memberRole === "Team Leader" && m.endDate === null;
  });
  if (leader) {
    var person = acme.individuals.findOne({ _id: leader.personId });
    var colocated = person && person.primaryLocation === t.teamHomeLocation;
    var flag = colocated ? "co-located" : "NOT co-located (" + (person ? person.primaryLocation : "?") + " vs " + t.teamHomeLocation + ")";
    print("  " + t.teamName + ": " + (person ? person.personName : leader.personId) + " — " + flag);
  }
});

print("\n========================================");
print(" Setup complete!");
print("========================================\n");

