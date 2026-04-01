import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api'

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

interface AuthState extends Partial<AuthUser> {
  isAuthenticated: boolean
  loading: boolean
  error:   string | null
}

const initialState: AuthState = {
  isAuthenticated: true,
  userId:    'dev-001',
  username:  'Dev User',
  email:     'dev@acme.com',
  role:      'system_admin',
  staffType: 'direct',
  teamId:    null,
  loading:   false,
  error:     null,
}

export const loginAsync = createAsyncThunk(
  'auth/login',
  async ({ email, password }: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const res = await api.post('/login', { email, password })
      return res.data // { userId, name, role }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Login failed')
    }
  }
)

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
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAsync.pending, (state) => {
        state.loading = true
        state.error   = null
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.loading         = false
        state.isAuthenticated = true
        state.userId          = action.payload.userId
        state.username        = action.payload.name
        state.email           = action.payload.email
        state.role            = action.payload.role
        state.staffType       = action.payload.staffType
        state.teamId          = action.payload.teamId ?? null
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.loading = false
        state.error   = action.payload as string
      })
  },
})

export const { logout } = authSlice.actions
export default authSlice.reducer
