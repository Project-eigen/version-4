import React, { useRef, useState, useCallback } from 'react'
import Webcam from 'react-webcam'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/client'
import { Zap, ZapOff, Camera, X, Upload, Keyboard, HelpCircle } from 'lucide-react'
import BrandLogo from '../components/BrandLogo'
import Modal from '../components/Modal'

export default function Scanner() {
  const webcamRef = useRef<Webcam>(null)
  const navigate = useNavigate()
  const { activeMemberId } = useAuth()
  const [capturing, setCapturing] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [flashActive, setFlashActive] = useState(false)
  const [pages, setPages] = useState<{ url: string; file: File }[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [showTips, setShowTips] = useState(false)
  const [imageQuality, setImageQuality] = useState<'good' | 'poor' | null>(null)
  const [qualityMessage, setQualityMessage] = useState('')
  const [flashHint, setFlashHint] = useState('')

  const analyzeImageQuality = useCallback((imageSrc: string) => {
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        let brightness = 0
        for (let i = 0; i < data.length; i += 4) {
          brightness += (data[i] + data[i + 1] + data[i + 2]) / 3
        }
        brightness /= (data.length / 4)
        let variance = 0
        for (let i = 0; i < data.length; i += 4) {
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3
          variance += Math.pow(lum - brightness, 2)
        }
        const contrast = Math.sqrt(variance / (data.length / 4))
        if (brightness < 50) {
          setImageQuality('poor')
          setQualityMessage('Too dark — enable flash or brighter area')
        } else if (brightness > 230) {
          setImageQuality('poor')
          setQualityMessage('Too bright — reduce glare or adjust angle')
        } else if (contrast < 20) {
          setImageQuality('poor')
          setQualityMessage('Low contrast — text may be hard to read')
        } else {
          setImageQuality('good')
          setQualityMessage('Good lighting — ready to scan')
        }
        setTimeout(() => { setImageQuality(null); setQualityMessage('') }, 3000)
      } catch (e) {
        if (import.meta.env.DEV) console.warn('Image quality analysis failed', e)
      }
    }
    img.src = imageSrc
  }, [])

  const toggleFlash = async () => {
    try {
      const stream = webcamRef.current?.video?.srcObject as MediaStream | null
      if (!stream) return
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities() as any
      if (capabilities && 'torch' in capabilities) {
        const newFlashState = !flashActive
        await track.applyConstraints({ advanced: [{ torch: newFlashState }] } as any)
        setFlashActive(newFlashState)
        setFlashHint('')
      } else {
        setFlashHint('Flash is not available on this camera')
        setTimeout(() => setFlashHint(''), 2500)
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to toggle flash', err)
      setFlashHint('Could not toggle flash')
      setTimeout(() => setFlashHint(''), 2500)
    }
  }

  const handleSnapPhoto = useCallback(async () => {
    if (pages.length >= 3) {
      setErrorMsg('Maximum 3 pages allowed per scan.')
      setTimeout(() => setErrorMsg(''), 3000)
      return
    }
    const imageSrc = webcamRef.current?.getScreenshot()
    if (!imageSrc) return

    analyzeImageQuality(imageSrc)
    try {
      const res = await fetch(imageSrc)
      const blob = await res.blob()
      const file = new File([blob], `scan_page_${pages.length + 1}.jpg`, { type: 'image/jpeg' })
      setPages((prev) => [...prev, { url: imageSrc, file }])
    } catch (err) {
      if (import.meta.env.DEV) console.error('Snap photo failed', err)
    }
  }, [pages.length, analyzeImageQuality])

  const handleUploadFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (!selectedFiles.length) return

    const remainingSlots = 3 - pages.length
    const filesToUse = selectedFiles.slice(0, remainingSlots)

    const newEntries = filesToUse.map((file) => ({
      url: URL.createObjectURL(file),
      file,
    }))

    setPages((prev) => [...prev, ...newEntries])
    if (newEntries.length > 0) {
      analyzeImageQuality(newEntries[0].url)
    }
  }, [pages.length, analyzeImageQuality])

  const handleRemovePage = (index: number) => {
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProcessScan = async () => {
    if (pages.length === 0 || capturing) return
    setCapturing(true)
    setErrorMsg('')

    try {
      const formData = new FormData()
      pages.forEach((p) => {
        formData.append('images', p.file)
      })

      const scanRes = await api.post('/medicine/scan', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      navigate('/scan/approve', {
        state: {
          scanData: scanRes.data,
          capturedImage: pages[0]?.url || null,
          targetMemberId: activeMemberId,
        },
      })
    } catch (err: any) {
      if (import.meta.env.DEV) console.error('Scan process failed', err)
      const msg = err?.response?.data?.error || 'Scan failed. Please try clear, well-lit photos.'
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(''), 4000)
      setCapturing(false)
    }
  }

  return (
    <div className="scanner-fullpage">
      {/* Dark header row */}
      <div className="scanner-top-bar">
        <div className="scanner-brand">
          <BrandLogo variant="mark" size={28} alt="" className="scanner-brand-logo" />
          <span>Scanner</span>
        </div>
        <div className="scanner-top-actions">
          <button
            className={`flash-toggle-btn ${flashActive ? 'active' : ''}`}
            onClick={toggleFlash}
            type="button"
            aria-label="Toggle flash"
            id="toggle-flash-btn"
          >
            {flashActive ? (
              <Zap size={18} color="var(--accent-teal)" aria-hidden="true" />
            ) : (
              <ZapOff size={18} color="rgba(255,255,255,0.6)" aria-hidden="true" />
            )}
          </button>
          <button
            className="flash-toggle-btn"
            onClick={() => setShowTips(true)}
            type="button"
            aria-label="Scanning tips"
            title="Scan help"
          >
            <HelpCircle size={18} color="var(--accent-teal)" aria-hidden="true" />
          </button>
          <button
            className="scanner-close-btn"
            onClick={() => navigate('/cabinet')}
            type="button"
            aria-label="Close scanner"
          >
            <X size={18} color="rgba(255,255,255,0.6)" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Full-screen camera view */}
      <div className="scanner-camera-area">
        {capturing && (
          <div className="scanner-analyzing-overlay">
            <div className="loading-spinner-container">
              <div className="loading-spinner" style={{ borderTopColor: 'var(--accent-teal)', width: 36, height: 36 }} />
            </div>
            <span className="scanner-analyzing-text">
              Analyzing {pages.length} page{pages.length > 1 ? 's' : ''} with AI…
            </span>
          </div>
        )}
        {cameraError ? (
          <div className="scanner-error-state">
            <ZapOff size={52} opacity={0.4} color="white" />
            <p className="scanner-error-title">Camera Unavailable</p>
            <p className="scanner-error-desc">
              To scan prescriptions, allow camera access in your browser settings or use the upload button.
            </p>
          </div>
        ) : (
          <>
            <Webcam
              ref={webcamRef}
              audio={false}
              playsInline
              screenshotFormat="image/jpeg"
              screenshotQuality={1.0}
              videoConstraints={{
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }}
              onUserMediaError={() => setCameraError(true)}
              className="scanner-video-feed"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />

            {/* Futuristic HUD Viewfinder overlay */}
            <div className="scanner-viewfinder">
              <div className={`scanner-scan-line ${capturing ? 'is-active' : ''}`} aria-hidden="true" />
              <div className="scanner-corner tl" aria-hidden="true" />
              <div className="scanner-corner tr" aria-hidden="true" />
              <div className="scanner-corner bl" aria-hidden="true" />
              <div className="scanner-corner br" aria-hidden="true" />
              <div className="scanner-reticle-crosshair" aria-hidden="true" />
            </div>

            {/* AR Live Status Banner */}
            <div className="scanner-hud-status">
              <span className="hud-pulse-dot" />
              <span className="hud-status-text">
                {capturing
                  ? 'Analyzing prescription & box images…'
                  : pages.length > 0
                  ? `${pages.length}/3 page${pages.length > 1 ? 's' : ''} ready — tap Process or add another`
                  : 'Position prescription or medicine box inside reticle'}
              </span>
            </div>

            {/* Checklist Bottom Sheet Modal */}
            <Modal
              open={showTips}
              onClose={() => setShowTips(false)}
              title="Prescription Scanning Tips"
              variant="sheet"
            >
              <div className="scanner-checklist">
                <div className="checklist-item">
                  <span className="checklist-icon">💡</span>
                  <div className="checklist-info">
                    <span className="checklist-title">Bright & Even Lighting</span>
                    <span className="checklist-desc">Ensure strong lighting across the page to avoid dark shadows.</span>
                  </div>
                </div>
                <div className="checklist-item">
                  <span className="checklist-icon">📐</span>
                  <div className="checklist-info">
                    <span className="checklist-title">Multi-Page & Box Scanning</span>
                    <span className="checklist-desc">You can snap up to 3 photos (prescription pages + medicine box/strip).</span>
                  </div>
                </div>
                <div className="checklist-item">
                  <span className="checklist-icon">🇮🇳</span>
                  <div className="checklist-info">
                    <span className="checklist-title">Hindi & Handwritten Support</span>
                    <span className="checklist-desc">AI understands Hindi doctor notes (e.g. "सुबह शाम 1-0-1", "खाने के बाद").</span>
                  </div>
                </div>
              </div>
              <button 
                type="button" 
                className="bottom-sheet-cancel" 
                onClick={() => setShowTips(false)}
                style={{ marginTop: '12px' }}
              >
                Understood
              </button>
            </Modal>
          </>
        )}
        {imageQuality && (
          <div className="quality-badge" data-quality={imageQuality}>
            {imageQuality === 'good' ? '✓' : '⚠'} {qualityMessage}
          </div>
        )}
      </div>

      {(errorMsg || flashHint) && (
        <div className="scanner-inline-error" role="status">
          {errorMsg || flashHint}
        </div>
      )}

      {/* Captured pages thumbnail tray */}
      {pages.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 110,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 35,
          display: 'flex',
          gap: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '8px 14px',
          borderRadius: 20,
        }}>
          {pages.map((p, i) => (
            <div key={i} style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--accent-teal)' }}>
              <img src={p.url} alt={`Page ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => handleRemovePage(i)}
                style={{
                  position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%',
                  background: '#ef4444', color: '#fff', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, padding: 0
                }}
                title="Remove page"
              >
                ✕
              </button>
              <span style={{ position: 'absolute', bottom: 1, left: 3, fontSize: '0.58rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 2px #000' }}>
                P{i + 1}
              </span>
            </div>
          ))}

          {pages.length > 0 && (
            <button
              type="button"
              onClick={handleProcessScan}
              disabled={capturing}
              style={{
                background: 'linear-gradient(135deg, var(--accent-teal) 0%, #0d9488 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '0 14px',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Scan ({pages.length}) ✓
            </button>
          )}
        </div>
      )}

      {/* Capture button pinned above bottom */}
      <div className={`scanner-capture-dock ${capturing ? 'processing-state' : ''}`}>
        
        {/* Left Side: Upload Gallery */}
        <div className="scanner-action-wrapper">
          <label
            className="gallery-btn-small"
            style={{
              cursor: capturing || pages.length >= 3 ? 'not-allowed' : 'pointer',
              opacity: capturing || pages.length >= 3 ? 0.5 : 1,
              pointerEvents: capturing || pages.length >= 3 ? 'none' : 'auto',
            }}
            title="Upload prescription photo"
          >
            <Upload size={20} color="rgba(255,255,255,0.7)" strokeWidth={2} />
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUploadFiles}
              style={{ display: 'none' }}
              disabled={capturing || pages.length >= 3}
            />
          </label>
          <span className="scanner-action-label">Upload</span>
        </div>

        {/* Center: Primary Shutter Button */}
        <div className="scanner-action-wrapper">
          <button
            className="capture-btn"
            onClick={handleSnapPhoto}
            disabled={cameraError || capturing || pages.length >= 3}
            id="capture-btn"
            aria-label="Capture medicine image"
            type="button"
          >
            <Camera size={28} color="#0f172a" strokeWidth={2} />
          </button>
          <span className="scanner-action-label">{pages.length > 0 ? '+ Add Page' : 'Take Photo'}</span>
        </div>

        {/* Right Side: Type Manually Fallback */}
        <div className="scanner-action-wrapper">
          <button
            className="manual-btn-small"
            onClick={() => navigate('/scan/approve', { state: { targetMemberId: activeMemberId } })}
            disabled={capturing}
            title="Type details manually"
            type="button"
          >
            <Keyboard size={20} color="rgba(255,255,255,0.7)" strokeWidth={2} />
          </button>
          <span className="scanner-action-label">Type Manual</span>
        </div>

      </div>
    </div>
  )
}
