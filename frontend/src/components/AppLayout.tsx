import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Users, ScanLine, Archive, Plus, Pencil } from 'lucide-react'
import Header from './Header'
import FamilyPills from './FamilyPills'
import Modal from './Modal'
import type { User } from '../types'

interface LayoutProps {
  children: React.ReactNode
  familyMembers: User[]
  activeMemberId: number
  onSelectMember: (id: number) => void
}

type NavTab = 'family' | 'cabinet' | 'scan'

export default function AppLayout({
  children,
  familyMembers,
  activeMemberId,
  onSelectMember,
}: LayoutProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const [showAddMenu, setShowAddMenu] = useState(false)

  const currentTab: NavTab =
    location.pathname.startsWith('/cabinet') ? 'cabinet'
    : location.pathname.startsWith('/scan') ? 'scan'
    : 'family'

  const closeAddMenu = useCallback(() => setShowAddMenu(false), [])

  return (
    <>
      <Header />
      {currentTab === 'cabinet' && (
        <FamilyPills
          members={familyMembers}
          activeMemberId={activeMemberId}
          onSelect={onSelectMember}
          currentUserId={user?.id ?? 0}
        />
      )}

      {/* Single scroll region owned by layout */}
      <div className="page-content">
        {children}
      </div>

      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        <button
          id="nav-family"
          type="button"
          className={`nav-item ${currentTab === 'family' ? 'active' : ''}`}
          onClick={() => navigate('/home')}
          aria-label="Family"
          aria-current={currentTab === 'family' ? 'page' : undefined}
        >
          <Users size={20} aria-hidden="true" />
          <span>Family</span>
        </button>

        <button
          id="nav-scan"
          type="button"
          className="scan-nav-btn"
          onClick={() => setShowAddMenu(true)}
          aria-label="Add medicine"
          aria-haspopup="dialog"
          aria-expanded={showAddMenu}
        >
          <Plus size={28} color="white" strokeWidth={2.5} aria-hidden="true" />
        </button>

        <button
          id="nav-cabinet"
          type="button"
          className={`nav-item ${currentTab === 'cabinet' ? 'active' : ''}`}
          onClick={() => navigate('/cabinet')}
          aria-label="Cabinet"
          aria-current={currentTab === 'cabinet' ? 'page' : undefined}
        >
          <Archive size={20} aria-hidden="true" />
          <span>Cabinet</span>
        </button>
      </nav>

      <Modal
        open={showAddMenu}
        onClose={closeAddMenu}
        title="Add medicine"
        titleId="add-medicine-title"
        variant="sheet"
      >
        <div className="bottom-sheet-options">
          <button
            type="button"
            className="bottom-sheet-option"
            onClick={() => {
              closeAddMenu()
              navigate('/scan')
            }}
            data-autofocus
          >
            <div className="option-icon scan" aria-hidden="true">
              <ScanLine size={22} color="var(--accent-teal)" />
            </div>
            <div className="option-text">
              <span className="option-title">Scan prescription</span>
              <span className="option-desc">AI reads the label and fills the details for you</span>
            </div>
          </button>

          <button
            type="button"
            className="bottom-sheet-option"
            onClick={() => {
              closeAddMenu()
              navigate('/scan/approve', {
                state: {
                  scanData: { extracted: { medicines: [] } },
                  capturedImage: null,
                },
              })
            }}
          >
            <div className="option-icon manual" aria-hidden="true">
              <Pencil size={22} color="var(--accent-cyan)" />
            </div>
            <div className="option-text">
              <span className="option-title">Type manually</span>
              <span className="option-desc">Enter names, schedules, and dosages yourself</span>
            </div>
          </button>
        </div>

        <button type="button" className="bottom-sheet-cancel" onClick={closeAddMenu}>
          Cancel
        </button>
      </Modal>
    </>
  )
}
