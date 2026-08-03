import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Mic, MicOff, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
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

export default function VoiceLoggerSheet({ open, onClose, targetUserId, onSuccess }: VoiceLoggerSheetProps) {
  const { lang } = useLanguage()
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTranscript('')
      setResultMsg(null)
      setErrorMsg(null)
      startListening()
    } else {
      setIsListening(false)
      setIsAnalyzing(false)
    }
  }, [open])

  const startListening = () => {
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setErrorMsg(lang === 'hi' ? 'ब्राउज़र वॉइस सपोर्ट नहीं करता' : 'Voice recognition not supported on this browser')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
      recognition.interimResults = true
      recognition.maxAlternatives = 3

      setIsListening(true)
      setErrorMsg(null)

      recognition.onresult = (event: any) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript
        }
        setTranscript(currentTranscript)
      }

      recognition.onerror = () => {
        setIsListening(false)
        setErrorMsg(lang === 'hi' ? 'आवाज समझ नहीं आई, कृपया पुन: प्रयास करें' : 'Voice not recognized. Please try again.')
      }

      recognition.onend = () => {
        setIsListening(false)
      }

      recognition.start()
    } catch (e) {
      setIsListening(false)
      setErrorMsg(lang === 'hi' ? 'माइक्रोफोन एक्सेस एरर' : 'Microphone access error')
    }
  }

  const handleProcessVoiceText = async (textToSend: string) => {
    if (!textToSend.trim()) return
    setIsAnalyzing(true)
    setErrorMsg(null)
    setResultMsg(null)

    try {
      const res = await api.post('/medicine/voice_parse', {
        spoken_text: textToSend,
        target_user_id: targetUserId,
      })

      const data = res.data
      if (data.success) {
        const msg = lang === 'hi' ? data.summary_hi : data.summary_en
        setResultMsg(`✅ ${msg} (${data.model_used})`)
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } })
        if (onSuccess) onSuccess()
        setTimeout(() => {
          onClose()
        }, 2200)
      } else {
        setErrorMsg(lang === 'hi' ? 'कोई दवा दर्ज नहीं हो सकी' : 'Could not match active doses')
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.error || (lang === 'hi' ? 'AI प्रोसेसिंग में त्रुटि हुई' : 'AI processing failed'))
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

        {/* Live Animated Mic Wave */}
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

        {/* Live Transcript Box */}
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
              <span>{lang === 'hi' ? 'AI आपकी आवाज का विश्लेषण कर रहा है...' : 'AI Analyzing voice intent...'}</span>
            </div>
          ) : resultMsg ? (
            <div style={{ color: '#10b981', fontWeight: 700, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle2 size={18} />
              <span>{resultMsg}</span>
            </div>
          ) : errorMsg ? (
            <div style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              {transcript || (lang === 'hi' ? 'बोलने के लिए माइक बटन दबाएं' : 'Tap mic to start speaking')}
            </p>
          )}
        </div>

        {/* Action Buttons */}
        {transcript && !isAnalyzing && !resultMsg && (
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
              {lang === 'hi' ? '⚡ AI से खुराक दर्ज करें (Confirm Voice Log)' : '⚡ AI Confirm & Log Doses'}
            </button>
          </div>
        )}

        {/* Elderly Prompt Guide */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '12px', textAlign: 'left' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
            {lang === 'hi' ? '💡 बुजुर्गों के लिए वॉइस गाइड (Voice Examples):' : '💡 Voice Examples for Elderly Care:'}
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <li>{lang === 'hi' ? '"मैंने रात की डोलू खा ली"' : '"Logged morning Dolo 650"'}</li>
            <li>{lang === 'hi' ? '"सुबह की सभी दवाइयां ले ली हैं"' : '"Took all night medicines"'}</li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}
