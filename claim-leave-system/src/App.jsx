import { Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import LeaveApply from './pages/LeaveApply'
import LeaveList from './pages/LeaveList'
import ClaimApply from './pages/ClaimApply'
import ClaimList from './pages/ClaimList'
import Approvals from './pages/Approvals'
import Employees from './pages/Employees'
import SettingsTypes from './pages/SettingsTypes'
import Attendance from './pages/Attendance'
import AttendanceAdmin from './pages/AttendanceAdmin'
import TeamCalendar from './pages/TeamCalendar'
import { ProtectedRoute } from './components/ProtectedRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave/apply"
        element={
          <ProtectedRoute>
            <LeaveApply />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leave"
        element={
          <ProtectedRoute>
            <LeaveList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/claims/new"
        element={
          <ProtectedRoute>
            <ClaimApply />
          </ProtectedRoute>
        }
      />
      <Route
        path="/claims"
        element={
          <ProtectedRoute>
            <ClaimList />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance"
        element={
          <ProtectedRoute>
            <Attendance />
          </ProtectedRoute>
        }
      />
      <Route
        path="/attendance-log"
        element={
          <ProtectedRoute requireManager>
            <AttendanceAdmin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-calendar"
        element={
          <ProtectedRoute>
            <TeamCalendar />
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute requireManager>
            <Approvals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/employees"
        element={
          <ProtectedRoute requireAdmin>
            <Employees />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute requireAdmin>
            <SettingsTypes />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
