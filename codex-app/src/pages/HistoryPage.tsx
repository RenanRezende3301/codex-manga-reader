import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './HistoryPage.css'

interface HistoryItem {
  id: number
  mangaId: number
  mangaTitle: string
  thumbnailUrl?: string
  chapterId: number
  chapterName: string
  chapterNumber: number
  dateRead: number
}

function HistoryPage() {
  const navigate = useNavigate()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    setIsLoading(true)
    try {
      if (window.codex) {
        const data = await window.codex.getReadingHistory(100)
        setHistory(data)
      } else {
        // Mock data for browser testing
        const now = Date.now()
        setHistory([
          { id: 1, mangaId: 1, mangaTitle: 'One Piece', thumbnailUrl: 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=OP', chapterId: 1, chapterName: 'Chapter 1120', chapterNumber: 1120, dateRead: now - 3600000 },
          { id: 2, mangaId: 1, mangaTitle: 'One Piece', thumbnailUrl: 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=OP', chapterId: 2, chapterName: 'Chapter 1119', chapterNumber: 1119, dateRead: now - 7200000 },
          { id: 3, mangaId: 2, mangaTitle: 'Naruto', thumbnailUrl: 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=N', chapterId: 3, chapterName: 'Chapter 700', chapterNumber: 700, dateRead: now - 86400000 },
          { id: 4, mangaId: 3, mangaTitle: 'Dragon Ball', thumbnailUrl: 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=DB', chapterId: 4, chapterName: 'Chapter 519', chapterNumber: 519, dateRead: now - 172800000 },
        ])
      }
    } catch (error) {
      console.error('Failed to load history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear all reading history?')) {
      if (window.codex) {
        await window.codex.clearHistory()
      }
      setHistory([])
    }
  }

  const handleItemClick = (item: HistoryItem) => {
    // Navigate to reader with the chapter
    navigate(`/reader/local/${item.chapterId}`)
  }

  const formatDate = (timestamp: number) => {
    // Auto-detect: if timestamp < 10 billion, it's in seconds; otherwise ms
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp
    const date = new Date(ms)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Group history by date
  const groupedHistory = history.reduce((groups, item) => {
    const ms = item.dateRead < 10000000000 ? item.dateRead * 1000 : item.dateRead
    const date = new Date(ms).toDateString()
    if (!groups[date]) groups[date] = []
    groups[date].push(item)
    return groups
  }, {} as Record<string, HistoryItem[]>)

  if (isLoading) {
    return (
      <div className="page">
        <header className="page-header">
          <h1 className="page-title">History</h1>
          <p className="page-subtitle">Your reading history</p>
        </header>
        <div className="history-loading">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className="history-item skeleton" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <header className="page-header">
        <div className="header-content">
          <div>
            <h1 className="page-title">History</h1>
            <p className="page-subtitle">Your reading history ({history.length} entries)</p>
          </div>
          {history.length > 0 && (
            <button className="btn btn-ghost" onClick={handleClearHistory}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              Clear All
            </button>
          )}
        </div>
      </header>

      {history.length > 0 ? (
        <div className="history-list">
          {Object.entries(groupedHistory).map(([date, items]) => (
            <div key={date} className="history-group">
              <h3 className="history-date">{date}</h3>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="history-item"
                  onClick={() => handleItemClick(item)}
                >
                  <img
                    src={item.thumbnailUrl || 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=?'}
                    alt={item.mangaTitle}
                    className="history-cover"
                  />
                  <div className="history-info">
                    <h4 className="history-manga-title">{item.mangaTitle}</h4>
                    <p className="history-chapter">{item.chapterName}</p>
                    <span className="history-time">{formatDate(item.dateRead)}</span>
                  </div>
                  <svg className="history-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <svg className="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <h2 className="empty-state-title">No reading history</h2>
          <p className="empty-state-description">
            Your reading history will appear here as you read manga.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/browse')}>
            Start Reading
          </button>
        </div>
      )}
    </div>
  )
}

export default HistoryPage
