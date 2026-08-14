import { useState } from 'react'
import { api } from '../api.js'

const ENDPOINTS = [
  { label: 'GET /flats', fn: () => api.getFlats() },
  { label: 'GET /system-status', fn: () => api.getSystemStatus() },
  { label: 'GET /sub-tanks', fn: () => api.getSubTanks() },
  { label: 'GET /config', fn: () => api.getConfig() },
  { label: 'GET /allocation-log', fn: () => api.getAllocationLog() },
  { label: 'GET /emergency-requests', fn: () => api.listEmergencyRequests() },
  { label: 'POST /allocate', fn: () => api.allocate() },
  { label: 'POST /allocate/hierarchical', fn: () => api.allocateHierarchical() },
  { label: 'POST /crisis/trigger', fn: () => api.triggerCrisis() },
  { label: 'POST /crisis/reset', fn: () => api.resetCrisis() },
]

export default function ApiConsole() {
  const [result, setResult] = useState(null)
  const [activeLabel, setActiveLabel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function call(endpoint) {
    setBusy(true)
    setError('')
    setActiveLabel(endpoint.label)
    try {
      const res = await endpoint.fn()
      setResult(res)
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="card-title">API console</p>
        <p className="card-sub">Call any endpoint directly and inspect the raw response — useful for live verification in front of judges.</p>
        <div className="api-btn-grid">
          {ENDPOINTS.map((ep) => (
            <button
              key={ep.label}
              className={`btn sm ${activeLabel === ep.label ? 'primary' : ''}`}
              disabled={busy}
              onClick={() => call(ep)}
            >
              {ep.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <p className="card-title" style={{ color: 'var(--danger)' }}>Error</p>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--danger)', margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </div>
      )}

      {result && !error && (
        <div className="card">
          <p className="card-title">{activeLabel} response</p>
          <pre style={{
            fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)',
            margin: 0, whiteSpace: 'pre-wrap', maxHeight: 480, overflow: 'auto',
            background: 'var(--bg-panel)', padding: 12, borderRadius: 'var(--radius)',
          }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
