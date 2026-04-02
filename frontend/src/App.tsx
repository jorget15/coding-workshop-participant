import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { Toaster } from 'react-hot-toast'
import AppLayout from './components/AppLayout'
import DevRoleSwitcher from './components/DevRoleSwitcher'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'
import type { RootState } from './store'

// Auth
import LoginPage from './pages/LoginPage'

/** Redirects to the correct home page based on the user's role. */
function RoleHome() {
  const role = useSelector((s: RootState) => s.auth.role)
  switch (role) {
    case 'system_admin': return <Navigate to="/admin/dashboard" replace />
    case 'team_lead':    return <Navigate to="/team/dashboard" replace />
    default:             return <Navigate to="/team" replace />
  }
}

// Admin pages
import AdminDashboard     from './pages/admin/AdminDashboard'
import AdminTeamList      from './pages/admin/AdminTeamList'
import AdminTeamDetail    from './pages/admin/AdminTeamDetail'
import AdminIndividualList    from './pages/admin/AdminIndividualList'
import AdminIndividualProfile from './pages/admin/AdminIndividualProfile'
import AdminAchievementFeed   from './pages/admin/AdminAchievementFeed'
import AdminLocationList  from './pages/admin/AdminLocationList'
import AdminReports       from './pages/admin/AdminReports'
import AdminReportBuilder    from './pages/admin/AdminReportBuilder'
import AdminMetricsDashboard from './pages/admin/AdminMetricsDashboard'

// Team lead pages
import TeamLeadDashboard  from './pages/team/TeamLeadDashboard'
import ManageMembers      from './pages/team/ManageMembers'
import TeamAchievements   from './pages/team/TeamAchievements'
import TeamHistory        from './pages/team/TeamHistory'

// Editor / viewer / non-direct pages
import MyTeam             from './pages/team/MyTeam'
import MyTeammates        from './pages/team/MyTeammates'

// Shared authenticated pages
import BrowseTeams        from './pages/BrowseTeams'
import TeamDetailReadOnly from './pages/TeamDetailReadOnly'
import AchievementFeed    from './pages/AchievementFeed'
import MyProfile          from './pages/MyProfile'

function AuthenticatedApp() {
  return (
    <AppLayout>
      <Routes>
        {/* Admin */}
        <Route path="/admin/dashboard"          element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/admin/teams"              element={<AdminRoute><AdminTeamList /></AdminRoute>} />
        <Route path="/admin/teams/:id"          element={<AdminRoute><AdminTeamDetail /></AdminRoute>} />
        <Route path="/admin/individuals"        element={<AdminRoute><AdminIndividualList /></AdminRoute>} />
        <Route path="/admin/individuals/:id"    element={<AdminRoute><AdminIndividualProfile /></AdminRoute>} />
        <Route path="/admin/achievements"       element={<AdminRoute><AdminAchievementFeed /></AdminRoute>} />
        <Route path="/admin/locations"          element={<AdminRoute><AdminLocationList /></AdminRoute>} />
        <Route path="/admin/reports"            element={<AdminRoute><AdminReports /></AdminRoute>} />
        <Route path="/admin/report-builder"    element={<AdminRoute><AdminReportBuilder /></AdminRoute>} />
        <Route path="/admin/metrics"           element={<AdminRoute><AdminMetricsDashboard /></AdminRoute>} />

        {/* Team lead */}
        <Route path="/team/dashboard" element={<ProtectedRoute roles={['system_admin','team_lead']}><TeamLeadDashboard /></ProtectedRoute>} />
        <Route path="/team/members"   element={<ProtectedRoute roles={['system_admin','team_lead']}><ManageMembers /></ProtectedRoute>} />
        <Route path="/team/achievements" element={<ProtectedRoute><TeamAchievements /></ProtectedRoute>} />
        <Route path="/team/history"   element={<ProtectedRoute roles={['system_admin','team_lead']}><TeamHistory /></ProtectedRoute>} />

        {/* Direct staff */}
        <Route path="/team/people"    element={<ProtectedRoute roles={['system_admin','team_lead','viewer']}><MyTeammates /></ProtectedRoute>} />
        <Route path="/team"           element={<ProtectedRoute><MyTeam /></ProtectedRoute>} />

        {/* Team browsing */}
        <Route path="/teams"          element={<ProtectedRoute roles={['system_admin','team_lead']}><BrowseTeams /></ProtectedRoute>} />
        <Route path="/teams/:id"      element={<ProtectedRoute roles={['system_admin','team_lead']}><TeamDetailReadOnly /></ProtectedRoute>} />

        {/* Shared */}
        <Route path="/achievements"   element={<ProtectedRoute><AchievementFeed /></ProtectedRoute>} />
        <Route path="/profile"        element={<ProtectedRoute><MyProfile /></ProtectedRoute>} />

        {/* Root → role-appropriate home */}
        <Route path="/" element={<RoleHome />} />

        {/* Fallback */}
        <Route path="*" element={<RoleHome />} />
      </Routes>
    </AppLayout>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*"     element={<ProtectedRoute><AuthenticatedApp /></ProtectedRoute>} />
      </Routes>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <DevRoleSwitcher />
    </BrowserRouter>
  )
}

