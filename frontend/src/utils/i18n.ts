import { useState, useEffect } from 'react'

export type Language = 'en' | 'hi'

const LANG_KEY = 'ds_lang'

export const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header & Nav
    appName: 'DawaiSathi',
    cabinet: 'Cabinet',
    family: 'Family',
    scan: 'Scan',
    history: 'History',
    settings: 'Settings',
    todaysSchedule: "Today's Schedule",
    goodMorning: 'Good Morning',
    goodAfternoon: 'Good Afternoon',
    goodEvening: 'Good Evening',
    goodNight: 'Good Night',

    // Time Slots
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',

    // Actions
    clickToLog: 'Click to log dose',
    swipeToLog: 'Swipe to log dose',
    doseLogged: '✓ Dose logged',
    availableAt: 'Available at',
    addMedicine: 'Add Medicine',
    scanPrescription: 'Scan Prescription',
    pastMedicines: 'Past / Expired Medicines',
    noActiveMeds: 'No active medicines today',

    // Stats
    adherence: 'Adherence',
    streak: 'Streak',
    dayStreak: 'day streak!',
    cabinetSafety: 'Cabinet Safety',
    safe: 'Safe',
    warning: 'Caution',

    // Settings
    theme: 'App Theme',
    language: 'App Language',
    english: 'English',
    hindi: 'हिंदी',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    logout: 'Log Out',
    saveSettings: 'Save Settings',
  },
  hi: {
    // Header & Nav
    appName: 'दवाईसाथी',
    cabinet: 'अलमारी',
    family: 'परिवार',
    scan: 'स्कैन',
    history: 'इतिहास',
    settings: 'सेटिंग्स',
    todaysSchedule: 'आज की समय सारणी',
    goodMorning: 'शुभ प्रभात',
    goodAfternoon: 'शुभ दोपहर',
    goodEvening: 'शुभ संध्या',
    goodNight: 'शुभ रात्रि',

    // Time Slots
    morning: 'सुबह',
    afternoon: 'दोपहर',
    evening: 'शाम',
    night: 'रात',

    // Actions
    clickToLog: 'ख़ुराक दर्ज करने के लिए क्लिक करें',
    swipeToLog: 'ख़ुराक दर्ज करने के लिए स्वाइप करें',
    doseLogged: '✓ ख़ुराक ली गई',
    availableAt: 'उपलब्ध समय',
    addMedicine: 'दवाई जोड़ें',
    scanPrescription: 'पर्चा स्कैन करें',
    pastMedicines: 'पुरानी / समाप्त दवाइयां',
    noActiveMeds: 'आज कोई दवाई नहीं है',

    // Stats
    adherence: 'पालन दर',
    streak: 'लगातार दिन',
    dayStreak: 'दिन लगातार!',
    cabinetSafety: 'अलमारी सुरक्षा',
    safe: 'सुरक्षित',
    warning: 'सावधानी',

    // Settings
    theme: 'ऐप थीम',
    language: 'ऐप भाषा',
    english: 'English',
    hindi: 'हिंदी',
    system: 'सिस्टम',
    light: 'लाइट',
    dark: 'डार्क',
    logout: 'लॉग आउट',
    saveSettings: 'सेटिंग्स सहेजें',
  },
}

export function getStoredLanguage(): Language {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'hi' || stored === 'en') {
    return stored
  }
  return 'en'
}

export function setStoredLanguage(lang: Language) {
  localStorage.setItem(LANG_KEY, lang)
  window.dispatchEvent(new Event('language-change'))
}

export function t(key: string, lang?: Language): string {
  const currentLang = lang || getStoredLanguage()
  return translations[currentLang]?.[key] || translations.en[key] || key
}

export function useLanguage() {
  const [lang, setLangState] = useState<Language>(getStoredLanguage())

  useEffect(() => {
    const handleLangChange = () => {
      setLangState(getStoredLanguage())
    }
    window.addEventListener('language-change', handleLangChange)
    return () => window.removeEventListener('language-change', handleLangChange)
  }, [])

  const setLanguage = (newLang: Language) => {
    setStoredLanguage(newLang)
  }

  return { lang, setLanguage, t: (key: string) => t(key, lang) }
}
