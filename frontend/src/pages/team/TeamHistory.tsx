import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../../store'
import { fetchTeamHistoryAsync } from '../../store/teamSlice'
import { formatDateTime } from '../../utils/formatDate'

export default function TeamHistory() {
  const dispatch = useDispatch<AppDispatch>()
  const { teamHistory, loading } = useSelector((s: RootState) => s.teams)
  const { teamId } = useSelector((s: RootState) => s.auth)

  useEffect(() => { if (teamId) dispatch(fetchTeamHistoryAsync(teamId)) }, [dispatch, teamId])

  const history = (teamId ? teamHistory[teamId] : undefined) ?? []

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <h1 className="text-acme-heading text-2xl font-bold">Team History</h1>

      {loading && <p className="text-acme-muted text-sm">Loading…</p>}

      {history.length === 0 ? (
        <p className="text-acme-muted text-sm">No history events recorded yet.</p>
      ) : (
        <ol className="relative border-l border-acme-border pl-6 flex flex-col gap-4">
          {[...history].reverse().map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-9 top-1 w-4 h-4 rounded-full bg-acme-action border-2 border-acme-card" />
              <p className="text-acme-heading font-semibold text-sm">{e.eventType}</p>
              <p className="text-acme-text text-sm">{e.description}</p>
              <p className="text-acme-muted text-xs mt-0.5">{formatDateTime(e.changedAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
