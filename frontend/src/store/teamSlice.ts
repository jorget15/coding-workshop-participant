/* teamSlice — manages teams, individuals, locations from the acme_team_mgmt DB.
 *
 * Schema facts reflected here (from docs/db/acme_schema.js):
 *   - Teams have max 5 active Members (R1); Leader & Delegate excluded from cap.
 *   - Exactly 1 active Team Leader per team (R2).
 *   - An individual can be in multiple teams (R3).
 *   - Locations are controlled refs (R4).
 *   - Soft deletion: isDeleted / deletedAt (R5). All queries filter { isDeleted: false }.
 *   - teamHistory is append-only (R6).
 *   - staffTypeSnapshot is frozen at join time (R7).
 */
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import api from '../api'

export type Region = 'NAM' | 'LATAM' | 'EU' | 'APAC'
export type StaffType = 'direct' | 'non-direct'
export type MemberRole = 'Team Leader' | 'Member' | 'Delegate'

export interface Location {
  _id: string
  name: string
  city: string
  country: string
  region: Region
  timezone: string
}

export interface Individual {
  _id: string
  personName: string
  email: string
  primaryLocation: string
  staffType: StaffType
  roles: string[]
  jobTitle: string
  profilePicture?: string
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface TeamMember {
  personId: string
  personName: string
  memberRole: MemberRole
  staffTypeSnapshot: StaffType
  startDate: string
  endDate: string | null
}

export interface Team {
  _id: string
  teamName: string
  description: string
  primaryLocation: string
  members: TeamMember[]
  reportingHistory: { orgLeaderId: string; orgLeaderName: string; startDate: string; endDate: string | null }[]
  teamHistory: { eventType: string; description: string; occurredAt: string }[]
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface Achievement {
  _id: string
  teamId: string | null        // null = org-level / bounty
  title: string
  description: string
  achievementMonth: string     // YYYY-MM
  impactMetric: string
  tags: string[]
  contributors: { personId: string; personName: string }[]
  proofLink?: string
  createdBy: string
  createdAt: string
}

export interface AchievementInput {
  teamId: string | null
  title: string
  description: string
  achievementMonth: string
  impactMetric: string
  tags: string[]
  contributors: { personId: string; personName: string }[]
  proofLink?: string
}

interface TeamState {
  teams:        Team[]
  individuals:  Individual[]
  locations:    Location[]
  achievements: Achievement[]
  loading:      boolean
  error:        string | null
}

const initialState: TeamState = {
  teams:        [],
  individuals:  [],
  locations:    [],
  achievements: [],
  loading:      false,
  error:        null,
}

export const fetchTeamsAsync = createAsyncThunk(
  'teams/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/teams')
      return res.data as Team[]
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Failed to fetch teams')
    }
  }
)

export const fetchIndividualsAsync = createAsyncThunk(
  'teams/fetchIndividuals',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/individuals')
      return res.data as Individual[]
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Failed to fetch individuals')
    }
  }
)

export const fetchLocationsAsync = createAsyncThunk(
  'teams/fetchLocations',
  async (_, { rejectWithValue }) => {
    try {
      const res = await api.get('/locations')
      return res.data as Location[]
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Failed to fetch locations')
    }
  }
)

export const fetchAchievementsAsync = createAsyncThunk(
  'teams/fetchAchievements',
  async (teamId: string | undefined, { rejectWithValue }) => {
    try {
      const url = teamId ? `/achievements?teamId=${teamId}` : '/achievements'
      const res = await api.get(url)
      return res.data as Achievement[]
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Failed to fetch achievements')
    }
  }
)

export const createAchievementAsync = createAsyncThunk(
  'teams/createAchievement',
  async (payload: AchievementInput, { rejectWithValue }) => {
    try {
      const res = await api.post('/achievements', payload)
      return res.data as Achievement
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } }
      return rejectWithValue(axiosErr.response?.data?.error ?? 'Failed to create achievement')
    }
  }
)

const teamSlice = createSlice({
  name: 'teams',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTeamsAsync.pending,       (state) => { state.loading = true; state.error = null })
      .addCase(fetchTeamsAsync.fulfilled,     (state, action) => { state.loading = false; state.teams        = Array.isArray(action.payload) ? action.payload : [] })
      .addCase(fetchTeamsAsync.rejected,      (state, action) => { state.loading = false; state.error = action.payload as string })
      .addCase(fetchIndividualsAsync.pending,    (state) => { state.loading = true })
      .addCase(fetchIndividualsAsync.fulfilled,  (state, action) => { state.loading = false; state.individuals  = Array.isArray(action.payload) ? action.payload : [] })
      .addCase(fetchIndividualsAsync.rejected,   (state, action) => { state.loading = false; state.error = action.payload as string })
      .addCase(fetchLocationsAsync.pending,   (state) => { state.loading = true })
      .addCase(fetchLocationsAsync.fulfilled, (state, action) => { state.loading = false; state.locations    = Array.isArray(action.payload) ? action.payload : [] })
      .addCase(fetchLocationsAsync.rejected,  (state, action) => { state.loading = false; state.error = action.payload as string })
      .addCase(fetchAchievementsAsync.pending,   (state) => { state.loading = true })
      .addCase(fetchAchievementsAsync.fulfilled, (state, action) => { state.loading = false; state.achievements = Array.isArray(action.payload) ? action.payload : [] })
      .addCase(fetchAchievementsAsync.rejected,  (state, action) => { state.loading = false; state.error = action.payload as string })
      .addCase(createAchievementAsync.fulfilled, (state, action) => { state.achievements.unshift(action.payload) })
  },
})

export default teamSlice.reducer
