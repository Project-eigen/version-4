/**
 * LanguageContext.tsx
 *
 * Global language state — wraps the entire app so any component can call
 * `useLanguage()` and get a reactive `lang` value + translation helper `t()`.
 *
 * Architecture:
 *  - Reads initial value from localStorage (ds_lang) on mount
 *  - Listens for the `language-change` window event fired by setStoredLanguage()
 *  - Re-renders the whole subtree when language changes → every consumer updates
 */
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getStoredLanguage, setStoredLanguage, t as rawT, type Language } from '../utils/i18n'

interface LanguageContextType {
  lang: Language
  setLanguage: (l: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(getStoredLanguage)

  useEffect(() => {
    const handleChange = () => setLangState(getStoredLanguage())
    window.addEventListener('language-change', handleChange)
    return () => window.removeEventListener('language-change', handleChange)
  }, [])

  const setLanguage = (newLang: Language) => {
    setStoredLanguage(newLang)
    // setLangState is also called by the event listener above,
    // but calling it here too makes the transition synchronous/instant.
    setLangState(newLang)
  }

  const t = (key: string) => rawT(key, lang)

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be inside LanguageProvider')
  return ctx
}
