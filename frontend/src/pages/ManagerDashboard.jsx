import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import Banner from '../components/Banner.jsx'
import FlatCard from '../components/FlatCard.jsx'
import ApiConsole from '../components/ApiConsole.jsx'
import EmergencyPanel from '../components/EmergencyPanel.jsx'

export default function ManagerDashboard({ user }) {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [flats, setFlats] = useState([])
  const [allocResult, setAllocResult] = useState(null)
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [s, f, r] = await Promise.all([
        api.getSystemStatus(),
        api.getFlats(),
        api.listEmergencyRequests('pending'),
      ])
      setStatus(s)
      setFlats(f.flats)
      setRequests(r.requests)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function runAction(fn, successMsg) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const res = await fn()
      if (res?.allocations) setAllocResult(res)
      setNotice(successMsg)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleApprove(id) {
    await runAction(() => api.approveEmergencyRequest(id), 'Request approved — it will be prioritized on the next allocation run.')
  }
  async function handleReject(id) {
    await runAction(() => api.rejectEmergencyRequest(id), 'Request rejected.')
  }

  return (
    <div>
      <Banner type="error" onClose={() => setError('')}>{error}</Banner>
      <Banner type="success" onClose={() => setNotice('')}>{notice}</Banner>

      <div className="tabs">
        <button className={`tab ${tab === 'overview' ? 'active' : ''}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`tab ${tab === 'flats' ? 'active' : ''}`} onClick={() => setTab('flats')}>Flats</button>
        <button className={`tab ${tab === 'emergency' ? 'active' : ''}`} onClick={() => setTab('emergency')}>
          Emergency requests{requests.length > 0 ? ` (${requests.length})` : ''}
        </button>
        <button className={`tab ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>API console</button>
      </div>

      {tab === 'overview' && status && (
        <OverviewTab
          status={status}
          allocResult={allocResult}
          busy={busy}
          onTrigger={() => runAction(api.triggerCrisis, 'Crisis triggered — supply halved.')}
          onReset={() => runAction(api.resetCrisis, 'Supply restored to normal.')}
          onAllocate={() => runAction(api.allocate, 'Allocation cycle complete.')}
          onAllocateHierarchical={() => runAction(api.allocateHierarchical, 'Hierarchical allocation complete.')}
        />
      )}

      {tab === 'flats' && (
        <div className="grid cols-3">
          {flats.map((f) => {
            const alloc = allocResult?.allocations?.find((a) => a.flat_id === f.flat_id)
            return <FlatCard key={f.flat_id} flat={f} allocation={alloc} />
          })}
        </div>
      )}

      {tab === 'emergency' && (
        <EmergencyPanel requests={requests} onApprove={handleApprove} onReject={handleReject} busy={busy} />
      )}

      {tab === 'api' && <ApiConsole />}
    </div>
  )
}

function OverviewTab({ status, allocResult, busy, onTrigger, onReset, onAllocate, onAllocateHierarchical }) {
  return (
    <div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="metric">
          <p className="metric-label">Supply</p>
          <p className={`metric-value ${status.status === 'crisis' ? 'crisis' : 'accent'}`}>{status.available_supply_l}L</p>
        </div>
        <div className="metric">
          <p className="metric-label">Capacity</p>
          <p className="metric-value">{status.capacity_l}L</p>
        </div>
        <div className="metric">
          <p className="metric-label">Status</p>
          <p className="metric-value" style={{ textTransform: 'capitalize' }}>{status.status}</p>
        </div>
        {allocResult && (
          <div className="metric">
            <p className="metric-label">Jain's fairness index</p>
            <p className="metric-value accent">{allocResult.jains_fairness_index}</p>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="card-title">Crisis controls</p>
        <p className="card-sub">Trigger halves current supply; reset restores the normal baseline.</p>
        <div className="api-btn-grid">
          <button className="btn crisis-btn" disabled={busy} onClick={onTrigger}>Trigger crisis</button>
          <button className="btn" disabled={busy} onClick={onReset}>Reset to normal</button>
        </div>
      </div>

      <div className="card">
        <p className="card-title">Run allocation</p>
        <p className="card-sub">Re-runs the algorithm against current supply and logs the result.</p>
        <div className="api-btn-grid">
          <button className="btn primary" disabled={busy} onClick={onAllocate}>
            {busy ? <span className="spinner" /> : 'Allocate (single tank)'}
          </button>
          <button className="btn" disabled={busy} onClick={onAllocateHierarchical}>Allocate (hierarchical)</button>
        </div>
      </div>

      {allocResult && (
        <div className="card" style={{ marginTop: 16 }}>
          <p className="card-title">Last run summary</p>
          <div className="grid cols-4">
            <div className="metric">
              <p className="metric-label">Allocated</p>
              <p className="metric-value">{allocResult.total_allocated_l ?? '—'}L</p>
            </div>
            <div className="metric">
              <p className="metric-label">Need</p>
              <p className="metric-value">{allocResult.total_need_l ?? '—'}L</p>
            </div>
            <div className="metric">
              <p className="metric-label">Bottleneck</p>
              <p className="metric-value" style={{ textTransform: 'capitalize' }}>{allocResult.bottleneck ?? '—'}</p>
            </div>
            <div className="metric">
              <p className="metric-label">Gini coefficient</p>
              <p className="metric-value">{allocResult.gini_coefficient ?? '—'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
