import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import type { Role } from '../store/authSlice'

interface Props {
  children: React.ReactNode
  /** If provided, only users with one of these roles may access this route. */
  roles?: Role[]
}

/** Redirects unauthenticated users to /login. Optionally restricts by role. */
export default function ProtectedRoute({ children, roles }: Props) {
  const { isAuthenticated, role } = useSelector((state: RootState) => state.auth)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (roles && role && !roles.includes(role)) return <Navigate to="/team" replace />
  return <>{children}</>
}
