import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import {
  ShieldCheck,
  Users,
  Pill,
  Terminal,
  Activity,
  Trash2,
  Key,
  Download,
  Sparkles,
  Search,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Edit,
  Eye,
  Server,
  Lock,
  Layers,
  ChevronRight,
} from 'lucide-react'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import Toast from '../components/Toast'

type AdminTab = 'overview' | 'users' | 'medicines' | 'families' | 'scans' | 'sql'

interface AdminStats {
  status: string
  counts: {
    users: number
    guests: number
    superusers: number
    active_24h: number
    families: number
    medicines: number
    logs_total: number
    logs_today: number
    scans: number
    push_subscriptions: number
    telegram_users: number
  }
  database: {
    engine: string
    location: string
    connected: boolean
  }
  server_time: string
}

export default function Admin() {
  const { user, refreshUser } = useAuth()
  const navigate = useNavigate()

  // State
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Auth gate for non-superusers (can log in with Secret Key or Admin credentials)
  const [adminKey, setAdminKey] = useState('')
  const [adminIdentifier, setAdminIdentifier] = useState('ayaan')
  const [adminPassword, setAdminPassword] = useState('')
  const [loginMethod, setLoginMethod] = useState<'credentials' | 'secret'>('credentials')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Users tab
  const [usersList, setUsersList] = useState<any[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('')
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<any | null>(null)

  // Medicines tab
  const [medsList, setMedsList] = useState<any[]>([])
  const [medSearch, setMedSearch] = useState('')
  const [editingMed, setEditingMed] = useState<any | null>(null)
  const [confirmDeleteMed, setConfirmDeleteMed] = useState<any | null>(null)

  // Families tab
  const [familiesList, setFamiliesList] = useState<any[]>([])
  const [confirmDeleteFamily, setConfirmDeleteFamily] = useState<any | null>(null)

  // Scans tab
  const [scansList, setScansList] = useState<any[]>([])
  const [viewingScan, setViewingScan] = useState<any | null>(null)
  const [confirmDeleteScan, setConfirmDeleteScan] = useState<any | null>(null)

  // SQL Console
  const [sqlQuery, setSqlQuery] = useState('SELECT id, name, username, email, is_superuser, is_ultimate_admin, created_at FROM users LIMIT 10;')
  const [sqlResult, setSqlResult] = useState<any | null>(null)
  const [sqlRunning, setSqlRunning] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
  }

  // ── Authentication Check & Login ──────────────────────────────────────────
  const isAuthorized = user?.is_superuser === true || user?.is_ultimate_admin === true

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)
    try {
      const payload = loginMethod === 'secret'
        ? { secret_key: adminKey }
        : { username: adminIdentifier, password: adminPassword }

      const res = await api.post('/admin/login', payload)
      if (res.data?.token) {
        localStorage.setItem('token', res.data.token)
        await refreshUser()
        showToast(res.data.message || 'Superuser session established!', 'success')
      }
    } catch (err: any) {
      setAuthError(err.response?.data?.error || 'Authentication failed. Please check credentials.')
    } finally {
      setAuthLoading(false)
    }
  }

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/admin/stats')
      setStats(res.data)
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error fetching admin stats:', err)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (userSearch) params.set('search', userSearch)
      if (userRoleFilter) params.set('role', userRoleFilter)
      params.set('per_page', '50')
      const res = await api.get(`/admin/users?${params.toString()}`)
      setUsersList(res.data.users || [])
    } catch {
      showToast('Failed to load users list', 'error')
    } finally {
      setLoading(false)
    }
  }, [userSearch, userRoleFilter])

  const fetchMedicines = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (medSearch) params.set('search', medSearch)
      params.set('per_page', '50')
      const res = await api.get(`/admin/medicines?${params.toString()}`)
      setMedsList(res.data.medicines || [])
    } catch {
      showToast('Failed to load medicines list', 'error')
    } finally {
      setLoading(false)
    }
  }, [medSearch])

  const fetchFamilies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/families')
      setFamiliesList(res.data.families || [])
    } catch {
      showToast('Failed to load families', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchScans = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/scans?per_page=30')
      setScansList(res.data.scans || [])
    } catch {
      showToast('Failed to load prescription scans', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAuthorized) return
    if (activeTab === 'overview') fetchStats()
    else if (activeTab === 'users') fetchUsers()
    else if (activeTab === 'medicines') fetchMedicines()
    else if (activeTab === 'families') fetchFamilies()
    else if (activeTab === 'scans') fetchScans()
  }, [isAuthorized, activeTab, fetchStats, fetchUsers, fetchMedicines, fetchFamilies, fetchScans])

  // ── Operations ────────────────────────────────────────────────────────────

  const handleToggleSuperuser = async (targetUser: any) => {
    try {
      const res = await api.post(`/admin/users/${targetUser.id}/toggle-superuser`)
      showToast(res.data.message || 'Updated superuser status')
      fetchUsers()
      if (targetUser.id === user?.id) refreshUser()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update superuser status', 'error')
    }
  }

  const handleSetPassword = async () => {
    if (!selectedUser || !newPassword) return
    try {
      await api.post(`/admin/users/${selectedUser.id}/set-password`, { password: newPassword })
      showToast(`Password updated for ${selectedUser.name}`)
      setShowPasswordModal(false)
      setNewPassword('')
      setSelectedUser(null)
      fetchUsers()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update password', 'error')
    }
  }

  const handleDeleteUser = async () => {
    if (!confirmDeleteUser) return
    try {
      await api.delete(`/admin/users/${confirmDeleteUser.id}`)
      showToast(`User ${confirmDeleteUser.name} deleted successfully`)
      setConfirmDeleteUser(null)
      fetchUsers()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete user', 'error')
    }
  }

  const handleSaveMedicine = async () => {
    if (!editingMed) return
    try {
      await api.put(`/admin/medicines/${editingMed.id}`, {
        name: editingMed.name,
        dosage: editingMed.dosage,
        quantity: editingMed.quantity,
        instructions: editingMed.instructions,
        days: editingMed.days,
        schedule: editingMed.schedule,
      })
      showToast(`Medicine '${editingMed.name}' updated`)
      setEditingMed(null)
      fetchMedicines()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to update medicine', 'error')
    }
  }

  const handleDeleteMedicine = async () => {
    if (!confirmDeleteMed) return
    try {
      await api.delete(`/admin/medicines/${confirmDeleteMed.id}`)
      showToast(`Medicine deleted`)
      setConfirmDeleteMed(null)
      fetchMedicines()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete medicine', 'error')
    }
  }

  const handleDeleteFamily = async () => {
    if (!confirmDeleteFamily) return
    try {
      await api.delete(`/admin/families/${confirmDeleteFamily.id}`)
      showToast(`Family dissolved`)
      setConfirmDeleteFamily(null)
      fetchFamilies()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete family', 'error')
    }
  }

  const handleDeleteScan = async () => {
    if (!confirmDeleteScan) return
    try {
      await api.delete(`/admin/scans/${confirmDeleteScan.id}`)
      showToast(`Scan record deleted`)
      setConfirmDeleteScan(null)
      fetchScans()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to delete scan', 'error')
    }
  }

  const handleRunSql = async () => {
    if (!sqlQuery.trim()) return
    setSqlRunning(true)
    setSqlResult(null)
    try {
      const res = await api.post('/admin/db/query', { query: sqlQuery })
      setSqlResult(res.data)
    } catch (err: any) {
      setSqlResult({
        ok: false,
        error: err.response?.data?.error || err.message,
      })
    } finally {
      setSqlRunning(false)
    }
  }

  const handleRunCleanup = async () => {
    try {
      const res = await api.post('/admin/db/cleanup')
      showToast(res.data.message || 'Database cleanup complete')
      fetchStats()
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Cleanup failed', 'error')
    }
  }

  const handleExportBackup = () => {
    const token = localStorage.getItem('token') || ''
    const exportUrl = `${api.defaults.baseURL || '/api'}/admin/db/export`
    // Fetch with authorization and trigger browser download
    fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `dawaisathi_db_backup_${new Date().toISOString().slice(0, 10)}.json`
        document.body.appendChild(a)
        a.click()
        a.remove()
        showToast('Database backup downloaded successfully', 'success')
      })
      .catch(() => showToast('Failed to export database backup', 'error'))
  }

  // ── Render Unauthorized / Admin Login View ────────────────────────────────
  if (!isAuthorized) {
    return (
      <div className="admin-page-container" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: '#090d16' }}>
        <div style={{ maxWidth: '440px', width: '100%', background: '#111827', border: '1px solid #1f2937', borderRadius: '16px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
            <div style={{ display: 'inline-flex', padding: '0.75rem', background: 'rgba(13, 148, 136, 0.15)', borderRadius: '12px', color: '#14b8a6', marginBottom: '0.75rem' }}>
              <ShieldCheck size={36} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f9fafb', margin: '0 0 0.25rem 0' }}>DawaiSathi VPS Admin</h1>
            <p style={{ fontSize: '0.875rem', color: '#9ca3af', margin: 0 }}>Superuser & Database Management Portal</p>
            <div style={{ marginTop: '0.5rem', display: 'inline-block', fontSize: '0.75rem', background: '#1e293b', color: '#38bdf8', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontFamily: 'monospace' }}>
              dawaisathi.georbit.org
            </div>
          </div>

          <div style={{ display: 'flex', background: '#1f2937', borderRadius: '8px', padding: '3px', marginBottom: '1.25rem' }}>
            <button
              type="button"
              onClick={() => { setLoginMethod('credentials'); setAuthError('') }}
              style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', background: loginMethod === 'credentials' ? '#0d9488' : 'transparent', color: loginMethod === 'credentials' ? '#fff' : '#9ca3af', transition: 'all 0.15s ease' }}
            >
              👑 Ayaan / Admin Login
            </button>
            <button
              type="button"
              onClick={() => { setLoginMethod('secret'); setAuthError('') }}
              style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '6px', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer', background: loginMethod === 'secret' ? '#0d9488' : 'transparent', color: loginMethod === 'secret' ? '#fff' : '#9ca3af', transition: 'all 0.15s ease' }}
            >
              Master Secret Key
            </button>
          </div>

          {authError && (
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem', color: '#f87171', fontSize: '0.825rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={16} />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleAdminLogin}>
            {loginMethod === 'credentials' ? (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db' }}>
                      USERNAME OR EMAIL
                    </label>
                    <span style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600 }}>👑 Ultimate Admin: ayaan</span>
                  </div>
                  <input
                    type="text"
                    value={adminIdentifier}
                    onChange={(e) => setAdminIdentifier(e.target.value)}
                    placeholder="ayaan"
                    required
                    style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.65rem 0.75rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '0.4rem' }}>
                    PASSWORD
                  </label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Enter password..."
                    required
                    style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.65rem 0.75rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
              </>
            ) : (
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#d1d5db', marginBottom: '0.4rem' }}>
                  ADMIN SECRET KEY
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    value={adminKey}
                    onChange={(e) => setAdminKey(e.target.value)}
                    placeholder="Enter VPS ADMIN_SECRET_KEY..."
                    required
                    style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.65rem 0.75rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                  />
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.4rem' }}>
                  Defined in your VPS environment variables (<code style={{ color: '#38bdf8' }}>ADMIN_SECRET_KEY</code>).
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              style={{ width: '100%', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.75rem', fontSize: '0.925rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: authLoading ? 0.7 : 1 }}
            >
              {authLoading ? <RotateCcw className="animate-spin" size={18} /> : <Lock size={18} />}
              {authLoading ? 'Verifying Superuser...' : 'Authenticate Superuser'}
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => navigate('/cabinet')}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '0.825rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <ArrowLeft size={14} /> Back to Cabinet
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render Full Superuser Dashboard ───────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0b0f19', color: '#e5e7eb', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Navbar */}
      <header style={{ background: '#111827', borderBottom: '1px solid #1f2937', padding: '0.75rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => navigate('/cabinet')}
            style={{ background: '#1e293b', border: 'none', color: '#9ca3af', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', display: 'flex' }}
            title="Exit Admin"
          >
            <ArrowLeft size={18} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: '#fff', letterSpacing: '-0.02em' }}>DawaiSathi Admin</span>
            {user.is_ultimate_admin || user.username === 'ayaan' ? (
              <span style={{ fontSize: '0.7rem', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000', padding: '0.18rem 0.6rem', borderRadius: '4px', fontWeight: 800, letterSpacing: '0.04em' }}>
                👑 ULTIMATE ADMIN
              </span>
            ) : (
              <span style={{ fontSize: '0.7rem', background: '#0d9488', color: '#fff', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
                ADMINISTRATOR
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#1f2937', padding: '0.3rem 0.75rem', borderRadius: '9999px', fontSize: '0.75rem', color: '#9ca3af' }}>
            <Server size={14} color="#38bdf8" />
            <span>dawaisathi.georbit.org</span>
          </div>
          <span style={{ fontSize: '0.85rem', color: '#d1d5db' }}>{user.name}</span>
          <button
            type="button"
            onClick={() => navigate('/cabinet')}
            style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            Exit Portal
          </button>
        </div>
      </header>

      {/* Navigation Sub-bar */}
      <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '0 1.5rem', display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
        {[
          { key: 'overview', label: 'Overview & KPIs', icon: Activity },
          { key: 'users', label: 'Users & Roles', icon: Users },
          { key: 'medicines', label: 'Medicines', icon: Pill },
          { key: 'families', label: 'Families', icon: Layers },
          { key: 'scans', label: 'Prescription Scans', icon: Eye },
          { key: 'sql', label: 'Database Console (SQL)', icon: Terminal },
        ].map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as AdminTab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.85rem 1rem',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #0d9488' : '2px solid transparent',
                color: active ? '#14b8a6' : '#9ca3af',
                fontSize: '0.875rem',
                fontWeight: active ? 600 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Content Container */}
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem' }}>
        {/* ── TAB 1: OVERVIEW ── */}
        {activeTab === 'overview' && (
          <div>
            {/* Top Operational Status Banner */}
            <div style={{ background: 'linear-gradient(135deg, #111827 0%, #1e293b 100%)', border: '1px solid #374151', borderRadius: '12px', padding: '1.25rem 1.5rem', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <CheckCircle2 size={18} color="#10b981" />
                  <span style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '1rem' }}>VPS Database Connected</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.825rem', color: '#9ca3af' }}>
                  Engine: <strong style={{ color: '#fff' }}>{stats?.database?.engine || 'PostgreSQL'}</strong> &bull; Host: <strong style={{ color: '#fff' }}>{stats?.database?.location || 'Localhost / VPS'}</strong> &bull; Server time: {stats?.server_time ? new Date(stats.server_time).toLocaleString() : 'Live'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleRunCleanup}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#374151', color: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Sparkles size={14} color="#f59e0b" /> Run DB Cleanup
                </button>
                <button
                  type="button"
                  onClick={handleExportBackup}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.5rem 0.85rem', fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  <Download size={14} /> Export Full JSON Backup
                </button>
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
              {[
                { title: 'Total Registered Users', value: stats?.counts?.users ?? '—', sub: `${stats?.counts?.guests || 0} guests, ${stats?.counts?.superusers || 0} superusers`, color: '#38bdf8' },
                { title: 'Active (24h Activity)', value: stats?.counts?.active_24h ?? '—', sub: 'Logged medicines today', color: '#10b981' },
                { title: 'Total Medicines Tracked', value: stats?.counts?.medicines ?? '—', sub: 'Across all user cabinets', color: '#f59e0b' },
                { title: 'Adherence Logs Recorded', value: stats?.counts?.logs_total ?? '—', sub: `${stats?.counts?.logs_today || 0} taken in last 24h`, color: '#a855f7' },
                { title: 'Families Created', value: stats?.counts?.families ?? '—', sub: 'Family group circles', color: '#ec4899' },
                { title: 'Archived Prescription Scans', value: stats?.counts?.scans ?? '—', sub: 'AI parsed scans', color: '#14b8a6' },
                { title: 'Web Push Subscribers', value: stats?.counts?.push_subscriptions ?? '—', sub: 'Registered browser devices', color: '#6366f1' },
                { title: 'Telegram Connected', value: stats?.counts?.telegram_users ?? '—', sub: 'Bot linked users', color: '#06b6d4' },
              ].map((card, idx) => (
                <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1.25rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{card.title}</div>
                  <div style={{ fontSize: '1.85rem', fontWeight: 700, color: card.color, margin: '0.4rem 0' }}>{card.value}</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* Quick Actions Shortcuts */}
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1.25rem' }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f3f4f6', margin: '0 0 1rem 0' }}>Database Quick Operations</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Users size={18} color="#38bdf8" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Manage User Accounts</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Grant superuser, reset passwords</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#6b7280" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('medicines')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Pill size={18} color="#f59e0b" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Inspect Medicine Inventory</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Edit dosages, instructions, stock</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#6b7280" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('sql')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', color: '#e5e7eb', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Terminal size={18} color="#10b981" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Interactive SQL Runner</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Query database tables directly</div>
                    </div>
                  </div>
                  <ChevronRight size={16} color="#6b7280" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB 2: USERS ── */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.6rem 0.75rem 0.6rem 2.25rem', color: '#fff', fontSize: '0.875rem', outline: 'none' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e5e7eb', fontSize: '0.825rem', outline: 'none' }}
                >
                  <option value="">All Roles</option>
                  <option value="superuser">Superusers Only</option>
                  <option value="regular">Regular Users</option>
                  <option value="guest">Guest Accounts</option>
                </select>
                <button
                  type="button"
                  onClick={fetchUsers}
                  style={{ background: '#1e293b', border: '1px solid #374151', color: '#e5e7eb', borderRadius: '8px', padding: '0.6rem 0.85rem', fontSize: '0.825rem', cursor: 'pointer' }}
                >
                  Refresh
                </button>
              </div>
            </div>

            {/* Users Table */}
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', color: '#9ca3af', background: '#0f172a' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>User</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Role</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Family</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Meds</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Joined</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        {loading ? 'Loading users...' : 'No users found.'}
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #1f2937' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: '#f3f4f6' }}>{u.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{u.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          {u.is_ultimate_admin || u.username === 'ayaan' ? (
                            <span style={{ background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.25))', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.5)', padding: '0.2rem 0.55rem', borderRadius: '4px', fontSize: '0.725rem', fontWeight: 800 }}>
                              👑 ULTIMATE ADMIN
                            </span>
                          ) : u.is_superuser ? (
                            <span style={{ background: 'rgba(13, 148, 136, 0.2)', color: '#2dd4bf', border: '1px solid rgba(13, 148, 136, 0.4)', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.725rem', fontWeight: 600 }}>
                              ADMIN
                            </span>
                          ) : u.is_guest ? (
                            <span style={{ background: 'rgba(107, 114, 128, 0.2)', color: '#9ca3af', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.725rem' }}>
                              Guest
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>User</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#d1d5db' }}>
                          {u.family_name || <span style={{ color: '#6b7280' }}>Solo</span>}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#d1d5db' }}>{u.medicines_count || 0}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.75rem' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          {u.is_ultimate_admin || u.username === 'ayaan' ? (
                            <span style={{ color: '#f59e0b', fontSize: '0.75rem', fontWeight: 700, padding: '0.3rem 0.6rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '6px' }}>
                              👑 Main Owner
                            </span>
                          ) : (
                            <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                              {(user?.is_ultimate_admin || user?.username === 'ayaan') && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleSuperuser(u)}
                                  title={u.is_superuser ? 'Revoke Admin Privileges' : 'Assign Admin Privileges'}
                                  style={{ background: u.is_superuser ? 'rgba(239, 68, 68, 0.15)' : 'rgba(13, 148, 136, 0.15)', border: 'none', color: u.is_superuser ? '#f87171' : '#14b8a6', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                                >
                                  {u.is_superuser ? 'Demote Admin' : 'Assign Admin'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => { setSelectedUser(u); setShowPasswordModal(true) }}
                                title="Set Password"
                                style={{ background: '#1e293b', border: '1px solid #374151', color: '#9ca3af', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                <Key size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUser(u)}
                                title="Delete User"
                                style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 3: MEDICINES ── */}
        {activeTab === 'medicines' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '360px' }}>
                <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
                <input
                  type="text"
                  value={medSearch}
                  onChange={(e) => setMedSearch(e.target.value)}
                  placeholder="Search medicines..."
                  style={{ width: '100%', boxSizing: 'border-box', background: '#111827', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.6rem 0.75rem 0.6rem 2.25rem', color: '#fff', fontSize: '0.875rem', outline: 'none' }}
                />
              </div>
              <button
                type="button"
                onClick={fetchMedicines}
                style={{ background: '#1e293b', border: '1px solid #374151', color: '#e5e7eb', borderRadius: '8px', padding: '0.6rem 0.85rem', fontSize: '0.825rem', cursor: 'pointer' }}
              >
                Refresh
              </button>
            </div>

            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', color: '#9ca3af', background: '#0f172a' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Medicine</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Dosage & Stock</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Schedule</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Owner</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {medsList.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        {loading ? 'Loading medicines...' : 'No medicines found.'}
                      </td>
                    </tr>
                  ) : (
                    medsList.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #1f2937' }}>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: '#f3f4f6' }}>{m.name}</div>
                          {m.instructions && <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{m.instructions}</div>}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#d1d5db' }}>
                          <div>{m.dosage || 'Standard'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {m.quantity !== null && m.quantity !== undefined ? `Stock: ${m.quantity}` : 'Stock: unmanaged'}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {Array.isArray(m.schedule) && m.schedule.map((slot: string) => (
                              <span key={slot} style={{ background: '#1e293b', color: '#38bdf8', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem' }}>
                                {slot}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ color: '#d1d5db' }}>{m.user_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{m.user_email}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                            <button
                              type="button"
                              onClick={() => setEditingMed({ ...m })}
                              style={{ background: '#1e293b', border: '1px solid #374151', color: '#9ca3af', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMed(m)}
                              style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 4: FAMILIES ── */}
        {activeTab === 'families' && (
          <div>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1f2937', color: '#9ca3af', background: '#0f172a' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Family Name</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Invite Code</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Members</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Medicines</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Created</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {familiesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                        {loading ? 'Loading families...' : 'No families created yet.'}
                      </td>
                    </tr>
                  ) : (
                    familiesList.map((f) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid #1f2937' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f3f4f6' }}>{f.name}</td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <code style={{ background: '#1e293b', color: '#10b981', padding: '0.2rem 0.5rem', borderRadius: '4px', letterSpacing: '0.1em' }}>
                            {f.family_code}
                          </code>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#d1d5db' }}>
                          {f.member_count} member{f.member_count !== 1 ? 's' : ''}
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {f.members?.map((m: any) => m.name).join(', ') || ''}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#d1d5db' }}>{f.medicines_count || 0}</td>
                        <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.75rem' }}>
                          {f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteFamily(f)}
                            style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.35rem 0.6rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Dissolve
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB 5: PRESCRIPTION SCANS ── */}
        {activeTab === 'scans' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {scansList.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: '#6b7280', background: '#111827', borderRadius: '12px' }}>
                  {loading ? 'Loading prescription scans...' : 'No prescription scans recorded.'}
                </div>
              ) : (
                scansList.map((s) => (
                  <div key={s.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.9rem' }}>Scan #{s.id}</div>
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{s.user_name} ({s.user_email})</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteScan(s)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: '#ef4444', padding: '0.3rem', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {s.scan_image_url && (
                      <div style={{ height: '140px', background: '#000', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img
                          src={s.scan_image_url}
                          alt="Prescription Scan"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'pointer' }}
                          onClick={() => setViewingScan(s)}
                        />
                      </div>
                    )}

                    <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.6rem', fontSize: '0.75rem', maxHeight: '100px', overflowY: 'auto' }}>
                      <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: '0.2rem' }}>Parsed OCR Medicines:</div>
                      {Array.isArray(s.medicines) && s.medicines.map((m: any, idx: number) => (
                        <div key={idx} style={{ color: '#d1d5db' }}>
                          &bull; <strong>{m.name || m.medicine_name}</strong> - {m.dosage || 'Standard'}
                        </div>
                      ))}
                    </div>

                    <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                      Scanned: {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── TAB 6: INTERACTIVE SQL CONSOLE ── */}
        {activeTab === 'sql' && (
          <div>
            <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Terminal size={18} color="#10b981" />
                  <span style={{ fontWeight: 600, color: '#f3f4f6', fontSize: '0.95rem' }}>Live VPS SQL Runner</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                  Direct database query executor
                </div>
              </div>

              {/* Pre-made query buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                {[
                  { label: 'Users', q: 'SELECT id, name, email, is_superuser, created_at FROM users LIMIT 10;' },
                  { label: 'Medicines', q: 'SELECT id, user_id, name, dosage, quantity, instructions FROM medicine_entries LIMIT 10;' },
                  { label: 'Recent Logs', q: 'SELECT id, entry_id, logged_by_user_id, time_slot, logged_at FROM medicine_logs ORDER BY logged_at DESC LIMIT 10;' },
                  { label: 'Families', q: 'SELECT * FROM families LIMIT 10;' },
                  { label: 'Push Subscriptions', q: 'SELECT id, user_id, created_at FROM push_subscriptions LIMIT 10;' },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSqlQuery(item.q)}
                    style={{ background: '#1e293b', border: '1px solid #374151', color: '#9ca3af', padding: '0.25rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* SQL Textarea */}
              <textarea
                value={sqlQuery}
                onChange={(e) => setSqlQuery(e.target.value)}
                rows={4}
                style={{ width: '100%', boxSizing: 'border-box', background: '#090d16', border: '1px solid #374151', borderRadius: '8px', padding: '0.75rem', color: '#4ade80', fontFamily: 'monospace', fontSize: '0.875rem', outline: 'none', resize: 'vertical' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleRunSql}
                  disabled={sqlRunning}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.6rem 1.25rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', opacity: sqlRunning ? 0.6 : 1 }}
                >
                  {sqlRunning ? <RotateCcw className="animate-spin" size={16} /> : <Terminal size={16} />}
                  {sqlRunning ? 'Executing...' : 'Run Query'}
                </button>
              </div>
            </div>

            {/* SQL Results View */}
            {sqlResult && (
              <div style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ background: '#0f172a', padding: '0.75rem 1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                  <div>
                    {sqlResult.ok ? (
                      <span style={{ color: '#10b981', fontWeight: 600 }}>Query Success</span>
                    ) : (
                      <span style={{ color: '#ef4444', fontWeight: 600 }}>Query Failed</span>
                    )}
                    {sqlResult.elapsed_ms && (
                      <span style={{ color: '#6b7280', marginLeft: '0.75rem' }}>Execution: {sqlResult.elapsed_ms} ms</span>
                    )}
                  </div>
                  {sqlResult.row_count !== undefined && (
                    <span style={{ color: '#9ca3af' }}>{sqlResult.row_count} row{sqlResult.row_count !== 1 ? 's' : ''} returned</span>
                  )}
                </div>

                {sqlResult.error ? (
                  <div style={{ padding: '1rem', color: '#f87171', fontFamily: 'monospace', fontSize: '0.825rem', whiteSpace: 'pre-wrap' }}>
                    {sqlResult.error}
                  </div>
                ) : sqlResult.returns_rows ? (
                  <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                      <thead>
                        <tr style={{ background: '#1e293b', borderBottom: '1px solid #374151', color: '#38bdf8' }}>
                          {sqlResult.columns?.map((col: string, idx: number) => (
                            <th key={idx} style={{ padding: '0.6rem 0.85rem', whiteSpace: 'nowrap' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sqlResult.rows?.map((row: any[], rowIdx: number) => (
                          <tr key={rowIdx} style={{ borderBottom: '1px solid #1f2937' }}>
                            {row.map((val: any, colIdx: number) => (
                              <td key={colIdx} style={{ padding: '0.5rem 0.85rem', color: val === null ? '#6b7280' : '#e5e7eb', whiteSpace: 'nowrap' }}>
                                {val === null ? 'NULL' : String(val)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '1.25rem', color: '#10b981', fontSize: '0.875rem' }}>
                    {sqlResult.message || 'Query executed successfully.'}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals & Dialogs ── */}

      {/* Password Reset Modal */}
      {showPasswordModal && selectedUser && (
        <Modal open={showPasswordModal} onClose={() => setShowPasswordModal(false)} title={`Set Password for ${selectedUser.name}`}>
          <div style={{ padding: '1rem 0' }}>
            <label style={{ display: 'block', fontSize: '0.825rem', color: '#d1d5db', marginBottom: '0.4rem' }}>
              New Password (minimum 6 characters)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password..."
              style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.65rem', color: '#fff', fontSize: '0.9rem', outline: 'none', marginBottom: '1.25rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSetPassword}
                style={{ background: '#0d9488', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Password
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Medicine Modal */}
      {editingMed && (
        <Modal open={!!editingMed} onClose={() => setEditingMed(null)} title={`Edit Medicine: ${editingMed.name}`}>
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.3rem' }}>Medicine Name</label>
              <input
                type="text"
                value={editingMed.name}
                onChange={(e) => setEditingMed({ ...editingMed, name: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.3rem' }}>Dosage</label>
                <input
                  type="text"
                  value={editingMed.dosage || ''}
                  onChange={(e) => setEditingMed({ ...editingMed, dosage: e.target.value })}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.3rem' }}>Remaining Stock</label>
                <input
                  type="number"
                  value={editingMed.quantity ?? ''}
                  onChange={(e) => setEditingMed({ ...editingMed, quantity: e.target.value ? Number(e.target.value) : null })}
                  style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#d1d5db', marginBottom: '0.3rem' }}>Instructions</label>
              <input
                type="text"
                value={editingMed.instructions || ''}
                onChange={(e) => setEditingMed({ ...editingMed, instructions: e.target.value })}
                style={{ width: '100%', boxSizing: 'border-box', background: '#1e293b', border: '1px solid #374151', borderRadius: '8px', padding: '0.6rem', color: '#fff', fontSize: '0.9rem', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setEditingMed(null)}
                style={{ background: 'transparent', border: '1px solid #374151', color: '#9ca3af', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMedicine}
                style={{ background: '#0d9488', color: '#fff', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Viewing Scan Details Modal */}
      {viewingScan && (
        <Modal open={!!viewingScan} onClose={() => setViewingScan(null)} title={`Prescription Scan #${viewingScan.id}`}>
          <div style={{ padding: '0.5rem 0' }}>
            <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#9ca3af' }}>
              User: <strong style={{ color: '#fff' }}>{viewingScan.user_name}</strong> ({viewingScan.user_email}) &bull; Date: {viewingScan.created_at ? new Date(viewingScan.created_at).toLocaleString() : '—'}
            </div>
            {viewingScan.scan_image_url && (
              <div style={{ textAlign: 'center', marginBottom: '1rem', background: '#000', borderRadius: '8px', padding: '0.5rem' }}>
                <img src={viewingScan.scan_image_url} alt="Prescription" style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '6px' }} />
              </div>
            )}
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', marginBottom: '0.3rem' }}>Parsed OCR Medicines:</div>
            <pre style={{ background: '#090d16', border: '1px solid #1f2937', padding: '0.75rem', borderRadius: '8px', color: '#4ade80', fontSize: '0.75rem', overflowX: 'auto', maxHeight: '200px' }}>
              {JSON.stringify(viewingScan.medicines, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => setViewingScan(null)}
                style={{ background: '#1e293b', border: '1px solid #374151', color: '#e5e7eb', padding: '0.5rem 1.25rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!confirmDeleteUser}
        title="Delete User Account"
        description={`Are you sure you want to permanently delete '${confirmDeleteUser?.name}' (${confirmDeleteUser?.email})? All associated medicines and logs will also be deleted.`}
        confirmLabel="Delete User"
        onConfirm={handleDeleteUser}
        onClose={() => setConfirmDeleteUser(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteMed}
        title="Delete Medicine"
        description={`Are you sure you want to permanently delete '${confirmDeleteMed?.name}'?`}
        confirmLabel="Delete Medicine"
        onConfirm={handleDeleteMedicine}
        onClose={() => setConfirmDeleteMed(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteFamily}
        title="Dissolve Family Circle"
        description={`Are you sure you want to dissolve '${confirmDeleteFamily?.name}'? Members will return to solo mode.`}
        confirmLabel="Dissolve"
        onConfirm={handleDeleteFamily}
        onClose={() => setConfirmDeleteFamily(null)}
      />

      <ConfirmDialog
        open={!!confirmDeleteScan}
        title="Delete Prescription Scan"
        description={`Are you sure you want to delete scan record #${confirmDeleteScan?.id}?`}
        confirmLabel="Delete Scan"
        onConfirm={handleDeleteScan}
        onClose={() => setConfirmDeleteScan(null)}
      />

      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.msg}
          type={toast.type}
        />
      )}
    </div>
  )
}
