import type { Studio } from '../state/useStudio'

export function RecoveryBanner({ studio }: { studio: Studio }) {
  const { recovery, notice, actions } = studio
  if (recovery) {
    const backup = () => {
      const url = URL.createObjectURL(new Blob([recovery.raw], { type: 'text/plain' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'hinge-backup.txt'
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    return (
      <div className="banner banner--warn" role="alert">
        <p><strong>Saved projects couldn’t be read.</strong> {recovery.reason} Nothing has been overwritten.</p>
        <button type="button" className="secondary-button" onClick={backup}>Download backup</button>
        <button type="button" className="primary-button" onClick={() => actions.resolveRecovery('fresh')}>Start fresh</button>
      </div>
    )
  }
  if (notice) {
    return (
      <div className="banner" role="status">
        <p>{notice}</p>
        <button type="button" className="text-button" onClick={actions.dismissNotice}>Dismiss</button>
      </div>
    )
  }
  return null
}
