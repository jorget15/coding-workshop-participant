import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchIndividualsAsync, addMemberAsync, removeMemberAsync } from '../../store/teamSlice'
import MemberRow from '../../components/MemberRow'
import CapIndicator from '../../components/CapIndicator'
import FormModal from '../../components/FormModal'
import { FormSelect } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

export default function ManageMembers() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, individuals, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  const modal = useFormModal(
    { person_id: '', member_role: 'Member' },
    addMemberAsync as Parameters<typeof useFormModal>[1],
    'Member added'
  )

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchIndividualsAsync())
  }, [dispatch])

  const team = teams.find(t => t._id === teamId)
  if (!team) return <p className="text-acme-muted p-4">{loading ? 'Loading…' : 'No team found.'}</p>

  const allActive     = team.members.filter(m => m.endDate === null)
  const activeMembers = allActive.filter(m => m.memberRole === 'Member')
  const atCap         = activeMembers.length >= 5

  const currentMemberIds = new Set(allActive.map(m => m.personId))
  const available = individuals.filter(i => !i.isDeleted && !currentMemberIds.has(i._id))

  async function handleRemove(personId: string) {
    if (!teamId) return
    try {
      await dispatch(removeMemberAsync({ teamId, personId })).unwrap()
      toast('Member removed')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  function handleDelegate(_personId: string) {
    const hasDelegate = allActive.some(m => m.memberRole === 'Delegate')
    if (hasDelegate) { toast.error('A delegate is already assigned'); return }
    toast('Delegate assignment coming soon')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.person_id || !teamId) { toast.error('Select a person'); return }
    modal.submit({ teamId, ...modal.form })
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Manage Members</h1>
        <button
          onClick={() => !atCap && modal.setOpen(true)}
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

      <FormModal open={modal.open} onClose={modal.reset} title="Add Member" submitting={modal.submitting} onSubmit={handleSubmit} submitLabel="Add Member">
        <FormSelect label="Person *" value={modal.form.person_id} onChange={v => modal.field('person_id', v)}
          placeholder="Select person…" options={available.map(i => ({ value: i._id, label: `${i.personName} — ${i.email}` }))} required />
        <FormSelect label="Role" value={modal.form.member_role} onChange={v => modal.field('member_role', v)}
          options={[{ value: 'Member', label: 'Member' }, { value: 'Delegate', label: 'Delegate' }]} />
      </FormModal>
    </div>
  )
}
