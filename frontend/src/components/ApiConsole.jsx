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
    <div className="api-console">

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="api-console-header">

        <div>

          <p className="user-eyebrow">
            DEVELOPER TOOLS
          </p>

          <h2>
            API Console
          </h2>

          <p>
            Test AquaFlow endpoints and inspect live responses.
          </p>

        </div>

        <div className="api-console-badge">
          <span className="api-status-dot" />
          LIVE API
        </div>

      </div>


      {/* =====================================================
          ENDPOINT PANEL
          ===================================================== */}

      <div className="api-console-panel">

        <div className="api-console-panel-head">

          <div>

            <h3>
              Available Endpoints
            </h3>

            <p>
              Select an endpoint to execute the request.
            </p>

          </div>

          <span className="api-endpoint-count">
            {ENDPOINTS.length} endpoints
          </span>

        </div>


        <div className="api-btn-grid">

          {ENDPOINTS.map((ep) => {

            const isActive =
              activeLabel === ep.label

            const isPost =
              ep.label.startsWith('POST')

            return (
              <button
                key={ep.label}
                className={`api-endpoint-btn ${
                  isActive ? 'active' : ''
                } ${isPost ? 'post' : 'get'}`}
                disabled={busy}
                onClick={() => call(ep)}
              >

                <span
                  className={`api-method ${
                    isPost ? 'post' : 'get'
                  }`}
                >
                  {isPost ? 'POST' : 'GET'}
                </span>

                <span className="api-path">
                  {ep.label
                    .replace('GET ', '')
                    .replace('POST ', '')}
                </span>

                {isActive && busy && (
                  <span className="api-spinner" />
                )}

              </button>
            )
          })}

        </div>

      </div>


      {/* =====================================================
          ERROR
          ===================================================== */}

      {error && (

        <div className="api-response-card api-error">

          <div className="api-response-header">

            <div className="api-response-title">

              <span className="api-response-icon error">
                !
              </span>

              <div>

                <h3>
                  Request Failed
                </h3>

                <p>
                  {activeLabel}
                </p>

              </div>

            </div>

          </div>


          <pre className="api-response-body error-text">
            {error}
          </pre>

        </div>

      )}


      {/* =====================================================
          SUCCESS RESPONSE
          ===================================================== */}

      {result && !error && (

        <div className="api-response-card">

          <div className="api-response-header">

            <div className="api-response-title">

              <span className="api-response-icon success">
                ✓
              </span>

              <div>

                <h3>
                  API Response
                </h3>

                <p>
                  {activeLabel}
                </p>

              </div>

            </div>


            <span className="api-success-badge">
              200 OK
            </span>

          </div>


          <div className="api-json-wrapper">

            <pre className="api-response-body">
              {JSON.stringify(result, null, 2)}
            </pre>

          </div>

        </div>

      )}


      {/* =====================================================
          EMPTY STATE
          ===================================================== */}

      {!result && !error && !busy && (

        <div className="api-empty">

          <div className="api-empty-icon">
            &lt;/&gt;
          </div>

          <h3>
            Ready to test
          </h3>

          <p>
            Select an endpoint above to view its
            live response.
          </p>

        </div>

      )}

    </div>
  )
}