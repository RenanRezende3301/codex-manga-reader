import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './LibraryPage.css'

interface LibraryManga {
  id: number
  sourceId: string
  sourceUrl: string
  title: string
  author?: string
  thumbnailUrl?: string
  unreadCount: number
  favorite: boolean
  lastRead?: number
  lastChapterId?: number
  lastChapterName?: string
  lastChapterUrl?: string
  lastPageRead?: number
  malId?: number
}

interface RecentUpdate {
  mangaId: number
  mangaTitle: string
  thumbnailUrl?: string
  chapterId: number
  chapterName: string
  chapterNumber: number
  dateAdded: number
}

function LibraryPage() {
  const navigate = useNavigate()
  const [mangas, setMangas] = useState<LibraryManga[]>([])
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadLibrary()
  }, [])

  const loadLibrary = async () => {
    setIsLoading(true)
    try {
      if (window.codex) {
        const library = await window.codex.getLibrary()
        // Map database fields to component interface
        const mappedLibrary: LibraryManga[] = library.map((manga: any) => ({
          id: manga.id,
          sourceId: manga.source_id || manga.sourceId,
          sourceUrl: manga.source_url || manga.sourceUrl,
          title: manga.title,
          author: manga.author,
          thumbnailUrl: manga.thumbnail_url || manga.thumbnailUrl,
          unreadCount: manga.unread_count || manga.unreadCount || 0,
          favorite: Boolean(manga.favorite),
          lastRead: manga.last_read || manga.lastRead,
          lastChapterId: manga.lastChapterId,
          lastChapterName: manga.lastChapterName,
          lastChapterUrl: manga.lastChapterUrl,
          lastPageRead: manga.lastPageRead,
        }))
        setMangas(mappedLibrary)

        // Load recent updates for notifications
        if (typeof window.codex.getRecentUpdates === 'function') {
          const updates = await window.codex.getRecentUpdates()
          setRecentUpdates(updates || [])
        } else {
          setRecentUpdates([])
        }
      } else {
        // No Electron context - show empty library
        setMangas([])
        setRecentUpdates([])
      }
    } catch (error) {
      console.error('Failed to load library:', error)
      setMangas([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleMangaClick = (manga: LibraryManga) => {
    // Check if this is a MAL catalog manga (saved without real source)
    if (manga.sourceId === 'mal_catalog' && manga.sourceUrl.startsWith('mal:')) {
      // Extract MAL ID and navigate to MAL route
      const malId = manga.sourceUrl.replace('mal:', '')
      navigate(`/manga/mal/${malId}`)
    } else {
      navigate(`/manga/${manga.sourceId}/${encodeURIComponent(manga.sourceUrl)}`)
    }
  }

  const handleContinueReading = (manga: LibraryManga) => {
    if (manga.lastChapterUrl) {
      // Navigate to reader with the last read chapter URL
      // Save mangaUrl for chapter navigation
      localStorage.setItem(`codex_manga_url_${manga.sourceId}`, manga.sourceUrl)
      if (manga.malId) {
        localStorage.setItem(`codex_mal_id_${manga.sourceId}_${encodeURIComponent(manga.sourceUrl)}`, String(manga.malId))
      }
      navigate(`/reader/${manga.sourceId}/${encodeURIComponent(manga.lastChapterUrl)}`)
    } else {
      // Go to manga details to pick a chapter
      handleMangaClick(manga)
    }
  }

  // Get recently read mangas for Continue Reading section
  const recentlyRead = mangas
    .filter(m => m.lastRead && m.lastChapterUrl)
    .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0))
    .slice(0, 10)

  if (isLoading) {
    return (
      <div className="page" style={{ padding: 0 }}>
        <div className="hero-banner skeleton" style={{ height: '60vh', width: '100%', marginBottom: '2rem' }} />
        <div style={{ padding: '0 3rem' }}>
          <div className="skeleton" style={{ height: '30px', width: '200px', marginBottom: '1rem' }} />
          <div className="carousel-row">
            {[1, 2, 3, 4, 5, 6].map(n => <div key={n} className="manga-card skeleton" />)}
          </div>
        </div>
      </div>
    )
  }

  // Determine the Hero item (most recently read, or a favorite, or just the first manga)
  const heroManga = recentlyRead[0] || mangas.find(m => m.favorite) || mangas[0]

  const continueReadingMangas = recentlyRead
  const favoriteMangas = mangas.filter(m => m.favorite)

  // Custom Card Component for reuse
  const MangaCard = ({ manga, onClick, showProgress = true }: { manga: LibraryManga, onClick: () => void, showProgress?: boolean }) => (
    <div className="manga-card" onClick={onClick}>
      <img
        src={manga.thumbnailUrl || 'https://via.placeholder.com/200x300/1a1a24/8b5cf6?text=No+Cover'}
        alt={manga.title}
        className="manga-card-image"
        loading="lazy"
        onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/200x300/1a1a24/8b5cf6?text=No+Cover' }}
      />
      {manga.unreadCount > 0 && (
        <div className="manga-card-badge">
          <span className="unread-badge">{manga.unreadCount}</span>
        </div>
      )}
      <div className="manga-card-overlay">
        <h3 className="manga-card-title">{manga.title}</h3>
        {showProgress && manga.lastChapterName && (
          <span className="manga-card-progress">
            {manga.lastChapterName}{manga.lastPageRead ? ` • Pág. ${manga.lastPageRead}` : ''}
          </span>
        )}
      </div>
      <div className="read-overlay">
        <div
          className="read-button"
          onClick={(e) => {
            e.stopPropagation()
            handleContinueReading(manga)
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      </div>
    </div>
  )

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* Netflix-style Hero Billboard */}
      {heroManga ? (
        <div className="hero-banner" style={{
          position: 'relative',
          width: '100%',
          height: '70vh',
          minHeight: '500px',
          maxHeight: '800px',
          marginBottom: 'var(--space-12)'
        }}>
          {/* Background Image with massive blur and dark gradients */}
          <div className="hero-bg" style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${heroManga.thumbnailUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center 20%',
            filter: 'blur(5px) brightness(0.6)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 95%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 95%, transparent 100%)',
          }} />
          {/* Gradient Overlays to blend into the background below */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, rgba(20,20,20,1) 0%, rgba(20,20,20,0.4) 50%, rgba(20,20,20,0.1) 100%)'
          }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, var(--bg-primary) 0%, var(--bg-primary) 5%, transparent 50%)'
          }} />

          {/* Hero Content */}
          <div className="hero-content" style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 'var(--space-16) var(--space-10) calc(var(--space-16) * 1.5)',
            maxWidth: '800px',
            zIndex: 2
          }}>
            {heroManga.favorite && <span style={{ color: 'var(--error)', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px', fontSize: 'var(--text-md)' }}>CODEX ORIGINAL</span>}
            <h1 style={{
              fontSize: 'var(--text-6xl)',
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: 'var(--space-4)',
              textShadow: '0 4px 10px rgba(0,0,0,0.8)'
            }}>
              {heroManga.title}
            </h1>
            <p style={{
              fontSize: 'var(--text-xl)',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-6)',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {heroManga.lastChapterName
                ? `Continue viewing ${heroManga.lastChapterName} now on CODEX.`
                : 'Experience the acclaimed manga. Add to your list and read now.'}
            </p>
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <button
                className="btn"
                style={{
                  backgroundColor: 'white',
                  color: 'black',
                  padding: '12px 32px',
                  fontSize: '18px',
                  fontWeight: 700,
                  borderRadius: '4px'
                }}
                onClick={() => handleContinueReading(heroManga)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Read
                </div>
              </button>
              <button
                className="btn"
                style={{
                  backgroundColor: 'rgba(109, 109, 110, 0.7)',
                  color: 'white',
                  padding: '12px 32px',
                  fontSize: '18px',
                  fontWeight: 700,
                  borderRadius: '4px',
                  backdropFilter: 'blur(10px)'
                }}
                onClick={() => handleMangaClick(heroManga)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  More Info
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ height: '70vh' }}>
          <h2 className="empty-state-title">Your library is empty</h2>
          <p className="empty-state-description">Browse sources and add manga to your library to see them here.</p>
          <button className="btn btn-primary" onClick={() => navigate('/browse')} style={{ marginTop: '1rem' }}>
            Browse Sources
          </button>
        </div>
      )}

      {/* Main Content Area (Rows) */}
      {mangas.length > 0 && (
        <div className="page-content" style={{ marginTop: heroManga ? '-6rem' : '0', position: 'relative', zIndex: 10 }}>

          {/* Continue Reading Carousel */}
          {continueReadingMangas.length > 0 && (
            <div style={{ marginBottom: 'var(--space-12)' }}>
              <h2 className="carousel-row-title">Continue Reading</h2>
              <div className="carousel-row">
                {continueReadingMangas.map(m => (
                  <MangaCard key={m.id} manga={m} onClick={() => handleMangaClick(m)} />
                ))}
              </div>
            </div>
          )}

          {/* New Releases/Updates Carousel */}
          {recentUpdates.length > 0 && (
            <div style={{ marginBottom: 'var(--space-12)' }}>
              <h2 className="carousel-row-title">New Chapters</h2>
              <div className="carousel-row">
                {recentUpdates.slice(0, 10).map((u, idx) => {
                  const manga = mangas.find(m => m.id === u.mangaId)
                  if (!manga) return null
                  return <MangaCard key={`update-${idx}`} manga={manga} onClick={() => handleMangaClick(manga)} showProgress={false} />
                })}
              </div>
            </div>
          )}

          {/* My List (Favorites) */}
          {favoriteMangas.length > 0 && (
            <div style={{ marginBottom: 'var(--space-12)' }}>
              <h2 className="carousel-row-title">My List</h2>
              <div className="carousel-row">
                {favoriteMangas.map(m => (
                  <MangaCard key={m.id} manga={m} onClick={() => handleMangaClick(m)} showProgress={false} />
                ))}
              </div>
            </div>
          )}

          {/* All Manga */}
          <div style={{ marginBottom: 'var(--space-12)' }}>
            <h2 className="carousel-row-title">Everything</h2>
            {/* Using a grid here for the remainder of the library so they can scroll down endlessly */}
            <div className="manga-grid" style={{ padding: '0 var(--space-10)' }}>
              {mangas.map(m => (
                <MangaCard key={m.id} manga={m} onClick={() => handleMangaClick(m)} showProgress={false} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LibraryPage
