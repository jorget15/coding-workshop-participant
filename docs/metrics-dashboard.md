# Metrics Dashboard — Implementation Instructions

> This file was written by a separate AI with full knowledge of the codebase. Follow it precisely.
> **Do not modify any existing file except the two additive wiring steps explicitly called out below.**

---

## 0. Install Recharts First

```bash
npm install recharts
```

Recharts 2.13+ is compatible with React 19 and ships its own TypeScript types. No `@types/recharts` needed.

---

## 1. Context — What Already Exists

Read these files before writing a single line:

| File | Why |
|------|-----|
| `frontend/src/store/teamSlice.ts` | All types (`Team`, `Individual`, `Location`, `Achievement`, `TeamMember`) and all thunks live here. Do not redefine any of these. |
| `frontend/src/pages/admin/AdminReports.tsx` | The existing reports page. The new dashboard **replaces** the text-based reports in this page with visual charts, but lives at a **new route** (`/admin/metrics`). Do not modify `AdminReports.tsx`. |
| `frontend/src/components/KPICard.tsx` | The existing card component. Use it for all number/stat cards — do not build a new one. Props: `label`, `value`, `sub?`, `onClick?`, `color?: 'default' | 'warning' | 'danger'`. |
| `frontend/src/components/Sidebar.tsx` | `ADMIN_LINKS` array drives the nav. You will add one entry here. |
| `frontend/src/App.tsx` | Route declarations. You will add one route here. |

### Critical type facts from `teamSlice.ts`

```ts
// Team — the field for location is primaryLocation (a locations._id string ref)
// NOT teamHomeLocation — that is the schema name; the backend serialises it as primaryLocation
interface Team {
  _id: string
  teamName: string
  primaryLocation: string           // ref to Location._id
  members: TeamMember[]
  reportingHistory: { orgLeaderId: string; orgLeaderName: string; startDate: string; endDate: string | null }[]
  isDeleted: boolean
}

// Individual — homeLocation is an EMBEDDED object, not a ref
// assignedOffice is an optional ref to Location._id (the office they sit at)
interface Individual {
  _id: string
  personName: string
  homeLocation: { city: string; country: string; region: string }
  assignedOffice?: string           // ref to Location._id — use this for co-location checks
  staffType: 'direct' | 'non-direct'
}

// TeamMember — embedded inside Team.members[]
interface TeamMember {
  personId: string
  personName: string
  memberRole: 'Team Leader' | 'Member' | 'Delegate'
  staffTypeSnapshot: 'direct' | 'non-direct'
  startDate: string
  endDate: string | null            // null = currently active
}

// Region enum (use these exact values — NOT 'EMEA')
type Region = 'NAM' | 'LATAM' | 'EU' | 'APAC'
```

### Active record filters

Always apply these before any computation:

```ts
const activeTeams   = teams.filter(t => !t.isDeleted)
const activeIndivs  = individuals.filter(i => !i.isDeleted)
const activeMembers = (team: Team) => team.members.filter(m => m.endDate === null)
const activeMembersOnly = (team: Team) =>            // excludes Leader + Delegate
  team.members.filter(m => m.endDate === null && m.memberRole === 'Member')
```

---

## 2. Two Wiring Steps in Existing Files

These are the **only** changes to existing files. Both are single additive lines.

### `frontend/src/App.tsx`

Add this route inside `AuthenticatedApp`, after the existing `/admin/reports` route:

```tsx
import AdminMetricsDashboard from './pages/admin/AdminMetricsDashboard'
// ...
<Route path="/admin/metrics" element={<AdminRoute><AdminMetricsDashboard /></AdminRoute>} />
```

### `frontend/src/components/Sidebar.tsx`

Add one entry to `ADMIN_LINKS`:

```ts
const ADMIN_LINKS: NavItem[] = [
  { label: 'Dashboard',    to: '/admin/dashboard' },
  { label: 'Teams',        to: '/admin/teams' },
  { label: 'Individuals',  to: '/admin/individuals' },
  { label: 'Achievements', to: '/admin/achievements' },
  { label: 'Locations',    to: '/admin/locations' },
  { label: 'Reports',      to: '/admin/reports' },
  { label: 'Metrics',      to: '/admin/metrics' },   // ← add this line
]
```

---

## 3. New Files to Create

```
frontend/src/
  hooks/
    useMetrics.ts                      ← all derived metric computations (shared hook)
  pages/admin/
    AdminMetricsDashboard.tsx          ← root page component
    AdminReportBuilder.tsx             ← PDF report builder page
  components/
    dashboard/
      DashboardSection.tsx             ← reusable section shell
      OverviewCards.tsx                ← 4 overview KPI cards
      HealthFlagCards.tsx              ← 5 health flag KPI cards
      MultiTeamMembersTable.tsx        ← plain table (no recharts)
      TeamContributionChart.tsx        ← per-team member contribution chart
      charts/
        VerticalBarChart.tsx           ← GENERIC vertical bar chart (Recharts wrapper)
        HorizontalBarChart.tsx         ← GENERIC horizontal bar chart (Recharts wrapper)
        TeamsbyRegionChart.tsx         ← thin wrapper → VerticalBarChart
        HeadcountByRegionChart.tsx     ← thin wrapper → VerticalBarChart
        TeamsPerOrgLeaderChart.tsx     ← thin wrapper → VerticalBarChart
        CoLocationRateChart.tsx        ← thin wrapper → HorizontalBarChart (color-coded cells)
        AchievementsPerTeamChart.tsx   ← thin wrapper → HorizontalBarChart
        DirectNonDirectDonut.tsx       ← PieChart donut (Recharts, unique shape — not a wrapper)
        AchievementsTrendChart.tsx     ← LineChart (Recharts, unique shape — not a wrapper)
        TopTagsChart.tsx               ← own full implementation (multi-color Cell + rotated labels — NOT a VerticalBarChart wrapper)
    report/
      ReportDocument.tsx               ← @react-pdf/renderer PDF document
```

### Why generic chart primitives

`VerticalBarChart` and `HorizontalBarChart` are the Recharts boilerplate wrappers. All bar chart
variants use one of these two primitives and pass config as props (`xKey`, `yKey`, `color`, `colorFn`,
`xDomain`, etc.). This avoids duplicating `ResponsiveContainer`, `CartesianGrid`, `Tooltip` setup
across every chart file.

`DirectNonDirectDonut` and `AchievementsTrendChart` are the only charts that use a fundamentally
different Recharts component (`PieChart` and `LineChart` respectively) and therefore have their own
full implementation.

---

## 4. `AdminMetricsDashboard.tsx` — The Root Page

This file owns all data fetching and every derived metric computation. Chart and card components receive **pre-computed data as props** — they do no computation themselves.

### Data fetching pattern

```tsx
import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import {
  fetchTeamsAsync, fetchIndividualsAsync,
  fetchLocationsAsync, fetchAchievementsAsync
} from '../../store/teamSlice'

export default function AdminMetricsDashboard() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, locations, achievements } = useSelector((s: RootState) => s.teams)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      dispatch(fetchTeamsAsync()),
      dispatch(fetchIndividualsAsync()),
      dispatch(fetchLocationsAsync()),
      dispatch(fetchAchievementsAsync(undefined)),
    ]).finally(() => setLoading(false))
  }, [dispatch])

  // ... all useMemo derivations below
```

Do **not** use `s.teams.loading` as the gate — it is shared across all pages and will flicker
when multiple thunks run. Use the local `loading` state from `Promise.all` instead.

### All metric computations

Wrap anything that iterates two arrays in `useMemo`. Simple counts can be plain `const`.

```ts
const activeTeams  = useMemo(() => teams.filter(t => !t.isDeleted), [teams])
const activeIndivs = useMemo(() => individuals.filter(i => !i.isDeleted), [individuals])

// ── Overview ──────────────────────────────────────────────────────────────

const teamsAtCapacity = useMemo(() =>
  activeTeams.filter(t =>
    t.members.filter(m => m.endDate === null && m.memberRole === 'Member').length === 5
  ).length, [activeTeams])

const achievementsThisMonth = useMemo(() => {
  const current = new Date().toISOString().slice(0, 7) // YYYY-MM
  return achievements.filter(a => a.achievementMonth === current).length
}, [achievements])

// ── Health flags ──────────────────────────────────────────────────────────

// Leaders not co-located: compare leader's assignedOffice against team.primaryLocation.
// Fall back to homeLocation.city vs location.city if assignedOffice is absent.
const leadersNotCoLocated = useMemo(() => {
  return activeTeams.filter(t => {
    const leaderMember = t.members.find(m => m.memberRole === 'Team Leader' && m.endDate === null)
    if (!leaderMember) return false
    const person = activeIndivs.find(p => p._id === leaderMember.personId)
    if (!person) return false
    if (person.assignedOffice) return person.assignedOffice !== t.primaryLocation
    const teamLoc = locations.find(l => l._id === t.primaryLocation)
    if (!teamLoc) return false
    return person.homeLocation.city.toLowerCase().trim() !== teamLoc.city.toLowerCase().trim()
  }).length
}, [activeTeams, activeIndivs, locations])

// Global member co-location rate (all active Members + Leaders across all teams)
const globalCoLocationRate = useMemo(() => {
  let total = 0, colocated = 0
  activeTeams.forEach(t => {
    const teamLoc = locations.find(l => l._id === t.primaryLocation)
    t.members.filter(m => m.endDate === null).forEach(m => {
      const person = activeIndivs.find(p => p._id === m.personId)
      if (!person || !teamLoc) { total++; return }
      total++
      const match = person.assignedOffice
        ? person.assignedOffice === t.primaryLocation
        : person.homeLocation.city.toLowerCase().trim() === teamLoc.city.toLowerCase().trim()
      if (match) colocated++
    })
  })
  return total > 0 ? Math.round((colocated / total) * 100) : 0
}, [activeTeams, activeIndivs, locations])

const nonDirectLeaders = useMemo(() =>
  activeTeams.filter(t =>
    t.members.some(m => m.memberRole === 'Team Leader' && m.endDate === null && m.staffTypeSnapshot === 'non-direct')
  ).length, [activeTeams])

const highNonDirectRatio = useMemo(() =>
  activeTeams.filter(t => {
    const members = t.members.filter(m => m.endDate === null && m.memberRole === 'Member')
    if (!members.length) return false
    return members.filter(m => m.staffTypeSnapshot === 'non-direct').length / members.length > 0.2
  }).length, [activeTeams])

const noReportingLine = useMemo(() =>
  activeTeams.filter(t => !t.reportingHistory.some(r => r.endDate === null)).length
, [activeTeams])

// ── Chart data ────────────────────────────────────────────────────────────

const teamsByRegion = useMemo(() => {
  const counts: Record<string, number> = { NAM: 0, LATAM: 0, EU: 0, APAC: 0 }
  activeTeams.forEach(t => {
    const loc = locations.find(l => l._id === t.primaryLocation)
    if (loc) counts[loc.region] = (counts[loc.region] ?? 0) + 1
  })
  return Object.entries(counts).map(([region, count]) => ({ region, count }))
}, [activeTeams, locations])

const headcountByRegion = useMemo(() => {
  const counts: Record<string, number> = {}
  activeIndivs.forEach(i => {
    const r = i.homeLocation.region
    counts[r] = (counts[r] ?? 0) + 1
  })
  return Object.entries(counts).map(([region, count]) => ({ region, count }))
}, [activeIndivs])

const directNonDirect = useMemo(() => {
  const direct    = activeIndivs.filter(i => i.staffType === 'direct').length
  const nonDirect = activeIndivs.filter(i => i.staffType === 'non-direct').length
  return [{ name: 'Direct', value: direct }, { name: 'Non-direct', value: nonDirect }]
}, [activeIndivs])

const coLocationPerTeam = useMemo(() =>
  activeTeams.map(t => {
    const teamLoc = locations.find(l => l._id === t.primaryLocation)
    const members = t.members.filter(m => m.endDate === null)
    if (!members.length || !teamLoc) return { teamName: t.teamName, rate: 0 }
    const colocated = members.filter(m => {
      const p = activeIndivs.find(i => i._id === m.personId)
      if (!p) return false
      return p.assignedOffice
        ? p.assignedOffice === t.primaryLocation
        : p.homeLocation.city.toLowerCase().trim() === teamLoc.city.toLowerCase().trim()
    }).length
    return { teamName: t.teamName, rate: Math.round((colocated / members.length) * 100) }
  }).sort((a, b) => b.rate - a.rate)
, [activeTeams, activeIndivs, locations])

const achievementsByMonth = useMemo(() => {
  const counts: Record<string, number> = {}
  achievements.forEach(a => { counts[a.achievementMonth] = (counts[a.achievementMonth] ?? 0) + 1 })
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)                          // last 12 months
    .map(([month, count]) => ({ month, count }))
}, [achievements])

const achievementsPerTeam = useMemo(() => {
  const counts: Record<string, number> = {}
  achievements.forEach(a => {
    const key = a.teamId ?? '__org__'
    counts[key] = (counts[key] ?? 0) + 1
  })
  return Object.entries(counts).map(([teamId, count]) => {
    const team = activeTeams.find(t => t._id === teamId)
    return { teamName: team?.teamName ?? (teamId === '__org__' ? 'Org-level' : teamId), count }
  }).sort((a, b) => b.count - a.count)
}, [achievements, activeTeams])

const topTags = useMemo(() => {
  const counts: Record<string, number> = {}
  achievements.forEach(a => a.tags?.forEach(tag => { counts[tag] = (counts[tag] ?? 0) + 1 }))
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([tag, count]) => ({ tag, count }))
}, [achievements])

const teamsPerOrgLeader = useMemo(() => {
  const counts: Record<string, { name: string; count: number }> = {}
  activeTeams.forEach(t => {
    const active = t.reportingHistory.find(r => r.endDate === null)
    if (!active) return
    if (!counts[active.orgLeaderId])
      counts[active.orgLeaderId] = { name: active.orgLeaderName, count: 0 }
    counts[active.orgLeaderId].count++
  })
  return Object.values(counts).sort((a, b) => b.count - a.count)
}, [activeTeams])

const multiTeamMembers = useMemo(() => {
  const map: Record<string, { name: string; teams: string[] }> = {}
  activeTeams.forEach(t => {
    t.members.filter(m => m.endDate === null).forEach(m => {
      if (!map[m.personId]) map[m.personId] = { name: m.personName, teams: [] }
      map[m.personId].teams.push(t.teamName)
    })
  })
  return Object.entries(map)
    .filter(([, v]) => v.teams.length > 1)
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.teams.length - a.teams.length)
}, [activeTeams])
```

### Page layout

Use `max-w-7xl` (wider than the existing `max-w-5xl` in `AdminReports`) so two-column chart grids have room.

```tsx
if (loading) return <p className="text-acme-muted text-sm p-6">Loading metrics…</p>

return (
  <div className="flex flex-col gap-8 max-w-7xl w-full">
    <h1 className="text-acme-heading text-2xl font-bold">Metrics</h1>

    <DashboardSection title="Overview">
      <OverviewCards
        totalTeams={activeTeams.length}
        totalIndividuals={activeIndivs.length}
        achievementsThisMonth={achievementsThisMonth}
        teamsAtCapacity={teamsAtCapacity}
      />
    </DashboardSection>

    <DashboardSection title="Team Health">
      <HealthFlagCards
        leadersNotCoLocated={leadersNotCoLocated}
        globalCoLocationRate={globalCoLocationRate}
        nonDirectLeaders={nonDirectLeaders}
        highNonDirectRatio={highNonDirectRatio}
        noReportingLine={noReportingLine}
        totalTeams={activeTeams.length}
      />
    </DashboardSection>

    <DashboardSection title="Distribution">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TeamsbyRegionChart data={teamsByRegion} />
        <HeadcountByRegionChart data={headcountByRegion} />
      </div>
    </DashboardSection>

    <DashboardSection title="Co-location">
      <CoLocationRateChart data={coLocationPerTeam} />
    </DashboardSection>

    <DashboardSection title="Staffing Mix">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        <DirectNonDirectDonut data={directNonDirect} />
      </div>
    </DashboardSection>

    <DashboardSection title="Achievements">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AchievementsTrendChart data={achievementsByMonth} />
        <AchievementsPerTeamChart data={achievementsPerTeam} />
      </div>
      <TopTagsChart data={topTags} />
    </DashboardSection>

    <DashboardSection title="Org Structure">
      <TeamsPerOrgLeaderChart data={teamsPerOrgLeader} />
    </DashboardSection>

    <DashboardSection title="Multi-Team Members">
      <MultiTeamMembersTable data={multiTeamMembers} />
    </DashboardSection>
  </div>
)
```

---

## 5. `DashboardSection.tsx`

Thin wrapper — consistent section title and card shell.

```tsx
interface Props {
  title: string
  children: React.ReactNode
  className?: string
}

export default function DashboardSection({ title, children, className = '' }: Props) {
  return (
    <section className={`bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-4 ${className}`}>
      <h2 className="text-acme-heading font-semibold text-lg">{title}</h2>
      {children}
    </section>
  )
}
```

---

## 6. `OverviewCards.tsx` and `HealthFlagCards.tsx`

Both use the existing `KPICard` component. Cards lay out in a responsive grid.

```tsx
// OverviewCards.tsx — 4 cards in a 2×2 → 4-col grid
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
  <KPICard label="Active Teams"        value={totalTeams} />
  <KPICard label="Individuals"         value={totalIndividuals} />
  <KPICard label="Achievements / Month" value={achievementsThisMonth} />
  <KPICard label="Teams at Capacity"   value={teamsAtCapacity}
           color={teamsAtCapacity > 0 ? 'warning' : 'default'} />
</div>
```

```tsx
// HealthFlagCards.tsx — 5 cards, 2→5-col responsive
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
  <KPICard label="Leaders Not Co-located" value={leadersNotCoLocated}
           color={leadersNotCoLocated > 0 ? 'warning' : 'default'} />
  <KPICard label="Global Co-location"     value={`${globalCoLocationRate}%`}
           color={globalCoLocationRate < 50 ? 'danger' : globalCoLocationRate < 75 ? 'warning' : 'default'} />
  <KPICard label="Non-direct Leaders"     value={nonDirectLeaders}
           color={nonDirectLeaders > 0 ? 'warning' : 'default'} />
  <KPICard label="> 20% Non-direct"       value={highNonDirectRatio}
           color={highNonDirectRatio > 0 ? 'warning' : 'default'} />
  <KPICard label="No Reporting Line"      value={noReportingLine}
           color={noReportingLine > 0 ? 'danger' : 'default'} />
</div>
```

---

## 7. Recharts — Rules for Every Chart Component

### Always wrap in `ResponsiveContainer`

```tsx
import { ResponsiveContainer, BarChart, ... } from 'recharts'

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    ...
  </BarChart>
</ResponsiveContainer>
```

This ensures charts fill their container width and respond to both mobile and desktop widths without hardcoded pixel dimensions.

### Tooltip styling (dark-mode safe)

```tsx
<Tooltip
  contentStyle={{
    backgroundColor: 'var(--color-acme-card)',
    border: '1px solid var(--color-acme-border)',
    borderRadius: '8px',
    fontSize: '12px',
  }}
/>
```

### Color palette — use these hex values to stay on-brand

| Use | Hex |
|-----|-----|
| Primary bar/line | `#0066CC` |
| Secondary | `#56B4E0` |
| Warning (amber) | `#d97706` |
| Danger (red) | `#CC0000` |
| Success (green) | `#16a34a` |
| Navy (direct) | `#003087` |

---

## 8. Chart Components

### Generic primitives — `VerticalBarChart` and `HorizontalBarChart`

All bar charts delegate to one of these two. They own all Recharts boilerplate
(`ResponsiveContainer`, `CartesianGrid`, `Tooltip`, axis config).

**`VerticalBarChart` props:** `data`, `xKey`, `yKey`, `title?`, `color?` (default `#0066CC`),
`colors?` (per-bar via `<Cell>`), `height?`, `emptyText?`

**`HorizontalBarChart` props:** `data`, `labelKey`, `valueKey`, `title?`, `color?`,
`colorFn?: (value, index) => string` (per-bar), `xDomain?`, `xTickFormat?`,
`tooltipFormat?`, `labelWidth?` (default `100`), `emptyText?`

These do NOT affect `useMetrics` or `AdminReportBuilder` — they only change JSX rendering.

---

### Thin wrappers (each ~10 lines)

| File | Primitive | Key config |
|------|-----------|------------|
| `TeamsbyRegionChart` | `VerticalBarChart` | `xKey="region"` `yKey="count"` `color="#0066CC"` |
| `HeadcountByRegionChart` | `VerticalBarChart` | same shape, `color="#56B4E0"` |
| `TeamsPerOrgLeaderChart` | `VerticalBarChart` | `xKey="name"` `yKey="count"` `color="#003087"` |
| `AchievementsPerTeamChart` | `HorizontalBarChart` | `labelKey="teamName"` `valueKey="count"` `color="#56B4E0"` `labelWidth={110}` |
| `CoLocationRateChart` | `HorizontalBarChart` | `xDomain={[0,100]}` `xTickFormat={v=>\`${v}%\`}` `colorFn={v => v>=75?'#16a34a':v>=50?'#d97706':'#CC0000'}` — also renders green/amber/red legend |
| `TopTagsChart` | **Own implementation** | `dataKey="tag"` / `dataKey="count"` — uses its own full Recharts `BarChart` with multi-color `Cell` cycling and rotated X-axis labels. Does NOT use `VerticalBarChart`. Props: `{ tag: string; count: number }[]` |

---

### Standalone charts (unique Recharts shape — not bar charts)

**`DirectNonDirectDonut`** — Recharts `PieChart`/`Pie`, colors `['#003087','#56B4E0']`,
`innerRadius={60}` `outerRadius={90}` `paddingAngle={4}`. Legend shows name + %. `height={260}`.

**`AchievementsTrendChart`** — Recharts `LineChart`/`Line`, stroke `#0066CC`,
`strokeWidth={2}`, `dot={{ r: 4 }}`. Last 12 months sorted ascending. `height={260}`.

---

### `MultiTeamMembersTable`

Plain HTML table — no Recharts. Columns: Name | Teams (comma-separated) | #.
`overflow-x-auto` wrapper is mandatory. `max-w-[200px] truncate` on the Teams `<td>`.

---

## 9. Responsive Design Requirements

The dashboard must look good on both mobile (≥ 320px) and desktop (≥ 1280px). Follow these rules throughout:

### Grid breakpoints

| Context | Mobile | Tablet (`sm`) | Desktop (`lg`) |
|---------|--------|---------------|----------------|
| Overview cards | `grid-cols-2` | — | `grid-cols-4` |
| Health flag cards | `grid-cols-2` | `grid-cols-3` | `grid-cols-5` |
| Side-by-side charts | `grid-cols-1` | — | `grid-cols-2` |
| Full-width charts | `grid-cols-1` | always full | always full |

### Chart height on mobile

Use a smaller height on mobile for charts that would otherwise feel cramped. Use `min-h-[200px]` on the `ResponsiveContainer` wrapper so Recharts always has a visible area even before layout settles:

```tsx
<div className="w-full min-h-[200px]">
  <ResponsiveContainer width="100%" height={300}>
    ...
  </ResponsiveContainer>
</div>
```

### Horizontal bar charts (co-location, achievements per team)

On narrow screens, team names on the Y-axis will truncate. Set `width={80}` on `YAxis` for mobile and consider adding a `title` attribute to the SVG text nodes via a custom tick renderer if names are long. An alternative is to show only the first word of the team name on mobile — implement a `formatLabel` helper that truncates beyond 10 characters.

### Table on mobile

`overflow-x-auto` on the table wrapper is mandatory. The `MultiTeamMembersTable` team names column can get long — truncate with `max-w-[180px] truncate` on that `<td>`.

### Page max-width

Keep `max-w-7xl` with `w-full` on the root `<div>` in the page. On small screens `max-w-7xl` has no effect (viewport is narrower) — that is fine.

---

## 10. Implementation Order

1. Install recharts
2. `DashboardSection.tsx`
3. `OverviewCards.tsx`, `HealthFlagCards.tsx`
4. All 8 chart components + `MultiTeamMembersTable.tsx` (each is fully self-contained)
5. `AdminMetricsDashboard.tsx` (assembles all of the above)
6. Add the route line to `App.tsx`
7. Add the nav link to `Sidebar.tsx`

---

## 11. Things to Watch Out For

- **`s.teams.loading` flickers** — always gate the page on the local `Promise.all` state, not the Redux `loading` flag.
- **`teamId: null` achievements** — bucket these under `"Org-level"` in the achievements-per-team chart, never try to join them.
- **Region values** — the codebase uses `'EU'` not `'EMEA'`. Do not hardcode `'EMEA'` anywhere.
- **Co-location fallback** — prefer `individual.assignedOffice === team.primaryLocation`. Only fall back to `homeLocation.city` comparison when `assignedOffice` is absent. Normalize city strings with `.toLowerCase().trim()` before comparing.
- **Empty data states** — every chart must handle an empty `data` array gracefully (show `<p className="text-acme-muted text-sm">No data.</p>` rather than rendering an empty Recharts canvas).
- **Dark mode** — use CSS variable references (`var(--color-acme-border)`) inside Recharts props rather than hardcoded hex values for structural elements like grid lines and tooltip backgrounds.

---

## 12. PDF Report Builder

### Install

```bash
npm install @react-pdf/renderer
```

`@react-pdf/renderer` 3.x is compatible with React 19 and ships its own TypeScript types. No `@types/` package needed.

### New file

```
frontend/src/
  pages/admin/
    AdminReportBuilder.tsx              ← report builder page
  components/report/
    ReportDocument.tsx                  ← @react-pdf/renderer document
    ReportChartImage.tsx                ← helper: Recharts SVG → base64 PNG
```

Add a route and nav link using the same pattern as the metrics dashboard:

**`App.tsx`** (one new additive line):
```tsx
import AdminReportBuilder from './pages/admin/AdminReportBuilder'
// ...
<Route path="/admin/report-builder" element={<AdminRoute><AdminReportBuilder /></AdminRoute>} />
```

**`Sidebar.tsx`** (one new entry in `ADMIN_LINKS`):
```ts
{ label: 'Report Builder', to: '/admin/report-builder' },
```

---

### How it works

1. **`AdminReportBuilder.tsx`** — the config UI. User picks teams and sections, then clicks "Download PDF".
2. **`ReportDocument.tsx`** — a `@react-pdf/renderer` `<Document>` that receives the config and pre-rendered chart images as props and lays them out as PDF pages.
3. **`ReportChartImage.tsx`** — a hidden off-screen component that renders a Recharts chart to an `<svg>`, serialises it to a base64 PNG using `canvas.toDataURL`, and passes the result up via a callback. This bridges Recharts (DOM) and `@react-pdf/renderer` (PDF canvas).

---

### `AdminReportBuilder.tsx`

```tsx
import { useState, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { pdf } from '@react-pdf/renderer'
import type { RootState } from '../../store'
import ReportDocument from '../../components/report/ReportDocument'
// import all the same useMemo computations from AdminMetricsDashboard —
// extract them into a shared hook `useMetrics()` so both pages can import them

const SECTIONS = [
  { id: 'overview',      label: 'Overview Cards' },
  { id: 'health',        label: 'Team Health Flags' },
  { id: 'distribution',  label: 'Teams & Headcount by Region' },
  { id: 'colocation',    label: 'Co-location Rate per Team' },
  { id: 'staffing',      label: 'Direct vs Non-direct' },
  { id: 'achievements',  label: 'Achievements Trend & Per Team' },
  { id: 'tags',          label: 'Top Achievement Tags' },
  { id: 'orgleaders',    label: 'Teams per Org Leader' },
  { id: 'multiteam',     label: 'Multi-team Members' },
] as const

type SectionId = typeof SECTIONS[number]['id']

export default function AdminReportBuilder() {
  const { teams, individuals, locations, achievements } = useSelector((s: RootState) => s.teams)

  // Reuse the same metric computations — extract useMetrics() hook (see below)
  const metrics = useMetrics({ teams, individuals, locations, achievements })

  const [selectedTeams, setSelectedTeams] = useState<string[]>([])   // empty = all teams
  const [sections, setSections] = useState<Set<SectionId>>(
    new Set(SECTIONS.map(s => s.id))                                  // all on by default
  )
  const [generating, setGenerating] = useState(false)

  const toggleSection = (id: SectionId) =>
    setSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleDownload = useCallback(async () => {
    setGenerating(true)
    try {
      const blob = await pdf(
        <ReportDocument
          metrics={metrics}
          selectedTeams={selectedTeams}
          sections={sections}
        />
      ).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `acme-report-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(false)
    }
  }, [metrics, selectedTeams, sections])

  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full">
      <h1 className="text-acme-heading text-2xl font-bold">Report Builder</h1>

      {/* Team filter */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Teams</h2>
        <p className="text-acme-muted text-sm">Leave all unchecked to include data for all teams.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {metrics.activeTeams.map(t => (
            <label key={t._id} className="flex items-center gap-2 text-sm text-acme-text cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTeams.includes(t._id)}
                onChange={() =>
                  setSelectedTeams(prev =>
                    prev.includes(t._id) ? prev.filter(id => id !== t._id) : [...prev, t._id]
                  )
                }
              />
              {t.teamName}
            </label>
          ))}
        </div>
      </section>

      {/* Section picker */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Sections</h2>
        <div className="flex flex-col gap-2">
          {SECTIONS.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-sm text-acme-text cursor-pointer">
              <input
                type="checkbox"
                checked={sections.has(s.id)}
                onChange={() => toggleSection(s.id)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </section>

      <button
        onClick={handleDownload}
        disabled={generating || sections.size === 0}
        className="self-start px-5 py-2.5 rounded-lg bg-acme-action text-white text-sm font-medium
                   disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
      >
        {generating ? 'Generating…' : 'Download PDF'}
      </button>
    </div>
  )
}
```

---

### Extract `useMetrics()` hook

Both `AdminMetricsDashboard` and `AdminReportBuilder` need the same derived data. Move all `useMemo` computations from section 4 of this document into a shared hook:

```
frontend/src/hooks/useMetrics.ts
```

```ts
import { useMemo } from 'react'
import type { Team, Individual, Location, Achievement } from '../store/teamSlice'

export function useMetrics({
  teams, individuals, locations, achievements,
}: {
  teams: Team[]
  individuals: Individual[]
  locations: Location[]
  achievements: Achievement[]
}) {
  // paste every useMemo block from AdminMetricsDashboard here
  // return all derived values as a single object
  return {
    activeTeams,
    activeIndivs,
    teamsAtCapacity,
    achievementsThisMonth,
    leadersNotCoLocated,
    globalCoLocationRate,
    nonDirectLeaders,
    highNonDirectRatio,
    noReportingLine,
    teamsByRegion,
    headcountByRegion,
    directNonDirect,
    coLocationPerTeam,
    achievementsByMonth,
    achievementsPerTeam,
    topTags,
    teamsPerOrgLeader,
    multiTeamMembers,
  }
}
```

Update `AdminMetricsDashboard` to `const metrics = useMetrics(...)` and destructure. No logic changes — just extraction.

---

### `ReportDocument.tsx`

`@react-pdf/renderer` uses its own layout primitives — **not** HTML or Tailwind. Use only `Document`, `Page`, `View`, `Text`, `Image`, `StyleSheet` from the library.

```tsx
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page:    { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a2e' },
  h1:      { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  h2:      { fontSize: 13, fontWeight: 'bold', marginBottom: 8, marginTop: 16 },
  row:     { flexDirection: 'row', gap: 8, marginBottom: 8 },
  card:    { flex: 1, border: '1pt solid #e2e8f0', borderRadius: 6, padding: 8 },
  cardVal: { fontSize: 20, fontWeight: 'bold', color: '#0066CC', marginBottom: 2 },
  muted:   { color: '#64748b' },
  table:   { marginTop: 4 },
  th:      { fontWeight: 'bold', borderBottom: '1pt solid #e2e8f0', paddingBottom: 4, marginBottom 4 },
  tr:      { flexDirection: 'row', paddingVertical: 3, borderBottom: '0.5pt solid #f1f5f9' },
  td:      { flex: 1 },
})

interface Props {
  metrics: ReturnType<typeof useMetrics>
  selectedTeams: string[]
  sections: Set<string>
}

export default function ReportDocument({ metrics, selectedTeams, sections }: Props) {
  // If selectedTeams is non-empty, filter activeTeams data down to the selection
  const teams = selectedTeams.length
    ? metrics.activeTeams.filter(t => selectedTeams.includes(t._id))
    : metrics.activeTeams

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>ACME Team Management — Report</Text>
        <Text style={styles.muted}>
          Generated {new Date().toLocaleDateString()} · {teams.length} team{teams.length !== 1 ? 's' : ''}
        </Text>

        {sections.has('overview') && (
          <>
            <Text style={styles.h2}>Overview</Text>
            <View style={styles.row}>
              <MetricCard label="Active Teams"     value={teams.length} />
              <MetricCard label="Individuals"      value={metrics.activeIndivs.length} />
              <MetricCard label="Achievements / Mo" value={metrics.achievementsThisMonth} />
              <MetricCard label="At Capacity"      value={metrics.teamsAtCapacity} />
            </View>
          </>
        )}

        {sections.has('health') && (
          <>
            <Text style={styles.h2}>Team Health</Text>
            <View style={styles.row}>
              <MetricCard label="Leaders Not Co-located" value={metrics.leadersNotCoLocated} />
              <MetricCard label="Co-location Rate"       value={`${metrics.globalCoLocationRate}%`} />
              <MetricCard label="Non-direct Leaders"     value={metrics.nonDirectLeaders} />
              <MetricCard label="> 20% Non-direct"       value={metrics.highNonDirectRatio} />
              <MetricCard label="No Reporting Line"      value={metrics.noReportingLine} />
            </View>
          </>
        )}

        {sections.has('multiteam') && metrics.multiTeamMembers.length > 0 && (
          <>
            <Text style={styles.h2}>Multi-team Members</Text>
            <View style={styles.table}>
              <View style={[styles.tr, styles.th]}>
                <Text style={[styles.td, { flex: 2 }]}>Name</Text>
                <Text style={styles.td}>Teams</Text>
                <Text style={[styles.td, { flex: 3 }]}>Team Names</Text>
              </View>
              {metrics.multiTeamMembers.map(row => (
                <View key={row.id} style={styles.tr}>
                  <Text style={[styles.td, { flex: 2 }]}>{row.name}</Text>
                  <Text style={styles.td}>{row.teams.length}</Text>
                  <Text style={[styles.td, { flex: 3 }]}>{row.teams.join(', ')}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Charts: pass as <Image src={chartImageBase64} /> — see ReportChartImage below */}
      </Page>
    </Document>
  )
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardVal}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  )
}
```

---

### Chart images in the PDF

`@react-pdf/renderer` cannot render Recharts components directly — it needs a PNG or SVG data URL. Use this approach:

1. In `AdminReportBuilder`, render each chart off-screen (opacity-0, position absolute, pointer-events-none) inside a `<div ref={chartRef}>`.
2. Use `html2canvas(chartRef.current)` to snapshot it.
3. Pass `canvas.toDataURL('image/png')` into `ReportDocument` as an `images` prop.
4. Inside `ReportDocument`, render `<Image src={images.coLocation} style={{ width: '100%', marginTop: 8 }} />`.

Install `html2canvas` for this step:

```bash
npm install html2canvas
```

Only snapshot charts for sections the user has selected. Skip the off-screen render for deselected sections to keep generation fast.

---

### Watch-outs for the report builder

- **`@react-pdf/renderer` runs in a web worker** — do not reference DOM APIs (`window`, `document`) inside `ReportDocument`. All data must be passed as plain props.
- **Tailwind classes do not work** inside `@react-pdf/renderer` components — use `StyleSheet.create` only.
- **Font rendering** — the default `Helvetica` is safe. If you want a custom font, register it with `Font.register()` before rendering.
- **Chart snapshots are async** — collect all `html2canvas` promises with `Promise.all` before calling `pdf(...).toBlob()`. Gate the download button until all images are ready.
- **Team filter propagation** — when `selectedTeams` is non-empty, filter the chart data passed to `ReportDocument` (e.g. `coLocationPerTeam`, `achievementsPerTeam`) before passing it in, not inside the document component.

---

## 13. Team Member Contribution Chart

### What it shows

A horizontal bar chart — one bar per team member — showing what percentage of the team's achievements (within a selected month) that person contributed to. Lets a team lead immediately see who is driving team output and who isn't appearing in achievement records.

### Access rules

- **`team_lead`** role: sees this chart only for their own team(s). Scope to teams where `individual.roles.includes('team_lead')` AND the individual has an active `'Team Leader'` entry in that team's `members[]`.
- **`system_admin`** role: sees it for any team via a team selector dropdown.

### Where it lives

1. **Team detail page** — always scoped to the team being viewed. Rendered as a new section at the bottom of the existing team detail page.
2. **Metrics dashboard** — add a new `DashboardSection` titled "Member Contributions" containing a team selector (admins see all teams, leads see only their teams) followed by the same chart component.

### New file

```
frontend/src/components/dashboard/
  TeamContributionChart.tsx       ← the chart + month picker, self-contained
```

No new page needed — it's a component dropped into two existing locations.

---

### Data model facts to keep in mind

```ts
// TeamMember (embedded in Team.members[])
{
  personId:  string
  personName: string
  memberRole: 'Team Leader' | 'Member' | 'Delegate'
  startDate:  string   // ISO date — when they joined this team
  endDate:    string | null  // null = currently active; set = departed
}

// Achievement
{
  teamId:         string | null   // null = org-level; filter these out
  achievementMonth: string        // YYYY-MM
  contributors:   { personId: string; personName: string }[]
}
```

---

### Computation logic

```ts
// selectedMonth: string — YYYY-MM, e.g. "2026-04"

// 1. Achievements pool — team achievements for the selected month only
const pool = achievements.filter(
  a => a.teamId === team._id && a.achievementMonth === selectedMonth
)

// 2. Member roster — everyone who was active on the team during the selected month
//    startDate <= last day of month  AND  (endDate === null OR endDate >= first day of month)
const [year, month] = selectedMonth.split('-').map(Number)
const windowStart = `${selectedMonth}-01`
const windowEnd   = new Date(year, month, 0).toISOString().slice(0, 10) // last day of month

const roster = team.members.filter(m =>
  m.startDate <= windowEnd &&
  (m.endDate === null || m.endDate >= windowStart)
)

// 3. Per-member rate
const data = roster.map(m => {
  const contributed = pool.filter(a =>
    a.contributors.some(c => c.personId === m.personId)
  ).length
  return {
    personName: m.personName,
    memberRole: m.memberRole,
    rate: pool.length > 0 ? Math.round((contributed / pool.length) * 100) : 0,
    contributed,
    total: pool.length,
  }
}).sort((a, b) => b.rate - a.rate)
```

**Key rule:** the denominator is always `pool.length` (total achievements that month for the team) — not the number of achievements the person *could have* been on. Everyone in the roster is compared against the same denominator, making percentages directly comparable.

---

### `TeamContributionChart.tsx`

```tsx
import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell,
} from 'recharts'
import type { Team, Achievement } from '../../store/teamSlice'

interface Props {
  team: Team
  achievements: Achievement[]
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

export default function TeamContributionChart({ team, achievements }: Props) {
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)

  const { data, poolSize } = useMemo(() => {
    const pool = achievements.filter(
      a => a.teamId === team._id && a.achievementMonth === selectedMonth
    )

    const [year, month] = selectedMonth.split('-').map(Number)
    const windowStart = `${selectedMonth}-01`
    const windowEnd   = new Date(year, month, 0).toISOString().slice(0, 10)

    const roster = team.members.filter(m =>
      m.startDate <= windowEnd &&
      (m.endDate === null || m.endDate >= windowStart)
    )

    const rows = roster.map(m => {
      const contributed = pool.filter(a =>
        a.contributors.some(c => c.personId === m.personId)
      ).length
      return {
        personName: m.personName,
        memberRole: m.memberRole,
        rate: pool.length > 0 ? Math.round((contributed / pool.length) * 100) : 0,
        contributed,
      }
    }).sort((a, b) => b.rate - a.rate)

    return { data: rows, poolSize: pool.length }
  }, [team, achievements, selectedMonth])

  return (
    <div className="flex flex-col gap-4">
      {/* Month picker */}
      <div className="flex items-center gap-3">
        <label className="text-acme-muted text-sm font-medium">Month</label>
        <input
          type="month"
          value={selectedMonth}
          max={currentMonth()}
          onChange={e => setSelectedMonth(e.target.value)}
          className="text-sm border border-acme-border rounded-lg px-3 py-1.5
                     bg-acme-card text-acme-text focus:outline-none focus:ring-2
                     focus:ring-acme-action"
        />
        <span className="text-acme-muted text-sm">
          {poolSize} achievement{poolSize !== 1 ? 's' : ''} this month
        </span>
      </div>

      {/* Empty states */}
      {poolSize === 0 && (
        <p className="text-acme-muted text-sm">No achievements recorded for this period.</p>
      )}
      {poolSize > 0 && data.length === 0 && (
        <p className="text-acme-muted text-sm">No members were active during this period.</p>
      )}

      {/* Chart */}
      {poolSize > 0 && data.length > 0 && (
        <div className="w-full min-h-[200px]">
          <ResponsiveContainer width="100%" height={Math.max(200, data.length * 48)}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 48, left: 120, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-acme-border)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={v => `${v}%`}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                dataKey="personName"
                type="category"
                tick={{ fontSize: 12 }}
                width={115}
                tickFormatter={name => name.length > 18 ? name.slice(0, 17) + '…' : name}
              />
              <Tooltip
                formatter={(value: number, _: string, entry: any) =>
                  [`${value}% (${entry.payload.contributed}/${poolSize} achievements)`, 'Contribution']
                }
                contentStyle={{
                  backgroundColor: 'var(--color-acme-card)',
                  border: '1px solid var(--color-acme-border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.memberRole === 'Team Leader' ? '#003087'
                      : entry.rate >= 60 ? '#16a34a'
                      : entry.rate >= 30 ? '#0066CC'
                      : '#d97706'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend */}
      {data.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-acme-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#003087' }} />
            Team Leader
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} />
            ≥ 60%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#0066CC' }} />
            30–59%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#d97706' }} />
            &lt; 30%
          </span>
        </div>
      )}
    </div>
  )
}
```

---

### Dropping it into the team detail page

Find the existing team detail page component. At the bottom, add:

```tsx
import TeamContributionChart from '../../components/dashboard/TeamContributionChart'

// inside the JSX, after the members list section:
<section className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-4">
  <h2 className="text-acme-heading font-semibold text-lg">Member Contributions</h2>
  <TeamContributionChart team={team} achievements={achievements} />
</section>
```

The team detail page already has `team` in scope. Make sure `achievements` are fetched — if they aren't already, dispatch `fetchAchievementsAsync(team._id)` in the page's `useEffect`.

---

### Dropping it into the metrics dashboard

Add a new `DashboardSection` in `AdminMetricsDashboard.tsx` after the existing "Achievements" section:

```tsx
// New state in AdminMetricsDashboard:
const [contributionTeamId, setContributionTeamId] = useState<string>(
  activeTeams[0]?._id ?? ''
)
const contributionTeam = activeTeams.find(t => t._id === contributionTeamId)

// In JSX:
<DashboardSection title="Member Contributions">
  {/* Team selector — admins see all teams; leads filtered by their own */}
  <select
    value={contributionTeamId}
    onChange={e => setContributionTeamId(e.target.value)}
    className="text-sm border border-acme-border rounded-lg px-3 py-1.5
               bg-acme-card text-acme-text focus:outline-none focus:ring-2
               focus:ring-acme-action w-full sm:w-auto"
  >
    {activeTeams.map(t => (
      <option key={t._id} value={t._id}>{t.teamName}</option>
    ))}
  </select>

  {contributionTeam && (
    <TeamContributionChart team={contributionTeam} achievements={achievements} />
  )}
</DashboardSection>
```

**Access control note:** the `activeTeams` list fed into the selector must already be filtered by role before reaching this component. If the logged-in user is a `team_lead` (not `system_admin`), filter `activeTeams` to only teams where that user is an active Team Leader. This filtering belongs in `AdminMetricsDashboard`, not inside `TeamContributionChart`.

---

### Watch-outs for this chart

- **`achievementMonth` is YYYY-MM, `startDate`/`endDate` are ISO date strings (YYYY-MM-DD)** — the window comparison uses `YYYY-MM-01` and the last day of the month for the date boundary. Do not compare month strings directly against date strings.
- **Departed members with contributions** — because the roster is built from `team.members[]` (not `activeIndivs`), departed members (endDate set) who were present during the window correctly appear in the chart. Their contributions are not lost.
- **Bar height scales with roster size** — use `height={Math.max(200, data.length * 48)}` inside `ResponsiveContainer` so the chart grows with the number of members rather than squashing bars together.
- **`pool.length === 0` guard** — always check before dividing. Show the "No achievements" empty state rather than a chart of all-zero bars.
- **Role-based team selector** — `system_admin` users see all active teams in the dropdown. `team_lead` users must only see teams where they hold an active `'Team Leader'` role. Enforce this in the parent, not in `TeamContributionChart`.
