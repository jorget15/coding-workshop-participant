import { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { formatDateTime } from '../utils/formatDate'
import type { RootState, AppDispatch } from '../store'
import { fetchIndividualHistoryAsync, fetchIndividualsAsync } from '../store/teamSlice'
import Avatar from '../components/Avatar'

export default function MyProfile() {
  const dispatch = useDispatch<AppDispatch>()
  const user = useSelector((s: RootState) => s.auth)
  const { individuals, individualHistory } = useSelector((s: RootState) => s.teams)

  useEffect(() => {
    dispatch(fetchIndividualsAsync())
    if (user.userId) dispatch(fetchIndividualHistoryAsync(user.userId))
  }, [dispatch, user.userId])

  const me = individuals.find(i => i._id === user.userId)

  const roleBadge: Record<string, string> = {
    system_admin: 'bg-purple-600 text-white',
    team_lead:    'bg-blue-600 text-white',
    viewer:       'bg-gray-500 text-white',
  }

  const roleBadgeColor = user.role ? (roleBadge[user.role] ?? 'bg-gray-400 text-white') : 'bg-gray-400 text-white'

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Avatar + name */}
      <div className="flex items-center gap-6">
        <Avatar
          name={user.username ?? 'User'}
          src={me?.profilePicture}
          size="xl"
          className="ring-4 ring-acme-accent"
        />
        <div>
          <h1 className="text-2xl font-bold text-acme-heading">{user.username}</h1>
          <p className="text-sm text-acme-muted">{user.email}</p>
          {user.role && (
            <span className={`mt-2 inline-block text-xs font-semibold px-2 py-1 rounded ${roleBadgeColor}`}>
              {user.role.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>

      {/* Details card */}
      <div className="rounded-xl border border-acme-border bg-acme-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-acme-heading">Account Details</h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-acme-muted">User ID</dt>
            <dd className="font-mono text-acme-text">{user.userId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-acme-muted">Staff Type</dt>
            <dd className="capitalize text-acme-text">{user.staffType ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-acme-muted">Team</dt>
            <dd className="text-acme-text">{user.teamId ?? 'No team assigned'}</dd>
          </div>
          <div>
            <dt className="text-acme-muted">Role</dt>
            <dd className="capitalize text-acme-text">{user.role?.replace('_', ' ') ?? '—'}</dd>
          </div>
        </dl>
      </div>

      {/* Change History */}
      {user.userId && (
        <div className="rounded-xl border border-acme-border bg-acme-surface p-6 space-y-4">
          <h2 className="text-lg font-semibold text-acme-heading">My History</h2>
          {(individualHistory[user.userId] ?? []).length === 0 ? (
            <p className="text-acme-muted text-sm">No change history recorded.</p>
          ) : (
            <ol className="relative border-l border-acme-border pl-6 flex flex-col gap-3">
              {[...(individualHistory[user.userId] ?? [])].reverse().map((e, i) => (
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
      )}
    </div>
  )
}

