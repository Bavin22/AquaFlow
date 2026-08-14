import { useState, useEffect, useCallback } from 'react'
import { api } from './api.js'
import Login from './pages/Login.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import ManagerDashboard from './pages/ManagerDashboard.jsx'
import UserDashboard from './pages/UserDashboard.jsx'

const STORAGE_KEY = 'aquaflow_user'

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const [user, setUser] = useState(loadStoredUser)
  const [status, setStatus] = useState(null)

  const handleLogin = useCallback((loggedInUser) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(loggedInUser))
    setUser(loggedInUser)
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
  }, [])

  // Live master-tank status pill in the topbar, independent of whichever
  // dashboard tab is active - polls gently so the crisis state is always
  // visible without needing to switch tabs to see it.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function poll() {
      try {
        const s = await api.getSystemStatus()
        if (!cancelled) setStatus(s)
      } catch {
        // Non-fatal - the topbar pill just stays at its last known value
        // if the backend is briefly unreachable; dashboards below surface
        // the real error state for anything that actually needs it.
      }
    }
    poll()
    const id = setInterval(poll, 6000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="drop" />
          AquaFlow
        </div>

        {status && (
          <span className={`status-pill ${status.status}`}>
            <span className="dot" />
            {status.status === 'crisis' ? 'Crisis' : 'Normal'} · {Math.round(status.available_supply_l).toLocaleString()}L
          </span>
        )}

        <div className="user-chip">
          <span className={`role-badge ${user.role}`}>{user.role}</span>
          <span>{user.name}</span>
          <button className="logout-btn" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      <div className="main">
        {user.role === 'admin' && <AdminDashboard user={user} />}
        {user.role === 'manager' && <ManagerDashboard user={user} />}
        {user.role === 'user' && <UserDashboard user={user} />}
      </div>
    </div>
  )
}
