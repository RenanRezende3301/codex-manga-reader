import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './ReaderPage.css'

interface PageData {
  url: string
  index: number
}

type ReadingMode = 'single' | 'double' | 'webtoon'
type ReadingDirection = 'ltr' | 'rtl'

// Simple hash function to generate unique key from URL
const simpleHash = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36)
}

// Storage key for progress - uses hash of FULL URL to ensure uniqueness
const getProgressKey = (sourceId: string, chapterUrl: string) =>
  `codex_progress_${sourceId}_${simpleHash(chapterUrl)}`

function ReaderPage() {
  const { sourceId, chapterId } = useParams<{ sourceId: string; chapterId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<(HTMLImageElement | null)[]>([])

  const chapterUrl = chapterId ? decodeURIComponent(chapterId) : ''

  const [pages, setPages] = useState<PageData[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [pagesRead, setPagesRead] = useState<boolean[]>([]) // Track which pages are "lit"
  const [isLoading, setIsLoading] = useState(true)
  const [imagesLoaded, setImagesLoaded] = useState<boolean[]>([]) // Track which images are loaded
  const [settingsLoaded, setSettingsLoaded] = useState(false) // Wait for settings before tracking
  const [error, setError] = useState<string | null>(null)
  const [showHUD, setShowHUD] = useState(true)
  const [hudHidden, setHudHidden] = useState(false)
  const [readingMode, setReadingMode] = useState<ReadingMode>('single') // Default to single, load from settings
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>('ltr')
  const [zoom, setZoom] = useState(100)
  const [showSettings, setShowSettings] = useState(false)

  const hideHUDTimer = useRef<NodeJS.Timeout | null>(null)
  const saveDebounce = useRef<NodeJS.Timeout | null>(null)

  // Chapter navigation
  interface ChapterInfo {
    name: string
    url: string
  }
  const [chapterList, setChapterList] = useState<ChapterInfo[]>([])
  const [currentChapterIndex, setCurrentChapterIndex] = useState(-1)
  const [malId, setMalId] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Load user settings first
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        if (window.codex) {
          const [savedMode, savedDirection] = await Promise.all([
            window.codex.getSetting('defaultReadingMode'),
            window.codex.getSetting('defaultReadingDirection'),
          ])
          if (savedMode) setReadingMode(savedMode as ReadingMode)
          if (savedDirection) setReadingDirection(savedDirection as ReadingDirection)
        }
      } catch (err) {
        console.warn('[Reader] Could not load settings, using defaults')
      } finally {
        setSettingsLoaded(true)
      }
    }
    loadUserSettings()
  }, [])

  // Load chapter after settings are loaded
  useEffect(() => {
    if (!settingsLoaded) return
    loadChapterPages()
    return () => {
      // Save on unmount
      if (saveDebounce.current) clearTimeout(saveDebounce.current)
    }
  }, [sourceId, chapterUrl, settingsLoaded])

  // Webtoon scroll tracking - update pagesRead based on scroll position
  useEffect(() => {
    if (readingMode !== 'webtoon' || pages.length === 0) return

    const handleScroll = () => {
      const viewportCenter = window.innerHeight / 2

      let bestPage = 0
      let bestDistance = Infinity
      let foundValidPage = false

      // Find which page's center is closest to the viewport center
      for (let index = 0; index < pageRefs.current.length; index++) {
        const ref = pageRefs.current[index]
        if (ref) {
          const rect = ref.getBoundingClientRect()

          // Only consider pages that have loaded (height > 100px)
          if (rect.height < 100) continue

          // Skip pages that are completely off-screen
          if (rect.bottom < 0 || rect.top > window.innerHeight) continue

          // Calculate page center and distance to viewport center
          const pageCenter = rect.top + rect.height / 2
          const distance = Math.abs(pageCenter - viewportCenter)

          if (distance < bestDistance) {
            bestDistance = distance
            bestPage = index
            foundValidPage = true
          }
        }
      }

      // Only update if we found a valid visible page
      if (!foundValidPage) return

      // Update current page and mark all previous as read
      setCurrentPage(bestPage)
      setPagesRead(prev => {
        const newState = [...prev]
        let changed = false
        for (let i = 0; i <= bestPage; i++) {
          if (!newState[i]) {
            newState[i] = true
            changed = true
          }
        }
        return changed ? newState : prev
      })
    }

    // Initial check after images might have loaded (give more time for images to render)
    const initialCheck = setTimeout(handleScroll, 1000)

    // Listen to window scroll for webtoon mode
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearTimeout(initialCheck)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [readingMode, pages.length])

  // Single/Double page mode - update pagesRead when currentPage changes
  useEffect(() => {
    if (readingMode === 'webtoon' || pages.length === 0) return

    setPagesRead(prev => {
      const newState = [...prev]
      const endPage = readingMode === 'double' ? Math.min(currentPage + 1, pages.length - 1) : currentPage
      for (let i = 0; i <= endPage; i++) {
        newState[i] = true
      }
      return newState
    })
  }, [currentPage, readingMode, pages.length])

  // Auto-save when pagesRead changes (debounced)
  useEffect(() => {
    if (pagesRead.length === 0) return

    if (saveDebounce.current) clearTimeout(saveDebounce.current)
    saveDebounce.current = setTimeout(() => {
      saveProgress()
    }, 2000)

    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current)
    }
  }, [pagesRead])

  // Auto-mark chapter as read when user views the last page
  useEffect(() => {
    if (pagesRead.length === 0 || pages.length === 0 || !sourceId) return

    // Check if last page has been read
    const lastPageIndex = pages.length - 1
    if (pagesRead[lastPageIndex]) {
      // Get MAL ID from context saved in details page (reliable way)
      const cachedMalId = localStorage.getItem(`codex_manga_mal_id_${sourceId}`)

      if (cachedMalId) {
        // Mark this chapter as read in localStorage
        const key = `codex_read_chapters_${cachedMalId}`
        const stored = localStorage.getItem(key)
        const readSet = new Set(stored ? JSON.parse(stored) : [])

        if (!readSet.has(chapterUrl)) {
          readSet.add(chapterUrl)
          localStorage.setItem(key, JSON.stringify([...readSet]))
          console.log(`[Reader] Auto-marked chapter as read for MAL ${cachedMalId}: ${chapterUrl}`)
        }
      } else {
        console.warn('[Reader] No MAL ID found in context to auto-mark as read')
      }
    }
  }, [pagesRead, pages.length, chapterUrl, sourceId])

  // Navigation functions (declared before keyboard handler useEffect)
  const goToPreviousPage = useCallback(() => {
    setCurrentPage(prev => {
      if (prev <= 0) return prev
      const step = readingMode === 'double' ? 2 : 1
      return Math.max(0, prev - step)
    })
  }, [readingMode])

  const goToNextPage = useCallback(() => {
    setCurrentPage(prev => {
      const maxPage = pages.length - 1
      if (prev >= maxPage) return prev
      const step = readingMode === 'double' ? 2 : 1
      return Math.min(maxPage, prev + step)
    })
  }, [pages.length, readingMode])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          // Left arrow works in all modes
          if (readingMode === 'webtoon') {
            // In webtoon, scroll up (left = back = up)
            window.scrollBy({ top: -300, behavior: 'smooth' })
          } else {
            readingDirection === 'ltr' ? goToPreviousPage() : goToNextPage()
          }
          break
        case 'ArrowRight':
          // Right arrow works in all modes
          if (readingMode === 'webtoon') {
            // In webtoon, scroll down (right = forward = down)
            window.scrollBy({ top: 300, behavior: 'smooth' })
          } else {
            readingDirection === 'ltr' ? goToNextPage() : goToPreviousPage()
          }
          break
        case 'ArrowUp':
          if (readingMode === 'webtoon') {
            window.scrollBy({ top: -300, behavior: 'smooth' })
          } else {
            goToPreviousPage()
          }
          break
        case 'ArrowDown':
          if (readingMode === 'webtoon') {
            window.scrollBy({ top: 300, behavior: 'smooth' })
          } else {
            goToNextPage()
          }
          break
        case 'PageUp':
          if (readingMode === 'webtoon') {
            window.scrollBy({ top: -window.innerHeight * 0.8, behavior: 'smooth' })
          } else {
            goToPreviousPage()
          }
          break
        case 'PageDown':
          if (readingMode === 'webtoon') {
            window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
          } else {
            goToNextPage()
          }
          break
        case 'Home':
          goToPage(0)
          break
        case 'End':
          goToPage(pages.length - 1)
          break
        case 'Escape':
          if (showSettings) setShowSettings(false)
          else handleClose()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'h':
        case 'H':
          setHudHidden(prev => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pages.length, readingMode, readingDirection, showSettings, goToNextPage, goToPreviousPage])

  // HUD auto-hide
  useEffect(() => {
    const handleMouseMove = () => {
      if (hudHidden) return
      setShowHUD(true)
      if (hideHUDTimer.current) clearTimeout(hideHUDTimer.current)
      hideHUDTimer.current = setTimeout(() => setShowHUD(false), 3000)
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [hudHidden])

  const loadChapterPages = async () => {
    if (!sourceId || !chapterUrl) {
      setError('Invalid chapter URL')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      let pageUrls: string[] = []

      if (window.codex) {
        if (sourceId === 'local') {
          // Load pages from locally downloaded chapter
          const chapterId = parseInt(chapterUrl)
          pageUrls = await window.codex.getLocalPages(chapterId)
        } else {
          pageUrls = await window.codex.fetchChapterPages(sourceId, chapterUrl)
        }
      } else {
        // Mock pages
        await new Promise(r => setTimeout(r, 300))
        for (let i = 1; i <= 20; i++) {
          pageUrls.push(`https://via.placeholder.com/800x1200/1a1a24/8b5cf6?text=Page+${i}`)
        }
      }

      if (pageUrls.length === 0) {
        setError('No pages found')
        setIsLoading(false)
        return
      }

      const pagesData = pageUrls.map((url, index) => ({ url, index }))
      setPages(pagesData)
      setImagesLoaded(new Array(pagesData.length).fill(false)) // Initialize image loading state
      pageRefs.current = new Array(pagesData.length).fill(null)

      // Initialize pagesRead and restore progress
      await restoreProgress(pagesData.length)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }

  // Preload next 3 pages for smoother reading experience
  const preloadPages = useCallback((fromIndex: number) => {
    const pagesToPreload = 3
    for (let i = 1; i <= pagesToPreload; i++) {
      const nextIndex = fromIndex + i
      if (nextIndex < pages.length && !imagesLoaded[nextIndex]) {
        const img = new Image()
        img.src = pages[nextIndex].url
      }
    }
  }, [pages, imagesLoaded])

  // Trigger preload when current page changes
  useEffect(() => {
    if (pages.length > 0) {
      preloadPages(currentPage)
    }
  }, [currentPage, pages.length, preloadPages])

  // Mark image as loaded
  const handleImageLoad = (index: number) => {
    setImagesLoaded(prev => {
      const newState = [...prev]
      newState[index] = true
      return newState
    })
  }

  const restoreProgress = async (totalPages: number) => {
    let lastPage = 0

    // Try localStorage
    if (sourceId) {
      const key = getProgressKey(sourceId, chapterUrl)
      const saved = localStorage.getItem(key)
      if (saved) {
        const data = JSON.parse(saved)
        lastPage = Math.min(data.lastPage || 0, totalPages - 1)
      }
    }

    // Initialize pagesRead - all pages up to lastPage are "lit"
    const initialState = new Array(totalPages).fill(false)
    for (let i = 0; i <= lastPage; i++) {
      initialState[i] = true
    }
    setPagesRead(initialState)
    setCurrentPage(lastPage)

    // Scroll to last position in webtoon mode
    if (lastPage > 0 && readingMode === 'webtoon') {
      setTimeout(() => {
        const targetPage = pageRefs.current[lastPage]
        if (targetPage) {
          targetPage.scrollIntoView({ block: 'center' })
        }
      }, 100)
    }
  }

  const saveProgress = useCallback(() => {
    if (pages.length === 0 || !sourceId) return

    // Find the highest page that's been read
    const lastPage = pagesRead.lastIndexOf(true)
    if (lastPage < 0) return

    const key = getProgressKey(sourceId, chapterUrl)
    localStorage.setItem(key, JSON.stringify({
      lastPage,
      totalPages: pages.length,
      timestamp: Date.now(),
    }))

    // --- AniList Sync ---
    if (malId && chapterList[currentChapterIndex]) {
      const chapterName = chapterList[currentChapterIndex].name
      // Try to extract chapter number from name (e.g. "Chapter 12" -> 12)
      const match = chapterName.match(/[\d.]+/)
      const chapterNumber = match ? parseFloat(match[0]) : (chapterList.length - currentChapterIndex)

      // Dispatch sync without blocking
      import('../api/anilist').then(({ syncProgress }) => {
        syncProgress(malId, chapterNumber)
      }).catch(err => console.error('[Reader] Failed to load AniList sync:', err))
    }

    console.log(`[Reader] Saved progress: page ${lastPage + 1}/${pages.length}`)
  }, [pagesRead, pages.length, sourceId, chapterUrl, chapterList, currentChapterIndex, malId])

  // Load chapter list for navigation
  const loadChapterList = useCallback(async (srcMangaUrl: string) => {
    if (!sourceId || !srcMangaUrl) return

    try {
      if (window.codex) {
        const chapters = await window.codex.fetchChapterList(sourceId, srcMangaUrl)
        const mappedChapters = chapters.map((ch: any) => ({
          name: ch.name,
          url: ch.sourceUrl || ch.url,
        }))
        setChapterList(mappedChapters)

        // Find current chapter index
        const currentIndex = mappedChapters.findIndex((ch: ChapterInfo) => ch.url === chapterUrl)
        setCurrentChapterIndex(currentIndex)
        console.log(`[Reader] Chapter list loaded: ${mappedChapters.length} chapters, current: ${currentIndex}`)

        // Fetch malId explicitly from local DB mapping or localStorage fallback
        const malIdStr = localStorage.getItem(`codex_mal_id_${sourceId}_${encodeURIComponent(srcMangaUrl)}`)
        let foundMalId = malIdStr ? parseInt(malIdStr) : null

        const dbManga = await window.codex.getMangaByUrl(srcMangaUrl)
        if (dbManga && dbManga.malId) {
          foundMalId = dbManga.malId
        }

        if (foundMalId) {
          setMalId(foundMalId)
        }
      }
    } catch (err) {
      console.warn('[Reader] Could not load chapter list for navigation:', err)
    }
  }, [sourceId, chapterUrl])

  // Try to get manga URL from localStorage or history
  useEffect(() => {
    const savedMangaUrl = localStorage.getItem(`codex_manga_url_${sourceId}`)
    if (savedMangaUrl) {
      loadChapterList(savedMangaUrl)
    }
  }, [sourceId, loadChapterList])

  // Show toast notification
  const showToast = useCallback((message: string) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Navigate to next chapter
  const goToNextChapter = useCallback(() => {
    if (chapterList.length === 0) {
      showToast('Chapter list not loaded')
      return
    }

    if (currentChapterIndex <= 0) {
      showToast('🎉 Last chapter!')
      return
    }

    // Chapters are usually in reverse order (newest first)
    const nextChapter = chapterList[currentChapterIndex - 1]
    if (nextChapter) {
      saveProgress()
      navigate(`/reader/${sourceId}/${encodeURIComponent(nextChapter.url)}`, { replace: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [chapterList, currentChapterIndex, sourceId, navigate, showToast, saveProgress])

  // Navigate to previous chapter
  const goToPreviousChapter = useCallback(() => {
    if (chapterList.length === 0) {
      showToast('Chapter list not loaded')
      return
    }

    if (currentChapterIndex >= chapterList.length - 1) {
      showToast('📖 First chapter!')
      return
    }

    // Chapters are usually in reverse order (newest first)
    const prevChapter = chapterList[currentChapterIndex + 1]
    if (prevChapter) {
      saveProgress()
      navigate(`/reader/${sourceId}/${encodeURIComponent(prevChapter.url)}`, { replace: true })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [chapterList, currentChapterIndex, sourceId, navigate, showToast, saveProgress])

  const goToPage = (index: number) => {
    if (index >= 0 && index < pages.length) {
      setCurrentPage(index)

      if (readingMode === 'webtoon') {
        const targetPage = pageRefs.current[index]
        if (targetPage) {
          targetPage.scrollIntoView({ block: 'start', behavior: 'smooth' })
        }
      }
    }
  }

  const handleClose = () => {
    saveProgress()
    navigate(-1)
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const handlePageClick = (e: React.MouseEvent) => {
    if (readingMode === 'webtoon') return

    const { clientX } = e
    const { innerWidth } = window
    const pos = clientX / innerWidth

    if (readingDirection === 'ltr') {
      if (pos < 0.3) goToPreviousPage()
      else if (pos > 0.7) goToNextPage()
    } else {
      if (pos < 0.3) goToNextPage()
      else if (pos > 0.7) goToPreviousPage()
    }
  }

  // Calculate progress percentage
  const progressPercent = pages.length > 0
    ? ((pagesRead.filter(Boolean).length / pages.length) * 100).toFixed(0)
    : 0

  if (isLoading) {
    return (
      <div className="reader-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <span>Loading chapter...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="reader-container">
        <button className="reader-close-btn" onClick={handleClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <div className="loading-spinner">
          <span style={{ color: '#ef4444' }}>{error}</span>
          <button className="btn btn-secondary" onClick={handleClose}>Go Back</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`reader-container mode-${readingMode}`}
      ref={containerRef}
      onClick={handlePageClick}
    >
      {/* Toast notification */}
      {toast && (
        <div className="reader-toast">
          {toast}
        </div>
      )}

      {/* Reading content */}
      {readingMode === 'webtoon' ? (
        <div className="webtoon-container" style={{ width: `${zoom}%`, maxWidth: '900px' }}>
          {pages.map((page, index) => (
            <img
              key={index}
              ref={(el) => { pageRefs.current[index] = el }}
              data-page={index}
              src={page.url}
              alt={`Page ${index + 1}`}
              className="webtoon-page"
              loading="lazy"
            />
          ))}

          {/* Chapter Navigation - shown at the end of webtoon mode */}
          <div className="chapter-navigation">
            <div className="chapter-nav-content">
              <h3 className="chapter-nav-title">End of Chapter</h3>
              <div className="chapter-nav-buttons">
                <button
                  className="btn btn-secondary btn-large"
                  onClick={(e) => { e.stopPropagation(); goToPreviousChapter() }}
                >
                  ← Previous Chapter
                </button>
                <button
                  className="btn btn-primary btn-large"
                  onClick={(e) => { e.stopPropagation(); goToNextChapter() }}
                >
                  Next Chapter →
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="page-container">
          {readingMode === 'double' && pages[currentPage + 1] ? (
            <div className="double-page">
              <div className="page-wrapper">
                {!imagesLoaded[currentPage] && <div className="page-loading-skeleton" />}
                <img
                  src={pages[currentPage]?.url}
                  alt={`Page ${currentPage + 1}`}
                  className={`reader-page ${!imagesLoaded[currentPage] ? 'loading' : ''}`}
                  style={{ transform: `scale(${zoom / 100})` }}
                  onLoad={() => handleImageLoad(currentPage)}
                />
              </div>
              <div className="page-wrapper">
                {!imagesLoaded[currentPage + 1] && <div className="page-loading-skeleton" />}
                <img
                  src={pages[currentPage + 1]?.url}
                  alt={`Page ${currentPage + 2}`}
                  className={`reader-page ${!imagesLoaded[currentPage + 1] ? 'loading' : ''}`}
                  style={{ transform: `scale(${zoom / 100})` }}
                  onLoad={() => handleImageLoad(currentPage + 1)}
                />
              </div>
            </div>
          ) : (
            <div className="page-wrapper">
              {!imagesLoaded[currentPage] && <div className="page-loading-skeleton" />}
              <img
                src={pages[currentPage]?.url}
                alt={`Page ${currentPage + 1}`}
                className={`reader-page single-page ${!imagesLoaded[currentPage] ? 'loading' : ''}`}
                style={{ transform: `scale(${zoom / 100})` }}
                onLoad={() => handleImageLoad(currentPage)}
              />
            </div>
          )}
        </div>
      )}

      {/* HUD Overlay */}
      <div className={`reader-hud ${showHUD && !hudHidden ? 'visible' : ''} ${hudHidden ? 'force-hidden' : ''}`}>

        {/* Vertical Left Reading Progress Bar */}
        <div className="hud-left-progress">
          {pages.map((_, i) => (
            <div
              key={i}
              className={`progress-cube ${i === currentPage ? 'active' : ''} ${pagesRead[i] ? 'read' : ''}`}
              title={`Page ${i + 1}`}
              onClick={(e) => {
                e.stopPropagation()
                goToPage(i)
              }}
            />
          ))}
        </div>

        {/* Top Gradient & Title Area */}
        <div className="hud-top">
          <div className="hud-left-group">
            <button className="reader-close-btn" onClick={(e) => { e.stopPropagation(); handleClose() }} title="Close reader">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
            <div className="hud-title-block">
              <span className="manga-title">
                {chapterList.length > 0 && currentChapterIndex >= 0
                  ? chapterList[currentChapterIndex]?.name
                  : 'Reading Manga'}
              </span>
              <span className="chapter-info-text">
                Page {currentPage + 1} of {pages.length} &bull; {progressPercent}%
              </span>
            </div>
          </div>

          <div className="hud-actions">
            <button className="hud-btn" onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings) }} title="Settings">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button className="hud-btn" onClick={(e) => { e.stopPropagation(); toggleFullscreen() }} title="Fullscreen (F)">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
          </div>
        </div>

        {/* Bottom Navigation Area */}
        {readingMode !== 'webtoon' && (
          <div className="hud-bottom">
            {/* Left Nav: Previous Page & Chapter */}
            <div className="nav-group-left">
              <button
                className="player-btn secondary"
                onClick={(e) => { e.stopPropagation(); goToPreviousChapter() }}
                title="Previous Chapter"
                disabled={chapterList.length === 0 || currentChapterIndex >= chapterList.length - 1}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                  <line x1="5" y1="19" x2="5" y2="5"></line>
                </svg>
              </button>

              <button
                className="player-btn primary"
                onClick={(e) => { e.stopPropagation(); goToPreviousPage() }}
                disabled={currentPage === 0}
                title="Previous Page"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                </svg>
              </button>
            </div>

            {/* Right Nav: Next Page & Chapter */}
            <div className="nav-group-right">
              <button
                className="player-btn primary"
                onClick={(e) => { e.stopPropagation(); goToNextPage() }}
                disabled={currentPage >= pages.length - 1}
                title="Next Page"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                </svg>
              </button>

              <button
                className="player-btn secondary"
                onClick={(e) => { e.stopPropagation(); goToNextChapter() }}
                title="Next Chapter"
                disabled={chapterList.length === 0 || currentChapterIndex <= 0}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                  <line x1="19" y1="5" x2="19" y2="19"></line>
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
          <h3 className="settings-title">Reader Settings</h3>

          <div className="settings-group">
            <label className="settings-label">Reading Mode</label>
            <div className="settings-buttons">
              <button className={`settings-btn ${readingMode === 'single' ? 'active' : ''}`} onClick={() => setReadingMode('single')}>Single</button>
              <button className={`settings-btn ${readingMode === 'double' ? 'active' : ''}`} onClick={() => setReadingMode('double')}>Double</button>
              <button className={`settings-btn ${readingMode === 'webtoon' ? 'active' : ''}`} onClick={() => setReadingMode('webtoon')}>Webtoon</button>
            </div>
          </div>

          <div className="settings-group">
            <label className="settings-label">Direction</label>
            <div className="settings-buttons">
              <button className={`settings-btn ${readingDirection === 'ltr' ? 'active' : ''}`} onClick={() => setReadingDirection('ltr')}>Left → Right</button>
              <button className={`settings-btn ${readingDirection === 'rtl' ? 'active' : ''}`} onClick={() => setReadingDirection('rtl')}>Right → Left</button>
            </div>
          </div>

          <div className="settings-group">
            <label className="settings-label">Zoom: {zoom}%</label>
            <input type="range" min="50" max="200" value={zoom} onChange={(e) => setZoom(parseInt(e.target.value))} className="zoom-slider" />
          </div>

          <button className="close-settings" onClick={() => setShowSettings(false)}>Close Settings</button>
          <span className="settings-hint">Press H to completely hide the interface</span>
        </div>
      )}
    </div>
  )
}

export default ReaderPage
