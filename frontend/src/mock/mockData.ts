/**
 * Mock data for frontend development — mirrors the seed data in
 * docs/db/acme_schema.js (v3).
 *
 * ROLES (from individuals.roles[] + authSlice):
 *   system_admin — full access, user management, admin dashboard
 *   team_lead    — can edit their own team's members and achievements
 *   editor       — can edit data within teams they belong to
 *   viewer       — read-only access across all teams
 *
 * BUSINESS RULES reflected here:
 *   [R1]  Max 5 active Members per team (Leader & Delegate excluded)
 *   [R2]  Exactly 1 active Team Leader per team
 *   [R3]  An individual can be an active member of multiple teams
 *   [R4]  Locations are controlled refs — no free-text city names
 *   [R5]  Soft deletion — isDeleted / deletedAt; active records = isDeleted: false
 *   [R7]  staffTypeSnapshot frozen at join time
 *   [R9]  At most 1 active Delegate per team; Delegate excluded from R1 cap
 *   [R10] A Team Leader cannot be a member of another team or lead 2 teams
 */

import type {
  Location,
  Individual,
  Team,
  Achievement,
} from '../store/teamSlice'

// ─────────────────────────────────────────────
// LOCATIONS  [R4] — 10 offices across 4 regions
// ─────────────────────────────────────────────
export const mockLocations: Location[] = [
  { _id: 'loc_nyc_hq',      name: 'ACME Global HQ',         city: 'New York',  country: 'US',         region: 'NAM',   timezone: 'America/New_York' },
  { _id: 'loc_nyc_park',    name: 'ACME Park Avenue Office', city: 'New York',  country: 'US',         region: 'NAM',   timezone: 'America/New_York' },
  { _id: 'loc_miami_latam', name: 'ACME LATAM Hub',          city: 'Miami',     country: 'US',         region: 'LATAM', timezone: 'America/New_York' },
  { _id: 'loc_london_cw',   name: 'ACME EMEA HQ',            city: 'London',    country: 'UK',         region: 'EU',    timezone: 'Europe/London' },
  { _id: 'loc_dublin',      name: 'ACME Dublin Office',      city: 'Dublin',    country: 'Ireland',    region: 'EU',    timezone: 'Europe/Dublin' },
  { _id: 'loc_frankfurt',   name: 'ACME Frankfurt Office',   city: 'Frankfurt', country: 'Germany',    region: 'EU',    timezone: 'Europe/Berlin' },
  { _id: 'loc_hong_kong',   name: 'ACME Hong Kong HQ',       city: 'Hong Kong', country: 'HK',         region: 'APAC',  timezone: 'Asia/Hong_Kong' },
  { _id: 'loc_singapore',   name: 'ACME Singapore Hub',      city: 'Singapore', country: 'Singapore',  region: 'APAC',  timezone: 'Asia/Singapore' },
  { _id: 'loc_mumbai',      name: 'ACME India HQ',           city: 'Mumbai',    country: 'India',      region: 'APAC',  timezone: 'Asia/Kolkata' },
  { _id: 'loc_sydney',      name: 'ACME Australia Office',   city: 'Sydney',    country: 'Australia',  region: 'APAC',  timezone: 'Australia/Sydney' },
]

// ─────────────────────────────────────────────
// INDIVIDUALS — 20 people across all 4 roles
//
// person_001–004 : Senior leaders  (system_admin + viewer)
// person_101–105 : Team Leaders    (team_lead + editor)     [R10: each leads exactly one team]
// person_201–215 : Members/editors (editor or viewer)       [R3: some span multiple teams]
// ─────────────────────────────────────────────
export const mockIndividuals: Individual[] = [

  // ── Senior Leaders (system_admin) ─────────────────────────────
  {
    _id: 'person_001', personName: 'Robert Kane',     email: 'rkane@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'Chief Technology Officer',
    roles: ['system_admin', 'viewer'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2020-01-01', updatedAt: '2020-01-01',
  },
  {
    _id: 'person_002', personName: 'Sandra Liu',      email: 'sliu@acme.com',
    primaryLocation: 'loc_singapore', staffType: 'direct',
    jobTitle: 'Chief Operating Officer',
    roles: ['system_admin', 'viewer'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2020-01-01', updatedAt: '2020-01-01',
  },
  {
    _id: 'person_003', personName: 'Marcus Webb',     email: 'mwebb@acme.com',
    primaryLocation: 'loc_london_cw', staffType: 'direct',
    jobTitle: 'Division Head, Credit Card',
    roles: ['system_admin', 'viewer'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2020-01-01', updatedAt: '2020-01-01',
  },
  {
    _id: 'person_004', personName: 'Isabelle Morin',  email: 'imorin@acme.com',
    primaryLocation: 'loc_frankfurt', staffType: 'direct',
    jobTitle: 'Division Head, Private Banking',
    roles: ['system_admin', 'viewer'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2020-01-01', updatedAt: '2020-01-01',
  },

  // ── Team Leaders (team_lead + editor) ─────────────────────────
  // [R10] Each person below leads exactly one team and is NOT a member of any other.
  {
    // NOTE: Alice is in NYC but leads team_001 in Miami LATAM. Flags:
    // "leader not co-located" and "leader is non-direct".
    _id: 'person_101', personName: 'Alice Smith',     email: 'asmith@acme.com',
    primaryLocation: 'loc_nyc_hq', staffType: 'non-direct',
    jobTitle: 'Engineering Lead',
    roles: ['team_lead', 'editor'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2023-06-01', updatedAt: '2026-01-15',
  },
  {
    _id: 'person_102', personName: 'Brian Torres',    email: 'btorres@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'Infrastructure Lead',
    roles: ['team_lead', 'editor'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2023-01-15', updatedAt: '2023-01-15',
  },
  {
    _id: 'person_103', personName: 'Carmen Diaz',     email: 'cdiaz@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'BI and Analytics Lead',
    roles: ['team_lead', 'editor'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2023-03-01', updatedAt: '2023-03-01',
  },
  {
    _id: 'person_104', personName: 'Daniel Kim',      email: 'dkim@acme.com',
    primaryLocation: 'loc_singapore', staffType: 'direct',
    jobTitle: 'Wealth Tech Lead',
    roles: ['team_lead', 'editor'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2023-05-01', updatedAt: '2023-05-01',
  },
  {
    _id: 'person_105', personName: 'Eva Fischer',     email: 'efischer@acme.com',
    primaryLocation: 'loc_london_cw', staffType: 'direct',
    jobTitle: 'Credit Tech Lead',
    roles: ['team_lead', 'editor'],
    profilePicture: 'avatars/defaults/default_01.png',
    isDeleted: false, createdAt: '2023-07-01', updatedAt: '2023-07-01',
  },

  // ── Members (editor / viewer) ──────────────────────────────────
  // [R3] Those noted "also in teamX" appear in multiple teams.
  {
    _id: 'person_201', personName: 'David Park',      email: 'dpark@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'Senior Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2023-06-15', updatedAt: '2023-06-15',
  },
  {
    // non-direct — also in team_002 [R3]
    _id: 'person_202', personName: 'Elena Russo',     email: 'erusso@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'non-direct',
    jobTitle: 'Data Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2023-09-01', updatedAt: '2023-09-01',
  },
  {
    // also in team_003 [R3]
    _id: 'person_203', personName: 'Frank Osei',      email: 'fosei@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'Backend Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-01-10', updatedAt: '2024-01-10',
  },
  {
    // non-direct — also in team_004 [R3]
    _id: 'person_204', personName: 'Grace Yuen',      email: 'gyuen@acme.com',
    primaryLocation: 'loc_london_cw', staffType: 'non-direct',
    jobTitle: 'Credit Analyst',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-02-01', updatedAt: '2024-02-01',
  },
  {
    // also in team_002 [R3]
    _id: 'person_205', personName: 'Henry Blake',     email: 'hblake@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'Platform Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-04-15', updatedAt: '2024-04-15',
  },
  {
    _id: 'person_206', personName: 'Iris Nakamura',   email: 'inakamura@acme.com',
    primaryLocation: 'loc_singapore', staffType: 'direct',
    jobTitle: 'Wealth Systems Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2023-08-01', updatedAt: '2023-08-01',
  },
  {
    // non-direct viewer — also in team_004 [R3]
    _id: 'person_207', personName: 'James OBrien',    email: 'jobrien@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'non-direct',
    jobTitle: 'Data Analyst',
    roles: ['viewer'],
    isDeleted: false, createdAt: '2024-01-20', updatedAt: '2024-01-20',
  },
  {
    _id: 'person_208', personName: 'Karen Patel',     email: 'kpatel@acme.com',
    primaryLocation: 'loc_sydney', staffType: 'direct',
    jobTitle: 'Full Stack Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-03-01', updatedAt: '2024-03-01',
  },
  {
    // also in team_002 [R3]
    _id: 'person_209', personName: 'Luis Mendez',     email: 'lmendez@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'DevOps Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-02-15', updatedAt: '2024-02-15',
  },
  {
    // non-direct viewer — also in team_005 [R3]
    _id: 'person_210', personName: 'Maya Chen',       email: 'mchen@acme.com',
    primaryLocation: 'loc_frankfurt', staffType: 'non-direct',
    jobTitle: 'Risk Analyst',
    roles: ['viewer'],
    isDeleted: false, createdAt: '2024-03-10', updatedAt: '2024-03-10',
  },
  {
    _id: 'person_211', personName: 'Noah Williams',   email: 'nwilliams@acme.com',
    primaryLocation: 'loc_london_cw', staffType: 'direct',
    jobTitle: 'API Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-05-01', updatedAt: '2024-05-01',
  },
  {
    _id: 'person_212', personName: 'Olivia Santos',   email: 'osantos@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'direct',
    jobTitle: 'BI Developer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-06-01', updatedAt: '2024-06-01',
  },
  {
    // non-direct viewer — also in team_004 [R3]
    _id: 'person_213', personName: 'Pedro Alves',     email: 'palves@acme.com',
    primaryLocation: 'loc_miami_latam', staffType: 'non-direct',
    jobTitle: 'Data Analyst',
    roles: ['viewer'],
    isDeleted: false, createdAt: '2024-07-01', updatedAt: '2024-07-01',
  },
  {
    // also in team_005 [R3]; previously in team_002 (closed entry)
    _id: 'person_214', personName: 'Quinn Taylor',    email: 'qtaylor@acme.com',
    primaryLocation: 'loc_nyc_hq', staffType: 'direct',
    jobTitle: 'ML Engineer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-08-01', updatedAt: '2024-08-01',
  },
  {
    _id: 'person_215', personName: 'Rosa Martinez',   email: 'rmartinez@acme.com',
    primaryLocation: 'loc_singapore', staffType: 'direct',
    jobTitle: 'Quant Developer',
    roles: ['editor'],
    isDeleted: false, createdAt: '2024-09-01', updatedAt: '2024-09-01',
  },
]

// ─────────────────────────────────────────────
// TEAMS — 5 teams
//
// [R1] Active Member count (leader excluded) shown per team.
// [R2] Exactly 1 active Team Leader per team.
// [R3] Overlapping members noted inline.
// [R7] staffTypeSnapshot frozen at join time.
// [R10] Leader does not appear as a member on any other team.
// ─────────────────────────────────────────────
export const mockTeams: Team[] = [
  {
    _id: 'team_001',
    teamName: 'Data Platform',
    description: 'Owns the core data infrastructure and real-time pipelines.',
    primaryLocation: 'loc_miami_latam',
    members: [
      // [R2] 1 active leader — non-direct, not co-located → flags in reports
      { personId: 'person_101', personName: 'Alice Smith',   memberRole: 'Team Leader', staffTypeSnapshot: 'non-direct', startDate: '2024-01-01', endDate: null },
      { personId: 'person_201', personName: 'David Park',    memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-01-01', endDate: null }, // 1/5
      { personId: 'person_202', personName: 'Elena Russo',   memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-03-01', endDate: null }, // 2/5 — also team_002 [R3]
      { personId: 'person_205', personName: 'Henry Blake',   memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-04-15', endDate: null }, // 3/5 — also team_002 [R3]
      { personId: 'person_209', personName: 'Luis Mendez',   memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-06-01', endDate: null }, // 4/5 — also team_002 [R3]
      { personId: 'person_214', personName: 'Quinn Taylor',  memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-08-01', endDate: null }, // 5/5 MAX [R1] — also team_005 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: 'person_001', orgLeaderName: 'Robert Kane', startDate: '2024-01-01', endDate: null },
    ],
    teamHistory: [
      { eventType: 'team_created',  description: 'Team Data Platform created.',                             occurredAt: '2024-01-01' },
      { eventType: 'member_added',  description: 'Quinn Taylor (person_214) added as Member.',              occurredAt: '2024-08-01' },
    ],
    isDeleted: false, createdAt: '2024-01-01', updatedAt: '2026-03-01',
  },
  {
    _id: 'team_002',
    teamName: 'Core Infrastructure',
    description: 'Platform reliability, cloud infrastructure, and DR.',
    primaryLocation: 'loc_miami_latam',
    members: [
      // Leader co-located + direct — no flags in business reports
      { personId: 'person_102', personName: 'Brian Torres',  memberRole: 'Team Leader', staffTypeSnapshot: 'direct',     startDate: '2023-01-15', endDate: null },
      { personId: 'person_202', personName: 'Elena Russo',   memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2023-01-15', endDate: null }, // 1/4 active — also team_001 [R3]
      { personId: 'person_203', personName: 'Frank Osei',    memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2023-06-01', endDate: null }, // 2/4 active — also team_003 [R3]
      { personId: 'person_205', personName: 'Henry Blake',   memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-04-15', endDate: null }, // 3/4 active — also team_001 [R3]
      { personId: 'person_209', personName: 'Luis Mendez',   memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-06-01', endDate: null }, // 4/4 active — also team_001 [R3]
      // CLOSED entry [R5] — retained for audit, does NOT count toward R1 cap
      { personId: 'person_214', personName: 'Quinn Taylor',  memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2023-01-15', endDate: '2025-03-31' },
    ],
    reportingHistory: [
      { orgLeaderId: 'person_001', orgLeaderName: 'Robert Kane', startDate: '2023-01-15', endDate: '2025-12-31' },
      { orgLeaderId: 'person_001', orgLeaderName: 'Robert Kane', startDate: '2026-01-01', endDate: null },
    ],
    teamHistory: [
      { eventType: 'team_created',     description: 'Team Core Infrastructure created.',                          occurredAt: '2023-01-15' },
      { eventType: 'member_removed',   description: 'Quinn Taylor departed. endDate set to 2025-03-31.',         occurredAt: '2025-03-31' },
      { eventType: 'reporting_changed',description: 'Reporting line refreshed after 2026 global reorg.',         occurredAt: '2026-01-01' },
    ],
    isDeleted: false, createdAt: '2023-01-15', updatedAt: '2026-01-01',
  },
  {
    _id: 'team_003',
    teamName: 'Business Intelligence',
    description: 'Executive dashboards, data quality, and LATAM reporting.',
    primaryLocation: 'loc_miami_latam',
    members: [
      { personId: 'person_103', personName: 'Carmen Diaz',   memberRole: 'Team Leader', staffTypeSnapshot: 'direct',     startDate: '2023-03-01', endDate: null },
      { personId: 'person_203', personName: 'Frank Osei',    memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-01-10', endDate: null }, // 1/5 — also team_002 [R3]
      { personId: 'person_207', personName: 'James OBrien',  memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-01-20', endDate: null }, // 2/5 — also team_004 [R3]
      { personId: 'person_212', personName: 'Olivia Santos', memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-06-01', endDate: null }, // 3/5
      { personId: 'person_213', personName: 'Pedro Alves',   memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-07-01', endDate: null }, // 4/5 — also team_004 [R3]
      { personId: 'person_204', personName: 'Grace Yuen',    memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-09-01', endDate: null }, // 5/5 — also team_004 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: 'person_002', orgLeaderName: 'Sandra Liu', startDate: '2023-03-01', endDate: null },
    ],
    teamHistory: [
      { eventType: 'team_created', description: 'Team Business Intelligence created.',  occurredAt: '2023-03-01' },
      { eventType: 'member_added', description: 'Grace Yuen added as Member.',          occurredAt: '2024-09-01' },
    ],
    isDeleted: false, createdAt: '2023-03-01', updatedAt: '2024-09-01',
  },
  {
    _id: 'team_004',
    teamName: 'Credit Card Analytics',
    description: 'Fraud models, EU compliance reporting, and credit card ML.',
    primaryLocation: 'loc_london_cw',
    members: [
      { personId: 'person_105', personName: 'Eva Fischer',   memberRole: 'Team Leader', staffTypeSnapshot: 'direct',     startDate: '2023-07-01', endDate: null },
      { personId: 'person_204', personName: 'Grace Yuen',    memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-02-01', endDate: null }, // 1/5 — also team_003 [R3]
      { personId: 'person_210', personName: 'Maya Chen',     memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-03-10', endDate: null }, // 2/5 — also team_005 [R3]
      { personId: 'person_211', personName: 'Noah Williams', memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-05-01', endDate: null }, // 3/5
      { personId: 'person_207', personName: 'James OBrien',  memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-06-01', endDate: null }, // 4/5 — also team_003 [R3]
      { personId: 'person_213', personName: 'Pedro Alves',   memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-07-01', endDate: null }, // 5/5 — also team_003 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: 'person_003', orgLeaderName: 'Marcus Webb', startDate: '2023-07-01', endDate: null },
    ],
    teamHistory: [
      { eventType: 'team_created', description: 'Team Credit Card Analytics created.', occurredAt: '2023-07-01' },
      { eventType: 'member_added', description: 'Pedro Alves added as Member.',        occurredAt: '2024-07-01' },
    ],
    isDeleted: false, createdAt: '2023-07-01', updatedAt: '2024-07-01',
  },
  {
    _id: 'team_005',
    teamName: 'Digital Wealth Platform',
    description: 'Private banking mobile app and APAC market data integration.',
    primaryLocation: 'loc_singapore',
    members: [
      { personId: 'person_104', personName: 'Daniel Kim',    memberRole: 'Team Leader', staffTypeSnapshot: 'direct',     startDate: '2023-05-01', endDate: null },
      { personId: 'person_206', personName: 'Iris Nakamura', memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2023-08-01', endDate: null }, // 1/5
      { personId: 'person_208', personName: 'Karen Patel',   memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-03-01', endDate: null }, // 2/5
      { personId: 'person_210', personName: 'Maya Chen',     memberRole: 'Member',      staffTypeSnapshot: 'non-direct', startDate: '2024-03-10', endDate: null }, // 3/5 — also team_004 [R3]
      { personId: 'person_215', personName: 'Rosa Martinez', memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2024-09-01', endDate: null }, // 4/5
      { personId: 'person_214', personName: 'Quinn Taylor',  memberRole: 'Member',      staffTypeSnapshot: 'direct',     startDate: '2025-01-01', endDate: null }, // 5/5 — also team_001 [R3]
    ],
    reportingHistory: [
      { orgLeaderId: 'person_004', orgLeaderName: 'Isabelle Morin', startDate: '2023-05-01', endDate: null },
    ],
    teamHistory: [
      { eventType: 'team_created', description: 'Team Digital Wealth Platform created.',    occurredAt: '2023-05-01' },
      { eventType: 'member_added', description: 'Quinn Taylor added as Member.',            occurredAt: '2025-01-01' },
    ],
    isDeleted: false, createdAt: '2023-05-01', updatedAt: '2025-01-01',
  },
]

// ─────────────────────────────────────────────
// ACHIEVEMENTS — 10 records (2 per team)
// achievementMonth: YYYY-MM [R5] isDeleted: false
// ─────────────────────────────────────────────
export const mockAchievements: Achievement[] = [
  // ── team_001 ──────────────────────────────────────────────────
  {
    _id: 'ach_001', teamId: 'team_001', achievementMonth: '2026-03',
    title: 'Reduced query runtime by 35%',
    description: 'Rewrote finance reporting pipeline aggregation and added compound indexes.',
    impactMetric: '35% latency reduction — saves approx 4 hrs/week for the finance team',
    tags: ['performance', 'infrastructure'],
    contributors: [{ personId: 'person_101', personName: 'Alice Smith' }, { personId: 'person_201', personName: 'David Park' }],
    proofLink: 'https://jira.acme.com/DATA-441',
    createdBy: 'person_101', createdAt: '2026-03-28',
  },
  {
    _id: 'ach_002', teamId: 'team_001', achievementMonth: '2026-02',
    title: 'Launched real-time data pipeline v2',
    description: 'Migrated batch ETL to streaming architecture using Kafka.',
    impactMetric: 'Data freshness improved from 24h to under 5 minutes',
    tags: ['infrastructure', 'streaming'],
    contributors: [{ personId: 'person_201', personName: 'David Park' }, { personId: 'person_202', personName: 'Elena Russo' }],
    proofLink: 'https://confluence.acme.com/data-pipeline-v2',
    createdBy: 'person_101', createdAt: '2026-02-27',
  },
  // ── team_002 ──────────────────────────────────────────────────
  {
    _id: 'ach_003', teamId: 'team_002', achievementMonth: '2026-03',
    title: 'Zero-downtime DB cluster migration',
    description: 'Migrated production DocumentDB to new VPC with no service interruption.',
    impactMetric: '0 min downtime, 40% cost reduction post-migration',
    tags: ['infrastructure', 'aws', 'cost'],
    contributors: [{ personId: 'person_102', personName: 'Brian Torres' }, { personId: 'person_205', personName: 'Henry Blake' }],
    proofLink: 'https://jira.acme.com/INFRA-209',
    createdBy: 'person_102', createdAt: '2026-03-31',
  },
  {
    _id: 'ach_004', teamId: 'team_002', achievementMonth: '2026-02',
    title: 'Automated DR failover testing',
    description: 'Built automated runbook to test disaster recovery failover monthly.',
    impactMetric: 'RTO reduced from 4h to 22 minutes',
    tags: ['reliability', 'automation'],
    contributors: [{ personId: 'person_102', personName: 'Brian Torres' }, { personId: 'person_209', personName: 'Luis Mendez' }],
    createdBy: 'person_102', createdAt: '2026-02-26',
  },
  // ── team_003 ──────────────────────────────────────────────────
  {
    _id: 'ach_005', teamId: 'team_003', achievementMonth: '2026-03',
    title: 'Shipped executive dashboard v1',
    description: 'Delivered real-time KPI dashboard used by C-suite for monthly reviews.',
    impactMetric: 'Eliminated 3 manual reporting decks — saves 12 hrs/month',
    tags: ['product', 'analytics', 'launch'],
    contributors: [{ personId: 'person_103', personName: 'Carmen Diaz' }, { personId: 'person_212', personName: 'Olivia Santos' }],
    proofLink: 'https://confluence.acme.com/bi-dashboard-v1',
    createdBy: 'person_103', createdAt: '2026-03-29',
  },
  {
    _id: 'ach_006', teamId: 'team_003', achievementMonth: '2026-02',
    title: 'Completed LATAM data quality audit',
    description: 'Audited 14 upstream feeds across LATAM region and resolved 3 critical gaps.',
    impactMetric: 'Data completeness improved from 81% to 97%',
    tags: ['data-quality', 'latam'],
    contributors: [{ personId: 'person_207', personName: 'James OBrien' }, { personId: 'person_213', personName: 'Pedro Alves' }],
    createdBy: 'person_103', createdAt: '2026-02-25',
  },
  // ── team_004 ──────────────────────────────────────────────────
  {
    _id: 'ach_007', teamId: 'team_004', achievementMonth: '2026-03',
    title: 'Fraud detection model v3 deployed',
    description: 'Retrained fraud model with 18 months of new transaction data.',
    impactMetric: 'False positive rate down 22%, saving approx 1.2M/yr in manual reviews',
    tags: ['ml', 'fraud', 'credit-card'],
    contributors: [{ personId: 'person_105', personName: 'Eva Fischer' }, { personId: 'person_210', personName: 'Maya Chen' }, { personId: 'person_211', personName: 'Noah Williams' }],
    proofLink: 'https://jira.acme.com/CC-887',
    createdBy: 'person_105', createdAt: '2026-03-30',
  },
  {
    _id: 'ach_008', teamId: 'team_004', achievementMonth: '2026-02',
    title: 'EU regulatory reporting automated',
    description: 'Automated monthly PSD2 compliance reports for 6 EU jurisdictions.',
    impactMetric: '40 hrs/month of manual effort eliminated',
    tags: ['compliance', 'eu', 'automation'],
    contributors: [{ personId: 'person_204', personName: 'Grace Yuen' }, { personId: 'person_211', personName: 'Noah Williams' }],
    createdBy: 'person_105', createdAt: '2026-02-24',
  },
  // ── team_005 ──────────────────────────────────────────────────
  {
    _id: 'ach_009', teamId: 'team_005', achievementMonth: '2026-03',
    title: 'Launched client portfolio mobile view',
    description: 'Shipped responsive portfolio tracker for private banking mobile clients.',
    impactMetric: '28% increase in mobile app engagement in first 2 weeks',
    tags: ['product', 'mobile', 'private-banking'],
    contributors: [{ personId: 'person_104', personName: 'Daniel Kim' }, { personId: 'person_206', personName: 'Iris Nakamura' }, { personId: 'person_215', personName: 'Rosa Martinez' }],
    proofLink: 'https://jira.acme.com/WLT-334',
    createdBy: 'person_104', createdAt: '2026-03-27',
  },
  {
    _id: 'ach_010', teamId: 'team_005', achievementMonth: '2026-02',
    title: 'APAC market data feeds integrated',
    description: 'Connected 4 APAC exchange feeds into the unified wealth data layer.',
    impactMetric: 'Latency from exchange to UI reduced from 8s to 400ms',
    tags: ['infrastructure', 'apac', 'market-data'],
    contributors: [{ personId: 'person_208', personName: 'Karen Patel' }, { personId: 'person_214', personName: 'Quinn Taylor' }],
    createdBy: 'person_104', createdAt: '2026-02-22',
  },
]

// ─────────────────────────────────────────────
// MOCK AUTH USERS
//
// One user per role for easy switching during dev.
// To change persona, update authSlice initialState or
// dispatch setMockUser from a dev toolbar.
// ─────────────────────────────────────────────
export const mockAuthUsers = {
  /** system_admin — full access: all admin pages + all data */
  admin: {
    userId: 'person_001', username: 'Robert Kane',    email: 'rkane@acme.com',
    role: 'system_admin' as const, staffType: 'direct' as const, teamId: null,
  },
  /** team_lead — scoped to their own team (team_001 / Alice Smith) */
  teamLead: {
    userId: 'person_101', username: 'Alice Smith',    email: 'asmith@acme.com',
    role: 'team_lead' as const, staffType: 'non-direct' as const, teamId: 'team_001',
  },
  /** editor — reads + edits within their teams */
  editor: {
    userId: 'person_201', username: 'David Park',     email: 'dpark@acme.com',
    role: 'editor' as const, staffType: 'direct' as const, teamId: 'team_001',
  },
  /** viewer — read-only, no edit access anywhere */
  viewer: {
    userId: 'person_207', username: 'James OBrien',   email: 'jobrien@acme.com',
    role: 'viewer' as const, staffType: 'non-direct' as const, teamId: 'team_003',
  },
}
