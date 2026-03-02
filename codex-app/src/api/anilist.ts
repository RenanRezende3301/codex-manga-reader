/**
 * AniList GraphQL API Client
 */

const ANILIST_API_URL = 'https://graphql.anilist.co';

// For production, the user should provide their own Client ID or we use a registered one
export const ANILIST_CLIENT_ID = '22699'; // Replace with actual Client ID when registered

export interface AniListUser {
  id: number;
  name: string;
  avatar: {
    large: string;
  };
}

export interface AniListMedia {
  id: number;
  idMal: number;
  title: {
    romaji: string;
    english: string;
    native: string;
  };
  averageScore: number;
  status: string;
  coverImage: {
    large: string;
  };
}

export interface AniListEntry {
  id: number;
  mediaId: number;
  status: string;
  score: number;
  progress: number;
  media: AniListMedia;
}

/**
 * Make a GraphQL request to AniList
 */
async function anilistRequest(query: string, variables: any = {}, token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      query,
      variables,
    }),
  });

  const json = await response.json();

  if (!response.ok || json.errors) {
    const errorMsg = json.errors ? json.errors[0].message : `HTTP Error ${response.status}`;
    console.error('[AniList] API Error:', errorMsg, json.errors);
    throw new Error(errorMsg);
  }

  return json.data;
}

/**
 * Get the currently authenticated user
 */
export async function getViewer(token: string): Promise<AniListUser> {
  const query = `
    query {
      Viewer {
        id
        name
        avatar {
          large
        }
      }
    }
  `;

  const data = await anilistRequest(query, {}, token);
  return data.Viewer;
}

/**
 * Fetch manga details from AniList using its MyAnimeList ID
 */
const mediaByMalIdCache: Record<number, AniListMedia | null> = {};

export async function getMediaByMalId(malId: number): Promise<AniListMedia | null> {
  if (mediaByMalIdCache[malId] !== undefined) {
    return mediaByMalIdCache[malId];
  }
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: MANGA) {
        id
        idMal
        title {
          romaji
          english
          native
        }
        averageScore
        status
        coverImage {
          large
        }
      }
    }
  `;

  try {
    const data = await anilistRequest(query, { malId });
    mediaByMalIdCache[malId] = data.Media;
    return data.Media;
  } catch (error: any) {
    if (error.message.includes('Not Found')) {
      mediaByMalIdCache[malId] = null;
      return null;
    }
    throw error;
  }
}

/**
 * Get the user's list entry for a specific manga
 */
const mediaListEntryCache: Record<string, AniListEntry | null> = {};

export async function getMediaListEntry(mediaId: number, token: string): Promise<AniListEntry | null> {
  const cacheKey = `${mediaId}_${token}`;
  if (mediaListEntryCache[cacheKey] !== undefined) {
    return mediaListEntryCache[cacheKey];
  }
  const query = `
    query ($mediaId: Int) {
      MediaList(mediaId: $mediaId) {
        id
        mediaId
        status
        score
        progress
        media {
          id
          averageScore
        }
      }
    }
  `;

  try {
    const data = await anilistRequest(query, { mediaId }, token);
    mediaListEntryCache[cacheKey] = data.MediaList;
    return data.MediaList;
  } catch (error: any) {
    if (error.message.includes('Not Found')) {
      mediaListEntryCache[cacheKey] = null;
      return null;
    }
    throw error;
  }
}

/**
 * Save or update a media list entry (progress, score, status)
 */
export async function saveMediaListEntry(
  mediaId: number,
  updates: { progress?: number; score?: number; status?: string },
  token: string
): Promise<AniListEntry> {
  const query = `
    mutation ($mediaId: Int, $progress: Int, $scoreRaw: Int, $status: MediaListStatus) {
      SaveMediaListEntry(mediaId: $mediaId, progress: $progress, scoreRaw: $scoreRaw, status: $status) {
        id
        mediaId
        status
        score
        progress
      }
    }
  `;

  // AniList 'scoreRaw' is used to set the score regardless of the user's scoring format
  // It expects a 0-100 integer.
  const variables: any = { mediaId };
  if (updates.progress !== undefined) variables.progress = updates.progress;
  if (updates.score !== undefined) variables.scoreRaw = updates.score; // 0-100
  if (updates.status !== undefined) variables.status = updates.status;

  // ... variables and query code above
  const data = await anilistRequest(query, variables, token);

  // Clear the cache for this mediaId so next fetch gets updated data
  const cacheKey = `${mediaId}_${token}`;
  delete mediaListEntryCache[cacheKey];

  return data.SaveMediaListEntry;
}

/**
 * Automagic Sync Helpers
 * Can be called directly from React components
 */

// Memory cache to prevent API spam on page turn
const mediaIdCache: Record<number, number> = {};
const lastSyncedChapter: Record<number, number> = {};

export async function syncProgress(malId: number, chapterNumber: number): Promise<boolean> {
  const flooredChapter = Math.floor(chapterNumber);

  // Prevent duplicate syncs for the exact same chapter
  if (lastSyncedChapter[malId] === flooredChapter) {
    return true;
  }

  if (!window.codex) return false;
  const token = await window.codex.getAnilistToken();
  if (!token) return false;

  try {
    let mediaId = mediaIdCache[malId];
    if (!mediaId) {
      const media = await getMediaByMalId(malId);
      if (!media) return false;
      mediaId = media.id;
      mediaIdCache[malId] = mediaId;
    }

    // Check if we need to force the status to CURRENT (Reading)
    // Otherwise, AniList might create new entries as PLANNING or ignore progress 0.
    let statusToSet: string | undefined = undefined;
    try {
      const entry = await getMediaListEntry(mediaId, token);
      if (!entry) {
        statusToSet = 'CURRENT'; // Brand new entry, force it to 'Reading'
      } else if (entry.status === 'PLANNING') {
        statusToSet = 'CURRENT'; // Move from "Plan to Read" to "Reading"
      }
    } catch (e) {
      console.warn('[AniList] Could not fetch current list entry, defaulting to CURRENT', e);
      statusToSet = 'CURRENT';
    }

    const updates: { progress: number; status?: string } = { progress: flooredChapter };
    if (statusToSet) updates.status = statusToSet;

    // Only update progress if the chapter number makes sense
    await saveMediaListEntry(mediaId, updates, token);
    console.log(`[AniList] Synced progress to chapter ${flooredChapter} for MAL ID ${malId} (Status: ${statusToSet || 'Unchanged'})`);

    // Mark as synced to prevent spamming
    lastSyncedChapter[malId] = flooredChapter;

    return true;
  } catch (err) {
    console.error('[AniList] Failed to sync progress:', err);
    return false;
  }
}

export async function syncScore(malId: number, score: number): Promise<boolean> {
  if (!window.codex) return false;
  const token = await window.codex.getAnilistToken();
  if (!token) return false;

  try {
    const media = await getMediaByMalId(malId);
    if (!media) return false;

    await saveMediaListEntry(media.id, { score }, token);
    console.log(`[AniList] Synced score ${score}/100 for MAL ID ${malId}`);
    return true;
  } catch (err) {
    console.error('[AniList] Failed to sync score:', err);
    return false;
  }
}
