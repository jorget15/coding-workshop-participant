import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchTeamsAsync } from '../store/teamSlice'

const ROLE_BADGE: Record<string, string> = {
  'Team Leader': 'bg-acme-navy text-white',
  'Member':      'bg-acme-card text-acme-text border border-acme-border',
  'Delegate':    'bg-acme-amber text-white',
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const { teams, loading } = useSelector((state: RootState) => state.teams)

  useEffect(() => {
    if (teams.length === 0) void dispatch(fetchTeamsAsync())
  }, [dispatch, teams.length])

  const team = teams.find((t) => t._id === id)

  if (loading)  return <p className="p-8 text-acme-muted">Loading…</p>
  if (!team)    return <p className="p-8 text-acme-muted">Team not found.</p>

  /* Active members (endDate === null) separated by role */
  const activeMembers = team.members.filter((m) => m.endDate === null)

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Link to="/teams" className="text-acme-action hover:underline text-sm mb-4 inline-block">
        ← Back to Teams
      </Link>

      <h1 className="text-3xl font-bold text-acme-heading mb-1">{team.teamName}</h1>
      <p className="text-acme-muted mb-6">{team.description}</p>

      <h2 className="text-lg font-semibold text-acme-heading mb-3">
        Active Members
        {/* R1: count only Members toward cap */}
        <span className="ml-2 text-sm font-normal text-acme-muted">
          ({activeMembers.filter((m) => m.memberRole === 'Member').length}/5 members)
        </span>
      </h2>

      <div className="flex flex-col gap-3">
        {activeMembers.length === 0 && (
          <p className="text-acme-muted text-sm">No active members.</p>
        )}
        {activeMembers.map((m) => (
          <div
            key={`${m.personId}-${m.startDate}`}
            className="bg-acme-card border border-acme-border rounded-sm px-5 py-3 flex justify-between items-center"
          >
            <div>
              <span className="font-medium text-acme-text">{m.personName}</span>
              <span className="ml-2 text-xs text-acme-muted">{m.staffTypeSnapshot}</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${ROLE_BADGE[m.memberRole] ?? ''}`}>
              {m.memberRole}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
