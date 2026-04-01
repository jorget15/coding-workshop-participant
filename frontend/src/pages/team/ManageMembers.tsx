import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync } from '../../store/teamSlice'
import MemberRow from '../../components/MemberRow'
import CapIndicator from '../../components/CapIndicator'
import { toast } from 'react-toastify'

export default function ManageMembers() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  useEffect(() => { dispatch(fetchTeamsAsync()) }, [dispatch])

  const team = teams.find(t => t._id === teamId)
  if (!team) return <p className="text-acme-muted p-4">{loading ? 'Loading…' : 'No team found.'}</p>

  const allActive     = team.members.filter(m => m.endDate === null)
  const activeMembers = allActive.filter(m => m.memberRole === 'Member')
  const atCap         = activeMembers.length >= 5

  function handleRemove(personId: string) {
    const m = allActive.find(m => m.personId === personId)
    toast.info(`Remove member: ${m?.personName} (connect to backend to persist)`)
  }

  function handleDelegate(personId: string) {
    const hasDelegate = allActive.some(m => m.memberRole === 'Delegate')
    if (hasDelegate) { toast.error('A delegate is already assigned'); return }
    const m = allActive.find(m => m.personId === personId)
    toast.info(`Assign delegate: ${m?.personName} (connect to backend to persist)`)
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Manage Members</h1>
        <button
          disabled={atCap}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            atCap ? 'bg-acme-muted/20 text-acme-muted cursor-not-allowed' : 'bg-acme-action text-white hover:bg-acme-blue'
          }`}
        >
          + Add Member
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <CapIndicator active={activeMembers.length} />
        {atCap && <p className="text-acme-red text-sm font-medium">This team already has 5 active members.</p>}
        {activeMembers.length === 4 && !atCap && <p className="text-acme-amber text-sm">1 slot remaining.</p>}
      </div>

      <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-acme-border">
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Role</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Staff type</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Since</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Actions</th>
          </tr></thead>
          <tbody>
            {allActive.map(m => (
              <MemberRow key={m.personId} member={m} onRemove={handleRemove} onDelegate={handleDelegate} />
            ))}
          </tbody>
        </table>
        {allActive.length === 0 && <p className="text-acme-muted text-sm p-4">No active members.</p>}
      </div>
    </div>
  )
}
