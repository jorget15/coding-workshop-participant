if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import { restoreAuth } from './store/authSlice'
import { seedMockData } from './store/teamSlice'
import { mockTeams, mockIndividuals, mockLocations, mockAchievements } from './mock/mockData'
import './index.css'
import App from './App'

// Restore JWT session from localStorage (no network call)
store.dispatch(restoreAuth())

// Seed mock data only when explicitly requested (VITE_USE_MOCK=true in .env.local).
// On CloudFront (production), VITE_API_URL is empty but we still want real API calls.
if (import.meta.env.VITE_USE_MOCK === 'true') {
  store.dispatch(seedMockData({
    teams: mockTeams,
    individuals: mockIndividuals,
    locations: mockLocations,
    achievements: mockAchievements,
  }))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
