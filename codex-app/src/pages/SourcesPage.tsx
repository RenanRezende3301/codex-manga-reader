import { useState, useEffect } from 'react'
import './SourcesPage.css'

interface Source {
  id: string
  name: string
  baseUrl: string
  version: string
  language: string
  iconUrl?: string
}

function SourcesPage() {
  const [sources, setSources] = useState<Source[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    loadSources()
  }, [])

  const loadSources = async () => {
    try {
      if (window.codex) {
        const allSources = await window.codex.getSources()
        setSources(allSources)
      }
    } catch (error) {
      console.error('[Sources] Failed to load:', error)
    } finally {
      setIsLoading(false)
    }
  }



  const handleRemove = async (sourceId: string) => {
    if (!confirm('Tem certeza que deseja remover esta fonte?')) return

    try {
      if (window.codex?.removeSource) {
        await window.codex.removeSource(sourceId)
        setSources(prev => prev.filter(s => s.id !== sourceId))
      }
    } catch (error) {
      console.error('[Sources] Failed to remove:', error)
      alert('Error removing source')
    }
  }

  const handleInstallFromUrl = async () => {
    if (!addUrl.trim()) return

    setInstalling(true)
    setAddError(null)

    try {
      if (window.codex?.installSource) {
        await window.codex.installSource(addUrl.trim())
        await loadSources()
        setShowAddModal(false)
        setAddUrl('')
      }
    } catch (error: any) {
      setAddError(error.message || 'Error installing source')
    } finally {
      setInstalling(false)
    }
  }

  const handleFileSelect = async () => {
    try {
      // Use file input to select local JSON
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.js'
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0]
        if (file) {
          const reader = new FileReader()
          reader.onload = async (event) => {
            try {
              const content = event.target?.result as string
              if (window.codex?.installLocalSource) {
                await window.codex.installLocalSource(content)
                await loadSources()
                setShowAddModal(false)
              }
            } catch (error: any) {
              setAddError(error.message || 'Error installing local source')
            }
          }
          reader.readAsText(file)
        }
      }
      input.click()
    } catch (error) {
      console.error('[Sources] File select error:', error)
    }
  }

  if (isLoading) {
    return (
      <div className="page" style={{ padding: 'var(--space-10)' }}>
        <h1 className="page-title skeleton-text" style={{ width: '200px', height: '40px', marginBottom: 'var(--space-4)' }} />
        <div className="skeleton" style={{ width: '100%', height: '100px', borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="page" style={{ padding: 'var(--space-10)' }}>
      <header className="page-header" style={{ marginBottom: 'var(--space-8)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-4xl)', fontWeight: 900, marginBottom: 'var(--space-2)' }}>Sources</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-lg)' }}>
            Manage your content extensions ({sources.length} installed)
          </p>
        </div>
        <button
          className="btn"
          style={{
            backgroundColor: 'var(--error)',
            color: 'white',
            borderRadius: '50px',
            padding: '10px 24px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
          onClick={() => setShowAddModal(true)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Source
        </button>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '900px' }}>
        {sources.map(source => (
          <div key={source.id} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-6)',
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.05)',
            transition: 'all 0.2s'
          }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text-secondary)'
              }}>
                {source.iconUrl ? (
                  <img src={source.iconUrl} alt={source.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : source.name.charAt(0)}
              </div>
              <div>
                <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginBottom: '4px' }}>{source.name}</h3>
                <div style={{ display: 'flex', gap: 'var(--space-4)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                  <span>{source.baseUrl}</span>
                  <span>•</span>
                  <span>v{source.version}</span>
                  <span>•</span>
                  <span>{source.language.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleRemove(source.id)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 'var(--space-2)',
                borderRadius: '50%',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)'; e.currentTarget.style.backgroundColor = 'rgba(229, 9, 20, 0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
              title="Remove Source"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        ))}

        {sources.length === 0 && (
          <div className="empty-state" style={{ height: '400px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-tertiary)', marginBottom: 'var(--space-4)' }}>
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>No sources installed</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Add extensions to begin reading your favorite titles.</p>
          </div>
        )}
      </div>

      {/* Modern Glass Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={() => setShowAddModal(false)}>
          <div style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-xl)',
            width: '100%', maxWidth: '500px',
            padding: 'var(--space-8)',
            boxShadow: 'var(--shadow-2xl)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
              <h2 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>Add Source</h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '24px' }}
              >×</button>
            </div>

            <div style={{ marginBottom: 'var(--space-6)' }}>
              <h4 style={{ marginBottom: '8px', fontWeight: 600 }}>Install via URL</h4>
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-4)' }}>Paste the direct link to a compiled source plugin</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <input
                  type="text"
                  value={addUrl}
                  onChange={(e) => setAddUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={installing}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    backgroundColor: 'rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: 'white',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={handleInstallFromUrl}
                  disabled={installing || !addUrl.trim()}
                  style={{
                    backgroundColor: 'white', color: 'black',
                    padding: '0 24px', fontWeight: 600, borderRadius: '8px',
                    opacity: installing || !addUrl.trim() ? 0.5 : 1,
                    cursor: installing || !addUrl.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {installing ? '...' : 'Add'}
                </button>
              </div>
            </div>

            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', margin: 'var(--space-6) 0' }}>or</div>

            <div>
              <h4 style={{ marginBottom: '8px', fontWeight: 600 }}>Install from File</h4>
              <button
                onClick={handleFileSelect}
                disabled={installing}
                style={{
                  width: '100%',
                  padding: '16px',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  border: '1px dashed rgba(255,255,255,0.2)',
                  borderRadius: '8px',
                  color: 'var(--text-secondary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Select Local File
              </button>
            </div>

            {addError && (
              <div style={{ marginTop: 'var(--space-4)', padding: '12px', backgroundColor: 'rgba(229,9,20,0.1)', color: 'var(--error)', borderRadius: '8px', fontSize: '14px' }}>
                {addError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default SourcesPage
