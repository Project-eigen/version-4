import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, FileText, Award, ShieldAlert } from 'lucide-react'
import BrandLogo from './BrandLogo'
import EmergencyCard from './EmergencyCard'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'

export default function Header() {
  const navigate = useNavigate()
  const { t } = useLanguage()
  const { user } = useAuth()
  const [showEmergency, setShowEmergency] = useState(false)

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
          onClick={() => setShowEmergency(true)}
          className="icon-btn"
          aria-label="Emergency Medical Card"
          title="Emergency Medical Card"
          style={{ color: '#dc2626' }}
        >
          <ShieldAlert size={20} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/history')}
          className="icon-btn"
          aria-label={t('historyLabel')}
          title={t('historyLabel')}
        >
          <FileText size={19} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/report')}
          className="icon-btn"
          aria-label={t('reportLabel')}
          title={t('reportLabel')}
        >
          <Award size={19} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="icon-btn"
          aria-label={t('settingsLabel')}
          title={t('settingsLabel')}
        >
          <Settings size={19} aria-hidden="true" />
        </button>
      </div>

      <EmergencyCard
        open={showEmergency}
        onClose={() => setShowEmergency(false)}
        user={user}
        medicines={[]}
      />
    </header>
  )
}
