export default function EmergencyPanel({
  requests,
  onApprove,
  onReject,
  busy
}) {
  if (requests.length === 0) {
    return (
      <div className="card emergency-empty-state">

        <div className="emergency-empty-icon">
          ✓
        </div>

        <h3>
          No pending emergency requests
        </h3>

        <p>
          There are currently no emergency water
          requests waiting for approval.
        </p>

      </div>
    )
  }

  return (
    <div>

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="emergency-page-header">

        <div>

          <div className="emergency-title-row">

            <div className="emergency-title-icon">
              !
            </div>

            <div>

              <h2>
                Emergency Water Requests
              </h2>

              <p>
                Review requests that require priority
                allocation.
              </p>

            </div>

          </div>

        </div>


        <div className="emergency-count">

          <strong>
            {requests.length}
          </strong>

          <span>
            pending
          </span>

        </div>

      </div>


      {/* =====================================================
          INFORMATION BANNER
          ===================================================== */}

      <div className="emergency-info">

        <div className="emergency-info-icon">
          💧
        </div>

        <div>

          <strong>
            Priority allocation
          </strong>

          <p>
            Approving a request gives the flat the same
            dominant priority as a medical flag for the
            next allocation cycle only.
          </p>

        </div>

      </div>


      {/* =====================================================
          REQUEST LIST
          ===================================================== */}

      <div className="emergency-request-list">

        {requests.map((r) => (

          <div
            className="emergency-request-card"
            key={r.request_id}
          >

            {/* -------------------------------------------------
                REQUEST HEADER
                ------------------------------------------------- */}

            <div className="emergency-request-head">

              <div>

                <span className="emergency-flat-label">
                  FLAT
                </span>

                <h3>
                  {r.flat_id}
                </h3>

              </div>


              <span className="emergency-status">
                PENDING
              </span>

            </div>


            {/* -------------------------------------------------
                REQUEST DETAILS
                ------------------------------------------------- */}

            <div className="emergency-request-details">

              <div className="emergency-detail">

                <span>
                  Requested water
                </span>

                <strong>
                  {r.requested_l
                    ? `${r.requested_l}L`
                    : '—'}
                </strong>

              </div>


              <div className="emergency-detail">

                <span>
                  Submitted
                </span>

                <strong className="emergency-date">
                  {new Date(
                    r.created_at
                  ).toLocaleString()}
                </strong>

              </div>

            </div>


            {/* -------------------------------------------------
                REASON
                ------------------------------------------------- */}

            <div className="emergency-reason">

              <span>
                Emergency reason
              </span>

              <p>
                {r.reason}
              </p>

            </div>


            {/* -------------------------------------------------
                ACTIONS
                ------------------------------------------------- */}

            <div className="emergency-actions">

              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  onApprove(r.request_id)
                }
              >
                ✓ Approve Request
              </button>


              <button
                className="btn danger"
                disabled={busy}
                onClick={() =>
                  onReject(r.request_id)
                }
              >
                Reject
              </button>

            </div>

          </div>

        ))}

      </div>

    </div>
  )
}