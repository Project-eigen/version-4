import { useNavigate } from 'react-router-dom'
import { Settings, FileText, Award } from 'lucide-react'
import BrandLogo from './BrandLogo'

export default function Header() {
  const navigate = useNavigate()

  return (
    <header className="app-header" role="banner">
      <button
        type="button"
        className="brand-btn"
        onClick={() => navigate('/cabinet')}
        aria-label="DawaiSathi home — open cabinet"
      >
        <BrandLogo variant="wordmark" size={32} alt="" />
      </button>

      <div className="header-actions">
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="icon-btn"
          aria-label="Prescription History"
          title="Prescription History Archive"
        >
          <FileText size={19} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/report')}
          className="icon-btn"
          aria-label="Weekly Report"
          title="Weekly Report Card"
        >
          <Award size={19} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="icon-btn"
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={19} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
