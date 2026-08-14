export default function TankGauge({ pct, height = 10 }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const level = clamped <= 15 ? 'critical' : clamped <= 35 ? 'low' : ''
  return (
    <div className="tank-gauge" style={{ height }}>
      <div
        className={`tank-gauge-fill ${level}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}
