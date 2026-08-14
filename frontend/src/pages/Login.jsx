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
      const user = await api.login(username.trim(), password)
      onLogin(user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(ellipse at top, #0f171c 0%, #0a0e12 60%)',
    }}>
      <div style={{ width: 380, padding: '0 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto 16px',
            borderRadius: '50% 50% 50% 0', transform: 'rotate(45deg)',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
          }} />
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, margin: '0 0 6px' }}>
            AquaFlow
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, margin: 0 }}>
            Fairness-verified water allocation console
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Banner type="error" onClose={() => setError('')}>{error}</Banner>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn primary" disabled={loading} style={{ marginTop: 4 }}>
            {loading ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 18, fontFamily: 'var(--font-mono)' }}>
          admin / admin123 · manager / manager123 · f1 / password123
        </p>
      </div>
    </div>
  )
}
