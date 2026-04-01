import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchIndividualsAsync, fetchAchievementsAsync } from '../../store/teamSlice'
import KPICard from '../../components/KPICard'
import AchievementCard from '../../components/AchievementCard'

/** Admin overview — bird's-eye KPIs across all teams. */
export default function AdminDashboard() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, achievements, loading } = useSelector((s: RootState) => s.teams)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchIndividualsAsync())
    dispatch(fetchAchievementsAsync(undefined))
  }, [dispatch])

  const activeTeams       = teams.filter(t => !t.isDeleted)
  const activeIndividuals = individuals.filter(i => !i.isDeleted)
  const direct            = activeIndividuals.filter(i => i.staffType === 'direct')
  const nonDirect         = activeIndividuals.filter(i => i.staffType === 'non-direct')

  const nonDirectLeader = activeTeams.filter(t =>
    t.members.some(m => m.memberRole === 'Team Leader' && m.endDate === null && m.staffTypeSnapshot === 'non-direct')
  )

  const highNonDirectRatio = activeTeams.filter(t => {
    const active = t.members.filter(m => m.endDate === null)
    const nd     = active.filter(m => m.staffTypeSnapshot === 'non-direct')
    return active.length > 0 && nd.length / active.length > 0.2
  })

  const recent = [...achievements]
    .sort((a, b) => b.achievementMonth.localeCompare(a.achievementMonth))
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <h1 className="text-acme-heading text-2xl font-bold">Dashboard</h1>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <KPICard label="Active teams"          value={activeTeams.length} />
        <KPICard label="Active people"         value={activeIndividuals.length} sub={`${direct.length} direct · ${nonDirect.length} non-direct`} />
        <KPICard label="Non-direct leader"     value={nonDirectLeader.length}    color={nonDirectLeader.length    > 0 ? 'warning' : 'default'} />
        <KPICard label="High non-direct ratio" value={highNonDirectRatio.length} color={highNonDirectRatio.length > 0 ? 'danger'  : 'default'} />
      </div>

      <section>
        <h2 className="text-acme-heading font-semibold text-lg mb-3">Recent Achievements</h2>
        {recent.length === 0 ? (
          <p className="text-acme-muted text-sm">No achievements yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {recent.map(a => <AchievementCard key={a._id} achievement={a} />)}
          </div>
        )}
      </section>
    </div>
  )
}
