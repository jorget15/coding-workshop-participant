import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamsAsync, fetchLocationsAsync, createTeamAsync } from '../../store/teamSlice'
import TeamCard from '../../components/TeamCard'
import FormModal from '../../components/FormModal'
import { FormInput, FormSelect } from '../../components/FormField'
import { useFormModal } from '../../hooks/useFormModal'
import toast from 'react-hot-toast'

const REGIONS = ['NAM','LATAM','EU','APAC'] as const

export default function AdminTeamList() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, locations, loading } = useSelector((s: RootState) => s.teams)
  const [search,  setSearch]  = useState('')
  const [regions, setRegions] = useState<string[]>([])

  const modal = useFormModal(
    { team_name: '', description: '', location_id: '' },
    createTeamAsync as Parameters<typeof useFormModal>[1],
    'Team created'
  )

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchLocationsAsync())
  }, [dispatch])

  const active = teams.filter(t => !t.isDeleted)
  const filtered = active.filter(t => {
    const matchSearch  = t.teamName.toLowerCase().includes(search.toLowerCase())
    const loc          = locations.find(l => l._id === t.teamHomeLocation)
    const matchRegion  = regions.length === 0 || (loc && regions.includes(loc.region))
    return matchSearch && matchRegion
  })

  function toggleRegion(r: string) {
    setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modal.form.team_name.trim()) { toast.error('Team name is required'); return }
    modal.submit()
  }

  return (
    <div className="flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-acme-heading text-2xl font-bold">Teams</h1>
        <button onClick={() => modal.setOpen(true)} className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
          + Create Team
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…"
          className="border border-acme-border rounded-lg px-3 py-2 text-sm bg-acme-card text-acme-text focus:outline-none focus:ring-2 focus:ring-acme-action" />
        <div className="flex gap-2">
          {REGIONS.map(r => (
            <button key={r} onClick={() => toggleRegion(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                regions.includes(r) ? 'bg-acme-action text-white border-acme-action' : 'bg-acme-card text-acme-muted border-acme-border hover:border-acme-action'
              }`}>{r}</button>
          ))}
        </div>
      </div>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => <TeamCard key={t._id} team={t} locations={locations} />)}
      </div>
      {!loading && filtered.length === 0 && <p className="text-acme-muted text-sm">No teams match your filters.</p>}

      <FormModal open={modal.open} onClose={modal.reset} title="Create Team" submitting={modal.submitting} onSubmit={handleSubmit} submitLabel="Create Team">
        <FormInput label="Team Name *" value={modal.form.team_name} onChange={v => modal.field('team_name', v)} required />
        <FormInput label="Description" value={modal.form.description} onChange={v => modal.field('description', v)} />
        <FormSelect label="Location" value={modal.form.location_id} onChange={v => modal.field('location_id', v)}
          placeholder="Select location…" options={locations.map(l => ({ value: l._id, label: `${l.name} — ${l.city}` }))} />
      </FormModal>
    </div>
  )
}
