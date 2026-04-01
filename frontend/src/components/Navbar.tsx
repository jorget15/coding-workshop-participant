import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import type { RootState, AppDispatch } from '../store'
import { logout } from '../store/authSlice'

/** Persists dark mode preference in localStorage and toggles the html class. */
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

/** Top navigation bar. Hidden on /admin routes (admin has its own layout). */
export default function Navbar() {
  const { isAuthenticated, username } = useSelector((state: RootState) => state.auth)
  const dispatch = useDispatch<AppDispatch>()
  const { dark, toggle } = useDarkMode()
  const { pathname } = useLocation()

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`font-medium transition-colors ${
        pathname === to
          ? 'text-acme-action'
          : 'text-acme-muted hover:text-acme-heading'
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="bg-acme-card border-b border-acme-border shadow-sm">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-3">
          <div className="w-8 h-8 bg-acme-blue rounded-sm flex items-center justify-center">
            <span className="text-white font-black text-base">A</span>
          </div>
          <span className="text-acme-heading font-bold text-xl tracking-tight">ACME Teams</span>
        </Link>

        <div className="flex gap-6 items-center">
          {navLink('/', 'Home')}
          {isAuthenticated && navLink('/teams', 'Teams')}
          {isAuthenticated && navLink('/individuals', 'Individuals')}

          {isAuthenticated ? (
            <>
              <span className="text-acme-muted text-sm border-l border-acme-border pl-6">{username}</span>
              <button
                onClick={() => dispatch(logout())}
                className="border border-acme-border text-acme-text px-4 py-2 rounded-sm hover:bg-acme-surface transition-colors text-sm font-medium"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/signin"
              className="bg-acme-action text-white px-4 py-2 rounded-sm hover:bg-acme-blue transition-colors text-sm font-medium"
            >
              Sign In
            </Link>
          )}

          {/* Dark mode toggle — pinned to the far right */}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="ml-auto text-acme-muted hover:text-acme-heading transition-colors text-lg"
          >
            {dark ? '☀️' : '🌙'}
          </button>
        </div>
      </div>
    </nav>
  )
}
