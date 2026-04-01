import { useState, type FormEvent } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import type { AppDispatch, RootState } from '../store'
import { loginAsync } from '../store/authSlice'

export default function SignIn() {
  const dispatch  = useDispatch<AppDispatch>()
  const navigate  = useNavigate()
  const { loading } = useSelector((state: RootState) => state.auth)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const result = await dispatch(loginAsync({ email, password }))
    if (loginAsync.fulfilled.match(result)) {
      navigate(result.payload.role === 'admin' ? '/admin' : '/teams')
    } else {
      toast.error(result.payload as string)
    }
  }

  return (
    <div className="min-h-screen bg-acme-surface flex items-center justify-center px-6">
      <div className="bg-acme-card border border-acme-border rounded-sm shadow-sm w-full max-w-sm p-8">
        <h2 className="text-2xl font-bold text-acme-heading mb-6">Sign In</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-acme-text mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-acme-border rounded-sm px-3 py-2 text-acme-text bg-acme-surface focus:outline-none focus:ring-2 focus:ring-acme-action"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-acme-text mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-acme-border rounded-sm px-3 py-2 pr-10 text-acme-text bg-acme-surface focus:outline-none focus:ring-2 focus:ring-acme-action"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute inset-y-0 right-2 flex items-center text-acme-muted hover:text-acme-text"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-acme-action text-white py-2 rounded-sm font-semibold hover:bg-acme-blue transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
