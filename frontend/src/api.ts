import axios from 'axios'

// VITE_API_URL = proxy base (http://localhost:3001 locally, CloudFront URL in production).
// All service routes live under /api so the proxy can route by service name:
//   http://localhost:3001/api/teams  →  teams Lambda
//   http://localhost:3001/api/individuals  →  individuals Lambda
const BASE = (import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? 'http://localhost:3001') + '/api'

const api = axios.create({ baseURL: BASE })

// Attach stored JWT on every outgoing request.
// Token is written to localStorage by authSlice on successful login.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('acme_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
