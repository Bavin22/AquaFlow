import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import Banner from '../components/Banner.jsx'
import FlatCard from '../components/FlatCard.jsx'
import ApiConsole from '../components/ApiConsole.jsx'
import EmergencyPanel from '../components/EmergencyPanel.jsx'

const CONFIG_FIELDS = [
  { key: 'MEDICAL_POINTS', label: 'Medical priority points', hint: 'Dominant override for medical-flagged flats — keep well above every other field combined', step: 10 },
  { key: 'EMERGENCY_POINTS', label: 'Emergency approval points', hint: 'Same dominant override, applied when you approve an emergency request', step: 10 },
  { key: 'ELDERLY_POINTS', label: 'Points per elderly person', hint: 'Added per elderly resident in a household', step: 1 },
  { key: 'CHILD_POINTS', label: 'Points per child', hint: 'Added per child in a household', step: 1 },
  { key: 'COMBINED_DEPENDENTS_BONUS', label: 'Combined dependents bonus', hint: 'Extra points when a household has both elderly and children', step: 1 },
  { key: 'LARGE_HOUSEHOLD_BONUS', label: 'Large household bonus', hint: 'Extra points for households at/above the threshold below', step: 1 },
  { key: 'LARGE_HOUSEHOLD_THRESHOLD', label: 'Large household threshold', hint: 'Household size that counts as "large"', step: 1 },
  { key: 'SURVIVAL_L_PER_PERSON', label: 'Survival floor, L/person', hint: 'Guaranteed minimum litres per person before ranking starts', step: 1 },
  { key: 'SURVIVAL_FLOOR_PCT_OF_NEED', label: 'Survival floor, % of need', hint: 'Floor also scales as this fraction of a flat\'s own need (0–1)', step: 0.01 },
  { key: 'FAIR_SHARE_PER_PERSON_L', label: 'Fair-share cap, L/person', hint: 'Anti-hoarding ceiling — need never counts for more than this × household size', step: 10 },
]

export default function AdminDashboard({ user }) {
  const [tab, setTab] = useState('overview')
  const [status, setStatus] = useState(null)
  const [flats, setFlats] = useState([])
  const [subTanks, setSubTanks] = useState([])
  const [requests, setRequests] = useState([])
  const [allocResult, setAllocResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const totalRequirement = flats.reduce((total, flat) => {
    const tankLevel = Number(flat.tank_level_pct || 0)
    const capacity = Number(flat.tank_capacity_l || 0)

    const need = Math.max(0, 100 - tankLevel) / 100 * capacity

    return total + need
  }, 0)

  const load = useCallback(async () => {
    setError('')

    try {
      const [s, f, st, r] = await Promise.all([
        api.getSystemStatus(),
        api.getFlats(),
        api.getSubTanks(),
        api.listEmergencyRequests('pending'),
      ])

      setStatus(s)
      setFlats(f.flats)
      setSubTanks(st.sub_tanks)
      setRequests(r.requests)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runAction(fn, successMsg) {
    setBusy(true)
    setError('')
    setNotice('')

    try {
      const res = await fn()

      if (res?.allocations) {
        setAllocResult(res)
      }

      setNotice(successMsg)

      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Banner
        type="error"
        onClose={() => setError('')}
      >
        {error}
      </Banner>

      <Banner
        type="success"
        onClose={() => setNotice('')}
      >
        {notice}
      </Banner>

      <div className="tabs">
        <button
          className={`tab ${tab === 'overview' ? 'active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>

        <button
          className={`tab ${tab === 'flats' ? 'active' : ''}`}
          onClick={() => setTab('flats')}
        >
          Flats
        </button>

        <button
          className={`tab ${tab === 'config' ? 'active' : ''}`}
          onClick={() => setTab('config')}
        >
          Algorithm config
        </button>

        <button
          className={`tab ${tab === 'tanks' ? 'active' : ''}`}
          onClick={() => setTab('tanks')}
        >
          Tank hierarchy
        </button>

        <button
          className={`tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          Users
        </button>

        <button
          className={`tab ${tab === 'emergency' ? 'active' : ''}`}
          onClick={() => setTab('emergency')}
        >
          Emergency requests
          {requests.length > 0 ? ` (${requests.length})` : ''}
        </button>

        <button
          className={`tab ${tab === 'api' ? 'active' : ''}`}
          onClick={() => setTab('api')}
        >
          API console
        </button>
      </div>

      {tab === 'overview' && status && (
        <OverviewTab
          status={status}
          totalRequirement={totalRequirement}
          allocResult={allocResult}
          busy={busy}

          onAddWater={(amount) =>
            runAction(
              () => api.addWater(amount),
              `${amount}L water added to the tank.`
            )
          }

          onTrigger={() =>
            runAction(
              api.triggerCrisis,
              'Crisis triggered.'
            )
          }

          onReset={() =>
            runAction(
              api.resetCrisis,
              'Supply restored to normal.'
            )
          }

          onAllocate={() =>
            runAction(
              api.allocate,
              'Allocation cycle complete.'
            )
          }

          onAllocateHierarchical={() =>
            runAction(
              api.allocateHierarchical,
              'Hierarchical allocation complete.'
            )
          }
        />
      )}

      {tab === 'flats' && (
        <div className="grid cols-3">
          {flats.map((f) => {
            const alloc = allocResult?.allocations?.find(
              (a) => a.flat_id === f.flat_id
            )

            return (
              <FlatCard
                key={f.flat_id}
                flat={f}
                allocation={alloc}
              />
            )
          })}
        </div>
      )}

      {tab === 'config' && (
        <ConfigTab
          onSaved={(msg) => {
            setNotice(msg)
            setError('')
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {tab === 'tanks' && (
        <TanksTab
          flats={flats}
          subTanks={subTanks}
          onAssigned={async (msg) => {
            setNotice(msg)
            await load()
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {tab === 'users' && (
        <UsersTab
          flats={flats}
          onError={(msg) => setError(msg)}
          onCreated={(msg) => setNotice(msg)}
        />
      )}

      {tab === 'emergency' && (
        <EmergencyPanel
          requests={requests}
          busy={busy}
          onApprove={(id) =>
            runAction(
              () => api.approveEmergencyRequest(id),
              'Request approved — prioritized on the next allocation run.'
            )
          }
          onReject={(id) =>
            runAction(
              () => api.rejectEmergencyRequest(id),
              'Request rejected.'
            )
          }
        />
      )}

      {tab === 'api' && <ApiConsole />}
    </div>
  )
}


/* =========================================================
   OVERVIEW TAB
   ========================================================= */

function OverviewTab({
  status,
  totalRequirement,
  allocResult,
  busy,
  onAddWater,
  onTrigger,
  onReset,
  onAllocate,
  onAllocateHierarchical
}) {
  const [waterAmount, setWaterAmount] = useState('')

  return (
    <div>

      {/* =====================================================
          WELCOME HEADER
          ===================================================== */}

      <div className="admin-welcome">
        <h1>
          Welcome back, Admin 👋
        </h1>

        <p>
          Monitor and manage your community water distribution.
        </p>
      </div>


      {/* =====================================================
          SUMMARY METRICS
          ===================================================== */}

      <div
        className="grid cols-4"
        style={{ marginBottom: 18 }}
      >

        {/* Available Supply */}

        <div className="metric">

          <p className="metric-label">
            Available Supply
          </p>

          <p
            className={`metric-value ${
              status.status === 'crisis'
                ? 'crisis'
                : 'accent'
            }`}
          >
            {status.available_supply_l}L
          </p>

        </div>


        {/* Total Requirement */}

        <div className="metric">

          <p className="metric-label">
            Total Requirement
          </p>

          <p className="metric-value">
            {totalRequirement.toFixed(2)}L
          </p>

        </div>


        {/* Capacity */}

        <div className="metric">

          <p className="metric-label">
            Tank Capacity
          </p>

          <p className="metric-value">
            {status.capacity_l}L
          </p>

        </div>


        {/* Status */}

        <div className="metric">

          <p className="metric-label">
            System Status
          </p>

          <p
            className={`metric-value ${
              status.status === 'crisis'
                ? 'crisis'
                : 'accent'
            }`}
            style={{
              textTransform: 'capitalize'
            }}
          >
            {status.status}
          </p>

        </div>

      </div>


      {/* =====================================================
          MASTER WATER TANK
          ===================================================== */}

      <div className="master-tank-card">

        <div className="master-tank-info">

          <p className="master-tank-label">
            AQUAFLOW MASTER TANK
          </p>

          <h2 className="master-tank-title">
            Community Water Supply
          </h2>

          <p className="master-tank-subtitle">
            Current water available for allocation
          </p>

          <div className="master-tank-value">
            {status.available_supply_l} L
          </div>

          <p className="master-tank-subtitle">
            of {status.capacity_l} L total capacity
          </p>

        </div>


        {/* Circular Tank Indicator */}

        <div
          className="water-ring"
          style={{
            '--water-percent': `${Math.min(
              100,
              Math.max(
                0,
                (status.available_supply_l /
                  status.capacity_l) *
                  100
              )
            )}%`
          }}
        >

          <div className="water-ring-content">

            <div className="water-ring-percent">

              {Math.round(
                Math.min(
                  100,
                  Math.max(
                    0,
                    (status.available_supply_l /
                      status.capacity_l) *
                      100
                  )
                )
              )}%

            </div>

            <div className="water-ring-label">
              tank level
            </div>

          </div>

        </div>

      </div>


      {/* =====================================================
          ADD WATER
          ===================================================== */}

      <div className="water-action-card">

        <div className="water-action-text">

          <h3>
            Add Water
          </h3>

          <p>
            Refill the master tank with additional water.
          </p>

        </div>


        <div className="water-action-form">

          <div className="field">

            <label htmlFor="water-amount">
              Amount of water (L)
            </label>

            <input
              id="water-amount"
              type="number"
              min="1"
              step="100"
              value={waterAmount}
              onChange={(e) =>
                setWaterAmount(e.target.value)
              }
              placeholder="Enter amount"
            />

          </div>


          <button
            className="btn primary"
            disabled={
              busy ||
              !waterAmount ||
              Number(waterAmount) <= 0
            }
            onClick={async () => {

              const amount = Number(waterAmount)

              await onAddWater(amount)

              setWaterAmount('')

            }}
          >
            Add Water
          </button>

        </div>

      </div>


      {/* =====================================================
          SYSTEM CONTROLS
          ===================================================== */}

      <div
        className="card"
        style={{ marginTop: 18 }}
      >

        <div className="allocation-card-head">

          <h3>
            System Controls
          </h3>

          <p>
            Manage the current water availability state.
          </p>

        </div>


        <div className="allocation-actions">

          <button
            className="btn crisis-btn"
            disabled={busy}
            onClick={onTrigger}
          >
            Trigger Crisis
          </button>


          <button
            className="btn"
            disabled={busy}
            onClick={onReset}
          >
            Reset to Normal
          </button>

        </div>

      </div>


      {/* =====================================================
          WATER ALLOCATION
          ===================================================== */}

      <div className="allocation-card">

        <div className="allocation-card-head">

          <h3>
            Water Allocation
          </h3>

          <p>
            Choose how water should be distributed
            across the community.
          </p>

        </div>


        <div className="allocation-actions">

          <button
            className="btn primary"
            disabled={busy}
            onClick={onAllocate}
          >
            {busy
              ? <span className="spinner" />
              : 'Allocate — Single Tank'}
          </button>


          <button
            className="btn"
            disabled={busy}
            onClick={onAllocateHierarchical}
          >
            Allocate — Hierarchical
          </button>

        </div>

      </div>


      {/* =====================================================
          ALLOCATION RESULTS
          ===================================================== */}

      {allocResult && (

        <div
          className="grid cols-3"
          style={{ marginTop: 18 }}
        >

          {/* Jain's Fairness Index */}

          <div className="metric">

            <p className="metric-label">
              Jain's Fairness Index
            </p>

            <p className="metric-value accent">
              {allocResult.jains_fairness_index}
            </p>

          </div>


          {/* Gini Coefficient */}

          <div className="metric">

            <p className="metric-label">
              Gini Coefficient
            </p>

            <p className="metric-value">
              {allocResult.gini_coefficient}
            </p>

          </div>


          {/* Allocated Water */}

          <div className="metric">

            <p className="metric-label">
              Allocated Water
            </p>

            <p className="metric-value accent">
              {allocResult.total_allocated_l}L
            </p>

          </div>

        </div>

      )}

    </div>
  )
}


/* =========================================================
   CONFIG TAB
   ========================================================= */

function ConfigTab({ onSaved, onError }) {
  const [values, setValues] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.getConfig()
      .then(setValues)
      .catch((e) => onError(e.message))
  }, [])

  function update(key, raw) {
    const num = raw === '' ? '' : Number(raw)
    setValues((v) => ({
      ...v,
      [key]: num
    }))
  }

  async function handleSave() {
    setSaving(true)
    onError('')

    try {
      const payload = {}

      for (const f of CONFIG_FIELDS) {
        if (
          values[f.key] !== '' &&
          values[f.key] !== undefined
        ) {
          payload[f.key] = values[f.key]
        }
      }

      const updated = await api.updateConfig(payload)

      setValues(updated)

      onSaved(
        'Config saved and applied to the next allocation run.'
      )

    } catch (err) {
      onError(err.message)

    } finally {
      setSaving(false)
    }
  }

  async function handleReset() {
    setSaving(true)
    onError('')

    try {
      const updated = await api.resetConfig()

      setValues(updated)

      onSaved(
        'Config restored to verified defaults.'
      )

    } catch (err) {
      onError(err.message)

    } finally {
      setSaving(false)
    }
  }

  if (!values) {
    return (
      <p style={{ color: 'var(--text-secondary)' }}>
        Loading config...
      </p>
    )
  }

  return (
    <div className="card">

      <div className="section-head">

        <div>

          <p
            className="card-title"
            style={{ marginBottom: 2 }}
          >
            Algorithm constants
          </p>

          <p
            className="card-sub"
            style={{ marginBottom: 0 }}
          >
            Changes apply to every allocation run
            from this point forward — nothing retroactive.
          </p>

        </div>

      </div>


      {CONFIG_FIELDS.map((f) => (

        <div
          className="config-row"
          key={f.key}
        >

          <div>

            <div className="config-label">
              {f.label}
            </div>

            <div className="config-hint">
              {f.hint}
            </div>

          </div>


          <input
            type="number"
            step={f.step}
            value={values[f.key] ?? ''}
            onChange={(e) =>
              update(f.key, e.target.value)
            }
          />

        </div>

      ))}


      <div
        className="api-btn-grid"
        style={{ marginTop: 16 }}
      >

        <button
          className="btn primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving
            ? <span className="spinner" />
            : 'Save changes'}
        </button>

        <button
          className="btn"
          disabled={saving}
          onClick={handleReset}
        >
          Restore defaults
        </button>

      </div>

    </div>
  )
}


/* =========================================================
   TANKS TAB
   ========================================================= */

function TanksTab({
  flats,
  subTanks,
  onAssigned,
  onError
}) {
  const [flatId, setFlatId] = useState('')
  const [subTankId, setSubTankId] = useState('')
  const [assigning, setAssigning] = useState(false)

  async function handleAssign(e) {
    e.preventDefault()

    if (!flatId || !subTankId) {
      onError(
        'Choose both a flat and a sub-tank.'
      )
      return
    }

    setAssigning(true)
    onError('')

    try {
      await api.assignSubTank(
        flatId,
        subTankId
      )

      await onAssigned(
        `${flatId} assigned to ${subTankId}.`
      )

    } catch (err) {
      onError(err.message)

    } finally {
      setAssigning(false)
    }
  }

  return (
    <div>

      <div
        className="card"
        style={{ marginBottom: 16 }}
      >

        <p className="card-title">
          Assign a flat to a sub-tank
        </p>

        <p className="card-sub">
          Defines the two-level hierarchy:
          which sub-tank feeds which flats.
        </p>


        <form
          onSubmit={handleAssign}
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'flex-end',
            flexWrap: 'wrap'
          }}
        >

          <div
            className="field"
            style={{ minWidth: 160 }}
          >

            <label htmlFor="flat-select">
              Flat
            </label>

            <select
              id="flat-select"
              value={flatId}
              onChange={(e) =>
                setFlatId(e.target.value)
              }
            >

              <option value="">
                Select a flat
              </option>

              {flats.map((f) => (

                <option
                  key={f.flat_id}
                  value={f.flat_id}
                >
                  {f.flat_id}
                  {f.sub_tank_id
                    ? ` (currently ${f.sub_tank_id})`
                    : ''}
                </option>

              ))}

            </select>

          </div>


          <div
            className="field"
            style={{ minWidth: 160 }}
          >

            <label htmlFor="tank-select">
              Sub-tank
            </label>

            <select
              id="tank-select"
              value={subTankId}
              onChange={(e) =>
                setSubTankId(e.target.value)
              }
            >

              <option value="">
                Select a sub-tank
              </option>

              {subTanks.map((t) => (

                <option
                  key={t.sub_tank_id}
                  value={t.sub_tank_id}
                >
                  {t.sub_tank_id} — {t.name}
                </option>

              ))}

            </select>

          </div>


          <button
            className="btn primary"
            disabled={assigning}
          >
            {assigning
              ? <span className="spinner" />
              : 'Assign'}
          </button>

        </form>

      </div>


      <div className="card">

        <p className="card-title">
          Current hierarchy
        </p>

        <table className="data-table">

          <thead>

            <tr>
              <th>Sub-tank</th>
              <th>Capacity</th>
              <th>Level</th>
              <th>Dependent flats</th>
            </tr>

          </thead>


          <tbody>

            {subTanks.map((t) => {

              const dependents =
                flats.filter(
                  (f) =>
                    f.sub_tank_id ===
                    t.sub_tank_id
                )

              return (
                <tr
                  key={t.sub_tank_id}
                >

                  <td>
                    {t.sub_tank_id} — {t.name}
                  </td>

                  <td>
                    {t.tank_capacity_l}L
                  </td>

                  <td>
                    {t.tank_level_pct}%
                  </td>

                  <td>
                    {dependents.length} flats
                  </td>

                </tr>
              )
            })}

          </tbody>

        </table>

      </div>

    </div>
  )
}


/* =========================================================
   USERS TAB
   ========================================================= */

function UsersTab({
  flats,
  onError,
  onCreated
}) {
  const [users, setUsers] = useState([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('user')
  const [flatId, setFlatId] = useState('')
  const [creating, setCreating] = useState(false)

  const loadUsers = useCallback(() => {
    api.listUsers()
      .then((r) => setUsers(r.users))
      .catch((e) => onError(e.message))
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  async function handleCreate(e) {
    e.preventDefault()

    if (
      !username.trim() ||
      !password ||
      (role === 'user' && !flatId)
    ) {
      onError(
        role === 'user'
          ? 'Username, password, and a flat are required.'
          : 'Username and password are required.'
      )

      return
    }

    setCreating(true)
    onError('')

    try {

      await api.createUser({
        username: username.trim(),
        password,
        role,
        name: name.trim() || username.trim(),
        flat_id:
          role === 'user'
            ? flatId
            : undefined,
      })

      onCreated(
        `Login created for ${username.trim()}.`
      )

      setUsername('')
      setPassword('')
      setName('')
      setFlatId('')

      loadUsers()

    } catch (err) {
      onError(err.message)

    } finally {
      setCreating(false)
    }
  }

  return (
    <div>

      <div
        className="card"
        style={{ marginBottom: 16 }}
      >

        <p className="card-title">
          Add a login
        </p>


        <form
          onSubmit={handleCreate}
          className="grid cols-3"
          style={{
            alignItems: 'flex-end'
          }}
        >

          <div className="field">

            <label htmlFor="u-name">
              Display name
            </label>

            <input
              id="u-name"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              placeholder="Priya Nair"
            />

          </div>


          <div className="field">

            <label htmlFor="u-username">
              Username
            </label>

            <input
              id="u-username"
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              placeholder="priya"
            />

          </div>


          <div className="field">

            <label htmlFor="u-password">
              Password
            </label>

            <input
              id="u-password"
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="••••••••"
            />

          </div>


          <div className="field">

            <label htmlFor="u-role">
              Role
            </label>

            <select
              id="u-role"
              value={role}
              onChange={(e) =>
                setRole(e.target.value)
              }
            >

              <option value="user">
                User
              </option>

              <option value="manager">
                Manager
              </option>

              <option value="admin">
                Admin
              </option>

            </select>

          </div>


          {role === 'user' && (

            <div className="field">

              <label htmlFor="u-flat">
                Linked flat
              </label>

              <select
                id="u-flat"
                value={flatId}
                onChange={(e) =>
                  setFlatId(e.target.value)
                }
              >

                <option value="">
                  Select a flat
                </option>

                {flats.map((f) => (

                  <option
                    key={f.flat_id}
                    value={f.flat_id}
                  >
                    {f.flat_id}
                  </option>

                ))}

              </select>

            </div>

          )}


          <button
            className="btn primary"
            disabled={creating}
          >
            {creating
              ? <span className="spinner" />
              : 'Create login'}
          </button>

        </form>

      </div>


      <div className="card">

        <p className="card-title">
          All logins
        </p>


        <table className="data-table">

          <thead>

            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Flat</th>
            </tr>

          </thead>


          <tbody>

            {users.map((u) => (

              <tr key={u.user_id}>

                <td>
                  {u.name}
                </td>

                <td>
                  {u.username}
                </td>

                <td>
                  <span
                    className={`role-badge ${u.role}`}
                  >
                    {u.role}
                  </span>
                </td>

                <td>
                  {u.flat_id || '—'}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}