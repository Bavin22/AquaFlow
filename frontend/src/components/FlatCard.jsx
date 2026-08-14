import TankGauge from './TankGauge.jsx'

export default function FlatCard({ flat, allocation }) {
  const isMedical = flat?.medical_flag || (allocation?.vulnerability_score ?? 0) >= 1000
  const pctServed = allocation?.need_l > 0
    ? Math.round((allocation.allocated_l / allocation.need_l) * 100)
    : allocation ? 100 : null

  return (
    <div className={`flat-card ${isMedical ? 'medical' : ''}`}>
      <div className="flat-card-head">
        <span className="flat-name">{flat?.flat_id || allocation?.flat_id}</span>
        {allocation && (
          <span className={`score-chip ${isMedical ? 'medical' : ''}`}>
            score {allocation.vulnerability_score}
          </span>
        )}
      </div>

      {flat && (
        <div>
          <TankGauge pct={flat.tank_level_pct} />
          <div className="flat-stats" style={{ marginTop: 6 }}>
            <span>{Math.round(flat.tank_level_pct)}% full</span>
            <span>{flat.tank_capacity_l}L capacity</span>
          </div>
        </div>
      )}

      {allocation && (
        <>
          <div className="flat-stats">
            <span>allocated {allocation.allocated_l}L</span>
            <span>need {allocation.need_l}L{pctServed !== null ? ` (${pctServed}%)` : ''}</span>
          </div>
          <div className="tag-row">
            {flat?.medical_flag && <span className="tag" style={{ color: 'var(--medical)', borderColor: 'var(--medical)' }}>medical</span>}
            {allocation.fair_share_capped && <span className="tag">fair-share capped</span>}
            {allocation.survival_floor_l > 0 && <span className="tag">floor {allocation.survival_floor_l}L</span>}
          </div>
          <p className="flat-reason">{allocation.reason}</p>
        </>
      )}
    </div>
  )
}
