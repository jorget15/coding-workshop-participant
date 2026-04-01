import { useSelector } from 'react-redux'
import type { RootState } from '../store'

export default function MyProfile() {
  const user = useSelector((s: RootState) => s.auth)

  const avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username ?? 'User')}&background=1e3a5f&color=fff&size=128`

  const roleBadge: Record<string, string> = {
    system_admin: 'bg-purple-600 text-white',
    team_lead:    'bg-blue-600 text-white',
    editor:       'bg-green-600 text-white',
    viewer:       'bg-gray-500 text-white',
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Avatar + name */}
      <div className="flex items-center gap-6">
        <img
          src={avatar}
          alt={user.username}
          className="w-24 h-24 rounded-full ring-4 ring-acme-accent"
        />
        <div>
          <h1 className="text-2xl font-bold text-acme-heading">{user.username}</h1>
          <p className="text-sm text-acme-muted">{user.email}</p>
          {user.role && (
            <span className={`mt-2 inline-block text-xs font-semibold px-2 py-1 rounded ${roleBadge[user.role] ?? 'bg-gray-400 text-white'}`}>
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
    </div>
  )
}

