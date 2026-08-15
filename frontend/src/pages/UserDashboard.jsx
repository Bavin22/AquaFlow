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

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="user-loading">
        <div className="spinner" />
        <p>Loading your tank...</p>
      </div>
    )
  }

  return (
    <div>

      {/* =====================================================
          ERROR
          ===================================================== */}

      <Banner
        type="error"
        onClose={() => setError('')}
      >
        {error}
      </Banner>


      {/* =====================================================
          WELCOME HEADER
          ===================================================== */}

      <div className="user-welcome">

        <div>

          <p className="user-eyebrow">
            AQUAFLOW RESIDENT PORTAL
          </p>

          <h1>
            Welcome back 👋
          </h1>

          <p>
            Monitor your household water supply,
            allocation and requests.
          </p>

        </div>

        <div className="user-flat-badge">

          <span>
            FLAT
          </span>

          <strong>
            {user.flat_id}
          </strong>

        </div>

      </div>


      {/* =====================================================
          NAVIGATION
          ===================================================== */}

      <div className="tabs user-tabs">

        <button
          className={`tab ${tab === 'tank' ? 'active' : ''}`}
          onClick={() => setTab('tank')}
        >
          My Tank
        </button>

        <button
          className={`tab ${tab === 'log' ? 'active' : ''}`}
          onClick={() => setTab('log')}
        >
          Usage &amp; Allocation
        </button>

        <button
          className={`tab ${tab === 'request' ? 'active' : ''}`}
          onClick={() => setTab('request')}
        >
          Request Water
        </button>

      </div>


      {/* =====================================================
          TANK TAB
          ===================================================== */}

      {tab === 'tank' && flat && (
        <TankTab
          flat={flat}
          allocation={myAlloc}
          onRefresh={load}
        />
      )}


      {/* =====================================================
          LOG TAB
          ===================================================== */}

      {tab === 'log' && (
        <LogTab log={log} />
      )}


      {/* =====================================================
          REQUEST TAB
          ===================================================== */}

      {tab === 'request' && (
        <RequestTab
          flatId={user.flat_id}
          requests={requests}
          onSubmitted={load}
        />
      )}

    </div>
  )
}


/* =========================================================
   TANK TAB
   ========================================================= */

function TankTab({
  flat,
  allocation,
  onRefresh
}) {
  const pctServed =
    allocation && allocation.need_l > 0
      ? Math.round(
          (allocation.allocated_l /
            allocation.need_l) * 100
        )
      : null

  const tankPercent = Math.min(
    100,
    Math.max(
      0,
      Number(flat.tank_level_pct || 0)
    )
  )

  const currentLitres =
    Math.round(
      (tankPercent / 100) *
      Number(flat.tank_capacity_l || 0)
    )


  return (
    <div>


      {/* =====================================================
          TOP METRICS
          ===================================================== */}

      <div
        className="grid cols-3"
        style={{ marginBottom: 18 }}
      >

        <div className="metric">

          <p className="metric-label">
            Tank Level
          </p>

          <p className="metric-value accent">
            {Math.round(tankPercent)}%
          </p>

        </div>


        <div className="metric">

          <p className="metric-label">
            Tank Capacity
          </p>

          <p className="metric-value">
            {flat.tank_capacity_l}L
          </p>

        </div>


        <div className="metric">

          <p className="metric-label">
            Household Size
          </p>

          <p className="metric-value">
            {flat.household_size}
          </p>

        </div>

      </div>


      {/* =====================================================
          MAIN WATER TANK
          ===================================================== */}

      <div className="user-tank-card">

        <div className="user-tank-info">

          <p className="user-tank-label">
            MY WATER TANK
          </p>

          <h2>
            {flat.flat_id}
          </h2>

          <p className="user-tank-subtitle">

            {flat.sub_tank_id
              ? `Fed by ${flat.sub_tank_id}`
              : 'Community water supply'}

          </p>


          <div className="user-tank-litres">
            {currentLitres}L
          </div>

          <p className="user-tank-capacity">
            of {flat.tank_capacity_l}L capacity
          </p>

        </div>


        {/* =================================================
            CIRCULAR WATER LEVEL
            ================================================= */}

        <div
          className="user-water-ring"
          style={{
            '--user-water-percent': `${tankPercent}%`
          }}
        >

          <div className="user-water-ring-inner">

            <strong>
              {Math.round(tankPercent)}%
            </strong>

            <span>
              tank level
            </span>

          </div>

        </div>

      </div>


      {/* =====================================================
          TANK GAUGE
          ===================================================== */}

      <div className="user-gauge-card">

        <div className="user-gauge-head">

          <div>

            <p className="card-title">
              Tank fill
            </p>

            <p className="card-sub">
              Live reading for {flat.flat_id}
            </p>

          </div>

          <span className="user-level-badge">
            {Math.round(tankPercent)}%
          </span>

        </div>


        <TankGauge
          pct={flat.tank_level_pct}
          height={16}
        />

      </div>


      {/* =====================================================
          MOST RECENT ALLOCATION
          ===================================================== */}

      {allocation ? (

        <div className="user-allocation-card">

          <div className="user-allocation-head">

            <div>

              <p className="user-tank-label">
                LATEST ALLOCATION
              </p>

              <h2>
                Your water allocation
              </h2>

              <p>
                Most recent allocation cycle
              </p>

            </div>


            <button
              className="btn sm"
              onClick={onRefresh}
            >
              Refresh
            </button>

          </div>


          {/* Allocation metrics */}

          <div
            className="grid cols-3"
            style={{ marginTop: 18 }}
          >

            <div className="metric">

              <p className="metric-label">
                Allocated
              </p>

              <p className="metric-value accent">
                {allocation.allocated_l}L
              </p>

            </div>


            <div className="metric">

              <p className="metric-label">
                Water Needed
              </p>

              <p className="metric-value">
                {allocation.need_l}L
              </p>

            </div>


            <div className="metric">

              <p className="metric-label">
                Requirement Met
              </p>

              <p className="metric-value">
                {pctServed ?? 0}%
              </p>

            </div>

          </div>


          {/* Requirement progress */}

          {pctServed !== null && (

            <div className="user-allocation-progress">

              <div className="user-progress-head">

                <span>
                  Your requirement served
                </span>

                <strong>
                  {pctServed}%
                </strong>

              </div>


              <div className="user-progress-bar">

                <div
                  className="user-progress-fill"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, pctServed)
                    )}%`
                  }}
                />

              </div>

            </div>

          )}


          {/* Priority information */}

          <div className="tag-row">

            <span className="tag">
              priority score {allocation.vulnerability_score}
            </span>

            {allocation.survival_floor_l > 0 && (

              <span className="tag">
                guaranteed floor {allocation.survival_floor_l}L
              </span>

            )}

            {allocation.fair_share_capped && (

              <span className="tag">
                fair-share capped
              </span>

            )}

          </div>


          {/* Detailed reason */}

          <div className="user-allocation-reason">

            <div className="user-reason-icon">
              💧
            </div>

            <div>

              <span>
                Why this amount was allocated
              </span>

              <p>
                {allocation.reason}
              </p>

            </div>

          </div>

        </div>

      ) : (

        <div className="card empty-state">

          <div className="user-empty-icon">
            💧
          </div>

          <h3>
            No allocation yet
          </h3>

          <p>
            No allocation run has been recorded
            for your flat yet.
          </p>

        </div>

      )}

    </div>
  )
}


/* =========================================================
   LOG TAB
   ========================================================= */

function LogTab({ log }) {

  if (!log.length) {

    return (
      <div className="card empty-state">

        <div className="user-empty-icon">
          ◷
        </div>

        <h3>
          No allocation history yet
        </h3>

        <p>
          Check back after the next allocation
          cycle runs.
        </p>

      </div>
    )
  }


  return (
    <div>

      <div className="user-section-heading">

        <div>

          <p className="user-eyebrow">
            WATER HISTORY
          </p>

          <h2>
            Usage &amp; Allocation
          </h2>

          <p>
            Every logged allocation cycle for your flat.
          </p>

        </div>

      </div>


      <div className="user-log-list">

        {log.map((entry, i) => (

          <div
            className="user-log-card"
            key={i}
          >

            <div className="user-log-main">

              <div className="user-log-water">

                <span>
                  Allocated
                </span>

                <strong>
                  {entry.allocated_l}L
                </strong>

              </div>


              <div className="user-log-detail">

                <span>
                  Need
                </span>

                <strong>
                  {entry.need_l}L
                </strong>

              </div>


              <div className="user-log-detail">

                <span>
                  Priority score
                </span>

                <strong>
                  {entry.vulnerability_score}
                </strong>

              </div>


              <div className="user-log-detail">

                <span>
                  Survival floor
                </span>

                <strong>
                  {entry.survival_floor_l ?? 0}L
                </strong>

              </div>

            </div>


            <div className="user-log-reason">

              <span>
                Allocation reason
              </span>

              <p>
                {entry.reason}
              </p>

            </div>

          </div>

        ))}

      </div>

    </div>
  )
}


/* =========================================================
   REQUEST WATER TAB
   ========================================================= */

function RequestTab({
  flatId,
  requests,
  onSubmitted
}) {
  const [reason, setReason] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)


  async function handleSubmit(e) {

    e.preventDefault()

    if (!reason.trim()) {

      setError(
        'Describe why you need extra water.'
      )

      return
    }

    setError('')
    setSubmitting(true)

    try {

      await api.createEmergencyRequest({
        flat_id: flatId,
        reason: reason.trim(),
        requested_l:
          amount
            ? Number(amount)
            : null,
      })

      setSuccess(
        'Request submitted. An admin or manager will review it.'
      )

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


      {/* =====================================================
          REQUEST HEADER
          ===================================================== */}

      <div className="user-section-heading">

        <div>

          <p className="user-eyebrow">
            EMERGENCY WATER
          </p>

          <h2>
            Request Additional Water
          </h2>

          <p>
            Submit a request when your household
            requires additional water.
          </p>

        </div>

      </div>


      {/* =====================================================
          REQUEST FORM
          ===================================================== */}

      <div className="user-request-card">

        <div className="user-request-intro">

          <div className="user-request-icon">
            !
          </div>

          <div>

            <h3>
              Need additional water?
            </h3>

            <p>
              Use this for medical needs, a leak,
              or any urgent shortfall. An admin or
              manager will review your request.
            </p>

          </div>

        </div>


        <Banner
          type="error"
          onClose={() => setError('')}
        >
          {error}
        </Banner>


        <Banner
          type="success"
          onClose={() => setSuccess('')}
        >
          {success}
        </Banner>


        <form
          onSubmit={handleSubmit}
          className="user-request-form"
        >

          <div className="field">

            <label htmlFor="reason">
              Why do you need additional water?
            </label>

            <textarea
              id="reason"
              rows={4}
              value={reason}
              onChange={(e) =>
                setReason(e.target.value)
              }
              placeholder="Example: Newborn at home, tank ran dry overnight..."
            />

          </div>


          <div className="field">

            <label htmlFor="amount">
              Litres needed
              <span className="optional-label">
                optional
              </span>
            </label>

            <input
              id="amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value)
              }
              placeholder="200"
            />

          </div>


          <button
            className="btn primary"
            disabled={submitting}
          >
            {submitting
              ? <span className="spinner" />
              : 'Submit Water Request'}
          </button>

        </form>

      </div>


      {/* =====================================================
          REQUEST HISTORY
          ===================================================== */}

      <div className="user-requests-card">

        <div className="user-section-card-head">

          <div>

            <h3>
              Your Requests
            </h3>

            <p>
              Track the status of your submitted
              emergency water requests.
            </p>

          </div>

          <span className="user-request-count">
            {requests.length}
          </span>

        </div>


        {requests.length === 0 ? (

          <div className="user-request-empty">

            <div className="user-empty-icon">
              ✓
            </div>

            <p>
              No requests submitted yet.
            </p>

          </div>

        ) : (

          <div className="user-request-history">

            {requests.map((r) => (

              <div
                className="user-request-history-item"
                key={r.request_id}
              >

                <div className="user-request-history-top">

                  <span
                    className={`badge ${r.status}`}
                  >
                    {r.status}
                  </span>

                  <span className="user-request-date">
                    {new Date(
                      r.created_at
                    ).toLocaleString()}
                  </span>

                </div>


                <p className="user-request-history-reason">
                  {r.reason}
                </p>


                <div className="user-request-history-bottom">

                  <span>
                    Requested
                  </span>

                  <strong>
                    {r.requested_l
                      ? `${r.requested_l}L`
                      : '—'}
                  </strong>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>
  )
}