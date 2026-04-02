/**
 * DevRoleSwitcher — floating persona panel, dev mode only.
 * Rendered only when import.meta.env.DEV is true.
 * Lets you switch between role personas without editing code.
 */
import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { switchPersona } from '../store/authSlice'
import type { PersonaPayload } from '../store/authSlice'
import type { RootState } from '../store'

const PERSONAS: (PersonaPayload & { label: string })[] = [
  {
    label:     '🔴 System Admin',
    userId:    'ind_001',
    username:  'Jorge Taban',
    email:     'jorge@acme.com',
    role:      'system_admin',
    staffType: 'direct',
    teamId:    null,
  },
  {
    label:     '🟠 Team Lead',
    userId:    'ind_003',
    username:  'Jorge2 Taban',
    email:     'jorge2@acme.com',
    role:      'team_lead',
    staffType: 'direct',
    teamId:    'team_001',
  },
  {
    label:     '� Viewer (Member)',
    userId:    'ind_012',
    username:  'Dan Brown',
    email:     'dan@acme.com',
    role:      'viewer',
    staffType: 'non-direct',
    teamId:    'team_002',
  },
]

export default function DevRoleSwitcher() {
  const dispatch = useDispatch()
  const currentRole = useSelector((s: RootState) => s.auth.role)
  const username    = useSelector((s: RootState) => s.auth.username)
  const [open, setOpen] = useState(false)

  if (!import.meta.env.DEV) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 font-mono text-xs">
      {open && (
        <div className="mb-2 rounded-lg border border-gray-600 bg-gray-900 text-white shadow-xl w-56">
          <div className="px-3 py-2 border-b border-gray-700 text-gray-400 uppercase tracking-widest text-[10px]">
            Dev — Switch Persona
          </div>
          <div className="p-1">
            {PERSONAS.map((p) => (
              <button
                key={p.role}
                onClick={() => { dispatch(switchPersona(p)); setOpen(false) }}
                className={`w-full text-left px-3 py-2 rounded hover:bg-gray-700 transition-colors ${
                  currentRole === p.role ? 'bg-gray-700 text-white' : 'text-gray-300'
                }`}
              >
                {p.label}
                {currentRole === p.role && (
                  <span className="ml-2 text-green-400 text-[10px]">✓ active</span>
                )}
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-gray-700 text-gray-500 text-[10px] truncate">
            {username} · {currentRole}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-auto flex items-center gap-1.5 rounded-full bg-gray-900 border border-gray-600 text-white px-3 py-1.5 shadow-lg hover:bg-gray-700 transition-colors"
        title="Dev: switch role persona"
      >
        <span>🛠</span>
        <span>{currentRole ?? 'no role'}</span>
      </button>
    </div>
  )
}
