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

// Request queue to serialize API calls
let requestQueue: Promise<any> = Promise.resolve();
const MIN_DELAY = 400; // 400ms between requests (safe for 3/sec limit)

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

/**
 * Fetch with retry and backoff
 */
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);

      if (response.status === 429) {
        // Rate limited - wait and retry
        const waitTime = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
        console.warn(`[Jikan] Rate limited, waiting ${waitTime}ms before retry...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await sleep(1000);
    }
  }
  throw new Error('Max retries exceeded');
}

/**
 * Queue a request to ensure sequential execution
 */
function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  requestQueue = requestQueue.then(async () => {
    await sleep(MIN_DELAY);
    return null;
  });

  return requestQueue = requestQueue.then(fn);
}

/**
 * Make API request with caching and queuing
 */
async function apiRequest(endpoint: string): Promise<any> {
  const cacheKey = endpoint;

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  // Queue the request
  return queueRequest(async () => {
    // Double-check cache (might have been populated while waiting)
    const cached2 = getFromCache(cacheKey);
    if (cached2) return cached2;

    console.log(`[Jikan] Fetching: ${endpoint.slice(0, 60)}...`);
    const data = await fetchWithRetry(`${BASE_URL}${endpoint}`);
    saveToCache(cacheKey, data);
    return data;
  });
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

export async function searchManga(query: string, options: SearchOptions = {}): Promise<PaginatedResponse<any>> {
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

  const response = await apiRequest(`/manga?${params}`)
  return {
    data: response.data.map(normalizeManga),
    pagination: response.pagination
  }
}

/**
 * Get top manga
 */
export async function getTopManga(filter = 'bypopularity', limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  const params = new URLSearchParams({
    filter,
    limit: limit.toString(),
    page: page.toString(),
    sfw: 'true',
  });

  const response = await apiRequest(`/top/manga?${params}`);
  return {
    data: response.data.map(normalizeManga),
    pagination: response.pagination
  }
}

/**
 * Get manga by genre
 */
export async function getMangaByGenre(genreId: number, limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  const params = new URLSearchParams({
    genres: genreId.toString(),
    limit: limit.toString(),
    page: page.toString(),
    order_by: 'score',
    sort: 'desc',
    sfw: 'true',
  });

  const response = await apiRequest(`/manga?${params}`);
  return {
    data: response.data.map(normalizeManga),
    pagination: response.pagination
  }
}

/**
 * Get manga by ID
 */
export async function getMangaById(malId: number) {
  const response = await apiRequest(`/manga/${malId}/full`);
  // ID fetch is always a single object, not a paginated array
  return normalizeManga(response.data);
}

/**
 * Get currently publishing manga
 */
export async function getPublishingManga(limit = 25, page = 1): Promise<PaginatedResponse<any>> {
  const params = new URLSearchParams({
    status: 'publishing',
    order_by: 'popularity',
    sort: 'desc',
    limit: limit.toString(),
    page: page.toString(),
    sfw: 'true',
  });

  const response = await apiRequest(`/manga?${params}`);
  return {
    data: response.data.map(normalizeManga),
    pagination: response.pagination
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
