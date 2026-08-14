const BASE_URL = 'http://127.0.0.1:8000'

function authHeaders() {
  const raw = localStorage.getItem('aquaflow_user')
  if (!raw) return {}
  try {
    const user = JSON.parse(raw)
    return { 'X-User-Id': user.user_id, 'X-Role': user.role }
  } catch {
    return {}
  }
}

function jainsFairnessIndex(allocations) {
  const fractions = allocations.map((a) =>
    a.need_l > 0.01 ? Math.min(1, a.allocated_l / a.need_l) : 1
  )
  const n = fractions.length
  if (n === 0) return 1
  const sum = fractions.reduce((a, b) => a + b, 0)
  const sumSq = fractions.reduce((a, b) => a + b * b, 0)
  return sumSq === 0 ? 0 : Math.round((sum * sum) / (n * sumSq) * 10000) / 10000
}

function giniCoefficient(allocations) {
  const values = allocations.map((a) => a.allocated_l).sort((a, b) => a - b)
  const n = values.length
  if (n === 0) return 0
  const total = values.reduce((a, b) => a + b, 0)
  if (total === 0) return 0
  const accum = values.reduce((sum, v, i) => sum + (i + 1) * v, 0)
  return Math.round(((2 * accum) / (n * total) - (n + 1) / n) * 10000) / 10000
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) Object.assign(headers, authHeaders())

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new Error(
      `Couldn't reach the backend at ${BASE_URL}. Is uvicorn running?`
    )
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null

  if (!res.ok) {
    const detail = data?.detail || res.statusText || 'Request failed'
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail))
  }
  return data
}

export const api = {
  // auth
  login: (username, password) =>
    request('/auth/login', { method: 'POST', body: { username, password }, auth: false }),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  listUsers: () => request('/users'),

  // flats / system
  getFlats: () => request('/flats'),
  getFlat: (flatId) => request(`/flats/${flatId}`),
  getSystemStatus: () => request('/system-status'),
  getSubTanks: () => request('/sub-tanks'),
  assignSubTank: (flatId, subTankId) =>
    request('/sub-tanks/assign', { method: 'POST', body: { flat_id: flatId, sub_tank_id: subTankId } }),

  // config
  getConfig: () => request('/config'),
  updateConfig: (payload) => request('/config', { method: 'PUT', body: payload }),
  resetConfig: () => request('/config/reset', { method: 'POST' }),

  // allocation
  allocate: () => request('/allocate', { method: 'POST' }),
  allocateHierarchical: async () => {
    const raw = await request('/allocate/hierarchical', { method: 'POST' })
    // The backend's hierarchical shape is genuinely different (nested per
    // sub-tank) since that's the real structure of the computation - but
    // the UI (Flats tab, FlatCard, Last-run-summary) is written once
    // against the single-tank shape. Flatten here, in one place, so both
    // allocation modes render identically instead of the hierarchical
    // button silently updating nothing.
    const allocations = Object.entries(raw.flat_allocation_by_subtank).flatMap(
      ([sub_tank_id, sub]) => sub.allocations.map((a) => ({ ...a, sub_tank_id }))
    )
    return {
      ...raw,
      allocations,
      total_allocated_l: Math.round(allocations.reduce((s, a) => s + a.allocated_l, 0) * 100) / 100,
      total_need_l: Math.round(allocations.reduce((s, a) => s + a.need_l, 0) * 100) / 100,
      bottleneck: Object.values(raw.flat_allocation_by_subtank).some((s) => s.bottleneck === 'supply')
        ? 'supply' : 'none',
      status: raw.master_status,
      jains_fairness_index: jainsFairnessIndex(allocations),
      gini_coefficient: giniCoefficient(allocations),
    }
  },
  getAllocationLog: (flatId) =>
    request(`/allocation-log${flatId ? `?flat_id=${encodeURIComponent(flatId)}` : ''}`),
  triggerCrisis: () => request('/crisis/trigger', { method: 'POST' }),
  resetCrisis: () => request('/crisis/reset', { method: 'POST' }),

  // emergency requests
  createEmergencyRequest: (payload) =>
    request('/emergency-requests', { method: 'POST', body: payload }),
  listEmergencyRequests: (status, flatId) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (flatId) params.set('flat_id', flatId)
    const qs = params.toString()
    return request(`/emergency-requests${qs ? `?${qs}` : ''}`)
  },
  approveEmergencyRequest: (id) =>
    request(`/emergency-requests/${id}/approve`, { method: 'POST' }),
  rejectEmergencyRequest: (id) =>
    request(`/emergency-requests/${id}/reject`, { method: 'POST' }),
}

export { BASE_URL }
