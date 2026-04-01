import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState, AppDispatch } from '../store'
import { logout } from '../store/authSlice'
import type { Role } from '../store/authSlice'

interface NavItem {
  label: string
  to:    string
}

const ADMIN_LINKS: NavItem[] = [
  { label: 'Dashboard',    to: '/admin/dashboard' },
  { label: 'Teams',        to: '/admin/teams' },
  { label: 'Individuals',  to: '/admin/individuals' },
  { label: 'Achievements', to: '/admin/achievements' },
  { label: 'Locations',    to: '/admin/locations' },
  { label: 'Reports',      to: '/admin/reports' },
]

const TEAM_LEAD_LINKS: NavItem[] = [
  { label: 'My Team',      to: '/team/dashboard' },
  { label: 'Members',      to: '/team/members' },
  { label: 'Achievements', to: '/team/achievements' },
  { label: 'History',      to: '/team/history' },
  { label: 'Browse Teams', to: '/teams' },
  { label: 'My Profile',   to: '/profile' },
]

const EDITOR_LINKS: NavItem[] = [
  { label: 'My Team',      to: '/team' },
  { label: 'Achievements', to: '/achievements' },
  { label: 'My Teammates', to: '/team/people' },
  { label: 'My Profile',   to: '/profile' },
]

const NON_DIRECT_LINKS: NavItem[] = [
  { label: 'My Team',      to: '/team' },
  { label: 'Achievements', to: '/achievements' },
  { label: 'My Profile',   to: '/profile' },
]

function linksForRole(role: Role | undefined): NavItem[] {
  switch (role) {
    case 'system_admin': return ADMIN_LINKS
    case 'team_lead':    return TEAM_LEAD_LINKS
    case 'editor':
    case 'viewer':       return EDITOR_LINKS
    case 'non-direct':   return NON_DIRECT_LINKS
    default:             return []
  }
}

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  function toggle() {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
    setDark(next)
  }
  return { dark, toggle }
}

/** Adaptive sidebar — renders the correct nav links based on the user's role. */
export default function Sidebar() {
  const { role, username } = useSelector((state: RootState) => state.auth)
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { dark, toggle } = useDarkMode()
  const [open, setOpen] = useState(true)

  const links = linksForRole(role)
  const isAdmin = role === 'system_admin'

  function handleLogout() {
    dispatch(logout())
    navigate('/login')
  }

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? isAdmin
          ? 'bg-admin-accent/10 text-admin-accent border border-admin-accent/20'
          : 'bg-acme-action/10 text-acme-action'
        : isAdmin
          ? 'text-admin-muted hover:text-admin-text hover:bg-admin-card'
          : 'text-acme-muted hover:text-acme-heading hover:bg-acme-surface'
    }`

  const sidebarBase = isAdmin
    ? 'bg-admin-surface border-r border-admin-border h-screen flex flex-col'
    : 'bg-acme-card border-r border-acme-border h-screen flex flex-col'

  return (
    <aside className={`${sidebarBase} transition-all ${open ? 'w-60' : 'w-16'}`}>
      {/* Logo / collapse toggle */}
      <div className={`flex items-center gap-3 px-4 py-5 ${isAdmin ? 'border-b border-admin-border' : 'border-b border-acme-border'}`}>
        <button
          onClick={() => setOpen(o => !o)}
          className={`w-8 h-8 rounded-sm flex items-center justify-center shrink-0 ${isAdmin ? 'bg-admin-accent' : 'bg-acme-blue'}`}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          <span className={`font-black text-base ${isAdmin ? 'text-admin-bg' : 'text-white'}`}>A</span>
        </button>
        {open && (
          <span className={`font-bold text-lg tracking-tight truncate ${isAdmin ? 'text-admin-text font-admin' : 'text-acme-heading'}`}>
            ACME Teams
          </span>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 flex flex-col gap-1">
        {links.map(({ label, to }) => (
          <NavLink key={to} to={to} className={linkClass}>
            {open ? label : label.charAt(0)}
          </NavLink>
        ))}
      </nav>

      {/* Footer: username, dark mode, logout */}
      <div className={`px-2 py-4 border-t ${isAdmin ? 'border-admin-border' : 'border-acme-border'} flex flex-col gap-2`}>
        {open && (
          <p className={`px-4 text-xs truncate ${isAdmin ? 'text-admin-muted' : 'text-acme-muted'}`}>
            {username}
          </p>
        )}
        <button
          onClick={toggle}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ${isAdmin ? 'text-admin-muted hover:text-admin-text hover:bg-admin-card' : 'text-acme-muted hover:text-acme-heading hover:bg-acme-surface'}`}
        >
          {dark ? '☀ Light' : '☾ Dark'}
        </button>
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium ${isAdmin ? 'text-admin-red hover:bg-admin-card' : 'text-acme-red hover:bg-acme-surface'}`}
        >
          {open ? 'Sign out' : '↩'}
        </button>
      </div>
    </aside>
  )
}
