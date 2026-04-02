import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchIndividualsAsync, fetchTeamsAsync, fetchLocationsAsync, createIndividualAsync, deactivateIndividualAsync } from '../../store/teamSlice'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

export default function AdminIndividualList() {
  const dispatch = useDispatch<AppDispatch>()
  const { individuals, teams, locations, loading } = useSelector((s: RootState) => s.teams)
  const [search, setSearch] = useState('')
  const [staffFilter, setStaffFilter] = useState<'all'|'direct'|'non-direct'>('all')

  const modal = useFormModal(
    { person_name: '', email: '', job_title: '', staff_type: 'direct', home_city: '', home_country: '', home_region: '', assigned_office: '', password: '' },
    createIndividualAsync as Parameters<typeof useFormModal>[1],
    'Individual created'
  )

  useEffect(() => {
    dispatch(fetchIndividualsAsync())
    dispatch(fetchTeamsAsync())
    dispatch(fetchLocationsAsync())
  }, [dispatch])

  const active = individuals.filter(i => !i.isDeleted)
  const filtered = active.filter(i => {
    const matchText  = i.personName.toLowerCase().includes(search.toLowerCase()) ||
                       i.email.toLowerCase().includes(search.toLowerCase())
    const matchStaff = staffFilter === 'all' || i.staffType === staffFilter
    return matchText && matchStaff
  })

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Deactivate ${name}? This cannot be undone.`)) return
    try {
      await dispatch(deactivateIndividualAsync(id)).unwrap()
      toast(`${name} deactivated`)
    } catch (err) { toast.error(String(err)) }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.person_name.trim() || !modal.form.email.trim()) { toast.error('Name and email are required'); return }
    if (!modal.form.password || modal.form.password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    modal.submit()
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Individuals</h1>
        <button onClick={() => modal.setOpen(true)} className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
          + Add Person
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or email…"
          className="border border-acme-border rounded-lg px-3 py-2 text-sm bg-acme-card text-acme-text focus:outline-none focus:ring-2 focus:ring-acme-action flex-1 min-w-48" />
        {(['all','direct','non-direct'] as const).map(s => (
          <button key={s} onClick={() => setStaffFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              staffFilter === s ? 'bg-acme-action text-white border-acme-action' : 'bg-acme-card text-acme-muted border-acme-border hover:border-acme-action'
            }`}>{s}</button>
        ))}
      </div>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-acme-border">
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Email</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Job Title</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Staff Type</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Role</th>
            <th className="py-3 px-4 text-right text-xs font-semibold text-acme-muted">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map(i => (
              <tr key={i._id} className="border-b border-acme-border last:border-0 hover:bg-acme-surface transition-colors">
                <td className="py-3 px-4">
                  <Link to={`/admin/individuals/${i._id}`} className="text-acme-action hover:underline font-medium text-sm">{i.personName}</Link>
                </td>
                <td className="py-3 px-4 text-acme-muted text-sm">{i.email}</td>
                <td className="py-3 px-4 text-acme-text text-sm">{i.jobTitle}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    i.staffType === 'direct' ? 'bg-acme-green/10 text-acme-green' : 'bg-acme-amber/10 text-acme-amber'
                  }`}>{i.staffType}</span>
                </td>
                <td className="py-3 px-4">
                  {(() => {
                    if (i.roles.includes('system_admin')) return <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-500/10 text-red-600">Admin</span>
                    const isLeadOrDelegate = teams.some(t => !t.isDeleted && t.members.some(m => m.personId === i._id && m.endDate === null && (m.memberRole === 'Team Leader' || m.memberRole === 'Delegate')))
                    return isLeadOrDelegate
                      ? <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-acme-action/10 text-acme-action">Team Lead</span>
                      : <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-400/10 text-gray-500">Viewer</span>
                  })()}
                </td>
                <td className="py-3 px-4 text-right">
                  <button onClick={() => handleDeactivate(i._id, i.personName)} className="text-xs text-red-500 hover:text-red-700 font-medium">Deactivate</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <p className="text-acme-muted text-sm p-4">No individuals match.</p>}
      </div>

      <FormModal open={modal.open} onClose={modal.reset} title="Add Individual" submitting={modal.submitting} onSubmit={handleSubmit} submitLabel="Add Person">
        <FormInput label="Full Name *" value={modal.form.person_name} onChange={v => modal.field('person_name', v)} required />
        <FormInput label="Email *" value={modal.form.email} onChange={v => modal.field('email', v)} type="email" required />
        <FormInput label="Password *" value={modal.form.password} onChange={v => modal.field('password', v)} type="password" required />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="Job Title" value={modal.form.job_title} onChange={v => modal.field('job_title', v)} />
          <FormSelect label="Staff Type" value={modal.form.staff_type} onChange={v => modal.field('staff_type', v)}
            options={[{ value: 'direct', label: 'Direct' }, { value: 'non-direct', label: 'Non-Direct' }]} />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormInput label="City *" value={modal.form.home_city} onChange={v => modal.field('home_city', v)} placeholder="e.g. London" required />
          <FormInput label="Country *" value={modal.form.home_country} onChange={v => modal.field('home_country', v)} placeholder="e.g. United Kingdom" required />
          <FormSelect label="Region *" value={modal.form.home_region} onChange={v => modal.field('home_region', v)}
            options={[{ value: 'NAM', label: 'NAM' }, { value: 'LATAM', label: 'LATAM' }, { value: 'EMEA', label: 'EMEA' }, { value: 'APAC', label: 'APAC' }]} />
        </div>
        <FormSelect label="Assigned Office (optional)" value={modal.form.assigned_office} onChange={v => modal.field('assigned_office', v)}
          placeholder="Select office…" options={locations.map(l => ({ value: l._id, label: `${l.name} — ${l.city}` }))} />
      </FormModal>
    </div>
  )
}
