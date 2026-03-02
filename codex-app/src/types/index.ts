// Manga types
export interface Manga {
  id: number
  sourceId: string
  sourceUrl: string
  title: string
  author?: string
  artist?: string
  description?: string
  status?: 'ongoing' | 'completed' | 'hiatus' | 'unknown'
  thumbnailUrl?: string
  localCoverPath?: string
  favorite: boolean
  lastRead?: Date
  createdAt: Date
  updatedAt: Date
  unreadCount?: number
  malId?: number
}

export interface MangaSearchResult {
  title: string
  url: string
  thumbnailUrl?: string
  status?: string
  rating?: string
  genres?: string[]
}

export interface MangaDetails {
  title: string
  author?: string
  artist?: string
  description?: string
  status?: string
  genres?: string[]
  thumbnailUrl?: string
  alternativeTitles?: string[]
}

// Chapter types
export interface Chapter {
  id: number
  mangaId: number
  sourceUrl: string
  name: string
  chapterNumber: number
  scanlator?: string
  read: boolean
  bookmark: boolean
  lastPageRead: number
  scrollPosition: number
  dateFetch: Date
  downloaded: boolean
  localPath?: string
}

// Download types
export interface DownloadItem {
  id: number
  chapterId: number
  mangaTitle: string
  chapterName: string
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  createdAt: Date
}

export interface DownloadProgress {
  downloadId: number
  progress: number
  status: string
}

// Source types
export interface Source {
  id: string
  name: string
  baseUrl: string
  version: string
  language: string
  iconUrl?: string
  isEnabled: boolean
}

export interface SourceConfig {
  id: string
  name: string
  baseUrl: string
  version: string
  language: string
  iconUrl?: string
  search: SearchConfig
  details: DetailsConfig
  chapters: ChaptersConfig
  pages: PagesConfig
}

export interface SearchConfig {
  urlPattern: string
  method: 'GET' | 'POST'
  selectors: {
    container: string
    title: string
    cover: string
    coverAttr: string
    url: string
    urlAttr: string
    status?: string
    rating?: string
    genres?: string
  }
}

export interface DetailsConfig {
  selectors: {
    title: string
    description: string
    author?: string
    artist?: string
    status?: string
    genres?: string
    cover: string
    coverAttr: string
  }
}

export interface ChaptersConfig {
  selectors: {
    container: string
    title: string
    date?: string
    url: string
    urlAttr?: string
  }
  numberRegex?: string
}

export interface PagesConfig {
  mode: 'DOM' | 'SCRIPT'
  selectors?: {
    container: string
    image: string
    imageAttr: string
  }
  scriptVariable?: string
  cdnVariable?: string
  imageCombine?: string
}

// Settings types
export interface Settings {
  accentColor: string
  readingMode: 'vertical' | 'horizontal' | 'webtoon'
  readingDirection: 'ltr' | 'rtl'
  downloadPath: string
  concurrentDownloads: number
}
