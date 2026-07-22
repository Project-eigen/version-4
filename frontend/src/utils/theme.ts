export type ThemeMode = 'system' | 'light' | 'dark'

const THEME_KEY = 'ds_theme'

export function getStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

export function applyTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_KEY, theme)
  const root = document.documentElement

  let effective: 'light' | 'dark' = 'light'
  if (theme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } else {
    effective = theme
  }

  root.setAttribute('data-theme', effective)
}

export function initTheme() {
  const theme = getStoredTheme()
  applyTheme(theme)

  // Listen for system theme changes if set to system
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') {
      applyTheme('system')
    }
  })
}
