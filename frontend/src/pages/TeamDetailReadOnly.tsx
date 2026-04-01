import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchTeamsAsync, fetchAchievementsAsync } from '../store/teamSlice'
import MemberRow from '../components/MemberRow'
import AchievementCard from '../components/AchievementCard'
import CapIndicator from '../components/CapIndicator'
import RatioBadge from '../components/RatioBadge'

export default function TeamDetailReadOnly() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const { teams, achievements } = useSelector((s: RootState) => s.teams)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchAchievementsAsync(id))
  }, [dispatch, id])

  const team = teams.find(t => t._id === id)
  if (!team) return <p className="text-acme-muted p-6">Team not found.</p>

  const allActive     = team.members.filter(m => m.endDate === null)
  const activeMembers = allActive.filter(m => m.memberRole === 'Member')
  const nonDirect     = allActive.filter(m => m.staffTypeSnapshot === 'non-direct')
  const ratio         = allActive.length ? nonDirect.length / allActive.length : 0
  const leader        = allActive.find(m => m.memberRole === 'Team Leader')
  const teamAchievements = achievements.filter(a => a.teamId === id)

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-acme-heading text-2xl font-bold">{team.teamName}</h1>
          {team.description && <p className="text-acme-muted text-sm mt-1">{team.description}</p>}
        </div>
        <RatioBadge ratio={ratio} />
      </div>

      {leader && (
        <p className="text-acme-muted text-sm">Leader: <span className="text-acme-text font-medium">{leader.personName}</span></p>
      )}

      <CapIndicator active={activeMembers.length} />

      <section>
        <h2 className="text-acme-heading font-semibold mb-2">Members</h2>
        <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-acme-border">
              <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Role</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Staff type</th>
              <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Since</th>
            </tr></thead>
            <tbody>{allActive.map(m => <MemberRow key={m.personId} member={m} />)}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-acme-heading font-semibold mb-2">Achievements</h2>
        {teamAchievements.length === 0
          ? <p className="text-acme-muted text-sm">No achievements.</p>
          : <div className="flex flex-col gap-3">{teamAchievements.map(a => <AchievementCard key={a._id} achievement={a} />)}</div>}
      </section>
    </div>
  )
}
