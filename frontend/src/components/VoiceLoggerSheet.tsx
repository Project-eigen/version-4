import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Sparkles, CheckCircle2, AlertCircle, Clock, Info } from 'lucide-react'
import Modal from './Modal'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import confetti from 'canvas-confetti'

interface VoiceLoggerSheetProps {
  open: boolean
  onClose: () => void
  targetUserId?: number
  onSuccess?: () => void
}

// ── TTS helper ─────────────────────────────────────────────────────────────────
function speak(text: string, langCode: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = langCode
  utterance.rate = 0.88
  utterance.pitch = 1.0
  utterance.volume = 1.0
  window.speechSynthesis.speak(utterance)
}

type ResultState =
  | { type: 'success'; msgEn: string; msgHi: string }
  | { type: 'already_logged'; msgEn: string; msgHi: string }
  | { type: 'no_meds'; msgEn: string; msgHi: string }
  | { type: 'error'; msg: string }

export default function VoiceLoggerSheet({ open, onClose, targetUserId, onSuccess }: VoiceLoggerSheetProps) {
  const { lang } = useLanguage()
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [autoSubmitCountdown, setAutoSubmitCountdown] = useState<number | null>(null)
  const transcriptRef = useRef('')
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open) {
      setTranscript('')
      transcriptRef.current = ''
      setResult(null)
      setAutoSubmitCountdown(null)
      startListening()
    } else {
      stopAutoSubmitTimer()
      setIsListening(false)
      setIsAnalyzing(false)
    }
    return () => stopAutoSubmitTimer()
  }, [open])

  function stopAutoSubmitTimer() {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current)
      autoSubmitTimerRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    setAutoSubmitCountdown(null)
  }

  const startListening = () => {
    const SpeechRecognition =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setResult({ type: 'error', msg: lang === 'hi' ? 'ब्राउज़र वॉइस सपोर्ट नहीं करता' : 'Voice recognition not supported on this browser' })
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
      recognition.interimResults = true
      recognition.maxAlternatives = 3

      setIsListening(true)
      setResult(null)
      stopAutoSubmitTimer()

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let current = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          current += event.results[i][0].transcript
        }
        setTranscript(current)
        transcriptRef.current = current
      }

      recognition.onerror = () => {
        setIsListening(false)
        setResult({ type: 'error', msg: lang === 'hi' ? 'आवाज़ समझ नहीं आई, फिर से बोलें' : 'Voice not recognized. Please try again.' })
      }

      recognition.onend = () => {
        setIsListening(false)
        const finalText = transcriptRef.current.trim()
        if (finalText) {
          // Auto-submit after 800ms — elderly users don't need to tap confirm
          let countdown = 2
          setAutoSubmitCountdown(countdown)
          countdownIntervalRef.current = setInterval(() => {
            countdown -= 1
            if (countdown <= 0) {
              if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
              setAutoSubmitCountdown(null)
            } else {
              setAutoSubmitCountdown(countdown)
            }
          }, 1000)
          autoSubmitTimerRef.current = setTimeout(() => {
            setAutoSubmitCountdown(null)
            handleProcessVoiceText(finalText)
          }, 800)
        }
      }

      recognition.start()
    } catch {
      setIsListening(false)
      setResult({ type: 'error', msg: lang === 'hi' ? 'माइक्रोफोन एक्सेस एरर' : 'Microphone access error' })
    }
  }

  const handleProcessVoiceText = async (textToSend: string) => {
    if (!textToSend.trim()) return
    stopAutoSubmitTimer()
    setIsAnalyzing(true)
    setResult(null)

    try {
      const res = await api.post('/medicine/voice_parse', {
        spoken_text: textToSend,
        target_user_id: targetUserId,
      })

      const data = res.data
      const langCode = lang === 'hi' ? 'hi-IN' : 'en-IN'

      if (data.already_logged) {
        const msgEn = data.summary_en || 'Doses were already logged earlier.'
        const msgHi = data.summary_hi || 'खुराक पहले से दर्ज है।'
        setResult({ type: 'already_logged', msgEn, msgHi })
        speak(lang === 'hi' ? msgHi : msgEn, langCode)
        setTimeout(() => onClose(), 3000)
        return
      }

      if (data.no_meds_in_slot || (!data.success && data.logged_count === 0)) {
        const msgEn = data.summary_en || 'No medicines found for that time slot.'
        const msgHi = data.summary_hi || 'उस समय के लिए कोई दवा नहीं मिली।'
        setResult({ type: 'no_meds', msgEn, msgHi })
        speak(lang === 'hi' ? msgHi : msgEn, langCode)
        return
      }

      if (data.success && data.logged_count > 0) {
        const msgEn = data.summary_en || `Logged ${data.target_slot} doses.`
        const msgHi = data.summary_hi || `${data.target_slot} की खुराक दर्ज कर दी गई।`
        setResult({ type: 'success', msgEn, msgHi })
        speak(lang === 'hi' ? msgHi : msgEn, langCode)
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 }, colors: ['#0d9488', '#14b8a6', '#5eead4', '#ffffff'] })
        if (onSuccess) onSuccess()
        setTimeout(() => onClose(), 2500)
        return
      }

      // Edge: success=true but logged_count=0 (e.g. nothing new)
      const msgEn = data.summary_en || 'Doses logged via voice.'
      const msgHi = data.summary_hi || 'वॉइस से खुराक दर्ज की गई।'
      setResult({ type: 'success', msgEn, msgHi })
      speak(lang === 'hi' ? msgHi : msgEn, langCode)
      if (onSuccess) onSuccess()
      setTimeout(() => onClose(), 2500)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const msg = err.response?.data?.error || (lang === 'hi' ? 'AI प्रोसेसिंग में त्रुटि हुई' : 'AI processing failed. Please try again.')
      setResult({ type: 'error', msg })
      speak(msg, lang === 'hi' ? 'hi-IN' : 'en-IN')
    } finally {
      setIsAnalyzing(false)
    }
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="" variant="sheet">
      <div style={{ maxWidth: 440, margin: '0 auto', textAlign: 'center', padding: '10px 4px 20px', color: 'var(--text-primary)' }}>

        {/* Header Badge */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 20, background: 'rgba(45, 212, 191, 0.12)', color: 'var(--accent-teal)', fontSize: '0.78rem', fontWeight: 800, marginBottom: 16 }}>
          <Sparkles size={14} color="var(--accent-teal)" />
          {lang === 'hi' ? 'एआई संचालित वॉइस असिस्टेंट' : 'AI Powered Voice Logger'}
        </div>

        {/* Live Animated Mic */}
        <div style={{ position: 'relative', width: 84, height: 84, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isListening && (
            <>
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0.2, 0.6] }}
                transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--accent-teal)' }}
              />
              <motion.div
                animate={{ scale: [1, 1.7, 1], opacity: [0.4, 0.1, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.5, delay: 0.3, ease: 'easeInOut' }}
                style={{ position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', background: 'var(--accent-teal)' }}
              />
            </>
          )}

          <button
            type="button"
            onClick={isListening ? () => setIsListening(false) : startListening}
            style={{
              position: 'relative',
              zIndex: 2,
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: isListening ? 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)' : 'var(--bg-subtle)',
              border: '2px solid var(--accent-teal)',
              color: isListening ? '#ffffff' : 'var(--accent-teal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              boxShadow: isListening ? '0 0 20px rgba(45, 212, 191, 0.5)' : 'none',
            }}
          >
            {isListening ? <Mic size={32} /> : <MicOff size={30} />}
          </button>
        </div>

        {/* Auto-submit countdown hint */}
        {autoSubmitCountdown !== null && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ fontSize: '0.8rem', color: 'var(--accent-teal)', fontWeight: 700, marginBottom: 8 }}
          >
            {lang === 'hi' ? `${autoSubmitCountdown}s में ऑटो सबमिट...` : `Auto-submitting in ${autoSubmitCountdown}s...`}
          </motion.div>
        )}

        {/* Live Transcript / State Box */}
        <div style={{ minHeight: 64, background: 'var(--bg-subtle)', borderRadius: 14, padding: '12px 16px', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
          {isListening ? (
            <p style={{ margin: 0, fontSize: '0.92rem', color: transcript ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: transcript ? 'normal' : 'italic' }}>
              {transcript || (lang === 'hi' ? 'सुन रहे हैं... बोलिए (उदा: "रात की दवा ले ली")' : 'Listening... Speak now (e.g. "Logged night Paracetamol")')}
            </p>
          ) : isAnalyzing ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--accent-teal)', fontWeight: 700, fontSize: '0.88rem' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                <Sparkles size={18} />
              </motion.div>
              <span>{lang === 'hi' ? 'AI आपकी आवाज़ का विश्लेषण कर रहा है...' : 'AI analyzing voice command...'}</span>
            </div>
          ) : result?.type === 'success' ? (
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle2 size={18} />
              <span>{lang === 'hi' ? result.msgHi : result.msgEn}</span>
            </div>
          ) : result?.type === 'already_logged' ? (
            <div style={{ color: 'var(--accent-teal)', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle2 size={16} />
              <span>{lang === 'hi' ? result.msgHi : result.msgEn}</span>
            </div>
          ) : result?.type === 'no_meds' ? (
            <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 6, textAlign: 'left' }}>
              <Clock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{lang === 'hi' ? result.msgHi : result.msgEn}</span>
            </div>
          ) : result?.type === 'error' ? (
            <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <AlertCircle size={16} />
              <span>{result.msg}</span>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {transcript || (lang === 'hi' ? 'बोलने के लिए माइक बटन दबाएं' : 'Tap mic to start speaking')}
            </p>
          )}
        </div>

        {/* Manual confirm button — shown when transcript ready but not yet analyzing */}
        {transcript && !isAnalyzing && !result && !isListening && autoSubmitCountdown === null && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => handleProcessVoiceText(transcript)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)',
                color: '#fff',
                border: 'none',
                fontWeight: 800,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(45, 212, 191, 0.3)',
              }}
            >
              {lang === 'hi' ? 'AI से खुराक दर्ज करें' : 'AI Confirm & Log Doses'}
            </button>
          </div>
        )}

        {/* Retry button after error or no-meds */}
        {(result?.type === 'error' || result?.type === 'no_meds') && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => {
                setResult(null)
                setTranscript('')
                transcriptRef.current = ''
                startListening()
              }}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: 14,
                background: 'var(--bg-surface)',
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
              }}
            >
              <Mic size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
              {lang === 'hi' ? 'फिर से बोलें' : 'Tap to Retry'}
            </button>
          </div>
        )}

        {/* Elderly Prompt Guide — Lucide icons, no emoji */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '12px', textAlign: 'left' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Info size={12} />
            {lang === 'hi' ? 'बुजुर्गों के लिए वॉइस उदाहरण:' : 'Voice Examples for Elderly Care:'}
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {lang === 'hi' ? (
              <>
                <li>"मैंने रात की दवा ले ली"</li>
                <li>"सुबह की सभी दवाइयां ले ली हैं"</li>
                <li>"दोपहर की दवा खा ली"</li>
              </>
            ) : (
              <>
                <li>"Logged night Paracetamol"</li>
                <li>"Took all morning medicines"</li>
                <li>"Evening dose done"</li>
              </>
            )}
          </ul>
          <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mic size={10} />
            {lang === 'hi'
              ? 'हिन्दी और English दोनों में बोल सकते हैं'
              : 'Hindi and English both supported'}
          </div>
        </div>

        {/* Language toggle hint */}
        <div
          style={{
            marginTop: 12,
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
          onClick={() => {
            // Trigger re-listen in current language
            if (!isListening && !isAnalyzing) {
              setResult(null)
              setTranscript('')
              transcriptRef.current = ''
              startListening()
            }
          }}
        >
          {lang === 'hi'
            ? `सुन रहा है: हिन्दी (hi-IN)`
            : `Listening in: English (en-IN)`}
        </div>

      </div>
    </Modal>
  )
}
