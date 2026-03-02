import { useState, useEffect } from 'react'
import { getViewer, AniListUser } from '../api/anilist'
import './SettingsPage.css'

interface Settings {
  // General
  downloadPath: string
  language: string
  autoUpdate: boolean

  // Reader
  defaultReadingMode: 'webtoon' | 'single' | 'double'
  defaultReadingDirection: 'ltr' | 'rtl'
  autoHideHud: boolean

  // Appearance
  accentColor: string
  darkMode: boolean

  // Downloads
  maxConcurrentDownloads: number
  downloadOnWifi: boolean
}

const DEFAULT_SETTINGS: Settings = {
  downloadPath: '',
  language: 'en',
  autoUpdate: true,
  defaultReadingMode: 'webtoon',
  defaultReadingDirection: 'ltr',
  autoHideHud: true,
  accentColor: '#8b5cf6',
  darkMode: true,
  maxConcurrentDownloads: 2,
  downloadOnWifi: false,
}

const ACCENT_COLORS = [
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Pink', value: '#ec4899' },
]

function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')

  // AniList State
  const [anilistUser, setAnilistUser] = useState<AniListUser | null>(null)
  const [isAnilistLoading, setIsAnilistLoading] = useState(false)

  useEffect(() => {
    loadSettings()
    loadAnilistStatus()
  }, [])

  const loadAnilistStatus = async () => {
    if (!window.codex) return
    try {
      const token = await window.codex.getAnilistToken()
      if (token) {
        setIsAnilistLoading(true)
        const user = await getViewer(token)
        setAnilistUser(user)
      } else {
        setAnilistUser(null)
      }
    } catch (error) {
      console.error('Failed to load AniList user:', error)
      setAnilistUser(null)
    } finally {
      setIsAnilistLoading(false)
    }
  }

  const handleAnilistLogin = async () => {
    if (!window.codex) return
    try {
      setIsAnilistLoading(true)
      const res = await window.codex.anilistLogin()
      if (res.success && res.token) {
        await loadAnilistStatus()
        setSaveMessage('AniList Connected!')
        setTimeout(() => setSaveMessage(''), 2000)
      } else if (res.error) {
        console.error('AniList login error:', res.error)
      }
    } catch (error) {
      console.error('Failed to login to AniList:', error)
    } finally {
      setIsAnilistLoading(false)
    }
  }

  const handleAnilistLogout = async () => {
    if (!window.codex) return
    try {
      await window.codex.anilistLogout()
      setAnilistUser(null)
      setSaveMessage('AniList Disconnected!')
      window.dispatchEvent(new Event('anilist-status-updated'))
      setTimeout(() => setSaveMessage(''), 2000)
    } catch (error) {
      console.error('Failed to logout of AniList:', error)
    }
  }

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      if (window.codex) {
        const savedSettings = await window.codex.getAllSettings()
        setSettings({ ...DEFAULT_SETTINGS, ...savedSettings })
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const saveSettings = async (key: keyof Settings, value: any) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)

    if (window.codex) {
      try {
        await window.codex.setSetting(key, value)

        // Apply accent color immediately
        if (key === 'accentColor') {
          document.documentElement.style.setProperty('--accent-primary', value)
        }

        setSaveMessage('Saved!')
        setTimeout(() => setSaveMessage(''), 2000)
      } catch (error) {
        console.error('Failed to save setting:', error)
      }
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure CODEX</p>
        </header>
        <div className="settings-loading">
          <div className="skeleton settings-group-skeleton" />
          <div className="skeleton settings-group-skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="page settings-page">
      <header className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-subtitle">Configure CODEX preferences</p>
          </div>
          {saveMessage && (
            <span className="save-indicator">{saveMessage}</span>
          )}
        </div>
      </header>

      <div className="settings-container">
        {/* General Settings */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            General
          </h2>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Language</span>
              <span className="setting-description">Application language</span>
            </div>
            <select
              className="setting-select"
              value={settings.language}
              onChange={(e) => saveSettings('language', e.target.value)}
            >
              <option value="en">English</option>
              <option value="pt-BR">Português (BR)</option>
              <option value="es">Español</option>
              <option value="ja">日本語</option>
            </select>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Auto-check for Updates</span>
              <span className="setting-description">Automatically check for new versions</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoUpdate}
                onChange={(e) => saveSettings('autoUpdate', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* Reader Settings */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            Reader
          </h2>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Default Reading Mode</span>
              <span className="setting-description">Initial mode when opening reader</span>
            </div>
            <select
              className="setting-select"
              value={settings.defaultReadingMode}
              onChange={(e) => saveSettings('defaultReadingMode', e.target.value)}
            >
              <option value="webtoon">Webtoon (Scroll)</option>
              <option value="single">Single Page</option>
              <option value="double">Double Page</option>
            </select>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Reading Direction</span>
              <span className="setting-description">Page turn direction for manga</span>
            </div>
            <select
              className="setting-select"
              value={settings.defaultReadingDirection}
              onChange={(e) => saveSettings('defaultReadingDirection', e.target.value)}
            >
              <option value="ltr">Left to Right</option>
              <option value="rtl">Right to Left (Manga)</option>
            </select>
          </div>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Auto-hide Controls</span>
              <span className="setting-description">Hide HUD after 3 seconds of inactivity</span>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={settings.autoHideHud}
                onChange={(e) => saveSettings('autoHideHud', e.target.checked)}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        {/* Appearance Settings */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a7 7 0 0 0 0 14 7 7 0 0 0 0-14" />
            </svg>
            Appearance
          </h2>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Accent Color</span>
              <span className="setting-description">Primary color for buttons and highlights</span>
            </div>
            <div className="color-picker">
              {ACCENT_COLORS.map(color => (
                <button
                  key={color.value}
                  className={`color-option ${settings.accentColor === color.value ? 'active' : ''}`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => saveSettings('accentColor', color.value)}
                  title={color.name}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Download Settings */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Downloads
          </h2>

          <div className="setting-item">
            <div className="setting-info">
              <span className="setting-label">Concurrent Downloads</span>
              <span className="setting-description">Number of chapters to download at once</span>
            </div>
            <select
              className="setting-select"
              value={settings.maxConcurrentDownloads}
              onChange={(e) => saveSettings('maxConcurrentDownloads', parseInt(e.target.value))}
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="5">5</option>
            </select>
          </div>
        </section>

        {/* Integrations Section */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            Integrations
          </h2>

          <div className="setting-item integration-item">
            <div className="setting-info">
              <span className="setting-label">AniList</span>
              <span className="setting-description">Sync reading progress and scores automatically</span>
            </div>

            <div className="integration-action">
              {isAnilistLoading ? (
                <div className="loading-spinner small"></div>
              ) : anilistUser ? (
                <div className="anilist-profile">
                  <img src={anilistUser.avatar.large} alt={anilistUser.name} className="anilist-avatar" />
                  <span className="anilist-name">{anilistUser.name}</span>
                  <button className="btn btn-secondary" onClick={handleAnilistLogout}>
                    Disconnect
                  </button>
                </div>
              ) : (
                <button className="btn btn-primary" onClick={handleAnilistLogin}>
                  Connect to AniList
                </button>
              )}
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="settings-section">
          <h2 className="settings-section-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            About
          </h2>

          <div className="about-info">
            <div className="app-logo">
              <span className="logo-text">C</span>
            </div>
            <div className="app-details">
              <h3 className="app-name">CODEX</h3>
              <p className="app-version">Version 1.0.0</p>
              <p className="app-description">A modern manga reader for desktop</p>
            </div>
          </div>

          <div className="about-links">
            <a href="#" className="about-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              GitHub
            </a>
            <a href="#" className="about-link">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
              Discord
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}

export default SettingsPage
