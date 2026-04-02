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
import api, { apiError } from '../api'

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
  team_id: string | null
  title: string
  description: string
  achievement_date: string
  awarded_to: string[]
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
    try { return (await api.get('/teams')).data as Team[] }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to fetch teams')) }
  }
)

export const fetchIndividualsAsync = createAsyncThunk(
  'teams/fetchIndividuals',
  async (_, { rejectWithValue }) => {
    try { return (await api.get('/individuals')).data as Individual[] }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to fetch individuals')) }
  }
)

export const fetchLocationsAsync = createAsyncThunk(
  'teams/fetchLocations',
  async (_, { rejectWithValue }) => {
    try { return (await api.get('/metadata/locations')).data as Location[] }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to fetch locations')) }
  }
)

export const fetchAchievementsAsync = createAsyncThunk(
  'teams/fetchAchievements',
  async (teamId: string | undefined, { rejectWithValue }) => {
    try {
      const url = teamId ? `/achievements?teamId=${teamId}` : '/achievements'
      return (await api.get(url)).data as Achievement[]
    } catch (err) { return rejectWithValue(apiError(err, 'Failed to fetch achievements')) }
  }
)

export const createAchievementAsync = createAsyncThunk(
  'teams/createAchievement',
  async (payload: AchievementInput, { rejectWithValue }) => {
    try { return (await api.post('/achievements', payload)).data as Achievement }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to create achievement')) }
  }
)

/* ── Team CRUD ── */

export const createTeamAsync = createAsyncThunk(
  'teams/createTeam',
  async (payload: { team_name: string; description: string; location_id: string }, { rejectWithValue }) => {
    try { return (await api.post('/teams', payload)).data as Team }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to create team')) }
  }
)

export const updateTeamAsync = createAsyncThunk(
  'teams/updateTeam',
  async ({ id, ...payload }: { id: string; team_name?: string; description?: string; location_id?: string }, { rejectWithValue }) => {
    try { return (await api.patch(`/teams/${id}`, payload)).data as Team }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to update team')) }
  }
)

export const closeTeamAsync = createAsyncThunk(
  'teams/closeTeam',
  async (id: string, { rejectWithValue }) => {
    try { return (await api.post(`/teams/${id}/close`)).data as Team }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to close team')) }
  }
)

export const addMemberAsync = createAsyncThunk(
  'teams/addMember',
  async ({ teamId, ...payload }: { teamId: string; person_id: string; member_role: MemberRole }, { rejectWithValue }) => {
    try { return (await api.post(`/teams/${teamId}/members`, payload)).data as Team }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to add member')) }
  }
)

export const removeMemberAsync = createAsyncThunk(
  'teams/removeMember',
  async ({ teamId, personId }: { teamId: string; personId: string }, { rejectWithValue }) => {
    try { return (await api.delete(`/teams/${teamId}/members/${personId}`)).data as Team }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to remove member')) }
  }
)

/* ── Individual CRUD ── */

export const createIndividualAsync = createAsyncThunk(
  'teams/createIndividual',
  async (payload: { person_name: string; email: string; primary_location: string; staff_type: StaffType; job_title: string; password: string }, { rejectWithValue }) => {
    try { return (await api.post('/individuals', payload)).data as Individual }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to create individual')) }
  }
)

export const updateIndividualAsync = createAsyncThunk(
  'teams/updateIndividual',
  async ({ id, ...payload }: { id: string; person_name?: string; email?: string; primary_location?: string; staff_type?: StaffType; job_title?: string }, { rejectWithValue }) => {
    try { return (await api.patch(`/individuals/${id}`, payload)).data as Individual }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to update individual')) }
  }
)

export const deactivateIndividualAsync = createAsyncThunk(
  'teams/deactivateIndividual',
  async (id: string, { rejectWithValue }) => {
    try { return (await api.delete(`/individuals/${id}`)).data as Individual }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to deactivate individual')) }
  }
)

/* ── Location CRUD ── */

export const createLocationAsync = createAsyncThunk(
  'teams/createLocation',
  async (payload: Omit<Location, '_id'>, { rejectWithValue }) => {
    try { return (await api.post('/metadata/locations', payload)).data as Location }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to create location')) }
  }
)

export const updateLocationAsync = createAsyncThunk(
  'teams/updateLocation',
  async ({ id, ...payload }: { id: string; name?: string; city?: string; country?: string; region?: Region; timezone?: string }, { rejectWithValue }) => {
    try { return (await api.patch(`/metadata/locations/${id}`, payload)).data as Location }
    catch (err) { return rejectWithValue(apiError(err, 'Failed to update location')) }
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
      // Team CRUD
      .addCase(createTeamAsync.fulfilled,  (state, action) => { state.teams.push(action.payload) })
      .addCase(updateTeamAsync.fulfilled,  (state, action) => { const i = state.teams.findIndex(t => t._id === action.payload._id); if (i >= 0) state.teams[i] = action.payload })
      .addCase(closeTeamAsync.fulfilled,   (state, action) => { const i = state.teams.findIndex(t => t._id === action.payload._id); if (i >= 0) state.teams[i] = action.payload })
      .addCase(addMemberAsync.fulfilled,   (state, action) => { const i = state.teams.findIndex(t => t._id === action.payload._id); if (i >= 0) state.teams[i] = action.payload })
      .addCase(removeMemberAsync.fulfilled,(state, action) => { const i = state.teams.findIndex(t => t._id === action.payload._id); if (i >= 0) state.teams[i] = action.payload })
      // Individual CRUD
      .addCase(createIndividualAsync.fulfilled,     (state, action) => { state.individuals.push(action.payload) })
      .addCase(updateIndividualAsync.fulfilled,     (state, action) => { const i = state.individuals.findIndex(p => p._id === action.payload._id); if (i >= 0) state.individuals[i] = action.payload })
      .addCase(deactivateIndividualAsync.fulfilled, (state, action) => { const i = state.individuals.findIndex(p => p._id === action.payload._id); if (i >= 0) state.individuals[i] = action.payload })
      // Location CRUD
      .addCase(createLocationAsync.fulfilled, (state, action) => { state.locations.push(action.payload) })
      .addCase(updateLocationAsync.fulfilled, (state, action) => { const i = state.locations.findIndex(l => l._id === action.payload._id); if (i >= 0) state.locations[i] = action.payload })
  },
})

export const {} = teamSlice.actions
export default teamSlice.reducer
