import React, { useState, useEffect, useCallback } from 'react'
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

  // ============================================================
  // LIVE MASTER TANK STATUS
  // ============================================================

  useEffect(() => {
    if (!user) return

    let cancelled = false

    async function poll() {
      try {
        const s = await api.getSystemStatus()

        if (!cancelled) {
          setStatus(s)
        }
      } catch {
        // Keep the last known status if backend is temporarily unavailable.
      }
    }

    poll()

    const id = setInterval(poll, 6000)

    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [user])

  // ============================================================
  // LOGIN
  // ============================================================

  if (!user) {
    return <Login onLogin={handleLogin} />
  }

  // ============================================================
  // ROLE DISPLAY
  // ============================================================

  const roleLabel =
    user.role === 'admin'
      ? 'Administrator'
      : user.role === 'manager'
        ? 'Water Manager'
        : 'Resident'

  const dashboardLabel =
    user.role === 'admin'
      ? 'Control Center'
      : user.role === 'manager'
        ? 'Operations'
        : 'My Water'

  return (
    <div className="app-shell">

      {/* ======================================================
          TOP NAVIGATION
          ====================================================== */}

      <header className="topbar">

        {/* BRAND */}
        <div className="brand-section">

          <div className="brand">
            <img
              src="/aquaflow-logo.png"
              alt="AquaFlow"
              className="brand-logo"
            />
            <span className="brand-name">
              AquaFlow
            </span>
          </div>

          <span className="nav-divider" />

          <span className="dashboard-label">
            {dashboardLabel}
          </span>

        </div>


        {/* MASTER WATER STATUS */}
        {status && (
          <div
            className={`status-pill ${status.status}`}
            title="Live master tank status"
          >
            <span className="dot" />

            <span>
              {status.status === 'crisis'
                ? 'Crisis'
                : 'System Normal'}
            </span>

            <span className="status-separator">
              ·
            </span>

            <strong>
              {Math.round(
                status.available_supply_l
              ).toLocaleString()}L
            </strong>

          </div>
        )}


        {/* USER / ROLE SECTION */}
        <div className="user-chip">

          <div className="user-info">

            <span className="user-name">
              {user.name}
            </span>

            <span className="user-role-text">
              {roleLabel}
            </span>

          </div>

          <span
            className={`role-badge ${user.role}`}
          >
            {user.role}
          </span>

          <button
            className="logout-btn"
            onClick={handleLogout}
          >
            <span className="logout-icon">↪</span>
            Sign out
          </button>

        </div>

      </header>


      {/* ======================================================
          MAIN APPLICATION CONTENT
          ====================================================== */}

      <main className="main">

        {user.role === 'admin' && (
          <AdminDashboard user={user} />
        )}

        {user.role === 'manager' && (
          <ManagerDashboard user={user} />
        )}

        {user.role === 'user' && (
          <UserDashboard user={user} />
        )}

      </main>

    </div>
  )
}