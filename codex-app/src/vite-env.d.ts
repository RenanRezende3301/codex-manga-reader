/// <reference types="vite/client" />

interface RecentUpdate {
  mangaId: number
  mangaTitle: string
  thumbnailUrl?: string
  chapterId: number
  chapterName: string
  chapterNumber: number
  dateAdded: number
}

interface DownloadedChapter {
  id: number
  name: string
  chapter_number: number
  source_url: string
  local_path: string
}

interface Window {
  codex: {
    // Source Engine
    fetchMangaSearch: (sourceId: string, query: string) => Promise<MangaSearchResult[]>
    fetchMangaDetails: (sourceId: string, url: string) => Promise<MangaDetails>
    fetchChapterList: (sourceId: string, url: string) => Promise<Chapter[]>
    fetchChapterPages: (sourceId: string, url: string) => Promise<string[]>

    // Database - Library
    getLibrary: () => Promise<Manga[]>
    addToLibrary: (manga: Partial<Manga>) => Promise<Manga>
    removeFromLibrary: (mangaId: number) => Promise<void>
    updateManga: (mangaId: number, data: Partial<Manga>) => Promise<Manga>
    getMangaByUrl: (sourceUrl: string) => Promise<Manga | null>
    getMangaByMalId: (malId: number) => Promise<Manga | null>

    // Database - Chapters
    getChapters: (mangaId: number) => Promise<Chapter[]>
    addChapters: (mangaId: number, chapters: any[]) => Promise<void>
    markChapterRead: (chapterId: number) => Promise<void>
    updateReadingProgress: (chapterId: number, page: number, scroll: number) => Promise<void>

    // Downloads
    downloadChapter: (manga: Manga, chapter: Chapter) => Promise<void>
    getDownloadQueue: () => Promise<DownloadItem[]>
    cancelDownload: (downloadId: number) => Promise<void>
    onDownloadProgress: (callback: (data: DownloadProgress) => void) => void
    getLocalPages: (chapterId: number) => Promise<string[]>
    getDownloadedChapters: (mangaId: number) => Promise<DownloadedChapter[]>
    deleteDownloadedChapter: (chapterId: number) => Promise<{ success: boolean }>

    // Settings
    getSetting: (key: string, defaultValue?: string) => Promise<string | null>
    setSetting: (key: string, value: string) => Promise<void>
    getAllSettings: () => Promise<Record<string, string>>

    // History
    addToHistory: (mangaId: number, chapterId: number) => Promise<void>
    getReadingHistory: (limit: number) => Promise<any[]>
    clearHistory: () => Promise<void>

    // Sources
    getSources: () => Promise<Source[]>
    addSourceRepository: (url: string) => Promise<void>
    refreshSources: () => Promise<void>
    installSource: (url: string) => Promise<{ success: boolean; source?: Source }>
    installLocalSource: (jsContent: string) => Promise<{ success: boolean; source?: Source }>
    removeSource: (sourceId: string) => Promise<{ success: boolean }>

    // Updates
    checkForUpdates: () => Promise<void>
    getRecentUpdates: () => Promise<RecentUpdate[]>
    markUpdatesAsSeen: (mangaId: number) => Promise<boolean>

    // AniList
    anilistLogin: () => Promise<{ success: boolean; token?: string; error?: string }>
    anilistLogout: () => Promise<{ success: boolean }>
    getAnilistToken: () => Promise<string | null>
  }
}
