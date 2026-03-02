import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { getViewer } from '../../api/anilist'
import './Sidebar.css'
import './Sidebar.css'

// SVG Icons as components
const LibraryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
  </svg>
)

const BrowseIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

const HistoryIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </svg>
)

const SettingsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const SourcesIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" x2="12" y1="18" y2="12" />
    <line x1="9" x2="15" y1="15" y2="15" />
  </svg>
)

const navItems = [
  { path: '/library', label: 'Library', icon: LibraryIcon },
  { path: '/browse', label: 'Browse', icon: BrowseIcon },
  { path: '/history', label: 'History', icon: HistoryIcon },
  { path: '/downloads', label: 'Downloads', icon: DownloadIcon },
  { path: '/sources', label: 'Sources', icon: SourcesIcon },
]

function Sidebar() {
  const [anilistUser, setAnilistUser] = useState<{ name: string, avatar: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const checkAnilistStatus = async () => {
    setIsLoading(true)
    try {
      if (window.codex) {
        const token = await window.codex.getAnilistToken()
        if (token) {
          const viewer = await getViewer(token)
          if (viewer) {
            setAnilistUser({ name: viewer.name, avatar: viewer.avatar.large })
          } else {
            setAnilistUser(null)
          }
        } else {
          setAnilistUser(null)
        }
      }
    } catch (e) {
      console.error('Failed to load AniList status in sidebar', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    checkAnilistStatus()

    // Listen for custom event if setting changes in SettingsPage
    const handleStatusUpdate = () => checkAnilistStatus()
    window.addEventListener('anilist-status-updated', handleStatusUpdate)
    return () => window.removeEventListener('anilist-status-updated', handleStatusUpdate)
  }, [])

  const handleAnilistLogin = async () => {
    if (!anilistUser && window.codex) {
      setIsLoading(true)
      const res = await window.codex.anilistLogin()
      if (res?.token) {
        await checkAnilistStatus()
        window.dispatchEvent(new Event('anilist-status-updated'))
      } else {
        setIsLoading(false)
      }
    } else if (anilistUser) {
      // If already connected, do nothing when clicking on the profile in the sidebar
      // Usually users go to settings to disconnect
    }
  }

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <span className="logo-text">C</span>
        </div>
        <span className="logo-title">CODEX</span>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            <Icon />
            <span className="nav-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div className="sidebar-spacer" />

      {/* Footer Container */}
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `nav-item ${isActive ? 'nav-item-active' : ''}`
          }
        >
          <SettingsIcon />
          <span className="nav-label">Settings</span>
        </NavLink>

        <div className="sidebar-profile" onClick={handleAnilistLogin} title={anilistUser ? "Open AniList Profile" : "Connect to AniList"}>
          {isLoading ? (
            <div className="profile-avatar skeleton-pulse" />
          ) : anilistUser ? (
            <img src={anilistUser.avatar} alt="AniList Avatar" className="profile-avatar" />
          ) : (
            <div className="profile-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>
          )}
          <div className="profile-info">
            {isLoading ? (
              <span className="profile-name">Loading...</span>
            ) : anilistUser ? (
              <>
                <span className="profile-name">{anilistUser.name}</span>
                <span className="profile-status connected">Connected</span>
              </>
            ) : (
              <>
                <span className="profile-name">Log In</span>
                <span className="profile-status">AniList</span>
              </>
            )}
          </div>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar
