import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import teamReducer from './teamSlice'

export const store = configureStore({
  reducer: {
    auth:  authReducer,
    teams: teamReducer,
  },
})

export type RootState   = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
