import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchLocationsAsync } from '../../store/teamSlice'
import LocationBadge from '../../components/LocationBadge'

export default function AdminLocationList() {
  const dispatch = useDispatch<AppDispatch>()
  const { locations, loading } = useSelector((s: RootState) => s.teams)

  useEffect(() => { dispatch(fetchLocationsAsync()) }, [dispatch])

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-acme-heading text-2xl font-bold">Locations</h1>
        <button className="px-4 py-2 bg-acme-action text-white rounded-lg text-sm font-medium hover:bg-acme-blue transition-colors">
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
    </div>
  )
}
