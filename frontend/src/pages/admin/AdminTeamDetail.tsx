import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import {
  fetchTeamsAsync, fetchAchievementsAsync, fetchLocationsAsync,
  fetchTeamHistoryAsync, fetchIndividualsAsync,
  updateTeamAsync, closeTeamAsync, addMemberAsync, removeMemberAsync
} from '../../store/teamSlice'
import AchievementCard from '../../components/AchievementCard'
import CapIndicator from '../../components/CapIndicator'
import RatioBadge from '../../components/RatioBadge'
import TeamContributionChart from '../../components/dashboard/TeamContributionChart'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import toast from 'react-hot-toast'

const TABS = ['Overview','Members','Achievements','Contributions','History'] as const
type Tab = typeof TABS[number]

export default function AdminTeamDetail() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { teams, achievements, locations, individuals, teamHistory } = useSelector((s: RootState) => s.teams)
  const [tab, setTab] = useState<Tab>('Overview')

  // Edit team modal
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ team_name: '', description: '', location_id: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  // Add member modal
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState({ person_id: '', member_role: 'Member' as string })
  const [addSubmitting, setAddSubmitting] = useState(false)

  // Close team confirm
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeSubmitting, setCloseSubmitting] = useState(false)

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchAchievementsAsync(id))
    dispatch(fetchLocationsAsync())
    dispatch(fetchIndividualsAsync())
    if (id) dispatch(fetchTeamHistoryAsync(id))
  }, [dispatch, id])

  const team = teams.find(t => t._id === id)
  if (!team) return <p className="text-acme-muted p-6">Team not found.</p>

  const activeMembers = team.members.filter(m => m.endDate === null && m.memberRole === 'Member')
  const allActive     = team.members.filter(m => m.endDate === null)
  const nonDirect     = allActive.filter(m => m.staffTypeSnapshot === 'non-direct')
  const office        = locations.find(l => l._id === team.teamHomeLocation)
  const ratio         = allActive.length ? nonDirect.length / allActive.length : 0
  const leader        = team.members.find(m => m.memberRole === 'Team Leader' && m.endDate === null)
  const teamAchievements = achievements.filter(a => a.teamId === id)

  // All handlers below are safe — `team` is guaranteed to be defined after the early return above
  function openEdit() {
    setEditForm({ team_name: team!.teamName, description: team!.description || '', location_id: team!.teamHomeLocation || '' })
    setEditOpen(true)
  }
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm.team_name.trim()) { toast.error('Team name is required'); return }
    setEditSubmitting(true)
    try {
      await dispatch(updateTeamAsync({ id: team!._id, ...editForm })).unwrap()
      toast('Team updated')
      setEditOpen(false)
    } catch (err) { toast.error(String(err)) }
    finally { setEditSubmitting(false) }
  }

  async function handleClose() {
    setCloseSubmitting(true)
    try {
      await dispatch(closeTeamAsync(team!._id)).unwrap()
      toast('Team closed')
      navigate('/admin/teams')
    } catch (err) { toast.error(String(err)) }
    finally { setCloseSubmitting(false); setCloseOpen(false) }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.person_id) { toast.error('Select a person'); return }
    setAddSubmitting(true)
    try {
      await dispatch(addMemberAsync({ teamId: team!._id, person_id: addForm.person_id, member_role: addForm.member_role as 'Team Leader' | 'Member' | 'Delegate' })).unwrap()
      toast('Member added')
      setAddOpen(false)
      setAddForm({ person_id: '', member_role: 'Member' })
    } catch (err) { toast.error(String(err)) }
    finally { setAddSubmitting(false) }
  }

  async function handleRemoveMember(personId: string) {
    if (!confirm('Remove this member from the team?')) return
    try {
      await dispatch(removeMemberAsync({ teamId: team!._id, personId })).unwrap()
      toast('Member removed')
    } catch (err) { toast.error(String(err)) }
  }

  const eligiblePeople = individuals.filter(i =>
    !i.isDeleted && !allActive.some(m => m.personId === i._id)
  )

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-acme-heading text-2xl font-bold">{team.teamName}</h1>
          {team.description && <p className="text-acme-muted text-sm mt-1">{team.description}</p>}
        </div>
        <div className="flex flex-col gap-2 items-end shrink-0">
          <div className="flex gap-2">
            <button onClick={openEdit} className="px-3 py-1.5 text-xs font-medium border border-acme-border rounded-lg hover:bg-acme-surface transition-colors text-acme-text">Edit</button>
            {!team.isDeleted && (
              <button onClick={() => setCloseOpen(true)} className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Close Team</button>
            )}
          </div>
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
          <p className="text-acme-muted text-sm">Created: <span className="text-acme-text">{formatDate(team.createdAt)}</span></p>
          <p className="text-acme-muted text-sm">Office: <span className="text-acme-text">{office ? `${office.name} — ${office.city}` : team.teamHomeLocation}</span></p>
        </div>
      )}

      {tab === 'Members' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <CapIndicator active={activeMembers.length} />
            <button onClick={() => setAddOpen(true)} className="px-3 py-1.5 text-xs font-medium bg-acme-action text-white rounded-lg hover:bg-acme-blue transition-colors">+ Add Member</button>
          </div>
          <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-acme-border">
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Role</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Staff type</th>
                <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Since</th>
                <th className="py-3 px-4 text-right text-xs font-semibold text-acme-muted">Actions</th>
              </tr></thead>
              <tbody>
                {allActive.map(m => (
                  <tr key={m.personId} className="border-b border-acme-border last:border-0 hover:bg-acme-surface transition-colors">
                    <td className="py-3 px-4 text-sm font-medium text-acme-text">{m.personName}</td>
                    <td className="py-3 px-4 text-sm text-acme-text">{m.memberRole}</td>
                    <td className="py-3 px-4"><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${m.staffTypeSnapshot === 'non-direct' ? 'bg-acme-amber/10 text-acme-amber' : 'bg-acme-green/10 text-acme-green'}`}>{m.staffTypeSnapshot || 'direct'}</span></td>
                    <td className="py-3 px-4 text-xs text-acme-muted">{formatDate(m.startDate)}</td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => handleRemoveMember(m.personId)} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </td>
                  </tr>
                ))}
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

      {tab === 'Contributions' && (
        <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-4">
          <TeamContributionChart team={team} achievements={teamAchievements} />
        </div>
      )}

      {tab === 'History' && (
        <div className="flex flex-col gap-2">
          {(id && teamHistory[id] ? teamHistory[id] : []).length === 0
            ? <p className="text-acme-muted text-sm">No history events.</p>
            : (teamHistory[id!] ?? []).map((e, i) => (
              <div key={i} className="bg-acme-card border border-acme-border rounded-lg p-4 text-sm">
                <span className="font-medium text-acme-heading mr-2">{e.eventType}</span>
                <span className="text-acme-text">{e.description}</span>
                <span className="text-acme-muted ml-2 text-xs">{formatDateTime(e.changedAt)}</span>
              </div>
          ))}
        </div>
      )}

      {/* Edit Team Modal */}
      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Team" submitting={editSubmitting} onSubmit={handleEdit} submitLabel="Save Changes">
        <FormInput label="Team Name *" value={editForm.team_name} onChange={v => setEditForm(f => ({ ...f, team_name: v }))} required />
        <FormInput label="Description" value={editForm.description} onChange={v => setEditForm(f => ({ ...f, description: v }))} />
        <FormSelect label="Location" value={editForm.location_id} onChange={v => setEditForm(f => ({ ...f, location_id: v }))}
          placeholder="Select location…" options={locations.map(l => ({ value: l._id, label: `${l.name} — ${l.city}` }))} />
      </FormModal>

      {/* Close Team Confirm */}
      <FormModal open={closeOpen} onClose={() => setCloseOpen(false)} title="Close Team" submitting={closeSubmitting} onSubmit={(e) => { e.preventDefault(); handleClose() }} submitLabel="Confirm Close" variant="danger">
        <p className="text-acme-text text-sm">
          This will close <strong>{team.teamName}</strong> and remove all active members. This action cannot be undone.
        </p>
      </FormModal>

      {/* Add Member Modal */}
      <FormModal open={addOpen} onClose={() => { setAddOpen(false); setAddForm({ person_id: '', member_role: 'Member' }) }} title="Add Member" submitting={addSubmitting} onSubmit={handleAddMember} submitLabel="Add Member">
        <FormSelect label="Person *" value={addForm.person_id} onChange={v => setAddForm(f => ({ ...f, person_id: v }))}
          placeholder="Select person…" options={eligiblePeople.map(p => ({ value: p._id, label: `${p.personName} (${p.email})` }))} />
        <FormSelect label="Role" value={addForm.member_role} onChange={v => setAddForm(f => ({ ...f, member_role: v }))}
          options={[{ value: 'Member', label: 'Member' }, { value: 'Team Leader', label: 'Team Leader' }, { value: 'Delegate', label: 'Delegate' }]} />
      </FormModal>
    </div>
  )
}
