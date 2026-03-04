import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getMangaById } from '../api/jikan'
import './MangaDetailsPage.css'

interface MangaDetails {
  malId: number
  title: string
  titleEnglish?: string
  titleJapanese?: string
  titleSynonyms?: string[]
  coverUrl: string
  synopsis: string
  score: number
  scoredBy?: number
  rank?: number
  popularity?: number
  genres: string[]
  themes?: string[]
  demographics?: string[]
  status: string
  chapters?: number
  volumes?: number
  type: string
  authors: string[]
  published?: string
}

interface SourceInfo {
  id: string
  name: string
  mangaUrl?: string
  chapterCount: number
  chapters: ChapterInfo[]
  loading: boolean
  error?: string
}

interface ChapterInfo {
  name: string
  url: string
  date?: string
  read?: boolean
}

// Generate an intelligent list of search terms from Jikan metadata
function generateSearchQueries(title: string, en?: string, ja?: string, syn: string[] = []): string[] {
  // Helper to get first N words
  const getFirstWords = (str: string, count: number) => str.split(' ').slice(0, count).join(' ').trim()

  // Helper to isolate the single longest word (best for WordPress backend keyword matching)
  const getLongestWord = (str: string) => {
    const words = str.split(' ').map(w => w.replace(/[^a-zA-Z]/g, ''))
    return words.reduce((longest, current) => current.length > longest.length ? current : longest, '')
  }

  const rawTerms: (string | undefined)[] = [
    en, title, ja, ...syn,
    // The "Matadora" RegEx: strip subtitles (everything after a colon, dash, comma, or parenthesis)
    en?.split(/[:\-,\(]/)[0].trim(),
    title.split(/[:\-,\(]/)[0].trim(),
  ]

  // The "Gatilho Curto": Sites like MangaLivre often remove colons but keep the massive 15-word sentence.
  // We grab just the first 2, 3, and 4 words of the English and Main title as last-resort fallbacks.
  if (en && en.split(' ').length > 3) {
    rawTerms.push(getFirstWords(en, 2), getFirstWords(en, 3), getFirstWords(en, 4))
    const lw = getLongestWord(en)
    if (lw.length >= 6) rawTerms.push(lw)
  }
  if (title.split(' ').length > 3) {
    rawTerms.push(getFirstWords(title, 2), getFirstWords(title, 3), getFirstWords(title, 4))
    const lw = getLongestWord(title)
    if (lw.length >= 6) rawTerms.push(lw)
  }

  // Filter out nulls, empty strings, strings that are too short to be meaningful, and deduplicate
  return Array.from(new Set(rawTerms)).filter((t): t is string => typeof t === 'string' && t.length >= 4)
}

function MangaDetailsPage() {
  // Handle both route patterns: /manga/mal/:id or /manga/:sourceId/:mangaId
  const params = useParams<{ sourceId?: string; mangaId?: string; type?: string; id?: string }>()
  const navigate = useNavigate()

  // Determine if this is a MAL catalog manga or a source manga
  const isMAL = params.sourceId === 'mal' || params.type === 'mal'
  const paramMalId = isMAL ? parseInt(params.mangaId || params.id || '0') : null
  const sourceId = !isMAL ? params.sourceId : null
  const mangaUrl = !isMAL ? (params.mangaId ? decodeURIComponent(params.mangaId) : null) : null

  const [malId, setMalId] = useState<number | null>(paramMalId)
  useEffect(() => {
    setMalId(paramMalId)
  }, [paramMalId])

  const [manga, setManga] = useState<MangaDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Dynamic sources from backend
  const [availableSources, setAvailableSources] = useState<{ id: string; name: string }[]>([])
  const [selectedSource, setSelectedSource] = useState<string>('')
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [inLibrary, setInLibrary] = useState(false)
  const [chaptersOrder, setChaptersOrder] = useState<'asc' | 'desc'>('desc') // desc = mais recentes primeiro
  const [chapterFilter, setChapterFilter] = useState('')
  const [readChapters, setReadChapters] = useState<Set<string>>(new Set())

  // Download state
  const [downloadedChapters, setDownloadedChapters] = useState<DownloadedChapter[]>([])
  const [downloadingUrls, setDownloadingUrls] = useState<Set<string>>(new Set())
  const [showDownloaded, setShowDownloaded] = useState(true)

  // AniList Sync
  const [userScore, setUserScore] = useState<number | null>(null)
  const [isAnilistConnected, setIsAnilistConnected] = useState(false)
  const [isSyncingScore, setIsSyncingScore] = useState(false)

  // Load available sources from backend
  useEffect(() => {
    const loadAvailableSources = async () => {
      try {
        if (window.codex?.getSources) {
          const allSources = await window.codex.getSources()
          console.log('[Details] Loaded available sources:', allSources.map(s => s.id))
          setAvailableSources(allSources.map(s => ({ id: s.id, name: s.name })))
          if (allSources.length > 0 && !selectedSource) {
            setSelectedSource(allSources[0].id)
          }
        }
      } catch (error) {
        console.error('[Details] Failed to load sources:', error)
      }
    }
    loadAvailableSources()
  }, [])

  // Load read chapters from localStorage
  useEffect(() => {
    if (malId) {
      const stored = localStorage.getItem(`codex_read_chapters_${malId}`)
      if (stored) {
        setReadChapters(new Set(JSON.parse(stored)))
      }
    }
  }, [malId])
  // Load AniList personal score
  useEffect(() => {
    if (malId && window.codex) {
      window.codex.getAnilistToken().then(token => {
        if (token) {
          setIsAnilistConnected(true)
          import('../api/anilist').then(({ getMediaByMalId, getMediaListEntry }) => {
            getMediaByMalId(malId).then(media => {
              if (media) {
                getMediaListEntry(media.id, token).then(entry => {
                  if (entry && entry.score) setUserScore(entry.score)
                })
              }
            })
          }).catch(err => console.error('[Details] Failed to fetch AniList score:', err))
        }
      })
    }
  }, [malId])

  // Toggle chapter read status
  const toggleChapterRead = (chapterUrl: string, event: React.MouseEvent) => {
    event.stopPropagation() // Don't navigate to chapter

    setReadChapters(prev => {
      const newSet = new Set(prev)
      if (newSet.has(chapterUrl)) {
        newSet.delete(chapterUrl)
      } else {
        newSet.add(chapterUrl)
      }

      // Save to localStorage
      if (malId) {
        localStorage.setItem(`codex_read_chapters_${malId}`, JSON.stringify([...newSet]))
      }

      return newSet
    })
  }


  useEffect(() => {
    console.log('[Details] Params:', { isMAL, malId, sourceId, mangaUrl })
    // Wait for sources to load before doing anything
    if (availableSources.length === 0) {
      console.log('[Details] Waiting for sources to load...')
      return
    }
    if (isMAL && malId) {
      loadMangaFromMAL(malId)
    } else if (sourceId && mangaUrl) {
      loadMangaFromSource(sourceId, mangaUrl)
    } else {
      setError('Invalid manga URL')
      setIsLoading(false)
    }
  }, [isMAL, malId, sourceId, mangaUrl, availableSources])

  // Load manga directly from a source (when coming from Library)
  const loadMangaFromSource = async (srcId: string, url: string) => {
    setIsLoading(true)
    setError(null)
    setSelectedSource(srcId)

    // Initialize sources state from availableSources (they might not be set yet)
    const initialSources = availableSources.map(s => ({
      id: s.id,
      name: s.name,
      chapterCount: 0,
      chapters: [] as ChapterInfo[],
      loading: s.id === srcId, // Only the target source is loading initially
    }))
    setSources(initialSources)

    try {
      // Fetch chapters from the source
      let chapters: ChapterInfo[] = []
      if (window.codex) {
        const chaptersData = await window.codex.fetchChapterList(srcId, url)
        console.log('[Details] Chapters data from IPC:', chaptersData)
        chapters = chaptersData.map((ch: any) => ({
          name: ch.name || ch.title,
          url: ch.sourceUrl || ch.url,
          date: ch.date,
        }))
        console.log('[Details] Mapped chapters:', chapters)
      }

      // Try to get manga info from database if saved
      let mangaData: Partial<MangaDetails> = {}
      if (window.codex) {
        const dbManga = await window.codex.getMangaByUrl(url)
        if (dbManga) {
          mangaData = {
            title: dbManga.title,
            synopsis: dbManga.description || 'Sem sinopse disponível',
            coverUrl: dbManga.thumbnail_url || dbManga.thumbnailUrl,
            authors: dbManga.author ? [dbManga.author] : [],
            status: dbManga.status || 'Desconhecido',
          }
          setInLibrary(true)
          setLibraryMangaId(dbManga.id)
          if (dbManga.malId && !malId) {
            setMalId(dbManga.malId)
          }
        }
      }

      // If we have manga info from DB, try to also fetch details from source for richer data
      if (!mangaData.title && window.codex) {
        try {
          const details = await window.codex.fetchMangaDetails(srcId, url)
          if (details) {
            mangaData = {
              title: details.title,
              synopsis: details.synopsis,
              coverUrl: details.coverUrl,
              authors: details.authors || [],
              status: details.status || 'Desconhecido',
            }
          }
        } catch (e) {
          console.warn('[Details] Could not fetch source details:', e)
        }
      }

      // Create manga object with available info
      setManga({
        malId: 0,
        title: mangaData.title || 'Manga',
        titleEnglish: undefined,
        titleJapanese: undefined,
        coverUrl: mangaData.coverUrl || '',
        synopsis: mangaData.synopsis || 'Carregado da biblioteca',
        score: 0,
        genres: [],
        status: mangaData.status || 'Desconhecido',
        type: 'Manga',
        authors: mangaData.authors || [],
      })

      // Update sources with chapters — use the fresh initialSources as base
      setSources(initialSources.map(s =>
        s.id === srcId
          ? { ...s, mangaUrl: url, chapters, chapterCount: chapters.length, loading: false }
          : { ...s, loading: false }
      ))

      // Also search in OTHER sources for this manga title (so user sees all sources)
      const otherSources = availableSources.filter(s => s.id !== srcId)
      for (const source of otherSources) {
        try {
          if (window.codex && mangaData.title) {
            const searchTerms = generateSearchQueries(mangaData.title)

            let results: any[] = []
            let successTerm = ''

            // Loop through the intelligent cascade of names
            for (const term of searchTerms) {
              const res = await window.codex.fetchMangaSearch(source.id, term)
              if (res && res.length > 0) {
                results = res
                successTerm = term
                break
              }
            }

            if (results.length > 0) {
              console.log(`[Sources] Found match in ${source.name} using term "${successTerm}":`, results[0].title, results[0].url)
              const otherChapters = await window.codex.fetchChapterList(source.id, results[0].url)
              setSources(prev => prev.map(s =>
                s.id === source.id ? {
                  ...s,
                  mangaUrl: results[0].url,
                  chapterCount: otherChapters?.length || 0,
                  chapters: otherChapters?.map((ch: any) => ({
                    name: ch.name,
                    url: ch.sourceUrl || ch.url,
                    date: ch.date,
                  })) || [],
                  loading: false,
                } : s
              ))
            } else {
              setSources(prev => prev.map(s =>
                s.id === source.id ? { ...s, loading: false, error: 'Não encontrado' } : s
              ))
            }
          }
        } catch (e) {
          setSources(prev => prev.map(s =>
            s.id === source.id ? { ...s, loading: false, error: 'Search error' } : s
          ))
        }
      }

    } catch (err) {
      console.error('[Details] Failed to load from source:', err)
      setError('Failed to load manga from source')
    } finally {
      setIsLoading(false)
    }
  }

  const loadMangaFromMAL = async (malId: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const mangaData = await getMangaById(malId)
      setManga(mangaData)

      // After loading manga, search for it in sources
      searchInSources(mangaData)
    } catch (err) {
      console.error('Failed to load manga:', err)
      setError('Failed to load manga information')
    } finally {
      setIsLoading(false)
    }
  }

  const searchInSources = async (mangaData: MangaDetails) => {
    // Generate intelligent search terms: primary, EN, JP, synonyms, and regex-stripped Subtitles
    const searchTerms = generateSearchQueries(
      mangaData.title,
      mangaData.titleEnglish,
      mangaData.titleJapanese,
      mangaData.titleSynonyms || []
    )

    // Initialize sources state with loading state for all available sources
    setSources(availableSources.map(s => ({
      id: s.id,
      name: s.name,
      chapterCount: 0,
      chapters: [],
      loading: true
    })))

    // Search for this manga in each source concurrently
    await Promise.all(availableSources.map(async (source) => {
      try {
        // Check if we're in Electron with the IPC functions available
        if (window.codex && typeof window.codex.fetchMangaSearch === 'function') {
          // Use IPC to search in source using the new cascade loop
          let results: any[] = []
          let successTerm = ''

          for (const term of searchTerms) {
            const res = await window.codex.fetchMangaSearch(source.id, term)
            if (res && res.length > 0) {
              results = res
              successTerm = term
              break
            }
          }

          if (results.length > 0) {
            // Find best match (first result for now)
            const bestMatch = results[0]
            console.log(`[Sources] Found match in ${source.name} using term "${successTerm}":`, bestMatch.title, bestMatch.url)

            // Fetch chapters for this manga using the correct IPC method
            const chapters = await window.codex.fetchChapterList(source.id, bestMatch.url)
            console.log(`[Sources] Got ${chapters?.length || 0} chapters from ${source.name}`)

            setSources(prev => prev.map(s =>
              s.id === source.id ? {
                ...s,
                mangaUrl: bestMatch.url,
                chapterCount: chapters?.length || 0,
                chapters: chapters?.map((ch: any) => ({
                  name: ch.name,
                  url: ch.sourceUrl || ch.url, // IPC returns sourceUrl
                  date: ch.date,
                })) || [],
                loading: false,
              } : s
            ))
          } else {
            setSources(prev => prev.map(s =>
              s.id === source.id ? {
                ...s,
                loading: false,
                error: 'Not found in this source',
              } : s
            ))
          }
        } else {
          // Mock data for browser testing (not in Electron)
          console.log(`[Sources] Running in browser mode, using mock data for ${source.name}`)
          await new Promise(r => setTimeout(r, 500))
          setSources(prev => prev.map(s =>
            s.id === source.id ? {
              ...s,
              mangaUrl: '#mock',
              chapterCount: Math.floor(Math.random() * 100) + 10,
              chapters: Array.from({ length: 20 }, (_, j) => ({
                name: `Chapter ${20 - j}`,
                url: `#chapter-${20 - j}`,
                date: new Date(Date.now() - j * 86400000).toLocaleDateString(),
              })),
              loading: false,
            } : s
          ))
        }
      } catch (err) {
        console.error(`Failed to search in ${source.name}:`, err)
        setSources(prev => prev.map(s =>
          s.id === source.id ? {
            ...s,
            loading: false,
            error: 'Error searching',
          } : s
        ))
      }
    }))
  }

  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryMangaId, setLibraryMangaId] = useState<number | null>(null)

  // Check if manga is already in library when source is loaded
  useEffect(() => {
    const checkLibrary = async () => {
      const sourceInfo = sources.find(s => s.id === selectedSource)
      if (sourceInfo?.mangaUrl && window.codex) {
        try {
          const mangaInLib = await window.codex.getMangaByUrl(sourceInfo.mangaUrl)
          if (mangaInLib) {
            setInLibrary(true)
            setLibraryMangaId(mangaInLib.id)

            // Mark updates as seen when user views this manga
            if (typeof window.codex.markUpdatesAsSeen === 'function') {
              await window.codex.markUpdatesAsSeen(mangaInLib.id)
              console.log('[Details] Marked updates as seen for manga', mangaInLib.id)
            }
          } else {
            setInLibrary(false)
            setLibraryMangaId(null)
          }
        } catch (err) {
          console.warn('[Details] Could not check library status:', err)
        }
      }
    }
    checkLibrary()
  }, [selectedSource, sources])

  // Save MAL ID to database if manga is in library
  useEffect(() => {
    if (malId && libraryMangaId && window.codex) {
      window.codex.updateManga(libraryMangaId, { malId }).then(() => {
        console.log(`[Details] Saved MAL ID context for reader: ${malId} for library manga ${libraryMangaId}`)
      }).catch(err => console.warn('[Details] Error saving MAL ID to database:', err))
    }
  }, [malId, libraryMangaId])

  // Load downloaded chapters when library manga is found
  useEffect(() => {
    const loadDownloaded = async () => {
      if (libraryMangaId && window.codex?.getDownloadedChapters) {
        try {
          const downloaded = await window.codex.getDownloadedChapters(libraryMangaId)
          setDownloadedChapters(downloaded)
        } catch (e) {
          console.warn('[Details] Could not load downloaded chapters:', e)
        }
      }
    }
    loadDownloaded()
  }, [libraryMangaId])

  // Download a chapter
  const handleDownloadChapter = async (chapter: ChapterInfo, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!manga || !window.codex) return
    if (downloadingUrls.has(chapter.url)) return // Already downloading

    setDownloadingUrls(prev => new Set(prev).add(chapter.url))

    try {
      let currentMangaId = libraryMangaId
      const sourceInfo = sources.find(s => s.id === selectedSource)

      // Auto-add to library if not already there
      if (!inLibrary) {
        const mangaData = {
          sourceId: sourceInfo?.mangaUrl ? selectedSource : 'mal_catalog',
          sourceUrl: sourceInfo?.mangaUrl || `mal:${malId}`,
          title: manga.title,
          author: manga.authors?.join(', '),
          description: manga.synopsis,
          status: manga.status,
          thumbnailUrl: manga.coverUrl,
        }
        const savedManga = await window.codex.addToLibrary(mangaData)
        setInLibrary(true)
        setLibraryMangaId(savedManga.id)
        currentMangaId = savedManga.id
        console.log('[Details] Auto-added to library for download:', savedManga.id)
      }

      // Save chapter to DB if not already saved (needed for download queue FK)
      if (currentMangaId) {
        await window.codex.addChapters(currentMangaId, [{
          sourceUrl: chapter.url,
          name: chapter.name,
          chapterNumber: parseFloat(chapter.name.match(/[\d.]+/)?.[0] || '0'),
          date: chapter.date,
        }])

        // Mark updates as seen so this chapter doesn't show as a "new" notification
        if (typeof window.codex.markUpdatesAsSeen === 'function') {
          await window.codex.markUpdatesAsSeen(currentMangaId)
        }

        // Get the saved chapter to get its ID
        const savedChapters = await window.codex.getChapters(currentMangaId)
        const savedChapter = savedChapters.find((c: any) => c.sourceUrl === chapter.url)

        if (savedChapter) {
          await window.codex.downloadChapter(
            { id: currentMangaId, title: manga.title, sourceId: selectedSource },
            { id: savedChapter.id, name: chapter.name, sourceUrl: chapter.url }
          )
          console.log('[Details] Download started:', chapter.name)
        } else {
          console.error('[Details] Could not find saved chapter in DB for:', chapter.url)
        }
      }
    } catch (err) {
      console.error('[Details] Download failed:', err)
    }

    // Always clean up downloading state
    setDownloadingUrls(prev => {
      const next = new Set(prev)
      next.delete(chapter.url)
      return next
    })

    // Refresh downloaded chapters list
    try {
      const mangaId = libraryMangaId
      if (mangaId && window.codex?.getDownloadedChapters) {
        const downloaded = await window.codex.getDownloadedChapters(mangaId)
        setDownloadedChapters(downloaded)
      }
    } catch (e) {
      console.warn('[Details] Could not refresh downloads:', e)
    }
  }

  // Delete a downloaded chapter
  const handleDeleteDownload = async (chapterId: number, event: React.MouseEvent) => {
    event.stopPropagation()
    if (!window.codex?.deleteDownloadedChapter) return

    try {
      await window.codex.deleteDownloadedChapter(chapterId)
      setDownloadedChapters(prev => prev.filter(c => c.id !== chapterId))
      console.log('[Details] Deleted downloaded chapter:', chapterId)
    } catch (err) {
      console.error('[Details] Delete download failed:', err)
    }
  }

  // Read a downloaded chapter (local)
  const handleReadDownloaded = (chapter: DownloadedChapter) => {
    navigate(`/reader/local/${chapter.id}`)
  }

  const handleAddToLibrary = async () => {
    if (!manga) {
      console.error('[Details] Cannot add to library: manga is null')
      return
    }

    const sourceInfo = sources.find(s => s.id === selectedSource)
    console.log('[Details] Add to library - sourceInfo:', sourceInfo)
    console.log('[Details] Add to library - inLibrary:', inLibrary, 'libraryMangaId:', libraryMangaId)

    setLibraryLoading(true)

    try {
      if (window.codex) {
        if (inLibrary && libraryMangaId) {
          // Remove from library
          await window.codex.removeFromLibrary(libraryMangaId)
          setInLibrary(false)
          setLibraryMangaId(null)
          console.log('[Details] Removed from library')
        } else {
          // Add to library - use MAL as source if no source manga URL available
          const mangaData = {
            sourceId: sourceInfo?.mangaUrl ? selectedSource : 'mal_catalog',
            sourceUrl: sourceInfo?.mangaUrl || `mal:${malId}`,
            title: manga.title,
            author: manga.authors?.join(', '),
            description: manga.synopsis,
            status: manga.status,
            thumbnailUrl: manga.coverUrl,
            malId: malId || undefined
          }
          console.log('[Details] Adding manga data:', mangaData)

          const savedManga = await window.codex.addToLibrary(mangaData)
          setInLibrary(true)
          setLibraryMangaId(savedManga.id)
          console.log('[Details] Added to library:', savedManga.id)
        }
      }
    } catch (err) {
      console.error('[Details] Library operation failed:', err)
      alert('Error adding to library. Check console for details.')
    } finally {
      setLibraryLoading(false)
    }
  }

  const handleScoreChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScoreRaw = parseInt(e.target.value)
    setUserScore(newScoreRaw)

    if (malId) {
      setIsSyncingScore(true)
      try {
        const { syncScore } = await import('../api/anilist')
        await syncScore(malId, newScoreRaw)
      } catch (err) {
        console.error('[Details] Failed to sync score:', err)
        alert('Error syncing score with AniList.')
      } finally {
        setIsSyncingScore(false)
      }
    }
  }

  const handleReadChapter = (chapter: ChapterInfo) => {
    console.log('[Details] handleReadChapter called with:', chapter)
    console.log('[Details] selectedSource:', selectedSource)

    if (!chapter) {
      console.error('[Details] Chapter is undefined!')
      return
    }

    if (!chapter.url) {
      console.error('[Details] Chapter URL is undefined!', chapter)
      alert(`Error: Chapter URL not found. Chapter: ${chapter.name || 'unnamed'}`)
      return
    }

    // Save manga URL for chapter navigation in reader
    const sourceInfo = sources.find(s => s.id === selectedSource)
    if (sourceInfo?.mangaUrl) {
      localStorage.setItem(`codex_manga_url_${selectedSource}`, sourceInfo.mangaUrl)
      if (malId) {
        localStorage.setItem(`codex_mal_id_${selectedSource}_${encodeURIComponent(sourceInfo.mangaUrl)}`, String(malId))
      }
    }

    // Save manga details for the History feature bypass
    const historyMeta = {
      malId: malId || null,
      mangaTitle: manga?.title || 'Unknown Manga',
      thumbnailUrl: manga?.coverUrl || 'https://via.placeholder.com/80x120/1a1a24/8b5cf6?text=?',
      chapterId: chapter.url,
      chapterName: chapter.name || 'Chapter',
      sourceUrl: sourceInfo?.mangaUrl || '',
      chapterUrl: chapter.url,
      timestamp: Date.now()
    }
    localStorage.setItem('codex_current_manga_meta', JSON.stringify(historyMeta))

    const readerUrl = `/reader/${selectedSource}/${encodeURIComponent(chapter.url)}`
    console.log('[Details] Navigating to:', readerUrl)
    navigate(readerUrl)
  }

  const currentSource = sources.find(s => s.id === selectedSource)

  const getScoreColor = (score: number) => {
    if (score >= 8) return '#4ade80'
    if (score >= 6) return '#eab308'
    return '#ef4444'
  }

  if (isLoading) {
    return (
      <div className="page" style={{ padding: 0, position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="details-loading" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="spinner" />
          <span style={{ fontSize: '1.2rem', color: 'var(--text-tertiary)' }}>Building details page...</span>
        </div>
      </div>
    )
  }

  if (error || !manga) {
    return (
      <div className="page" style={{ padding: 0, position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="details-error" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>{error || 'Manga not found'}</h2>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ padding: 0, position: 'relative', minHeight: '100vh', overflowX: 'hidden' }}>

      {/* Immersive Hero Background */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '100vh',
        backgroundImage: `url(${manga.coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center 30%',
        zIndex: 0,
        filter: 'blur(12px) brightness(0.5)',
        transform: 'scale(1.1)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 80%, transparent 100%)',
        maskImage: 'linear-gradient(to bottom, black 0%, black 40%, transparent 80%, transparent 100%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: '100vh',
        background: 'linear-gradient(to bottom, rgba(20,20,20,0) 0%, rgba(20,20,20,0.6) 50%, var(--bg-primary) 80%, var(--bg-primary) 100%)',
        zIndex: 1,
        pointerEvents: 'none'
      }} />

      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute',
          top: 'var(--space-8)',
          left: 'var(--space-8)',
          zIndex: 10,
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '50%',
          width: '48px', height: '48px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      {/* Main Content Area */}
      <div style={{ position: 'relative', zIndex: 2, padding: 'calc(15vh) var(--space-12) var(--space-12)', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

        {/* Cinematic Header Block */}
        <div style={{ display: 'flex', gap: 'var(--space-10)', alignItems: 'flex-end', marginBottom: 'var(--space-12)', flexWrap: 'wrap' }}>

          {/* Main Info */}
          <div style={{ flex: 1, minWidth: '300px', maxWidth: '800px' }}>
            {/* Title Logo / Huge Text */}
            <h1 style={{
              fontSize: 'min(4.5rem, 8vw)',
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: 'var(--space-4)',
              textShadow: '0 4px 20px rgba(0,0,0,0.8)',
              fontFamily: 'var(--font-cinematic)'
            }}>
              {manga.title}
            </h1>

            {/* Metadata Row */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
              fontSize: '1.1rem',
              color: 'var(--text-secondary)',
              fontWeight: 600,
              textShadow: '0 2px 10px rgba(0,0,0,0.8)',
              flexWrap: 'wrap'
            }}>
              {manga.score > 0 && (
                <span style={{ color: getScoreColor(manga.score), display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  {manga.score} Score
                </span>
              )}

              {/* AniList Integration */}
              {isAnilistConnected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', backdropFilter: 'blur(5px)' }}>
                  <span style={{ color: '#3db4f2', fontSize: '0.85em', fontWeight: 800 }}>AniList</span>
                  <select
                    value={userScore || 0}
                    onChange={handleScoreChange}
                    disabled={isSyncingScore}
                    style={{ background: 'transparent', color: 'white', border: 'none', outline: 'none', fontWeight: 600, cursor: 'pointer', appearance: 'none' }}
                  >
                    <option value={0} style={{ color: 'black' }}>Not Rated</option>
                    {[...Array(10)].map((_, i) => (
                      <option key={i + 1} value={(i + 1) * 10} style={{ color: 'black' }}>{i + 1} / 10</option>
                    ))}
                  </select>
                  {isSyncingScore && <div className="spinner tiny" />}
                </div>
              )}

              {manga.published && <span>{manga.published.replace(' to ?', '').split('-')[0] || manga.published.replace(' to ?', '')}</span>}
              <span style={{ border: '1px solid rgba(255,255,255,0.3)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.85em' }}>
                {manga.type}
              </span>
              <span>{manga.chapters ? `${manga.chapters} Chapters` : 'Ongoing'}</span>
              <span style={{ color: manga.status === 'Publishing' ? '#60a5fa' : 'var(--text-secondary)' }}>{manga.status}</span>
            </div>

            {/* Synopsis */}
            <p style={{
              fontSize: '1.15rem',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-8)',
              maxWidth: '90%',
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              textShadow: '0 2px 10px rgba(0,0,0,0.8)'
            }}>
              {manga.synopsis}
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary btn-large"
                style={{
                  background: 'white',
                  color: 'black',
                  fontSize: '1.2rem',
                  padding: '12px 32px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  border: 'none',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 15px rgba(255,255,255,0.2)'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.8)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                onClick={() => {
                  const source = sources.find(s => s.id === selectedSource)
                  if (source?.chapters && source.chapters.length > 0) {
                    const firstChapter = source.chapters[source.chapters.length - 1]
                    handleReadChapter(firstChapter)
                  }
                }}
                disabled={!currentSource?.chapters.length}
              >
                {(() => {
                  const source = sources.find(s => s.id === selectedSource)
                  const hasProgress = source?.chapters?.some(ch => {
                    if (!ch.url) return false
                    const hash = Math.abs(ch.url.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)).toString(36)
                    return localStorage.getItem(`codex_progress_${selectedSource}_${hash}`) !== null
                  })
                  return hasProgress ? (
                    <><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg> Continue Reading</>
                  ) : (
                    <><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg> Read</>
                  )
                })()}
              </button>

              <button
                style={{
                  background: inLibrary ? 'rgba(255,255,255,0.2)' : 'rgba(109, 109, 110, 0.7)',
                  color: 'white',
                  fontSize: '1.2rem',
                  padding: '12px 32px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  border: 'none',
                  transition: 'all 0.2s',
                  backdropFilter: 'blur(10px)',
                  cursor: libraryLoading ? 'wait' : 'pointer'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = inLibrary ? 'rgba(255,255,255,0.3)' : 'rgba(109, 109, 110, 0.9)'}
                onMouseLeave={(e) => e.currentTarget.style.background = inLibrary ? 'rgba(255,255,255,0.2)' : 'rgba(109, 109, 110, 0.7)'}
                onClick={handleAddToLibrary}
                disabled={libraryLoading}
              >
                {libraryLoading ? '...' : inLibrary ? (
                  <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg> My List</>
                ) : (
                  <><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg> My List</>
                )}
              </button>
            </div>

            {/* Small info below actions */}
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)', fontSize: '0.95rem', color: 'var(--text-tertiary)' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Genres: </span>
                {manga.genres.join(', ')}
              </div>
              {manga.authors.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Creator: </span>
                  {manga.authors.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* Right side poster */}
          <div style={{
            flexShrink: 0,
            width: '240px',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'none' /* Will show on huge screens via media queries */
          }}>
            <img src={manga.coverUrl} alt={manga.title} style={{ width: '100%', display: 'block' }} />
          </div>

        </div>

        {/* Separator */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', marginBottom: 'var(--space-8)' }} />

        {/* Downloads & Chapters Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-12)' }}>

          {/* Downloaded Chapters Section */}
          {downloadedChapters.length > 0 && (
            <div>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', marginBottom: 'var(--space-4)' }}
                onClick={() => setShowDownloaded(!showDownloaded)}
              >
                <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Downloads ({downloadedChapters.length})</h2>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showDownloaded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {showDownloaded && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
                  {downloadedChapters
                    .sort((a, b) => b.chapter_number - a.chapter_number)
                    .map(chapter => (
                      <div
                        key={chapter.id}
                        style={{
                          padding: 'var(--space-4)',
                          backgroundColor: 'rgba(255,255,255,0.05)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                          cursor: 'pointer', transition: 'all 0.2s', position: 'relative'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        onClick={() => handleReadDownloaded(chapter)}
                      >
                        <div style={{ width: '40px', height: '40px', flexShrink: 0, backgroundColor: '#4ade80', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'black' }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{chapter.name}</h4>
                          <span style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 600 }}>Available Offline</span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteDownload(chapter.id, e)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '8px' }}
                          title="Delete Download"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /><line x1="9" y1="6" x2="15" y2="6" /></svg>
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Chapters List Area */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Chapters</h2>

                {/* Source / Extensions Dropdown */}
                <select
                  value={selectedSource}
                  onChange={(e) => setSelectedSource(e.target.value)}
                  style={{
                    background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none',
                    padding: '6px 12px', borderRadius: '4px', outline: 'none', fontSize: '0.9rem', fontWeight: 600
                  }}
                >
                  {sources.map(source => (
                    <option key={source.id} value={source.id} style={{ background: 'var(--bg-secondary)' }}>
                      {source.name} {source.loading ? '(loading...)' : source.error ? `(${source.error})` : `(${source.chapterCount})`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filters toolbar */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '4px', borderRadius: '50px' }}>
                <input
                  type="text"
                  placeholder="Filter..."
                  value={chapterFilter}
                  onChange={(e) => setChapterFilter(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', padding: '4px 12px', outline: 'none', width: '120px', fontSize: '0.9rem' }}
                />
                <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
                <button
                  onClick={() => setChaptersOrder('desc')}
                  style={{ background: chaptersOrder === 'desc' ? 'rgba(255,255,255,0.15)' : 'transparent', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '50px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: chaptersOrder === 'desc' ? 600 : 400 }}
                >Newest</button>
                <button
                  onClick={() => setChaptersOrder('asc')}
                  style={{ background: chaptersOrder === 'asc' ? 'rgba(255,255,255,0.15)' : 'transparent', border: 'none', color: 'white', padding: '4px 12px', borderRadius: '50px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: chaptersOrder === 'asc' ? 600 : 400 }}
                >Oldest</button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
              {currentSource?.loading ? (
                <div className="chapters-loading" style={{ gridColumn: '1 / -1' }}>
                  <div className="spinner small" />
                  <span>Loading chapters...</span>
                </div>
              ) : currentSource?.error ? (
                <div className="chapters-error" style={{ gridColumn: '1 / -1' }}>
                  <span>{currentSource.error}</span>
                </div>
              ) : currentSource?.chapters.length === 0 ? (
                <div className="chapters-empty" style={{ gridColumn: '1 / -1' }}>
                  <span>No chapters available</span>
                </div>
              ) : (
                [...(currentSource?.chapters || [])]
                  .filter(ch => ch.name.toLowerCase().includes(chapterFilter.toLowerCase()))
                  .sort((a, b) => {
                    const numA = parseFloat(a.name.match(/[\d.]+/)?.[0] || '0')
                    const numB = parseFloat(b.name.match(/[\d.]+/)?.[0] || '0')
                    return chaptersOrder === 'desc' ? numB - numA : numA - numB
                  })
                  .map((chapter, index) => {
                    const isRead = readChapters.has(chapter.url)
                    const isDownloaded = downloadedChapters.some(dc => dc.source_url === chapter.url)
                    const isDownloading = downloadingUrls.has(chapter.url)

                    return (
                      <div
                        key={index}
                        style={{
                          padding: 'var(--space-4)',
                          backgroundColor: 'rgba(255,255,255,0.03)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-4)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
                        onClick={() => handleReadChapter(chapter)}
                      >
                        {/* Play / Read Icon Area */}
                        <button style={{
                          width: '40px', height: '40px', flexShrink: 0,
                          backgroundColor: isRead ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.2)',
                          border: 'none',
                          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', cursor: 'pointer',
                          opacity: isRead ? 0.5 : 1
                        }} onClick={(e) => toggleChapterRead(chapter.url, e)}>
                          {isRead ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-tertiary)' }}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                          )}
                        </button>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h4 style={{
                            fontSize: '1rem',
                            fontWeight: 600,
                            marginBottom: '4px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            color: isRead ? 'var(--text-tertiary)' : 'white'
                          }}>{chapter.name}</h4>
                          {chapter.date && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>{chapter.date}</span>
                          )}
                        </div>

                        {/* Download Action */}
                        <div style={{ flexShrink: 0 }}>
                          {isDownloaded ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const dc = downloadedChapters.find(d => d.source_url === chapter.url);
                                if (dc) handleDeleteDownload(dc.id, e);
                              }}
                              style={{ background: 'transparent', border: 'none', color: '#4ade80', cursor: 'pointer', padding: '8px' }}
                              title="Downloaded (Click to delete)"
                            >
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleDownloadChapter(chapter, e)}
                              disabled={isDownloading}
                              style={{
                                background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                                color: 'white', cursor: isDownloading ? 'not-allowed' : 'pointer',
                                padding: '6px', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: isDownloading ? 0.5 : 1
                              }}
                              onMouseEnter={(e) => { if (!isDownloading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                              onMouseLeave={(e) => { if (!isDownloading) e.currentTarget.style.background = 'transparent' }}
                              title="Download"
                            >
                              {isDownloading ? (
                                <div className="spinner tiny" />
                              ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default MangaDetailsPage
