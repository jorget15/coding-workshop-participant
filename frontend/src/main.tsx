if (localStorage.getItem('theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import { restoreAuth } from './store/authSlice'
import './index.css'
import App from './App'

// Restore JWT session from localStorage (no network call)
store.dispatch(restoreAuth())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
)
