import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchIndividualsAsync, fetchLocationsAsync, fetchAchievementsAsync } from '../../store/teamSlice'
import { Link } from 'react-router-dom'
import RatioBadge from '../../components/RatioBadge'
import LocationBadge from '../../components/LocationBadge'
import { formatMonth } from '../../components/MonthPicker'
import type { Region } from '../../store/teamSlice'

export default function AdminReports() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, locations, achievements } = useSelector((s: RootState) => s.teams)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchIndividualsAsync())
    dispatch(fetchLocationsAsync())
    dispatch(fetchAchievementsAsync())
  }, [dispatch])

  const active = teams.filter(t => !t.isDeleted)

  // Report 1 — Teams by region
  const byRegion: Record<string, typeof active> = { NAM: [], LATAM: [], EMEA: [], APAC: [] }
  active.forEach(t => {
    const loc = locations.find(l => l._id === t.teamHomeLocation)
    if (loc) byRegion[loc.region]?.push(t)
  })

  // Report 2 — Leader not co-located (placeholder — needs locationId on member)
  // Report 3 — Non-direct leader
  const nonDirectLeader = active.filter(t =>
    t.members.some(m => m.memberRole === 'Team Leader' && m.endDate === null && m.staffTypeSnapshot === 'non-direct')
  )

  // Report 4 — Non-direct ratio
  const byRatio = active.map(t => {
    const all = t.members.filter(m => m.endDate === null)
    const nd  = all.filter(m => m.staffTypeSnapshot === 'non-direct')
    return { team: t, ratio: all.length ? nd.length / all.length : 0 }
  }).sort((a, b) => b.ratio - a.ratio)

  // Report 6 — Multi-team members
  const memberTeamCount: Record<string, { name: string; count: number }> = {}
  active.forEach(t => {
    t.members.filter(m => m.endDate === null).forEach(m => {
      if (!memberTeamCount[m.personId]) memberTeamCount[m.personId] = { name: m.personName, count: 0 }
      memberTeamCount[m.personId].count++
    })
  })
  const multiTeam = Object.entries(memberTeamCount).filter(([, v]) => v.count > 1)

  // Report 5 — Achievements by month
  const achievementsByMonth: Record<string, number> = {}
  achievements.forEach(a => {
    const m = a.achievementMonth || 'Unknown'
    achievementsByMonth[m] = (achievementsByMonth[m] || 0) + 1
  })
  const sortedMonths = Object.entries(achievementsByMonth).sort(([a], [b]) => b.localeCompare(a))

  // Report 7 — Teams without achievements
  const teamAchCounts = new Set(achievements.map(a => a.teamId).filter(Boolean))
  const teamsNoAch = active.filter(t => !teamAchCounts.has(t._id))

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Reports</h1>
        <Link
          to="/admin/report-builder"
          className="px-4 py-2 rounded-lg bg-acme-action text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Build PDF Report
        </Link>
      </div>

      {/* Report 1 */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">1. Teams by Region</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(byRegion).map(([region, ts]) => (
            <div key={region} className="flex flex-col gap-1">
              <LocationBadge city={`${ts.length} teams`} region={region as Region} />
            </div>
          ))}
        </div>
      </section>

      {/* Report 3 */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">3. Non-Direct Leader ({nonDirectLeader.length})</h2>
        {nonDirectLeader.length === 0
          ? <p className="text-acme-muted text-sm">None.</p>
          : <div className="flex flex-col gap-1">
              {nonDirectLeader.map(t => <Link key={t._id} to={`/admin/teams/${t._id}`} className="text-acme-action hover:underline text-sm">{t.teamName}</Link>)}
            </div>
        }
      </section>

      {/* Report 4 */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">4. Non-Direct Ratio (sorted)</h2>
        <div className="flex flex-col gap-2">
          {byRatio.map(({ team, ratio }) => (
            <div key={team._id} className="flex items-center gap-3">
              <Link to={`/admin/teams/${team._id}`} className="text-acme-action hover:underline text-sm w-48 truncate">{team.teamName}</Link>
              <RatioBadge ratio={ratio} />
            </div>
          ))}
        </div>
      </section>

      {/* Report 6 */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">6. Multi-Team Members ({multiTeam.length})</h2>
        {multiTeam.length === 0
          ? <p className="text-acme-muted text-sm">No one is on multiple teams.</p>
          : <div className="flex flex-col gap-1">
              {multiTeam.map(([id, v]) => {
                const person = individuals.find(p => p._id === id)
                return (
                  <div key={id} className="flex items-center gap-3 text-sm">
                    {person
                      ? <Link to={`/admin/individuals/${id}`} className="text-acme-action hover:underline">{v.name}</Link>
                      : <span className="text-acme-text">{v.name}</span>
                    }
                    <span className="text-acme-muted">on {v.count} teams</span>
                  </div>
                )
              })}
            </div>
        }
      </section>

      {/* Report 5 — Achievements by month */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">5. Achievements by Month ({achievements.length} total)</h2>
        {sortedMonths.length === 0
          ? <p className="text-acme-muted text-sm">No achievements recorded.</p>
          : <div className="flex flex-col gap-2">
              {sortedMonths.map(([month, count]) => (
                <div key={month} className="flex items-center gap-3 text-sm">
                  <span className="text-acme-heading font-medium w-40">{formatMonth(month)}</span>
                  <div className="flex-1 bg-acme-border rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-acme-action h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, (count / Math.max(...sortedMonths.map(([,c]) => c))) * 100)}%` }}
                    />
                  </div>
                  <span className="text-acme-muted w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
        }
      </section>

      {/* Report 7 — Teams without achievements */}
      <section className="bg-acme-card border border-acme-border rounded-xl p-5">
        <h2 className="text-acme-heading font-semibold mb-3">7. Teams Without Achievements ({teamsNoAch.length})</h2>
        {teamsNoAch.length === 0
          ? <p className="text-acme-muted text-sm">All teams have at least one achievement.</p>
          : <div className="flex flex-col gap-1">
              {teamsNoAch.map(t => (
                <Link key={t._id} to={`/admin/teams/${t._id}`} className="text-acme-action hover:underline text-sm">{t.teamName}</Link>
              ))}
            </div>
        }
      </section>
    </div>
  )
}
