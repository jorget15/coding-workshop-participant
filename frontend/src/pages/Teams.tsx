import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchTeamsAsync } from '../store/teamSlice'

/** Lists all active teams (isDeleted: false — R5). */
export default function Teams() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, loading, error } = useSelector((state: RootState) => state.teams)

  useEffect(() => {
    void dispatch(fetchTeamsAsync())
  }, [dispatch])

  const activeTeams = teams.filter((t) => !t.isDeleted)

  if (loading) return <p className="p-8 text-acme-muted">Loading…</p>
  if (error)   return <p className="p-8 text-acme-red">{error}</p>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-acme-heading">Teams</h1>
        <span className="text-acme-muted text-sm">{activeTeams.length} active</span>
      </div>

      {activeTeams.length === 0 ? (
        <p className="text-acme-muted">No teams yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTeams.map((team) => {
            /* Active members only, Leader & Delegate excluded from cap (R1) */
            const activeMembers = team.members.filter(
              (m) => m.endDate === null && m.memberRole === 'Member'
            )
            const leader = team.members.find(
              (m) => m.memberRole === 'Team Leader' && m.endDate === null
            )

            return (
              <Link
                key={team._id}
                to={`/teams/${team._id}`}
                className="bg-acme-card border border-acme-border rounded-sm p-5 hover:border-acme-action transition-colors block"
              >
                <h2 className="font-semibold text-acme-heading text-lg mb-1">{team.teamName}</h2>
                <p className="text-acme-muted text-sm mb-3 line-clamp-2">{team.description}</p>
                <div className="flex justify-between text-xs text-acme-muted">
                  <span>{leader ? `Lead: ${leader.personName}` : 'No leader'}</span>
                  <span>{activeMembers.length}/5 members</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
