import { useState, useEffect } from 'react'
import './DownloadsPage.css'

interface DownloadItem {
  id: number
  chapterId: number
  mangaTitle: string
  chapterName: string
  status: 'PENDING' | 'DOWNLOADING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  progress: number
  errorMessage?: string
}

function DownloadsPage() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadDownloads()

    // Subscribe to progress updates
    if (window.codex?.onDownloadProgress) {
      window.codex.onDownloadProgress((data: { id: number; progress: number }) => {
        setDownloads(prev => prev.map(item =>
          item.id === data.id ? { ...item, progress: data.progress } : item
        ))
      })
    }

    // Poll for updates every 2 seconds
    const interval = setInterval(loadDownloads, 2000)
    return () => clearInterval(interval)
  }, [])

  const loadDownloads = async () => {
    try {
      if (window.codex) {
        const queue = await window.codex.getDownloadQueue()
        setDownloads(queue)
      } else {
        // Mock data for browser testing
        setDownloads([
          { id: 1, chapterId: 1, mangaTitle: 'One Piece', chapterName: 'Chapter 1120', status: 'DOWNLOADING', progress: 45 },
          { id: 2, chapterId: 2, mangaTitle: 'One Piece', chapterName: 'Chapter 1119', status: 'PENDING', progress: 0 },
          { id: 3, chapterId: 3, mangaTitle: 'Naruto', chapterName: 'Chapter 700', status: 'COMPLETED', progress: 100 },
          { id: 4, chapterId: 4, mangaTitle: 'Bleach', chapterName: 'Chapter 686', status: 'FAILED', progress: 32, errorMessage: 'Connection timeout' },
        ])
      }
    } catch (error) {
      console.error('Failed to load downloads:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = async (downloadId: number) => {
    if (window.codex) {
      await window.codex.cancelDownload(downloadId)
      loadDownloads()
    }
  }

  const handleClearCompleted = async () => {
    if (window.codex) {
      // @ts-ignore
      await window.codex.clearCompletedDownloads?.()
      loadDownloads()
    } else {
      setDownloads(prev => prev.filter(d => d.status !== 'COMPLETED'))
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DOWNLOADING': return '#8b5cf6'
      case 'COMPLETED': return '#22c55e'
      case 'FAILED': return '#ef4444'
      case 'CANCELLED': return '#6b7280'
      default: return '#6b7280'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PENDING': return 'Waiting...'
      case 'DOWNLOADING': return 'Downloading'
      case 'COMPLETED': return 'Completed'
      case 'FAILED': return 'Failed'
      case 'CANCELLED': return 'Cancelled'
      default: return status
    }
  }

  const activeDownloads = downloads.filter(d => d.status === 'DOWNLOADING' || d.status === 'PENDING')
  const completedDownloads = downloads.filter(d => d.status === 'COMPLETED')
  const failedDownloads = downloads.filter(d => d.status === 'FAILED' || d.status === 'CANCELLED')

  if (isLoading) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">Downloads</h1>
          <p className="page-subtitle">Manage your downloads</p>
        </header>
        <div className="downloads-loading">
          <div className="skeleton download-item-skeleton" />
          <div className="skeleton download-item-skeleton" />
          <div className="skeleton download-item-skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">Downloads</h1>
            <p className="page-subtitle">
              {activeDownloads.length > 0
                ? `${activeDownloads.length} active download${activeDownloads.length > 1 ? 's' : ''}`
                : 'No active downloads'}
            </p>
          </div>
          {completedDownloads.length > 0 && (
            <button className="btn btn-ghost" onClick={handleClearCompleted}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear Completed
            </button>
          )}
        </div>
      </header>

      {downloads.length > 0 ? (
        <div className="downloads-list">
          {/* Active downloads */}
          {activeDownloads.length > 0 && (
            <section className="download-section">
              <h3 className="section-label">Active</h3>
              {activeDownloads.map(item => (
                <div key={item.id} className="download-item">
                  <div className="download-info">
                    <h4 className="download-manga">{item.mangaTitle}</h4>
                    <p className="download-chapter">{item.chapterName}</p>
                    {item.status === 'DOWNLOADING' && (
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    <span
                      className="download-status"
                      style={{ color: getStatusColor(item.status) }}
                    >
                      {getStatusText(item.status)}
                      {item.status === 'DOWNLOADING' && ` (${Math.round(item.progress)}%)`}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost cancel-btn"
                    onClick={() => handleCancel(item.id)}
                    title="Cancel download"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </section>
          )}

          {/* Completed downloads */}
          {completedDownloads.length > 0 && (
            <section className="download-section">
              <h3 className="section-label">Completed</h3>
              {completedDownloads.map(item => (
                <div key={item.id} className="download-item completed">
                  <div className="download-info">
                    <h4 className="download-manga">{item.mangaTitle}</h4>
                    <p className="download-chapter">{item.chapterName}</p>
                    <span
                      className="download-status"
                      style={{ color: getStatusColor(item.status) }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {getStatusText(item.status)}
                    </span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Failed downloads */}
          {failedDownloads.length > 0 && (
            <section className="download-section">
              <h3 className="section-label">Failed</h3>
              {failedDownloads.map(item => (
                <div key={item.id} className="download-item failed">
                  <div className="download-info">
                    <h4 className="download-manga">{item.mangaTitle}</h4>
                    <p className="download-chapter">{item.chapterName}</p>
                    <span
                      className="download-status"
                      style={{ color: getStatusColor(item.status) }}
                    >
                      {getStatusText(item.status)}
                      {item.errorMessage && ` - ${item.errorMessage}`}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost retry-btn"
                    title="Retry download"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </button>
                </div>
              ))}
            </section>
          )}
        </div>
      ) : (
        <div className="empty-state">
          <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <h2 className="empty-state-title">No downloads</h2>
          <p className="empty-state-description">
            Download chapters for offline reading from the manga details page.
          </p>
        </div>
      )}
    </div>
  )
}

export default DownloadsPage
