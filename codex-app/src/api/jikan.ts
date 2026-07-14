/**
 * Jikan API Client v2
 * 
 * Improvements:
 * - Local cache to avoid repeated requests
 * - Sequential loading to respect rate limits
 * - Retry with exponential backoff on 429 errors
 * - Request queue to prevent parallel overload
 */

const BASE_URL = 'https://api.jikan.moe/v4';

// Cache for API responses (in-memory + localStorage)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const STALE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const REQUEST_TIMEOUT = 15000;
const LISTING_OUTAGE_TTL = 5 * 60 * 1000; // 5 minutes

// Request queue to serialize API calls
let requestQueue: Promise<any> = Promise.resolve();
const MIN_DELAY = 400; // 400ms between requests (safe for 3/sec limit)
let listingOutageUntil = 0;

const FALLBACK_MANGA_IDS = {
  trending: [2, 13, 1706, 23390, 656, 51, 100448],
  topRated: [2, 1706, 656, 13, 51, 100448, 23390],
  publishing: [2, 13, 1706, 23390, 656, 51, 100448],
  byGenre: {
    1: [13, 2, 1706, 23390, 656],
    2: [2, 13, 1706, 656, 51],
    4: [13, 51, 100448, 2, 1706],
    8: [23390, 100448, 656, 51, 2],
    10: [13, 2, 1706, 23390, 100448],
    14: [2, 656, 23390, 1706, 100448],
    22: [100448, 13, 51, 656, 2],
    24: [2, 1706, 23390, 656, 51],
  } as Record<number, number[]>,
};

const STATIC_FALLBACK_MANGA = new Map<number, any>([
  [2, {
    malId: 2,
    title: 'Berserk',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/1/157897l.webp',
    score: 9.46,
    genres: ['Action', 'Adventure', 'Award Winning'],
    status: 'Publishing',
    type: 'Manga',
    synopsis: 'Guts, a former mercenary known as the Black Swordsman, is out for revenge after a brutal betrayal.'
  }],
  [13, {
    malId: 13,
    title: 'One Piece',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/2/253146l.webp',
    score: 9.21,
    genres: ['Action', 'Adventure', 'Fantasy'],
    status: 'Publishing',
    type: 'Manga',
    synopsis: 'Monkey D. Luffy sails the Grand Line with his crew in search of the legendary treasure One Piece.'
  }],
  [51, {
    malId: 51,
    title: 'Slam Dunk',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/2/258749l.webp',
    score: 9.09,
    genres: ['Award Winning', 'Sports', 'School'],
    status: 'Finished',
    type: 'Manga',
    synopsis: 'Hanamichi Sakuragi joins his school basketball team and discovers a talent he never expected.'
  }],
  [656, {
    malId: 656,
    title: 'Vagabond',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/1/259070l.webp',
    score: 9.27,
    genres: ['Action', 'Adventure', 'Award Winning'],
    status: 'On Hiatus',
    type: 'Manga',
    synopsis: 'Shinmen Takezou walks a violent path toward becoming the legendary swordsman Miyamoto Musashi.'
  }],
  [1706, {
    malId: 1706,
    title: 'JoJo no Kimyou na Bouken Part 7: Steel Ball Run',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/3/179882l.webp',
    score: 9.34,
    genres: ['Action', 'Adventure', 'Mystery'],
    status: 'Finished',
    type: 'Manga',
    synopsis: 'A transcontinental horse race across America becomes a dangerous contest filled with strange powers.'
  }],
  [23390, {
    malId: 23390,
    title: 'Shingeki no Kyojin',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/2/37846l.webp',
    score: 8.56,
    genres: ['Action', 'Award Winning', 'Drama'],
    status: 'Finished',
    type: 'Manga',
    synopsis: 'Humanity fights for survival behind walls after the world is overrun by man-eating Titans.'
  }],
  [100448, {
    malId: 100448,
    title: 'Jumyou wo Kaitotte Moratta. Ichinen ni Tsuki, Ichimanen de.',
    coverUrl: 'https://cdn.myanimelist.net/images/manga/5/260043l.webp',
    score: 8.77,
    genres: ['Drama', 'Romance', 'Supernatural'],
    status: 'Finished',
    type: 'Manga',
    synopsis: 'A broke young man sells most of his remaining lifespan and begins to reconsider what life is worth.'
  }],
]);

/**
 * Get from cache (memory or localStorage)
 */
function getFromCache(key: string): any | null {
  // Check memory cache first
  const memCached = cache.get(key);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL) {
    console.log(`[Jikan] Cache hit (memory): ${key.slice(0, 50)}...`);
    return memCached.data;
  }

  // Check localStorage
  try {
    const stored = localStorage.getItem(`jikan_${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        console.log(`[Jikan] Cache hit (storage): ${key.slice(0, 50)}...`);
        cache.set(key, parsed); // Restore to memory
        return parsed.data;
      }
    }
  } catch (e) {
    // Ignore storage errors
  }

  return null;
}

function getStaleFromCache(key: string): any | null {
  const memCached = cache.get(key);
  if (memCached && Date.now() - memCached.timestamp < STALE_CACHE_TTL) {
    console.warn(`[Jikan] Using stale memory cache: ${key.slice(0, 50)}...`);
    return memCached.data;
  }

  try {
    const stored = localStorage.getItem(`jikan_${key}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp < STALE_CACHE_TTL) {
        console.warn(`[Jikan] Using stale storage cache: ${key.slice(0, 50)}...`);
        cache.set(key, parsed);
        return parsed.data;
      }
    }
  } catch (e) {
    // Ignore storage errors
  }

  return null;
}

/**
 * Save to cache
 */
function saveToCache(key: string, data: any): void {
  const entry = { data, timestamp: Date.now() };
  cache.set(key, entry);

  try {
    localStorage.setItem(`jikan_${key}`, JSON.stringify(entry));
  } catch (e) {
    // Ignore storage errors (quota exceeded, etc)
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function areListingsUnavailable() {
  return Date.now() < listingOutageUntil;
}

function markListingsUnavailable() {
  listingOutageUntil = Date.now() + LISTING_OUTAGE_TTL;
}

/**
 * Fetch with retry and backoff
 * Handles 429 (rate limit) AND 5xx (server overload/timeout) with exponential backoff
 */
async function fetchWithRetry(url: string, retries = 4): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (response.status >= 500) {
        markListingsUnavailable();
        throw new Error(`HTTP ${response.status}`);
      }

      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s, 16s
        console.warn(`[Jikan] HTTP ${response.status}, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${retries})...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && /^HTTP 5\d\d$/.test(error.message)) {
        throw error;
      }

      if (attempt === retries - 1) throw error;
      const waitTime = Math.pow(2, attempt + 1) * 1000;
      console.warn(`[Jikan] Request failed, waiting ${waitTime}ms before retry (attempt ${attempt + 1}/${retries})...`);
      await sleep(waitTime);
    } finally {
      window.clearTimeout(timeout);
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Queue a request to ensure sequential execution
 */
function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  const queuedRequest = requestQueue.catch(() => null).then(async () => {
    await sleep(MIN_DELAY);
    return fn();
  });

  requestQueue = queuedRequest.catch(() => null);
  return queuedRequest;
}

/**
 * Make API request with caching and queuing
 */
async function apiRequest(endpoint: string, options: { skipWhenListingsUnavailable?: boolean } = {}): Promise<any> {
  const cacheKey = endpoint;

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Queue the request
  return queueRequest(async () => {
    // Double-check cache (might have been populated while waiting)
    const cached2 = getFromCache(cacheKey);
    if (cached2) return cached2;

    if (options.skipWhenListingsUnavailable && areListingsUnavailable()) {
      throw new Error('Jikan listing endpoints are temporarily unavailable');
    }

    console.log(`[Jikan] Fetching: ${endpoint.slice(0, 60)}...`);
    try {
      const data = await fetchWithRetry(`${BASE_URL}${endpoint}`);
      saveToCache(cacheKey, data);
      return data;
    } catch (error) {
      const stale = getStaleFromCache(cacheKey);
      if (stale) return stale;
      throw error;
    }
  });
}

async function getMangaListByIds(ids: number[], limit: number, page: number): Promise<PaginatedResponse<any>> {
  const start = Math.max(0, (page - 1) * limit);
  const pageIds = ids.slice(start, start + limit);
  const staticData = pageIds
    .map(id => STATIC_FALLBACK_MANGA.get(id))
    .filter(Boolean);

  if (staticData.length > 0) {
    return {
      data: staticData,
      pagination: {
        last_visible_page: Math.max(1, Math.ceil(ids.length / limit)),
        has_next_page: start + limit < ids.length,
        current_page: page,
        items: {
          count: staticData.length,
          total: ids.length,
          per_page: limit,
        },
      },
    };
  }

  const data = await Promise.all(
    pageIds.map(async id => {
      try {
        return await getMangaById(id);
      } catch (error) {
        console.warn(`[Jikan] Fallback manga ${id} failed`, error);
        return null;
      }
    })
  );

  return {
    data: data.filter(Boolean),
    pagination: {
      last_visible_page: Math.max(1, Math.ceil(ids.length / limit)),
      has_next_page: start + limit < ids.length,
      current_page: page,
      items: {
        count: data.filter(Boolean).length,
        total: ids.length,
        per_page: limit,
      },
    },
  };
}

/**
 * Normalize Jikan manga data
 */
function normalizeManga(jikanManga: any) {
  const allTags = [
    ...(jikanManga.genres?.map((g: any) => g.name) || []),
    ...(jikanManga.themes?.map((t: any) => t.name) || []),
    ...(jikanManga.demographics?.map((d: any) => d.name) || [])
  ];

  return {
    malId: jikanManga.mal_id,
    title: jikanManga.title,
    titleEnglish: jikanManga.title_english,
    titleJapanese: jikanManga.title_japanese,
    titleSynonyms: jikanManga.title_synonyms || [],
    coverUrl: jikanManga.images?.webp?.large_image_url || jikanManga.images?.jpg?.large_image_url,
    synopsis: jikanManga.synopsis,
    score: jikanManga.score,
    scoredBy: jikanManga.scored_by,
    rank: jikanManga.rank,
    popularity: jikanManga.popularity,
    genres: Array.from(new Set(allTags)), // Deduplicate combined tags
    themes: jikanManga.themes?.map((t: any) => t.name) || [],
    demographics: jikanManga.demographics?.map((d: any) => d.name) || [],
    status: jikanManga.status || 'Unknown',
    chapters: jikanManga.chapters,
    volumes: jikanManga.volumes,
    type: jikanManga.type,
    authors: jikanManga.authors?.map((a: any) => a.name) || [],
    serializations: jikanManga.serializations?.map((s: any) => s.name) || [],
    published: jikanManga.published?.string?.replace(' to ?', '') || 'Unknown',
  };
}

/**
 * Common paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
}

/**
 * Search manga with advanced filters
 */
export interface SearchOptions {
  limit?: number
  orderBy?: 'popularity' | 'score' | 'title' | 'start_date' | 'rank'
  sort?: 'asc' | 'desc'
  genres?: number[]
  status?: 'publishing' | 'complete' | 'hiatus' | 'discontinued'
  minScore?: number
  page?: number
}

function paginateStatic(data: any[], limit: number, page: number): PaginatedResponse<any> {
  const start = Math.max(0, (page - 1) * limit);
  const pageData = data.slice(start, start + limit);

  return {
    data: pageData,
    pagination: {
      last_visible_page: Math.max(1, Math.ceil(data.length / limit)),
      has_next_page: start + limit < data.length,
      current_page: page,
      items: {
        count: pageData.length,
        total: data.length,
        per_page: limit,
      },
    },
  };
}

function searchStaticManga(query: string, options: SearchOptions): PaginatedResponse<any> {
  const normalizedQuery = query.trim().toLowerCase();
  const limit = options.limit || 25;
  const page = options.page || 1;
  let data = Array.from(STATIC_FALLBACK_MANGA.values());

  if (normalizedQuery) {
    data = data.filter(manga => {
      const haystack = [
        manga.title,
        manga.titleEnglish,
        manga.titleJapanese,
        ...(manga.genres || []),
      ].filter(Boolean).join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }

  if (options.genres && options.genres.length > 0) {
    const selectedGenreNames = options.genres
      .map(id => Object.entries(GENRE_IDS).find(([, value]) => value === id)?.[0])
      .filter(Boolean)
      .map(name => String(name).toLowerCase());

    data = data.filter(manga =>
      manga.genres?.some((genre: string) =>
        selectedGenreNames.some(selected => genre.toLowerCase().replace(/[^a-z]/g, '').includes(selected.toLowerCase()))
      )
    );
  }

  if (options.status) {
    data = data.filter(manga => manga.status?.toLowerCase().includes(options.status as string));
  }

  if (options.minScore && options.minScore > 0) {
    data = data.filter(manga => manga.score >= options.minScore!);
  }

  if (options.orderBy === 'score' || options.orderBy === 'rank') {
    data = data.sort((a, b) => (b.score || 0) - (a.score || 0));
  } else if (options.orderBy === 'title') {
    data = data.sort((a, b) => a.title.localeCompare(b.title));
  }

  return paginateStatic(data, limit, page);
}

export async function searchManga(query: string, options: SearchOptions = {}): Promise<PaginatedResponse<any>> {
  if (areListingsUnavailable()) {
    return searchStaticManga(query, options);
  }

  const params = new URLSearchParams({
    limit: (options.limit || 25).toString(),
    page: (options.page || 1).toString(),
    sfw: 'true',
  })

  if (query.trim()) {
    params.set('q', query)
  }

  if (options.orderBy) {
    params.set('order_by', options.orderBy)
    params.set('sort', options.sort || 'desc')
  }

  if (options.genres && options.genres.length > 0) {
    params.set('genres', options.genres.join(','))
  }

  if (options.status) {
    params.set('status', options.status)
  }

  if (options.minScore && options.minScore > 0) {
    params.set('min_score', options.minScore.toString())
  }

  try {
    const response = await apiRequest(`/manga?${params}`)
    return {
      data: response.data.map(normalizeManga),
      pagination: response.pagination
    }
  } catch (error) {
    console.warn('[Jikan] Search failed, using static fallback', error);
    return searchStaticManga(query, options);
  }
}

/**
 * Get top manga
 */
export async function getTopManga(filter = 'bypopularity', limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  const fallbackIds = filter === 'favorite' ? FALLBACK_MANGA_IDS.topRated : FALLBACK_MANGA_IDS.trending;

  if (areListingsUnavailable()) {
    return getMangaListByIds(fallbackIds, limit, page);
  }

  const params = new URLSearchParams({
    filter,
    limit: limit.toString(),
    page: page.toString(),
    sfw: 'true',
  });

  try {
    const response = await apiRequest(`/top/manga?${params}`, { skipWhenListingsUnavailable: true });
    return {
      data: response.data.map(normalizeManga),
      pagination: response.pagination
    }
  } catch (error) {
    console.warn(`[Jikan] /top/manga failed for filter "${filter}", using fallback IDs`, error);
    return getMangaListByIds(fallbackIds, limit, page);
  }
}

/**
 * Get manga by genre
 */
export async function getMangaByGenre(genreId: number, limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  const fallbackIds = FALLBACK_MANGA_IDS.byGenre[genreId] || FALLBACK_MANGA_IDS.trending;

  if (areListingsUnavailable()) {
    return getMangaListByIds(fallbackIds, limit, page);
  }

  const params = new URLSearchParams({
    genres: genreId.toString(),
    limit: limit.toString(),
    page: page.toString(),
    order_by: 'score',
    sort: 'desc',
    sfw: 'true',
  });

  try {
    const response = await apiRequest(`/manga?${params}`, { skipWhenListingsUnavailable: true });
    return {
      data: response.data.map(normalizeManga),
      pagination: response.pagination
    }
  } catch (error) {
    console.warn(`[Jikan] Genre ${genreId} failed, using fallback IDs`, error);
    return getMangaListByIds(fallbackIds, limit, page);
  }
}

/**
 * Get manga by ID
 */
export async function getMangaById(malId: number) {
  // We explicitly avoid the '/full' endpoint because Jikan struggles with it and returns 504s frequently
  const response = await apiRequest(`/manga/${malId}`);
  // ID fetch is always a single object, not a paginated array
  return normalizeManga(response.data);
}

/**
 * Get currently publishing manga
 */
export async function getPublishingManga(limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  if (areListingsUnavailable()) {
    return getMangaListByIds(FALLBACK_MANGA_IDS.publishing, limit, page);
  }

  const params = new URLSearchParams({
    status: 'publishing',
    order_by: 'popularity',
    sort: 'desc',
    limit: limit.toString(),
    page: page.toString(),
    sfw: 'true',
  });

  try {
    const response = await apiRequest(`/manga?${params}`, { skipWhenListingsUnavailable: true });
    return {
      data: response.data.map(normalizeManga),
      pagination: response.pagination
    }
  } catch (error) {
    console.warn('[Jikan] Publishing list failed, using fallback IDs', error);
    return getMangaListByIds(FALLBACK_MANGA_IDS.publishing, limit, page);
  }
}

/**
 * Get manga genres
 */
export async function getGenres() {
  const data = await apiRequest('/genres/manga');
  // Return early if array is empty or malformed
  if (!data?.data || !Array.isArray(data.data)) return [];
  // Jikan sometimes returns duplicate IDs across different categories (Genres vs Themes)
  // We need to deduplicate them using a Set or Map so React doesn't throw Key warnings
  const uniqueMetadata = new Map();

  data.data.forEach((g: any) => {
    if (!uniqueMetadata.has(g.mal_id)) {
      uniqueMetadata.set(g.mal_id, {
        id: g.mal_id,
        name: g.name,
        count: g.count
      })
    }
  });

  return Array.from(uniqueMetadata.values())
    .sort((a: any, b: any) => b.count - a.count); // Sort by popularity
}

// Genre IDs
export const GENRE_IDS = {
  action: 1,
  adventure: 2,
  comedy: 4,
  drama: 8,
  fantasy: 10,
  horror: 14,
  mystery: 7,
  romance: 22,
  sciFi: 24,
  sliceOfLife: 36,
  sports: 30,
  supernatural: 37,
  thriller: 41,
  shounen: 27,
  seinen: 42,
  shoujo: 25,
  josei: 43,
};

/**
 * Clear cache (for debugging)
 */
export function clearCache() {
  cache.clear();
  const keys = Object.keys(localStorage).filter(k => k.startsWith('jikan_'));
  keys.forEach(k => localStorage.removeItem(k));
  console.log('[Jikan] Cache cleared');
}

export default {
  searchManga,
  getTopManga,
  getMangaByGenre,
  getMangaById,
  getPublishingManga,
  GENRE_IDS,
  clearCache,
};
