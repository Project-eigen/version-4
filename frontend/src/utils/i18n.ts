import { useState, useEffect } from 'react'

/**
 * i18n.ts — DawaiSathi translation system
 *
 * Usage:
 *   import { useLanguage } from '../context/LanguageContext'
 *   const { t } = useLanguage()
 *   <span>{t('morning')}</span>
 *
 * Keys cover: navigation, time slots, actions, stats, settings, family,
 * scan/approval flow, notifications, toasts, archive, onboarding.
 */
export type Language = 'en' | 'hi'

const LANG_KEY = 'ds_lang'

export const translations: Record<Language, Record<string, string>> = {
  en: {
    // ── App / Brand ──────────────────────────────────────────────────────────
    appName: 'DawaiSathi',

    // ── Bottom navigation ────────────────────────────────────────────────────
    family: 'Family',
    cabinet: 'Cabinet',
    scan: 'Scan',

    // ── Header actions ───────────────────────────────────────────────────────
    historyLabel: 'Prescription History',
    reportLabel: 'Weekly Report',
    settingsLabel: 'Settings',

    // ── Cabinet hero ─────────────────────────────────────────────────────────
    todaysSchedule: "Today's Schedule",
    goodMorning: 'Good Morning',
    goodAfternoon: 'Good Afternoon',
    goodEvening: 'Good Evening',
    goodNight: 'Good Night',

    // ── Time slots ───────────────────────────────────────────────────────────
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night',

    // ── Dose actions ─────────────────────────────────────────────────────────
    clickToLog: 'Click to log dose',
    swipeToLog: 'Swipe to log dose',
    doseLogged: '✓ Dose logged',
    availableAt: 'Available at',

    // ── Add medicine ─────────────────────────────────────────────────────────
    addMedicine: 'Add medicine',
    scanPrescription: 'Scan prescription',
    typeManually: 'Type manually',
    scanDesc: 'AI reads the label and fills the details for you',
    manualDesc: 'Enter names, schedules, and dosages yourself',
    cancel: 'Cancel',

    // ── Cabinet empty / no-meds ──────────────────────────────────────────────
    cabinetEmpty: 'Cabinet is empty',
    cabinetEmptyDesc: 'Tap + to scan a prescription or add medicines',
    noActiveMeds: 'No active medicines today',
    noActiveMedsDesc: 'All your active medicines will show up here.',

    // ── Prescription Archive ─────────────────────────────────────────────────
    prescriptionArchive: 'Prescription Archive',
    expiredBadge: 'Expired',

    // ── Stats / HUD ──────────────────────────────────────────────────────────
    adherence: 'Adherence',
    todaysAdherence: "Today's Adherence",
    streak: 'Streak',
    dayStreak: 'day streak!',
    cabinetSafety: 'Cabinet Safety',
    safe: 'Safe',
    warning: 'Caution',
    taken: 'taken',
    of: 'of',

    // ── Missed dose banner ───────────────────────────────────────────────────
    missedYesterday: 'Missed yesterday',

    // ── Settings ─────────────────────────────────────────────────────────────
    theme: 'App Theme',
    language: 'App Language',
    english: 'English',
    hindi: 'हिंदी',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
    logout: 'Log Out',
    saveSettings: 'Save Settings',
    history: 'History',
    settings: 'Settings',

    // ── Family ───────────────────────────────────────────────────────────────
    joinFamily: 'Join a Family',
    createFamily: 'Create Family',
    inviteMembers: 'Invite Members',
    inviteCode: 'Invite Code',
    familyCode: 'Family Code',
    accept: 'Accept',
    reject: 'Reject',
    pendingRequests: 'Join Requests',

    // ── Notifications ────────────────────────────────────────────────────────
    notifReminder: 'Medicine Reminder',

    // ── Toasts ───────────────────────────────────────────────────────────────
    doseLoggedToast: '✓ Dose logged!',
    failedToLog: 'Failed to log dose — try again',
  },

  hi: {
    // ── App / Brand ──────────────────────────────────────────────────────────
    appName: 'दवाईसाथी',

    // ── Bottom navigation ────────────────────────────────────────────────────
    family: 'परिवार',
    cabinet: 'अलमारी',
    scan: 'स्कैन',

    // ── Header actions ───────────────────────────────────────────────────────
    historyLabel: 'पर्चा इतिहास',
    reportLabel: 'साप्ताहिक रिपोर्ट',
    settingsLabel: 'सेटिंग्स',

    // ── Cabinet hero ─────────────────────────────────────────────────────────
    todaysSchedule: 'आज की समय सारणी',
    goodMorning: 'शुभ प्रभात',
    goodAfternoon: 'शुभ दोपहर',
    goodEvening: 'शुभ संध्या',
    goodNight: 'शुभ रात्रि',

    // ── Time slots ───────────────────────────────────────────────────────────
    morning: 'सुबह',
    afternoon: 'दोपहर',
    evening: 'शाम',
    night: 'रात',

    // ── Dose actions ─────────────────────────────────────────────────────────
    clickToLog: 'ख़ुराक दर्ज करने के लिए क्लिक करें',
    swipeToLog: 'ख़ुराक दर्ज करने के लिए स्वाइप करें',
    doseLogged: '✓ ख़ुराक ली गई',
    availableAt: 'उपलब्ध समय',

    // ── Add medicine ─────────────────────────────────────────────────────────
    addMedicine: 'दवाई जोड़ें',
    scanPrescription: 'पर्चा स्कैन करें',
    typeManually: 'खुद दर्ज करें',
    scanDesc: 'AI लेबल पढ़कर जानकारी भर देगा',
    manualDesc: 'नाम, समय और खुराक खुद डालें',
    cancel: 'रद्द करें',

    // ── Cabinet empty / no-meds ──────────────────────────────────────────────
    cabinetEmpty: 'अलमारी खाली है',
    cabinetEmptyDesc: 'पर्चा स्कैन करने या दवाई जोड़ने के लिए + दबाएं',
    noActiveMeds: 'आज कोई दवाई नहीं है',
    noActiveMedsDesc: 'आपकी सभी सक्रिय दवाइयां यहां दिखेंगी।',

    // ── Prescription Archive ─────────────────────────────────────────────────
    prescriptionArchive: 'पर्चा संग्रह',
    expiredBadge: 'समाप्त',

    // ── Stats / HUD ──────────────────────────────────────────────────────────
    adherence: 'पालन दर',
    todaysAdherence: 'आज की पालन दर',
    streak: 'लगातार दिन',
    dayStreak: 'दिन लगातार!',
    cabinetSafety: 'अलमारी सुरक्षा',
    safe: 'सुरक्षित',
    warning: 'सावधानी',
    taken: 'ली गई',
    of: 'में से',

    // ── Missed dose banner ───────────────────────────────────────────────────
    missedYesterday: 'कल छूट गई',

    // ── Settings ─────────────────────────────────────────────────────────────
    theme: 'ऐप थीम',
    language: 'ऐप भाषा',
    english: 'English',
    hindi: 'हिंदी',
    system: 'सिस्टम',
    light: 'लाइट',
    dark: 'डार्क',
    logout: 'लॉग आउट',
    saveSettings: 'सेटिंग्स सहेजें',
    history: 'इतिहास',
    settings: 'सेटिंग्स',

    // ── Family ───────────────────────────────────────────────────────────────
    joinFamily: 'परिवार से जुड़ें',
    createFamily: 'परिवार बनाएं',
    inviteMembers: 'सदस्य आमंत्रित करें',
    inviteCode: 'आमंत्रण कोड',
    familyCode: 'परिवार कोड',
    accept: 'स्वीकार',
    reject: 'अस्वीकार',
    pendingRequests: 'जुड़ने के अनुरोध',

    // ── Notifications ────────────────────────────────────────────────────────
    notifReminder: 'दवाई की याद',

    // ── Toasts ───────────────────────────────────────────────────────────────
    doseLoggedToast: '✓ ख़ुराक दर्ज हो गई!',
    failedToLog: 'ख़ुराक दर्ज नहीं हुई — दोबारा प्रयास करें',
  },
}

export function getStoredLanguage(): Language {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'hi' || stored === 'en') return stored
  return 'en'
}

export function setStoredLanguage(lang: Language) {
  localStorage.setItem(LANG_KEY, lang)
  window.dispatchEvent(new Event('language-change'))
}

/** One-shot translation without a hook (for use outside React components). */
export function t(key: string, lang?: Language): string {
  const currentLang = lang || getStoredLanguage()
  return translations[currentLang]?.[key] || translations.en[key] || key
}

/**
 * @deprecated Import useLanguage from context/LanguageContext instead.
 * This local hook does NOT propagate changes to sibling components.
 * Kept for backwards-compatibility with SettingsDashboard until it's migrated.
 */
export function useLanguage() {
  const [lang, setLangState] = useState<Language>(getStoredLanguage)
  useEffect(() => {
    const h = () => setLangState(getStoredLanguage())
    window.addEventListener('language-change', h)
    return () => window.removeEventListener('language-change', h)
  }, [])
  const setLanguage = (newLang: Language) => setStoredLanguage(newLang)
  return { lang, setLanguage, t: (key: string) => t(key, lang) }
}
