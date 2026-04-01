import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { fetchIndividualsAsync } from '../store/teamSlice'

const STAFF_BADGE: Record<string, string> = {
  'direct':     'bg-acme-green text-white',
  'non-direct': 'bg-acme-muted text-white',
}

/** Lists all active individuals (isDeleted: false — R5). */
export default function Individuals() {
  const dispatch = useDispatch<AppDispatch>()
  const { individuals, loading, error } = useSelector((state: RootState) => state.teams)

  useEffect(() => {
    void dispatch(fetchIndividualsAsync())
  }, [dispatch])

  const active = individuals.filter((i) => !i.isDeleted)

  if (loading) return <p className="p-8 text-acme-muted">Loading…</p>
  if (error)   return <p className="p-8 text-acme-red">{error}</p>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-acme-heading">Individuals</h1>
        <span className="text-acme-muted text-sm">{active.length} people</span>
      </div>

      <div className="flex flex-col gap-3">
        {active.length === 0 && <p className="text-acme-muted">No individuals found.</p>}
        {active.map((person) => (
          <div
            key={person._id}
            className="bg-acme-card border border-acme-border rounded-sm px-5 py-3 flex justify-between items-center"
          >
            <div>
              <p className="font-medium text-acme-text">{person.personName}</p>
              <p className="text-acme-muted text-sm">{person.email} · {person.jobTitle}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${STAFF_BADGE[person.staffType] ?? ''}`}>
              {person.staffType}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
