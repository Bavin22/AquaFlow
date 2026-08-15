export default function Banner({
  type = 'info',
  children,
  onClose
}) {
  if (!children) return null

  return (
    <div
      className={`banner ${type}`}
      role="alert"
    >

      <div className="banner-content">

        <span className="banner-icon">
          {type === 'success' && '✓'}
          {type === 'error' && '!'}
          {type === 'warning' && '⚠'}
          {type === 'info' && 'i'}
        </span>

        <span className="banner-message">
          {children}
        </span>

      </div>


      {onClose && (
        <button
          className="banner-close"
          onClick={onClose}
          aria-label="Dismiss"
          type="button"
        >
          ✕
        </button>
      )}

    </div>
  )
}