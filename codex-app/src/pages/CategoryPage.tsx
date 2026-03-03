import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { getMangaByGenre, getTopManga, getPublishingManga, searchManga } from '../api/jikan';
import './CategoryPage.css';

interface MangaCard {
  malId: number;
  title: string;
  coverUrl: string;
  score: number;
  genres: string[];
  type: string;
}

export default function CategoryPage() {
  const { type, id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [mangas, setMangas] = useState<MangaCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(true);
  const title = searchParams.get('name') || (type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Category');

  const fetchMangas = useCallback(async (pageNum: number) => {
    try {
      let res;
      if (type === 'genre' && id) {
        res = await getMangaByGenre(Number(id), 25, pageNum);
      } else if (type === 'trending') {
        res = await getTopManga('bypopularity', 25, pageNum);
      } else if (type === 'top') {
        res = await getTopManga('favorite', 25, pageNum);
      } else if (type === 'publishing') {
        res = await getPublishingManga(25, pageNum);
      } else {
        // Fallback or specific search
        res = await searchManga('', { limit: 25, page: pageNum });
      }

      setMangas(prev => pageNum === 1 ? res.data : [...prev, ...res.data]);
      setHasNextPage(res.pagination.has_next_page);
    } catch (error) {
      console.error('Failed to fetch category data:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [type, id]);

  useEffect(() => {
    setLoading(true);
    setPage(1);
    fetchMangas(1);
  }, [fetchMangas]);

  // Intersection Observer for Infinite Scrolling
  const observerRef = useRef<IntersectionObserver>();
  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasNextPage) {
        setLoadingMore(true);
        const next = page + 1;
        setPage(next);
        fetchMangas(next);
      }
    }, { rootMargin: '400px' });

    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasNextPage, page, fetchMangas]);

  return (
    <div className="page" style={{ padding: '0 var(--space-8)' }}>
      {/* Category Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '40px 0' }}>
        <button
          className="btn"
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            width: '48px', height: '48px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer'
          }}
          onClick={() => navigate(-1)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, margin: 0 }}>
          {title}
        </h1>
      </div>

      {loading ? (
        <div className="manga-grid">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="manga-card skeleton" style={{ height: '300px' }} />
          ))}
        </div>
      ) : (
        <div className="manga-grid">
          {mangas.map((manga, index) => {
            const isLast = index === mangas.length - 1;
            return (
              <div
                key={`${manga.malId}-${index}`}
                ref={isLast ? lastElementRef : null}
                className="manga-card"
                onClick={() => navigate(`/manga/mal/${manga.malId}`)}
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
                    {manga.type} {manga.genres?.[0] ? `• ${manga.genres[0]}` : ''}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loadingMore && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '40px 0 80px' }}>
          <div className="spinner small" />
        </div>
      )}
    </div>
  );
}
