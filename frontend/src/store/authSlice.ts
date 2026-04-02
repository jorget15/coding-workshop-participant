import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api, { apiError } from '../api'

/** Matches the roles[] array on the individuals collection (R10 in business_decisions.md). */
export type Role = 'system_admin' | 'team_lead' | 'editor' | 'viewer' | 'non-direct'

export interface AuthUser {
  userId:    string
  username:  string
  email:     string
  role:      Role
  staffType: 'direct' | 'non-direct'
  teamId:    string | null  // the team this user belongs to (null for system_admin)
}

interface AuthState {
  isAuthenticated: boolean
  loading:   boolean
  error:     string | null
  userId:    string | null
  username:  string | null
  email:     string | null
  role:      Role | null
  staffType: 'direct' | 'non-direct' | null
  teamId:    string | null
}

const initialState: AuthState = {
  isAuthenticated: false,
  userId:    null,
  username:  null,
  email:     null,
  role:      null,
  staffType: null,
  teamId:    null,
  loading:   false,
  error:     null,
}

/** Decode the stored JWT and restore session without a network call. */
export const restoreAuth = createAsyncThunk(
  'auth/restore',
  async (_, { rejectWithValue }) => {
    const token = localStorage.getItem('acme_token')
    if (!token) return rejectWithValue('no token')
    try {
      // JWT payload is base64url-encoded — decode it client-side (no verify needed here;
      // the backend verifies on every request anyway)
      const payload = JSON.parse(atob(token.split('.')[1]))
      if (payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('acme_token')
        return rejectWithValue('token expired')
      }
      return { ...payload, token }
    } catch {
      localStorage.removeItem('acme_token')
      return rejectWithValue('invalid token')
    }
  }
)

export const loginAsync = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try { return (await api.post('/auth/login', { email, password })).data }
    catch (err) { return rejectWithValue(apiError(err, 'Login failed')) }
  }
)

export interface PersonaPayload extends AuthUser {}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout(state) {
      state.isAuthenticated = false
      state.userId   = null
      state.username = null
      state.role     = null
      state.error    = null
      localStorage.removeItem('acme_token')
    },
    /** Dev-only: swap the active persona without a real login. */
    switchPersona(state, action: { payload: PersonaPayload }) {
      const p = action.payload
      state.isAuthenticated = true
      state.userId    = p.userId
      state.username  = p.username
      state.email     = p.email
      state.role      = p.role
      state.staffType = p.staffType
      state.teamId    = p.teamId   // string | null — matches AuthUser
      state.error     = null
      // Dev personas don't have real JWTs — clear any stored token
      localStorage.removeItem('acme_token')
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreAuth.fulfilled, (state, action) => {
        state.isAuthenticated = true
        state.userId    = action.payload.sub ?? null
        state.username  = action.payload.username ?? null
        state.email     = null  // not in JWT; populate from profile fetch
        state.role      = action.payload.role ?? null
        state.staffType = null  // not in JWT; populate from profile fetch
        state.teamId    = action.payload.team_id ?? null
      })
      .addCase(restoreAuth.rejected, (state) => {
        // Token missing/expired — stay unauthenticated, no error shown
        state.isAuthenticated = false
      })
      .addCase(loginAsync.pending, (state) => {
        state.loading = true
        state.error   = null
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.loading         = false
        state.isAuthenticated = true
        state.userId          = action.payload.user_id
        state.username        = action.payload.username
        state.email           = null  // not in token response; populate from profile fetch
        state.role            = action.payload.role
        state.staffType       = null  // not in token response; populate from profile fetch
        state.teamId          = action.payload.team_id ?? null
        // Persist JWT so axios interceptor can attach it to every request
        if (action.payload.access_token) {
          localStorage.setItem('acme_token', action.payload.access_token)
        }
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.loading = false
        state.error   = action.payload as string
      })
  },
})

export const { logout, switchPersona } = authSlice.actions
export default authSlice.reducer
