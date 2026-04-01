import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchAchievementsAsync } from '../../store/teamSlice'
import MemberRow from '../../components/MemberRow'
import AchievementCard from '../../components/AchievementCard'
import CapIndicator from '../../components/CapIndicator'
import RatioBadge from '../../components/RatioBadge'

const TABS = ['Overview','Members','Achievements','History'] as const
type Tab = typeof TABS[number]

export default function AdminTeamDetail() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const { teams, achievements } = useSelector((s: RootState) => s.teams)
  const [tab, setTab] = useState<Tab>('Overview')

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchAchievementsAsync(id))
  }, [dispatch, id])

  const team = teams.find(t => t._id === id)
  if (!team) return <p className="text-acme-muted p-6">Team not found.</p>

  const activeMembers = team.members.filter(m => m.endDate === null && m.memberRole === 'Member')
  const allActive     = team.members.filter(m => m.endDate === null)
  const nonDirect     = allActive.filter(m => m.staffTypeSnapshot === 'non-direct')
  const ratio         = allActive.length ? nonDirect.length / allActive.length : 0
  const leader        = team.members.find(m => m.memberRole === 'Team Leader' && m.endDate === null)
  const teamAchievements = achievements.filter(a => a.teamId === id)

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-acme-heading text-2xl font-bold">{team.teamName}</h1>
          {team.description && <p className="text-acme-muted text-sm mt-1">{team.description}</p>}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <RatioBadge ratio={ratio} />
          {leader && <p className="text-acme-muted text-xs">Leader: <span className="text-acme-text font-medium">{leader.personName}</span></p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-acme-border gap-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-acme-action text-acme-action' : 'border-transparent text-acme-muted hover:text-acme-heading'
            }`}
          >{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
          <p className="text-acme-muted text-sm">Created: <span className="text-acme-text">{team.createdAt?.slice(0,10)}</span></p>
          <p className="text-acme-muted text-sm">Location ID: <span className="text-acme-text">{team.primaryLocation}</span></p>
        </div>
      )}

      {tab === 'Members' && (
        <div className="flex flex-col gap-3">
          <CapIndicator active={activeMembers.length} />
          <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-acme-border">
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Role</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Staff type</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Since</th>
                <th className="py-3 px-4"></th>
              </tr></thead>
              <tbody>
                {allActive.map(m => <MemberRow key={m.personId} member={m} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Achievements' && (
        <div className="flex flex-col gap-3">
          {teamAchievements.length === 0
            ? <p className="text-acme-muted text-sm">No achievements yet.</p>
            : teamAchievements.map(a => <AchievementCard key={a._id} achievement={a} />)}
        </div>
      )}

      {tab === 'History' && (
        <div className="flex flex-col gap-2">
          {(team.teamHistory ?? []).length === 0
            ? <p className="text-acme-muted text-sm">No history events.</p>
            : (team.teamHistory ?? []).map((e, i) => (
              <div key={i} className="bg-acme-card border border-acme-border rounded-lg p-4 text-sm">
                <span className="font-medium text-acme-heading mr-2">{e.eventType}</span>
                <span className="text-acme-text">{e.description}</span>
                <span className="text-acme-muted ml-2 text-xs">{e.occurredAt?.slice(0,10)}</span>
              </div>
          ))}
        </div>
      )}
    </div>
  )
}
