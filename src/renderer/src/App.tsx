import { useEffect, useState, useCallback } from 'react'
import Onboarding from './components/Onboarding'
import SettingsModal from './components/SettingsModal'
import StoryTree from './components/StoryTree'
import NodePanel from './components/NodePanel'
import { applyTheme } from './themes'
import type { NodeDetail, Settings, StoryOutline } from '../../shared/types'

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const [query, setQuery] = useState('')
  const [outline, setOutline] = useState<StoryOutline | null>(null)
  const [buildingOutline, setBuildingOutline] = useState(false)
  const [outlineError, setOutlineError] = useState('')

  const [activeId, setActiveId] = useState<string | undefined>()
  const [blinkId, setBlinkId] = useState<string | undefined>()
  const [details, setDetails] = useState<Record<string, NodeDetail>>({})
  const [nodeLoading, setNodeLoading] = useState(false)
  const [nodeError, setNodeError] = useState('')

  // Load persisted settings once.
  useEffect(() => {
    window.storyteller.getSettings().then((s) => {
      applyTheme(s.theme)
      setSettings(s)
    })
  }, [])

  const detailIds = new Set(Object.keys(details))

  async function runSearch(): Promise<void> {
    const q = query.trim()
    if (!q || buildingOutline) return
    setBuildingOutline(true)
    setOutlineError('')
    setOutline(null)
    setActiveId(undefined)
    setDetails({})
    const res = await window.storyteller.buildOutline(q)
    setBuildingOutline(false)
    if (!res.ok || !res.data) {
      setOutlineError(res.error ?? 'Could not build this story.')
      return
    }
    setOutline(res.data)
  }

  const loadNode = useCallback(
    async (id: string, force = false) => {
      if (!outline) return
      setActiveId(id)
      if (details[id] && !force) {
        setNodeError('')
        return
      }
      const node = outline.nodes.find((n) => n.id === id)
      if (!node) return
      setNodeLoading(true)
      setNodeError('')
      const res = await window.storyteller.buildNode(outline, node)
      setNodeLoading(false)
      if (!res.ok || !res.data) {
        setNodeError(res.error ?? 'Could not load this chapter.')
        return
      }
      setDetails((d) => ({ ...d, [id]: res.data! }))
    },
    [outline, details]
  )

  // Briefly pulse a node in the tree (e.g. when an answer relates to it).
  const blink = useCallback((id: string) => {
    setBlinkId(id)
    window.setTimeout(
      () => setBlinkId((cur) => (cur === id ? undefined : cur)),
      2600
    )
  }, [])

  if (!settings) return <div className="boot" />

  if (!settings.apiKey) {
    return (
      <Onboarding
        onSaved={(key) => setSettings({ ...settings, apiKey: key })}
      />
    )
  }

  const activeNode = outline?.nodes.find((n) => n.id === activeId)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">✦</span>
          <span className="brand__name">Storyteller</span>
        </div>

        <div className="searchbar">
          <input
            className="searchbar__input"
            placeholder="Name any work — e.g. The Last of Us, Berserk, Dune…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
          <button
            className="btn btn--primary"
            onClick={runSearch}
            disabled={buildingOutline}
          >
            {buildingOutline ? 'Weaving…' : 'Tell the story'}
          </button>
        </div>

        <button
          className="icon-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <main className="stage">
        {!outline && !buildingOutline && !outlineError && (
          <div className="empty">
            <div className="empty__art">✦</div>
            <h1>What story shall we tell?</h1>
            <p>
              Search any game, film, anime, series, book or comic above. We’ll
              trace its whole tale and lay it out as a tree of chapters — click
              any node to read that part.
            </p>
          </div>
        )}

        {buildingOutline && (
          <div className="empty">
            <div className="spinner spinner--lg" />
            <h1>Weaving “{query}” into a story…</h1>
            <p>Mapping the chapters from start to finish.</p>
          </div>
        )}

        {outlineError && (
          <div className="empty">
            <div className="empty__art">⚠</div>
            <h1>Something interrupted the tale</h1>
            <p>{outlineError}</p>
            <button className="btn btn--primary" onClick={runSearch}>
              Try again
            </button>
          </div>
        )}

        {outline && (
          <div className={`workspace ${activeId ? 'has-panel' : ''}`}>
            <div className="canvas">
              <div className="canvas__header">
                <h2>{outline.title}</h2>
                <span className="badge">{outline.mediaType}</span>
                <p className="logline">{outline.logline}</p>
              </div>
              <div className="canvas__flow">
                <StoryTree
                  outline={outline}
                  activeId={activeId}
                  blinkId={blinkId}
                  detailIds={detailIds}
                  onSelect={(id) => loadNode(id)}
                />
              </div>
            </div>

            {activeId && (
              <NodePanel
                outline={outline}
                node={activeNode}
                title={activeNode?.title ?? ''}
                loading={nodeLoading}
                error={nodeError}
                detail={details[activeId]}
                onClose={() => setActiveId(undefined)}
                onRetry={() => loadNode(activeId, true)}
                onBlink={blink}
                onGoToNode={(id) => loadNode(id)}
              />
            )}
          </div>
        )}
      </main>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => {
            applyTheme(settings.theme) // revert live preview if cancelled
            setShowSettings(false)
          }}
          onSave={(s) => {
            applyTheme(s.theme)
            setSettings(s)
            setShowSettings(false)
          }}
        />
      )}
    </div>
  )
}
