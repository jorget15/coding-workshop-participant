import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import {
  fetchTeamsAsync, fetchIndividualsAsync,
  fetchLocationsAsync, fetchAchievementsAsync,
} from '../../store/teamSlice'
import { useMetrics } from '../../hooks/useMetrics'

import DashboardSection         from '../../components/dashboard/DashboardSection'
import OverviewCards            from '../../components/dashboard/OverviewCards'
import HealthFlagCards          from '../../components/dashboard/HealthFlagCards'
import MultiTeamMembersTable    from '../../components/dashboard/MultiTeamMembersTable'
import TeamContributionChart    from '../../components/dashboard/TeamContributionChart'
import TeamsbyRegionChart       from '../../components/dashboard/charts/TeamsbyRegionChart'
import HeadcountByRegionChart   from '../../components/dashboard/charts/HeadcountByRegionChart'
import CoLocationRateChart      from '../../components/dashboard/charts/CoLocationRateChart'
import DirectNonDirectDonut     from '../../components/dashboard/charts/DirectNonDirectDonut'
import AchievementsTrendChart   from '../../components/dashboard/charts/AchievementsTrendChart'
import AchievementsPerTeamChart from '../../components/dashboard/charts/AchievementsPerTeamChart'
import TopTagsChart             from '../../components/dashboard/charts/TopTagsChart'
import TeamsPerOrgLeaderChart   from '../../components/dashboard/charts/TeamsPerOrgLeaderChart'

export default function AdminMetricsDashboard() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, locations, achievements } = useSelector((s: RootState) => s.teams)
  const { role, teamId: authTeamId } = useSelector((s: RootState) => s.auth)
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

  const metrics = useMetrics({ teams, individuals, locations, achievements })

  // Admins see all teams in the contribution selector; leads see only their own
  const visibleTeams = role === 'system_admin'
    ? metrics.activeTeams
    : metrics.activeTeams.filter(t => t._id === authTeamId)

  const [contributionTeamId, setContributionTeamId] = useState<string>('')

  // Set default once teams load
  useEffect(() => {
    if (!contributionTeamId && visibleTeams.length > 0) {
      setContributionTeamId(visibleTeams[0]._id)
    }
  }, [visibleTeams, contributionTeamId])

  const contributionTeam = visibleTeams.find(t => t._id === contributionTeamId)

  if (loading) {
    return <p className="text-acme-muted text-sm p-6">Loading metrics…</p>
  }

  return (
    <div className="flex flex-col gap-8 max-w-7xl w-full">
      <h1 className="text-acme-heading text-2xl font-bold">Metrics</h1>

      {/* ── Overview ── */}
      <DashboardSection title="Overview">
        <OverviewCards
          totalTeams={metrics.activeTeams.length}
          totalIndividuals={metrics.activeIndivs.length}
          achievementsThisMonth={metrics.achievementsThisMonth}
          teamsAtCapacity={metrics.teamsAtCapacity}
        />
      </DashboardSection>

      {/* ── Team Health ── */}
      <DashboardSection title="Team Health">
        <HealthFlagCards
          leadersNotCoLocated={metrics.leadersNotCoLocated}
          globalCoLocationRate={metrics.globalCoLocationRate}
          nonDirectLeaders={metrics.nonDirectLeaders}
          highNonDirectRatio={metrics.highNonDirectRatio}
          noReportingLine={metrics.noReportingLine}
        />
      </DashboardSection>

      {/* ── Distribution ── */}
      <DashboardSection title="Distribution">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamsbyRegionChart   data={metrics.teamsByRegion} />
          <HeadcountByRegionChart data={metrics.headcountByRegion} />
        </div>
      </DashboardSection>

      {/* ── Co-location ── */}
      <DashboardSection title="Co-location">
        <CoLocationRateChart data={metrics.coLocationPerTeam} />
      </DashboardSection>

      {/* ── Staffing Mix ── */}
      <DashboardSection title="Staffing Mix">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <DirectNonDirectDonut data={metrics.directNonDirect} />
        </div>
      </DashboardSection>

      {/* ── Achievements ── */}
      <DashboardSection title="Achievements">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AchievementsTrendChart   data={metrics.achievementsByMonth} />
          <AchievementsPerTeamChart data={metrics.achievementsPerTeam} />
        </div>
        <TopTagsChart data={metrics.topTags} />
      </DashboardSection>

      {/* ── Org Structure ── */}
      <DashboardSection title="Org Structure">
        <TeamsPerOrgLeaderChart data={metrics.teamsPerOrgLeader} />
      </DashboardSection>

      {/* ── Multi-team Members ── */}
      <DashboardSection title="Multi-team Members">
        <MultiTeamMembersTable data={metrics.multiTeamMembers} />
      </DashboardSection>

      {/* ── Member Contributions ── */}
      <DashboardSection title="Member Contributions">
        {visibleTeams.length > 1 && (
          <select
            value={contributionTeamId}
            onChange={e => setContributionTeamId(e.target.value)}
            className="text-sm border border-acme-border rounded-lg px-3 py-1.5
                       bg-acme-card text-acme-text focus:outline-none focus:ring-2
                       focus:ring-acme-action w-full sm:w-auto"
          >
            {visibleTeams.map(t => (
              <option key={t._id} value={t._id}>{t.teamName}</option>
            ))}
          </select>
        )}
        {contributionTeam
          ? <TeamContributionChart team={contributionTeam} achievements={achievements} />
          : <p className="text-acme-muted text-sm">No teams available.</p>
        }
      </DashboardSection>
    </div>
  )
}
