import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function AuthSuccess() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const handleSuccess = useCallback(async () => {
    try {
      // Production path: backend passes JWT directly in URL to avoid cross-origin cookie issues.
      // (dawaisathi.onrender.com and dawaisathi-api.onrender.com are cross-site per PSL)
      const params = new URLSearchParams(window.location.search)
      const urlToken = params.get('token')

      if (urlToken) {
        // Remove the token from the URL immediately (security hygiene)
        window.history.replaceState({}, '', '/auth/success')
        localStorage.setItem('token', urlToken)
        await refreshUser()
        navigate('/home', { replace: true })
        return
      }

      // Local dev fallback: exchange the HttpOnly cookie for a JWT
      const res = await api.post('/auth/exchange-token')
      const token = res.data.token
      if (token) {
        localStorage.setItem('token', token)
        await refreshUser()
        navigate('/home', { replace: true })
      } else {
        navigate('/', { replace: true })
      }
    } catch {
      navigate('/', { replace: true })
    }
  }, [navigate, refreshUser])

  useEffect(() => {
    handleSuccess()
  }, [handleSuccess])

  return (
    <div className="loading-overlay" style={{ height: '100dvh' }}>
      <div className="loading-spinner" />
      <span>Signing you in…</span>
    </div>
  )
}
