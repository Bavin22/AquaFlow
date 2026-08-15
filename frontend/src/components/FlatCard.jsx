import TankGauge from './TankGauge.jsx'

export default function FlatCard({ flat, allocation }) {
  const isMedical =
    flat?.medical_flag ||
    (allocation?.vulnerability_score ?? 0) >= 1000

  const pctServed =
    allocation?.need_l > 0
      ? Math.round(
          (allocation.allocated_l / allocation.need_l) * 100
        )
      : allocation
        ? 100
        : null

  return (
    <div
      className={`flat-card ${isMedical ? 'medical' : ''}`}
    >

      {/* =====================================================
          HEADER
          ===================================================== */}

      <div className="flat-card-head">

        <div>
          <span className="flat-name">
            {flat?.flat_id || allocation?.flat_id}
          </span>

          {flat?.medical_flag && (
            <span
              className="tag"
              style={{
                color: 'var(--medical)',
                borderColor: 'var(--medical)',
                marginLeft: 8
              }}
            >
              medical
            </span>
          )}
        </div>

        {allocation && (
          <span
            className={`score-chip ${
              isMedical ? 'medical' : ''
            }`}
          >
            score {allocation.vulnerability_score}
          </span>
        )}

      </div>


      {/* =====================================================
          WATER LEVEL
          ===================================================== */}

      {flat && (
        <div className="flat-water-section">

          <div className="flat-water-header">

            <div>

              <p className="flat-section-label">
                WATER LEVEL
              </p>

              <div className="flat-water-percentage">
                {Math.round(flat.tank_level_pct)}%
              </div>

            </div>

            <div className="flat-water-capacity">
              {flat.tank_capacity_l}L
              <span>capacity</span>
            </div>

          </div>


          <TankGauge
            pct={flat.tank_level_pct}
            height={12}
          />


          <div className="flat-water-bottom">

            <span>
              Current tank level
            </span>

            <span>
              {Math.round(flat.tank_level_pct)}% full
            </span>

          </div>

        </div>
      )}


      {/* =====================================================
          ALLOCATION DETAILS
          ===================================================== */}

      {allocation && (
        <>

          {/* =================================================
              NEED + ALLOCATED
              ================================================= */}

          <div className="flat-allocation-grid">

            {/* Need */}

            <div className="flat-stat-box">

              <span className="flat-stat-label">
                Water Needed
              </span>

              <strong>
                {allocation.need_l}L
              </strong>

              {pctServed !== null && (
                <small>
                  {pctServed}% served
                </small>
              )}

            </div>


            {/* Allocated */}

            <div className="flat-stat-box">

              <span className="flat-stat-label">
                Allocated
              </span>

              <strong className="allocated">
                {allocation.allocated_l}L
              </strong>

              {pctServed !== null && (
                <small>
                  of required water
                </small>
              )}

            </div>

          </div>


          {/* =================================================
              ALLOCATION PROGRESS
              ================================================= */}

          {pctServed !== null && (
            <div className="flat-service-section">

              <div className="flat-service-header">

                <span>
                  Requirement served
                </span>

                <strong>
                  {pctServed}%
                </strong>

              </div>


              <div className="flat-service-bar">

                <div
                  className="flat-service-fill"
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


          {/* =================================================
              PRIORITY TAGS
              ================================================= */}

          <div className="tag-row">

            {flat?.medical_flag && (
              <span
                className="tag"
                style={{
                  color: 'var(--medical)',
                  borderColor: 'var(--medical)'
                }}
              >
                medical priority
              </span>
            )}

            {allocation.fair_share_capped && (
              <span className="tag">
                fair-share capped
              </span>
            )}

            {allocation.survival_floor_l > 0 && (
              <span className="tag">
                floor {allocation.survival_floor_l}L
              </span>
            )}

          </div>


          {/* =================================================
              DETAILED ALLOCATION REASON
              ================================================= */}

          <div className="flat-reason-box">

            <div className="flat-reason-header">

              <div className="flat-reason-icon">
                💧
              </div>

              <div>

                <span className="flat-reason-label">
                  Why this amount was allocated
                </span>

                <span className="flat-reason-subtitle">
                  Allocation decision
                </span>

              </div>

            </div>


            <div className="flat-reason-content">

              <p className="flat-reason">
                {allocation.reason}
              </p>

            </div>

          </div>

        </>
      )}

    </div>
  )
}