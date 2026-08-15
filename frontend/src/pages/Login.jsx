import { useState } from 'react'
import { api } from '../api.js'
import Banner from '../components/Banner.jsx'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()

    if (!username.trim() || !password) {
      setError('Enter a username and password.')
      return
    }

    setError('')
    setLoading(true)

    try {
      const user = await api.login(
        username.trim(),
        password
      )

      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">

      {/* =====================================================
          BACKGROUND DECORATION
          ===================================================== */}

      <div className="login-bg-circle circle-one" />
      <div className="login-bg-circle circle-two" />
      <div className="login-bg-circle circle-three" />


      {/* =====================================================
          LOGIN CONTAINER
          ===================================================== */}

      <div className="login-container">

        {/* ===================================================
            BRAND
            =================================================== */}

        <div className="login-brand">

          <div className="login-logo">

            <img src="/aquaflow-logo.png" alt="AquaFlow logo"/>

          </div>

          <h1>
            AquaFlow
          </h1>

          <p>
            Smart Water Allocation System
          </p>

        </div>


        {/* ===================================================
            LOGIN CARD
            =================================================== */}

        <form
          onSubmit={handleSubmit}
          className="login-card"
        >

          <div className="login-card-header">

            <h2>
              Welcome back
            </h2>

            <p>
              Sign in to access your AquaFlow dashboard.
            </p>

          </div>


          {/* =================================================
              ERROR
              ================================================= */}

          <Banner
            type="error"
            onClose={() => setError('')}
          >
            {error}
          </Banner>


          {/* =================================================
              USERNAME
              ================================================= */}

          <div className="field login-field">

            <label htmlFor="username">
              Username
            </label>

            <div className="login-input-wrapper">

              <span className="login-input-icon">
                ◉
              </span>

              <input
                id="username"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value)
                }
                placeholder="Enter your username"
                autoFocus
                autoComplete="username"
              />

            </div>

          </div>


          {/* =================================================
              PASSWORD
              ================================================= */}

          <div className="field login-field">

            <label htmlFor="password">
              Password
            </label>

            <div className="login-input-wrapper">

              <span className="login-input-icon">
                ◆
              </span>

              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder="Enter your password"
                autoComplete="current-password"
              />

            </div>

          </div>


          {/* =================================================
              SIGN IN
              ================================================= */}

          <button
            type="submit"
            className="btn primary login-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Signing in...
              </>
            ) : (
              <>
                Sign in
                <span className="login-arrow">
                  →
                </span>
              </>
            )}
          </button>


          {/* =================================================
              SECURITY MESSAGE
              ================================================= */}

          <div className="login-security">

            <span className="login-security-icon">
              ✓
            </span>

            <span>
              Secure access to your water management dashboard
            </span>

          </div>

        </form>


        {/* ===================================================
            DEMO ACCOUNTS
            =================================================== */}

        {/*<div className="login-demo">

          <p className="login-demo-title">
            DEMO ACCOUNTS
          </p>

          <div className="login-demo-list">

            <span>
              admin / admin123
            </span>

            <span>
              manager / manager123
            </span>

            <span>
              f1 / password123
            </span>

          </div>

        </div>*/}


        {/* ===================================================
            FOOTER
            =================================================== */}

        <p className="login-footer">
          AquaFlow · Fair &amp; intelligent water allocation
        </p>

      </div>

    </div>
  )
}