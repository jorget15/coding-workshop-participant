import { useSelector } from 'react-redux'
import type { RootState } from '../store'

/** Admin-only dashboard — always dark terminal theme. */
export default function AdminDashboard() {
  const { username } = useSelector((state: RootState) => state.auth)

  return (
    <div className="min-h-screen bg-admin-bg text-admin-text font-admin p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-admin-accent mb-1">Admin Console</h1>
        <p className="text-admin-muted text-sm mb-8">Logged in as {username}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Teams',       color: 'text-admin-accent' },
            { label: 'Individuals', color: 'text-admin-green'  },
            { label: 'Locations',   color: 'text-admin-amber'  },
          ].map(({ label, color }) => (
            <div key={label} className="bg-admin-card border border-admin-border rounded-sm p-5">
              <p className="text-admin-muted text-xs uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>—</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
