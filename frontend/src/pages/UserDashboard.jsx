import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import Banner from '../components/Banner.jsx'
import TankGauge from '../components/TankGauge.jsx'

export default function UserDashboard({ user }) {
  const [tab, setTab] = useState('tank')
  const [flat, setFlat] = useState(null)
  const [myAlloc, setMyAlloc] = useState(null)
  const [log, setLog] = useState([])
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError('')
    try {
      const [flatRes, logRes, reqRes] = await Promise.all([
        api.getFlat(user.flat_id),
        api.getAllocationLog(user.flat_id),
        api.listEmergencyRequests(null, user.flat_id),
      ])
      setFlat(flatRes)
      setLog(logRes.log)
      setMyAlloc(logRes.log[0] || null)
      setRequests(reqRes.requests)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user.flat_id])

  useEffect(() => { load() }, [load])

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading your tank...</p>

  return (
    <div>
      <Banner type="error" onClose={() => setError('')}>{error}</Banner>

      <div className="tabs">
        <button className={`tab ${tab === 'tank' ? 'active' : ''}`} onClick={() => setTab('tank')}>My tank</button>
        <button className={`tab ${tab === 'log' ? 'active' : ''}`} onClick={() => setTab('log')}>Usage &amp; allocation log</button>
        <button className={`tab ${tab === 'request' ? 'active' : ''}`} onClick={() => setTab('request')}>Request water</button>
      </div>

      {tab === 'tank' && flat && (
        <TankTab flat={flat} allocation={myAlloc} onRefresh={load} />
      )}
      {tab === 'log' && <LogTab log={log} />}
      {tab === 'request' && (
        <RequestTab flatId={user.flat_id} requests={requests} onSubmitted={load} />
      )}
    </div>
  )
}

function TankTab({ flat, allocation, onRefresh }) {
  const pctServed = allocation && allocation.need_l > 0
    ? Math.round((allocation.allocated_l / allocation.need_l) * 100)
    : null

  return (
    <div>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="metric">
          <p className="metric-label">Tank level</p>
          <p className="metric-value accent">{Math.round(flat.tank_level_pct)}%</p>
        </div>
        <div className="metric">
          <p className="metric-label">Capacity</p>
          <p className="metric-value">{flat.tank_capacity_l}L</p>
        </div>
        <div className="metric">
          <p className="metric-label">Household size</p>
          <p className="metric-value">{flat.household_size}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="card-title">Tank fill</p>
        <p className="card-sub">Live reading for {flat.flat_id}{flat.sub_tank_id ? ` · fed by ${flat.sub_tank_id}` : ''}</p>
        <TankGauge pct={flat.tank_level_pct} height={16} />
      </div>

      {allocation ? (
        <div className="card">
          <div className="section-head">
            <h2>Most recent allocation</h2>
            <button className="btn sm" onClick={onRefresh}>Refresh</button>
          </div>
          <div className="grid cols-3" style={{ marginBottom: 14 }}>
            <div className="metric">
              <p className="metric-label">Allocated</p>
              <p className="metric-value accent">{allocation.allocated_l}L</p>
            </div>
            <div className="metric">
              <p className="metric-label">Need</p>
              <p className="metric-value">{allocation.need_l}L</p>
            </div>
            <div className="metric">
              <p className="metric-label">% of need met</p>
              <p className="metric-value">{pctServed}%</p>
            </div>
          </div>
          <div className="tag-row" style={{ marginBottom: 10 }}>
            <span className="tag">priority score {allocation.vulnerability_score}</span>
            {allocation.survival_floor_l > 0 && <span className="tag">guaranteed floor {allocation.survival_floor_l}L</span>}
            {allocation.fair_share_capped && <span className="tag">fair-share capped</span>}
          </div>
          <p className="flat-reason">{allocation.reason}</p>
        </div>
      ) : (
        <div className="card empty-state">No allocation run yet for this cycle.</div>
      )}
    </div>
  )
}

function LogTab({ log }) {
  if (!log.length) {
    return <div className="card empty-state">No allocation history yet — check back after the next allocation cycle runs.</div>
  }
  return (
    <div className="card">
      <p className="card-title">Allocation log</p>
      <p className="card-sub">Every logged allocation cycle for your flat</p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Allocated</th>
            <th>Need</th>
            <th>Score</th>
            <th>Floor</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry, i) => (
            <tr key={i}>
              <td>{entry.allocated_l}L</td>
              <td>{entry.need_l}L</td>
              <td>{entry.vulnerability_score}</td>
              <td>{entry.survival_floor_l ?? 0}L</td>
              <td style={{ fontFamily: 'var(--font-body)', color: 'var(--text-secondary)', fontSize: 12 }}>{entry.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RequestTab({ flatId, requests, onSubmitted }) {
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Describe why you need extra water.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      await api.createEmergencyRequest({
        flat_id: flatId,
        reason: reason.trim(),
        requested_l: amount ? Number(amount) : null,
      })
      setSuccess('Request submitted. An admin or manager will review it.')
      setReason('')
      setAmount('')
      onSubmitted()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p className="card-title">Request additional water</p>
        <p className="card-sub">Use this for medical needs, a leak, or any urgent shortfall — an admin or manager approves or declines it.</p>
        <Banner type="error" onClose={() => setError('')}>{error}</Banner>
        <Banner type="success" onClose={() => setSuccess('')}>{success}</Banner>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label htmlFor="reason">Reason</label>
            <textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Newborn at home, tank ran dry overnight"
            />
          </div>
          <div className="field">
            <label htmlFor="amount">Litres needed (optional)</label>
            <input
              id="amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="200"
            />
          </div>
          <button className="btn primary" disabled={submitting} style={{ alignSelf: 'flex-start' }}>
            {submitting ? <span className="spinner" /> : 'Submit request'}
          </button>
        </form>
      </div>

      <div className="card">
        <p className="card-title">Your requests</p>
        {requests.length === 0 ? (
          <div className="empty-state">No requests submitted yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Reason</th><th>Requested</th><th>Status</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.request_id}>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12.5 }}>{r.reason}</td>
                  <td>{r.requested_l ? `${r.requested_l}L` : '—'}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
