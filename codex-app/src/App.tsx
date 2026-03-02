import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import LibraryPage from './pages/LibraryPage'
import BrowsePage from './pages/BrowsePage'
import MangaDetailsPage from './pages/MangaDetailsPage'
import ReaderPage from './pages/ReaderPage'
import HistoryPage from './pages/HistoryPage'
import DownloadsPage from './pages/DownloadsPage'
import SettingsPage from './pages/SettingsPage'
import SourcesPage from './pages/SourcesPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<LibraryPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="browse" element={<BrowsePage />} />
        <Route path="manga/:sourceId/:mangaId" element={<MangaDetailsPage />} />
        <Route path="manga/:type/:id" element={<MangaDetailsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
        <Route path="sources" element={<SourcesPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/reader/:sourceId/:chapterId" element={<ReaderPage />} />
    </Routes>
  )
}

export default App
