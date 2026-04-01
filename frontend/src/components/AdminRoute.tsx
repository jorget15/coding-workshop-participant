import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'

interface Props { children: React.ReactNode }

/** Restricts a route to system_admin users. */
export default function AdminRoute({ children }: Props) {
  const { isAuthenticated, role } = useSelector((state: RootState) => state.auth)
  if (!isAuthenticated)           return <Navigate to="/login" replace />
  if (role !== 'system_admin')    return <Navigate to="/team"  replace />
  return <>{children}</>
}
