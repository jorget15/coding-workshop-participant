import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchAchievementsAsync } from '../../store/teamSlice'
import KPICard from '../../components/KPICard'
import AchievementCard from '../../components/AchievementCard'
import CapIndicator from '../../components/CapIndicator'
import RatioBadge from '../../components/RatioBadge'
import { Link } from 'react-router-dom'

export default function TeamLeadDashboard() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, achievements, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchAchievementsAsync(teamId ?? undefined))
  }, [dispatch, teamId])

  const team = teams.find(t => t._id === teamId)
  if (!team) return <p className="text-acme-muted p-4">{loading ? 'Loading…' : 'No team found.'}</p>

  const activeMembers = team.members.filter(m => m.endDate === null && m.memberRole === 'Member')
  const allActive     = team.members.filter(m => m.endDate === null)
  const nonDirect     = allActive.filter(m => m.staffTypeSnapshot === 'non-direct')
  const ratio         = allActive.length ? nonDirect.length / allActive.length : 0

  const now    = new Date()
  const currMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`
  const thisMonth  = achievements.filter(a => a.teamId === teamId && a.achievementMonth === currMonth)
  const recent     = achievements.filter(a => a.teamId === teamId).slice(0, 3)

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-acme-heading text-2xl font-bold">{team.teamName}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><CapIndicator active={activeMembers.length} /><p className="text-acme-muted text-xs mt-1">Active members</p></div>
        <KPICard label="Non-direct ratio" value={`${Math.round(ratio * 100)}%`} color={ratio > 0.2 ? 'danger' : 'default'} />
        <KPICard label="Achievements this month" value={thisMonth.length} />
        <div className="bg-acme-card border border-acme-border rounded-xl p-4">
          <p className="text-acme-muted text-sm">Non-direct</p>
          <RatioBadge ratio={ratio} />
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-acme-heading font-semibold">Members</h2>
          <Link to="/team/members" className="text-acme-action text-sm hover:underline">Manage →</Link>
        </div>
        <div className="flex flex-col gap-1">
          {allActive.map(m => (
            <div key={m.personId} className="flex items-center justify-between bg-acme-card border border-acme-border rounded-lg px-4 py-2.5">
              <span className="text-acme-heading text-sm font-medium">{m.personName}</span>
              <span className="text-acme-muted text-xs">{m.memberRole}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-acme-heading font-semibold">Recent Achievements</h2>
          <Link to="/team/achievements" className="text-acme-action text-sm hover:underline">All →</Link>
        </div>
        {recent.length === 0
          ? <p className="text-acme-muted text-sm">No achievements yet.</p>
          : <div className="flex flex-col gap-3">{recent.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}
      </section>
    </div>
  )
}
