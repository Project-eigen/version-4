import { useNavigate } from 'react-router-dom'
import { Settings } from 'lucide-react'
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
        <BrandLogo variant="mark" size={32} alt="" className="brand-mark-img" />
        <span className="brand-text">DawaiSathi</span>
      </button>

      <div className="header-actions">
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="icon-btn"
          aria-label="Open settings"
        >
          <Settings size={20} aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
