import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchTeamsAsync, fetchLocationsAsync } from '../store/teamSlice'
import TeamCard from '../components/TeamCard'

export default function BrowseTeams() {
  const dispatch = useDispatch<AppDispatch>()
  const { teams, locations, loading } = useSelector((s: RootState) => s.teams)
  const [search, setSearch] = useState('')

  useEffect(() => {
    dispatch(fetchTeamsAsync())
    dispatch(fetchLocationsAsync())
  }, [dispatch])

  const active   = teams.filter(t => !t.isDeleted)
  const filtered = active.filter(t => t.teamName.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <h1 className="text-acme-heading text-2xl font-bold">Browse Teams</h1>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search teams…"
        className="border border-acme-border rounded-lg px-3 py-2 text-sm bg-acme-card text-acme-text focus:outline-none focus:ring-2 focus:ring-acme-action max-w-xs"
      />

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(t => <TeamCard key={t._id} team={t} locations={locations} basePath="/teams" />)}
      </div>
      {!loading && filtered.length === 0 && <p className="text-acme-muted text-sm">No teams found.</p>}
    </div>
  )
}
