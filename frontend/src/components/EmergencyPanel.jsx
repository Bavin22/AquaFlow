export default function EmergencyPanel({ requests, onApprove, onReject, busy }) {
  if (requests.length === 0) {
    return <div className="card empty-state">No pending emergency requests.</div>
  }
  return (
    <div className="card">
      <p className="card-title">Pending requests</p>
      <p className="card-sub">Approving gives a flat the same dominant priority as a medical flag for the next allocation cycle only.</p>
      <table className="data-table">
        <thead>
          <tr><th>Flat</th><th>Reason</th><th>Requested</th><th>Submitted</th><th></th></tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <tr key={r.request_id}>
              <td>{r.flat_id}</td>
              <td style={{ fontFamily: 'var(--font-body)', fontSize: 12.5 }}>{r.reason}</td>
              <td>{r.requested_l ? `${r.requested_l}L` : '—'}</td>
              <td style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString()}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn sm primary" disabled={busy} onClick={() => onApprove(r.request_id)}>Approve</button>
                  <button className="btn sm danger" disabled={busy} onClick={() => onReject(r.request_id)}>Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
