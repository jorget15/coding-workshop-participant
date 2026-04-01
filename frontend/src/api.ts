import axios from 'axios'

// In development, Vite proxies /api/* to the Node proxy (http://localhost:3001)
// which routes each service path to the correct Lambda URL.
// In production (CloudFront), VITE_API_URL is set to the CloudFront base URL.
// Using a relative base in dev means the browser never makes a cross-origin
// request — Vite handles the forwarding server-side, so no CORS issues.
const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '') + '/api'
  : '/api'

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
