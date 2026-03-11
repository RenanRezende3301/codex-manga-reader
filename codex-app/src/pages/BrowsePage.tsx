import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { searchManga, getTopManga, getPublishingManga, getMangaByGenre, getGenres, SearchOptions } from '../api/jikan'
import Pagination from '../components/common/Pagination'
import './BrowsePage.css'

interface MangaCard {
  malId: number
  title: string
  titleEnglish?: string
  coverUrl: string
  score: number
  genres: string[]
  status: string
  type: string
}

interface CarouselRow {
  title: string
  icon: string
  data: MangaCard[]
  loading: boolean
  genreId?: number
  path?: string // Route path for View All
}

const STATUS_OPTIONS = [
  { value: '', name: 'All' },
  { value: 'publishing', name: 'Publishing' },
  { value: 'complete', name: 'Completed' },
  { value: 'hiatus', name: 'Hiatus' },
]

const ORDER_OPTIONS = [
  { value: 'popularity', name: 'Popularity' },
  { value: 'score', name: 'Score' },
  { value: 'title', name: 'Title A-Z' },
  { value: 'start_date', name: 'Newest' },
]

const SCORE_OPTIONS = [
  { value: 0, name: 'Any' },
  { value: 6, name: '6+' },
  { value: 7, name: '7+' },
  { value: 8, name: '8+' },
  { value: 9, name: '9+' },
]

function BrowsePage() {
  const navigate = useNavigate()
  const CACHE_KEY = 'codex-browse-state'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MangaCard[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [genres, setGenres] = useState<{ id: number; name: string }[]>([{ id: 0, name: 'All' }])
  const [searchPage, setSearchPage] = useState(1)
  const [searchTotalPages, setSearchTotalPages] = useState(1)
  const [genreSearchInput, setGenreSearchInput] = useState('')
  const [showGenreDropdown, setShowGenreDropdown] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Hero Carousel State
  const [heroMangas, setHeroMangas] = useState<MangaCard[]>([])
  const [currentHeroIndex, setCurrentHeroIndex] = useState(0)

  // Filter states
  const [selectedGenres, setSelectedGenres] = useState<number[]>([])
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedOrder, setSelectedOrder] = useState('popularity')
  const [selectedScore, setSelectedScore] = useState(0)
  const [filtersApplied, setFiltersApplied] = useState(false)

  const [rows, setRows] = useState<CarouselRow[]>([
    { title: '🔥 Trending', icon: '🔥', data: [], loading: true, path: '/discovery/trending' },
    { title: '⭐ Top Rated', icon: '⭐', data: [], loading: true, path: '/discovery/top' },
    { title: '📖 Publishing Now', icon: '📖', data: [], loading: true, path: '/discovery/publishing' },
  ])

  useEffect(() => {
    const savedStateStr = sessionStorage.getItem(CACHE_KEY)
    if (savedStateStr) {
      try {
        const saved = JSON.parse(savedStateStr)
        setSearchQuery(saved.searchQuery)
        setHasSearched(saved.hasSearched)
        setSearchPage(saved.searchPage)
        setSearchTotalPages(saved.searchTotalPages || 1)
        setSearchResults(saved.searchResults)
        setSelectedGenres(saved.selectedGenres)
        setSelectedStatus(saved.selectedStatus)
        setSelectedOrder(saved.selectedOrder)
        setSelectedScore(saved.selectedScore)
        setFiltersApplied(saved.filtersApplied)

        sessionStorage.removeItem(CACHE_KEY)

        getGenres().then(fetchedGenres => {
          setGenres([{ id: 0, name: 'All' }, ...fetchedGenres])

          setTimeout(() => {
            window.scrollTo(0, saved.scrollY || 0)
          }, 100)
        })

        return
      } catch (err) {
        console.error('Failed to parse cached browse state', err)
        sessionStorage.removeItem(CACHE_KEY)
      }
    }

    initializePage()
  }, [])

  const initializePage = async () => {
    try {
      // 1. Fetch Genres first
      const fetchedGenres = await getGenres()
      let topGenres: typeof fetchedGenres = []

      if (fetchedGenres && fetchedGenres.length > 0) {
        setGenres([{ id: 0, name: 'All' }, ...fetchedGenres])
        topGenres = fetchedGenres.slice(0, 3) // Get top 3 most popular genres

        // Dynamically append the top 3 genres as new rows
        setRows([
          { title: '🔥 Trending', icon: '🔥', data: [], loading: true, path: '/discovery/trending' },
          { title: '⭐ Top Rated', icon: '⭐', data: [], loading: true, path: '/discovery/top' },
          { title: '📖 Publishing Now', icon: '📖', data: [], loading: true, path: '/discovery/publishing' },
          ...topGenres.map((g: { id: number; name: string }) => ({ title: `🏷️ ${g.name}`, icon: '🏷️', data: [], loading: true, genreId: g.id }))
        ])
      }

      // 2. Load Top Carousels
      getTopManga('bypopularity', 20, 1).then(res => {
        setHeroMangas(res.data.slice(0, 5)) // Keep top 5 for the hero banner
        updateRow(0, res.data)
      }).catch(console.error)
      getTopManga('favorite', 20, 1).then(res => updateRow(1, res.data)).catch(console.error)
      getPublishingManga(20, 1).then(res => updateRow(2, res.data)).catch(console.error)

      // 3. Load Dynamic Genre Carousels
      for (let i = 0; i < topGenres.length; i++) {
        getMangaByGenre(topGenres[i].id, 20, 1)
          .then(res => updateRow(3 + i, res.data))
          .catch(console.error)
      }
    } catch (error) {
      console.error('Failed to initialize page:', error)
    }
  }

  // Handle auto-rotation of hero banner
  useEffect(() => {
    if (heroMangas.length === 0 || searchQuery.trim() || filtersApplied) return
    const interval = setInterval(() => {
      setCurrentHeroIndex(prev => (prev + 1) % heroMangas.length)
    }, 8000) // Rotate every 8 seconds
    return () => clearInterval(interval)
  }, [heroMangas.length, searchQuery, filtersApplied])

  const updateRow = (index: number, data: MangaCard[]) => {
    setRows(prev => {
      const newRows = [...prev]
      if (newRows[index]) {
        newRows[index] = { ...newRows[index], data, loading: false }
      }
      return newRows
    })
  }

  const handleSearchInput = (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setHasSearched(false)
      setSearchResults([])
      setSearchPage(1)
      setSearchTotalPages(1)
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      doSearch()
    }
  }

  const toggleGenre = (genreId: number) => {
    setSelectedGenres(prev => {
      if (prev.includes(genreId)) {
        return prev.filter(id => id !== genreId)
      }
      return [...prev, genreId]
    })
  }

  const doSearch = (page = 1) => {
    const hasFilters = selectedGenres.length > 0 || selectedStatus !== '' || selectedScore > 0

    if (!searchQuery.trim() && !hasFilters) {
      setSearchResults([])
      setIsSearching(false)
      setFiltersApplied(false)
      setSearchPage(1)
      setSearchTotalPages(1)
      return
    }

    setIsSearching(true)
    if (page === 1) {
      setFiltersApplied(true) // Show results section immediately when search starts
      setSearchPage(1)
    }

    // Small delay to show loading state
    setTimeout(async () => {
      try {
        setIsSearching(true)
        setHasSearched(true)
        const options: SearchOptions = {
          limit: 25,
          page: page
        }

        // Only apply order_by when there's NO text query (filter-only browsing)
        // When searching by name, let Jikan use its default relevance ranking
        if (!searchQuery.trim()) {
          options.orderBy = selectedOrder as SearchOptions['orderBy']
          options.sort = selectedOrder === 'title' ? 'asc' : 'desc'
        }

        if (selectedGenres.length > 0) {
          options.genres = selectedGenres
        }

        if (selectedStatus) {
          options.status = selectedStatus as SearchOptions['status']
        }

        if (selectedScore > 0) {
          options.minScore = selectedScore
        }

        const res = await searchManga(searchQuery, options)

        setSearchResults(res.data)
        setSearchTotalPages(res.pagination.last_visible_page || 1)
      } catch (error) {
        console.error('Search failed:', error)
      } finally {
        setIsSearching(false)
      }
    }, 100)
  }

  const handlePageChange = (newPage: number) => {
    setSearchPage(newPage)
    doSearch(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const preserveState = () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      searchQuery,
      hasSearched,
      searchPage,
      searchTotalPages,
      searchResults,
      selectedGenres,
      selectedStatus,
      selectedOrder,
      selectedScore,
      filtersApplied,
      scrollY: window.scrollY
    }))
  }

  const handleCategoryClick = (row: CarouselRow) => {
    preserveState()
    if (row.path) {
      navigate(row.path)
    } else if (row.genreId) {
      navigate(`/discovery/genre/${row.genreId}?name=${encodeURIComponent(row.title.replace('🏷️ ', ''))}`)
    }
  }

  const handleMangaClick = (manga: MangaCard) => {
    preserveState()
    // Navigate to manga details page with MAL ID
    navigate(`/manga/mal/${manga.malId}`, { state: { mangaData: manga } })
  }



  const renderMangaCard = (manga: MangaCard) => (
    <div
      key={manga.malId}
      className="manga-card"
      onClick={() => handleMangaClick(manga)}
    >
      <img
        src={manga.coverUrl}
        alt={manga.title}
        className="manga-card-image"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'https://via.placeholder.com/200x300/1a1a24/8b5cf6?text=No+Cover'
        }}
      />
      {manga.score > 0 && (
        <div className="manga-card-badge" style={{ background: 'var(--accent-secondary)', color: 'black' }}>
          <span className="unread-badge">★ {manga.score.toFixed(1)}</span>
        </div>
      )}
      <div className="manga-card-overlay">
        <h3 className="manga-card-title">{manga.title}</h3>
        <span className="manga-card-progress" style={{ color: 'var(--text-tertiary)' }}>
          {manga.type} • {manga.genres[0]}
        </span>
      </div>
    </div>
  )

  const renderCarousel = (row: CarouselRow, index: number) => (
    <div key={index} style={{ marginBottom: 'var(--space-12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 'var(--space-2)' }}>
        <h2 className="carousel-row-title" style={{ margin: 0 }}>{row.title}</h2>
        <button
          className="btn"
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '14px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px'
          }}
          onClick={() => handleCategoryClick(row)}
        >
          View All
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
      <div className="carousel-row">
        {row.loading ? (
          // Skeleton loaders
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="manga-card skeleton" />
          ))
        ) : (
          row.data.map(renderMangaCard)
        )}
      </div>
    </div>
  )

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* Dynamic Netflix-style Hero Billboard */}
      <div className="browse-hero" style={{
        position: 'relative',
        width: '100%',
        height: (!searchQuery.trim() && !filtersApplied) ? '70vh' : 'auto',
        minHeight: (!searchQuery.trim() && !filtersApplied) ? '600px' : 'auto',
        maxHeight: (!searchQuery.trim() && !filtersApplied) ? '900px' : 'none',
        marginBottom: (!searchQuery.trim() && !filtersApplied) ? 'var(--space-12)' : 'var(--space-8)'
      }}>
        {heroMangas.length > 0 && !searchQuery.trim() && !filtersApplied ? (
          <>
            {/* Background Image */}
            <div className="hero-bg" style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${heroMangas[currentHeroIndex].coverUrl.replace('large_', '')})`, // Try to get highest res
              backgroundSize: 'cover',
              backgroundPosition: 'center 20%',
              filter: 'blur(3px) brightness(0.5)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 95%, transparent 100%)',
              maskImage: 'linear-gradient(to bottom, black 0%, black 60%, transparent 95%, transparent 100%)',
              transition: 'background-image 1s ease-in-out'
            }} />
            {/* Gradient Overlays */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to right, rgba(20,20,20,1) 0%, rgba(20,20,20,0.4) 50%, rgba(20,20,20,0) 100%)'
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, var(--bg-primary) 0%, var(--bg-primary) 5%, transparent 50%)'
            }} />
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(20,20,20,0.9) 0%, var(--bg-primary) 100%)' }} />
        )}

        {/* Top Search & Filter Bar */}
        <div style={{ position: 'relative', zIndex: 10, padding: '24px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '12px', width: '100%', maxWidth: '600px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <svg style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Search manga, authors, or genres..."
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                style={{
                  width: '100%',
                  padding: '12px 16px 12px 48px',
                  fontSize: '16px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '24px',
                  color: 'white',
                  outline: 'none',
                  backdropFilter: 'blur(10px)',
                  transition: 'background-color 0.3s ease'
                }}
                onFocus={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.15)'}
                onBlur={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
              />
              {isSearching && (
                <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)' }}>
                  <div className="spinner small" />
                </div>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              style={{
                width: '46px', height: '46px',
                borderRadius: '50%',
                backgroundColor: showFilters ? 'var(--error)' : 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
          </div>

          {/* Quick Filter Pills (hidden during heavy search for focus) */}
          {(!searchQuery.trim() || filtersApplied) && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', maxWidth: '800px', marginTop: '16px' }}>
              {[
                { id: 1, name: 'Action' },
                { id: 2, name: 'Adventure' },
                { id: 4, name: 'Comedy' },
                { id: 8, name: 'Drama' },
                { id: 10, name: 'Fantasy' },
                { id: 14, name: 'Horror' },
                { id: 22, name: 'Romance' },
                { id: 24, name: 'Sci-Fi' },
                { id: 62, name: 'Isekai' }
              ].map(g => {
                const isSelected = selectedGenres.includes(g.id);
                return (
                  <button
                    key={g.id}
                    onClick={() => toggleGenre(g.id)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '50px',
                      backgroundColor: isSelected ? 'var(--error)' : 'rgba(255,255,255,0.1)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      border: `1px solid ${isSelected ? 'var(--error)' : 'rgba(255,255,255,0.1)'}`,
                      cursor: 'pointer',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                      fontSize: '13px',
                      backdropFilter: 'blur(5px)'
                    }}
                  >
                    {isSelected && <span style={{ marginRight: '4px' }}>✓</span>}
                    {g.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Advanced Filters Panel */}
          {showFilters && (
            <div style={{ marginTop: '16px', padding: '24px', background: 'rgba(0,0,0,0.6)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '900px', backdropFilter: 'blur(10px)' }}>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <select style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'black' }}>{s.name}</option>)}
                </select>
                <select style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} value={selectedScore} onChange={(e) => setSelectedScore(Number(e.target.value))}>
                  {SCORE_OPTIONS.map(s => <option key={s.value} value={s.value} style={{ color: 'black' }}>{s.name}</option>)}
                </select>
                <select style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', outline: 'none' }} value={selectedOrder} onChange={(e) => setSelectedOrder(e.target.value)}>
                  {ORDER_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ color: 'black' }}>{o.name}</option>)}
                </select>

                {/* Searchable Custom Genre Select */}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Search genres..."
                    value={genreSearchInput}
                    onChange={(e) => {
                      setGenreSearchInput(e.target.value)
                      setShowGenreDropdown(true)
                    }}
                    onFocus={() => setShowGenreDropdown(true)}
                    style={{
                      padding: '8px 16px',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      outline: 'none',
                      width: '180px'
                    }}
                  />
                  {showGenreDropdown && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                        onClick={() => setShowGenreDropdown(false)}
                      />
                      <div style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        left: 0,
                        width: '200px',
                        maxHeight: '250px',
                        overflowY: 'auto',
                        background: '#1a1a1a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '8px',
                        zIndex: 50,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                      }}>
                        {genres.filter(g => g.id !== 0 && g.name.toLowerCase().includes(genreSearchInput.toLowerCase())).map(g => (
                          <div
                            key={g.id}
                            onClick={() => {
                              if (!selectedGenres.includes(g.id)) {
                                toggleGenre(g.id)
                              }
                              setGenreSearchInput('')
                              setShowGenreDropdown(false)
                            }}
                            style={{
                              padding: '10px 16px',
                              cursor: 'pointer',
                              color: selectedGenres.includes(g.id) ? 'var(--error)' : 'white',
                              backgroundColor: 'transparent',
                              fontSize: '14px',
                              borderBottom: '1px solid rgba(255,255,255,0.05)'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                          >
                            {g.name}
                          </div>
                        ))}
                        {genres.filter(g => g.id !== 0 && g.name.toLowerCase().includes(genreSearchInput.toLowerCase())).length === 0 && (
                          <div style={{ padding: '10px 16px', color: 'var(--text-tertiary)', fontSize: '14px' }}>No genres found.</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Selected Genres Pills */}
              {selectedGenres.length > 0 && (
                <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {selectedGenres.map(gid => {
                      const genre = genres.find(g => g.id === gid)
                      if (!genre) return null
                      return (
                        <button
                          key={gid}
                          onClick={() => toggleGenre(gid)}
                          style={{
                            padding: '6px 14px',
                            borderRadius: '50px',
                            backgroundColor: 'var(--error)',
                            color: 'white',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {genre.name}
                          <span style={{ fontSize: '16px', lineHeight: 1 }}>×</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Explicit Apply Filters Button */}
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '8px' }}>
                <button
                  className="btn"
                  onClick={() => doSearch()}
                  style={{
                    padding: '12px 32px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--error)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '16px',
                    width: '100%',
                    maxWidth: '300px'
                  }}
                >
                  Apply Filters & Search
                </button>
              </div>

            </div>
          )}
        </div>

        {/* Hero Content Area */}
        {heroMangas.length > 0 && !searchQuery.trim() && !filtersApplied && (
          <div className="hero-content" style={{
            position: 'absolute',
            bottom: '40px', left: '40px',
            padding: '40px 0',
            maxWidth: '600px',
            zIndex: 5
          }}>
            {/* Status / Top 1 Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ background: 'var(--error)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 800, letterSpacing: '1px' }}>TOP TRENDING</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 600 }}>#{currentHeroIndex + 1} Today</span>
            </div>

            <h1 style={{
              fontSize: '4rem',
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: '16px',
              textShadow: '0 4px 10px rgba(0,0,0,0.8)'
            }}>
              {heroMangas[currentHeroIndex].title}
            </h1>
            <p style={{
              fontSize: '1.2rem',
              color: 'var(--text-secondary)',
              marginBottom: '32px',
              textShadow: '0 2px 4px rgba(0,0,0,0.8)',
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden'
            }}>
              {(heroMangas[currentHeroIndex] as any).synopsis || 'Experience the acclaimed manga. Add to your list and read now.'}
            </p>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                className="btn"
                style={{
                  backgroundColor: 'white', color: 'black',
                  padding: '12px 32px', fontSize: '18px', fontWeight: 700,
                  borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px'
                }}
                onClick={() => handleMangaClick(heroMangas[currentHeroIndex])}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Read Chapter 1
              </button>
              <button
                className="btn btn-secondary"
                style={{
                  backgroundColor: 'rgba(109, 109, 110, 0.7)', color: 'white',
                  backdropFilter: 'blur(5px)', border: 'none',
                  padding: '12px 32px', fontSize: '18px', fontWeight: 700,
                  borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '12px'
                }}
                onClick={() => handleMangaClick(heroMangas[currentHeroIndex])}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                More Details
              </button>
            </div>

            {/* Carousel Navigation Indicators */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '40px' }}>
              {heroMangas.map((_, idx) => (
                <div
                  key={idx}
                  onClick={() => setCurrentHeroIndex(idx)}
                  style={{
                    width: idx === currentHeroIndex ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: idx === currentHeroIndex ? 'var(--error)' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Results or Carousels */}
      <div className="page-content" style={{ marginTop: 0 }}>
        {filtersApplied || hasSearched ? (
          <div style={{ padding: '0 var(--space-10)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: 'var(--space-6)' }}>
              <button
                className="btn"
                onClick={() => {
                  setSearchQuery('');
                  setHasSearched(false);
                  setFiltersApplied(false);
                  setSelectedGenres([]);
                  setSelectedStatus('');
                  setSelectedScore(0);
                  setSearchResults([]);
                  setSearchPage(1);
                  setSearchTotalPages(1);
                }}
                style={{
                  background: 'rgba(0,0,0,0.5)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  width: '48px', height: '48px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', cursor: 'pointer',
                  flexShrink: 0,
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                title="Back to Discover"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <h2 className="carousel-row-title" style={{ margin: 0 }}>
                {searchQuery.trim() ? `Search Results for "${searchQuery}"` : 'Filtered Results'}
              </h2>
            </div>
            <div className="manga-grid">
              {searchResults.length > 0 ? (
                searchResults.map(renderMangaCard)
              ) : !isSearching ? (
                <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
                  <h2 className="empty-state-title">No results found</h2>
                  <p className="empty-state-description">Try adjusting your search or filters.</p>
                </div>
              ) : null}
            </div>

            {!isSearching && searchTotalPages > 1 && (
              <Pagination
                currentPage={searchPage}
                totalPages={searchTotalPages}
                onPageChange={handlePageChange}
                disabled={isSearching}
              />
            )}

            {isSearching && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '40px 0' }}>
                <div className="spinner small" />
              </div>
            )}
          </div>
        ) : (
          <div>
            {rows.map(renderCarousel)}
          </div>
        )}
      </div>
    </div>
  )
}

export default BrowsePage
