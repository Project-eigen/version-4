import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'

export default function AuthSuccess() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()

  const handleSuccess = useCallback(async () => {
    try {
      // Exchange secure HttpOnly cookie for the token to prevent URL leakage
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
