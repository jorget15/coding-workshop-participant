import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchLocationsAsync, createLocationAsync } from '../../store/teamSlice'
import LocationBadge from '../../components/LocationBadge'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

export default function AdminLocationList() {
  const dispatch = useDispatch<AppDispatch>()
  const { locations, loading } = useSelector((s: RootState) => s.teams)

  const modal = useFormModal(
    { name: '', city: '', country: '', region: 'NAM', timezone: '' },
    createLocationAsync as Parameters<typeof useFormModal>[1],
    'Location created'
  )

  useEffect(() => { dispatch(fetchLocationsAsync()) }, [dispatch])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.name.trim() || !modal.form.city.trim()) { toast.error('Name and city are required'); return }
    modal.submit()
  }

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Locations</h1>
        <button onClick={() => modal.setOpen(true)} className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
          + Add Location
        </button>
      </div>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="bg-acme-card border border-acme-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead><tr className="border-b border-acme-border">
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Name</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">City</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Country</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Region</th>
            <th className="py-3 px-4 text-left text-xs font-semibold text-acme-muted">Timezone</th>
          </tr></thead>
          <tbody>
            {locations.map(l => (
              <tr key={l._id} className="border-b border-acme-border last:border-0">
                <td className="py-3 px-4 text-acme-heading font-medium text-sm">{l.name}</td>
                <td className="py-3 px-4 text-acme-text text-sm">{l.city}</td>
                <td className="py-3 px-4 text-acme-text text-sm">{l.country}</td>
                <td className="py-3 px-4"><LocationBadge city={l.city} region={l.region} /></td>
                <td className="py-3 px-4 text-acme-muted text-sm">{l.timezone}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && locations.length === 0 && <p className="text-acme-muted text-sm p-4">No locations.</p>}
      </div>

      <FormModal open={modal.open} onClose={modal.reset} title="Add Location" submitting={modal.submitting} onSubmit={handleSubmit} submitLabel="Add Location">
        <FormInput label="Name *" value={modal.form.name} onChange={v => modal.field('name', v)} required />
        <div className="grid grid-cols-2 gap-4">
          <FormInput label="City *" value={modal.form.city} onChange={v => modal.field('city', v)} required />
          <FormInput label="Country" value={modal.form.country} onChange={v => modal.field('country', v)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormSelect label="Region" value={modal.form.region} onChange={v => modal.field('region', v)}
            options={['NAM','LATAM','EU','APAC'].map(r => ({ value: r, label: r }))} />
          <FormInput label="Timezone" value={modal.form.timezone} onChange={v => modal.field('timezone', v)} placeholder="America/New_York" />
        </div>
      </FormModal>
    </div>
  )
}
