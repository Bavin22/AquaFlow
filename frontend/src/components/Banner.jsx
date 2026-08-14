export default function Banner({ type = 'info', children, onClose }) {
  if (!children) return null
  return (
    <div className={`banner ${type}`}>
      <span>{children}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  )
}
