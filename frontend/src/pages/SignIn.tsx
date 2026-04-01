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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-acme-border rounded-sm px-3 py-2 text-acme-text bg-acme-surface focus:outline-none focus:ring-2 focus:ring-acme-action"
            />
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
