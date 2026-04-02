import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchIndividualsAsync, fetchTeamsAsync, fetchIndividualHistoryAsync, fetchLocationsAsync, updateIndividualAsync, deactivateIndividualAsync } from '../../store/teamSlice'
import ProfileHeader from '../../components/ProfileHeader'
import { Link } from 'react-router-dom'
import { formatDate, formatDateTime } from '../../utils/formatDate'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import toast from 'react-hot-toast'

export default function AdminIndividualProfile() {
  const { id } = useParams<{ id: string }>()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { individuals, teams, individualHistory, locations } = useSelector((s: RootState) => s.teams)

  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<{ person_name: string; email: string; job_title: string; staff_type: 'direct' | 'non-direct'; home_city: string; home_country: string; home_region: string; assigned_office: string }>({ person_name: '', email: '', job_title: '', staff_type: 'direct', home_city: '', home_country: '', home_region: '', assigned_office: '' })
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deactivateSubmitting, setDeactivateSubmitting] = useState(false)

  useEffect(() => {
    dispatch(fetchIndividualsAsync())
    dispatch(fetchTeamsAsync())
    dispatch(fetchLocationsAsync())
    if (id) dispatch(fetchIndividualHistoryAsync(id))
  }, [dispatch, id])

  const person = individuals.find(i => i._id === id)
  if (!person) return <p className="text-acme-muted p-6">Person not found.</p>

  const activeTeams = teams.filter(t =>
    !t.isDeleted && t.members.some(m => m.personId === id && m.endDate === null)
  )

  function openEdit() {
    setEditForm({
      person_name: person!.personName,
      email: person!.email,
      job_title: person!.jobTitle || '',
      staff_type: person!.staffType as 'direct' | 'non-direct',
      home_city: person!.homeLocation?.city || '',
      home_country: person!.homeLocation?.country || '',
      home_region: person!.homeLocation?.region || '',
      assigned_office: person!.assignedOffice || ''
    })
    setEditOpen(true)
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editForm.person_name.trim() || !editForm.email.trim()) { toast.error('Name and email are required'); return }
    setEditSubmitting(true)
    try {
      await dispatch(updateIndividualAsync({ id: person!._id, ...editForm })).unwrap()
      toast('Profile updated')
      setEditOpen(false)
    } catch (err) { toast.error(String(err)) }
    finally { setEditSubmitting(false) }
  }

  async function handleDeactivate() {
    setDeactivateSubmitting(true)
    try {
      await dispatch(deactivateIndividualAsync(person!._id)).unwrap()
      toast('Account deactivated')
      navigate('/admin/individuals')
    } catch (err) { toast.error(String(err)) }
    finally { setDeactivateSubmitting(false); setDeactivateOpen(false) }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <ProfileHeader individual={person} />
        <div className="flex gap-2 shrink-0">
          <button onClick={openEdit} className="px-3 py-1.5 text-xs font-medium border border-acme-border rounded-lg hover:bg-acme-surface transition-colors text-acme-text">Edit</button>
          {!person.isDeleted && (
            <button onClick={() => setDeactivateOpen(true)} className="px-3 py-1.5 text-xs font-medium border border-red-300 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">Deactivate</button>
          )}
        </div>
      </div>

      <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Details</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <span className="text-acme-muted">Staff type</span>
          <span className={`font-medium ${ person.staffType === 'direct' ? 'text-acme-green' : 'text-acme-amber'}`}>{person.staffType}</span>
          <span className="text-acme-muted">Role</span>
          <div className="flex flex-wrap gap-1">
            {person.roles.includes('system_admin') ? (
              <span className="px-2 py-0.5 bg-red-500/10 text-red-600 rounded text-xs font-medium">System Admin</span>
            ) : (() => {
              const isLeaderOrDelegate = activeTeams.some(t =>
                t.members.some(m => m.personId === id && m.endDate === null && (m.memberRole === 'Team Leader' || m.memberRole === 'Delegate'))
              )
              return isLeaderOrDelegate
                ? <span className="px-2 py-0.5 bg-acme-action/10 text-acme-action rounded text-xs font-medium">Team Lead</span>
                : <span className="px-2 py-0.5 bg-gray-400/10 text-gray-500 rounded text-xs font-medium">Viewer</span>
            })()}
          </div>
          <span className="text-acme-muted">Created</span>
          <span className="text-acme-text">{formatDate(person.createdAt)}</span>
        </div>
      </div>

      <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Team Memberships</h2>
        {activeTeams.length === 0 ? (
          <p className="text-acme-muted text-sm">Not a member of any active team.</p>
        ) : activeTeams.map(t => {
          const m = t.members.find(m => m.personId === id && m.endDate === null)
          return (
            <div key={t._id} className="flex items-center justify-between">
              <Link to={`/admin/teams/${t._id}`} className="text-acme-action hover:underline text-sm font-medium">{t.teamName}</Link>
              <span className="text-acme-muted text-xs">{m?.memberRole}</span>
            </div>
          )
        })}
      </div>

      <div className="bg-acme-card border border-acme-border rounded-xl p-5 flex flex-col gap-3">
        <h2 className="text-acme-heading font-semibold">Change History</h2>
        {(id && individualHistory[id] ? individualHistory[id] : []).length === 0 ? (
          <p className="text-acme-muted text-sm">No change history recorded.</p>
        ) : (
          <ol className="relative border-l border-acme-border pl-6 flex flex-col gap-3">
            {[...(individualHistory[id!] ?? [])].reverse().map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-9 top-1 w-3 h-3 rounded-full bg-acme-action border-2 border-acme-card" />
                <p className="text-acme-heading font-semibold text-sm">{e.eventType}</p>
                <p className="text-acme-text text-sm">{e.description}</p>
                <p className="text-acme-muted text-xs mt-0.5">{formatDateTime(e.occurredAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Edit Modal */}
      <FormModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Individual" submitting={editSubmitting} onSubmit={handleEdit} submitLabel="Save Changes">
        <FormInput label="Full Name *" value={editForm.person_name} onChange={v => setEditForm(f => ({ ...f, person_name: v }))} required />
        <FormInput label="Email *" value={editForm.email} onChange={v => setEditForm(f => ({ ...f, email: v }))} type="email" required />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Job Title" value={editForm.job_title} onChange={v => setEditForm(f => ({ ...f, job_title: v }))} />
          <FormSelect label="Staff Type" value={editForm.staff_type} onChange={v => setEditForm(f => ({ ...f, staff_type: v as 'direct' | 'non-direct' }))}
            options={[{ value: 'direct', label: 'Direct' }, { value: 'non-direct', label: 'Non-Direct' }]} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormInput label="City" value={editForm.home_city} onChange={v => setEditForm(f => ({ ...f, home_city: v }))} />
          <FormInput label="Country" value={editForm.home_country} onChange={v => setEditForm(f => ({ ...f, home_country: v }))} />
          <FormSelect label="Region" value={editForm.home_region} onChange={v => setEditForm(f => ({ ...f, home_region: v }))}
            options={[{ value: 'NAM', label: 'NAM' }, { value: 'LATAM', label: 'LATAM' }, { value: 'EMEA', label: 'EMEA' }, { value: 'APAC', label: 'APAC' }]} />
        </div>
        <FormSelect label="Assigned Office" value={editForm.assigned_office} onChange={v => setEditForm(f => ({ ...f, assigned_office: v }))}
          placeholder="None" options={locations.map(l => ({ value: l._id, label: `${l.name} — ${l.city}` }))} />
      </FormModal>

      {/* Deactivate Confirm */}
      <FormModal open={deactivateOpen} onClose={() => setDeactivateOpen(false)} title="Deactivate Account" submitting={deactivateSubmitting} onSubmit={(e) => { e.preventDefault(); handleDeactivate() }} submitLabel="Confirm Deactivate" variant="danger">
        <p className="text-acme-text text-sm">
          This will deactivate <strong>{person.personName}</strong>'s account. They will be removed from all active teams. This cannot be undone.
        </p>
        {activeTeams.length > 0 && (
          <p className="text-red-600 text-sm font-medium mt-1">
            Warning: This person is currently on {activeTeams.length} active team{activeTeams.length > 1 ? 's' : ''}.
            Deactivation will fail if R4 is violated — remove them from teams first.
          </p>
        )}
      </FormModal>
    </div>
  )
}
