import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'

/** Landing page. */
export default function Home() {
  const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated)

  return (
    <div className="min-h-screen bg-acme-surface flex flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-bold text-acme-heading">ACME Team Management</h1>
      <p className="text-acme-muted max-w-md text-lg">
        Track teams, members, locations, and achievements across your organisation.
      </p>
      {isAuthenticated ? (
        <Link
          to="/teams"
          className="bg-acme-action text-white px-6 py-3 rounded-sm font-semibold hover:bg-acme-blue transition-colors"
        >
          View Teams
        </Link>
      ) : (
        <Link
          to="/signin"
          className="bg-acme-action text-white px-6 py-3 rounded-sm font-semibold hover:bg-acme-blue transition-colors"
        >
          Sign In
        </Link>
      )}
    </div>
  )
}
