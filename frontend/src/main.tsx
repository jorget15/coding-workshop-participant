if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import { seedMockData } from './store/teamSlice'
import { mockTeams, mockIndividuals, mockLocations, mockAchievements } from './mock/mockData'
import './index.css'
import App from './App'

// Seed mock data when running without a real backend (VITE_API_URL not set)
if (!import.meta.env.VITE_API_URL) {
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
