import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchAchievementsAsync } from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import CapIndicator from '../../components/CapIndicator'
import { Link } from 'react-router-dom'

export default function MyTeam() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, achievements, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchAchievementsAsync(teamId ?? undefined))
  }, [dispatch, teamId])

  const team = teams.find(t => t._id === teamId)
  if (!team) return <p className="text-acme-muted p-4">{loading ? 'Loading…' : 'No team found.'}</p>

  const allActive     = team.members.filter(m => m.endDate === null)
  const activeMembers = allActive.filter(m => m.memberRole === 'Member')
  const teamAchievements = achievements.filter(a => a.teamId === teamId).slice(0, 5)

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h1 className="text-acme-heading text-2xl font-bold">{team.teamName}</h1>

      <CapIndicator active={activeMembers.length} />

      <section>
        <h2 className="text-acme-heading font-semibold mb-2">Team Members</h2>
        <div className="flex flex-col gap-1">
          {allActive.map(m => (
            <div key={m.personId} className="flex items-center justify-between bg-acme-card border border-acme-border rounded-lg px-4 py-2.5">
              <span className="text-acme-heading text-sm font-medium">{m.personName}</span>
              <span className="text-acme-muted text-xs">{m.memberRole}</span>
            </div>
          ))}
        </div>
        <Link to="/team/people" className="text-acme-action text-sm hover:underline mt-2 inline-block">See all teammates →</Link>
      </section>

      <section>
        <h2 className="text-acme-heading font-semibold mb-2">Achievements</h2>
        {teamAchievements.length === 0
          ? <p className="text-acme-muted text-sm">No achievements yet.</p>
          : <div className="flex flex-col gap-3">{teamAchievements.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}
        <Link to="/achievements" className="text-acme-action text-sm hover:underline mt-2 inline-block">View all →</Link>
      </section>
    </div>
  )
}
