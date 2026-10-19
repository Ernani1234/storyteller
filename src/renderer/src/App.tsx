import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Onboarding from './components/Onboarding'
import SettingsModal, { type SettingsSection } from './components/SettingsModal'
import StoryTree from './components/StoryTree'
import NodePanel from './components/NodePanel'
import SearchBar, { type SearchBarHandle } from './components/SearchBar'
import EngineSwitch from './components/EngineSwitch'
import Home from './components/Home'
import { BuildState, ErrorState } from './components/StatusViews'
import StoryHeader, { type View } from './components/StoryHeader'
import ReaderView from './components/ReaderView'
import CharactersView from './components/CharactersView'
import InfoView from './components/InfoView'
import Lightbox from './components/Lightbox'
import Icon from './components/Icon'
import { ToastProvider, useToast } from './components/Toasts'
import { I18nProvider, useI18n } from './i18n'
import { applyAppearance, SYSTEM_THEME } from './themes'
import { stopSpeaking } from './lib/tts'
import { originalDetail, originalOutline } from './lib/translation'
import { readingOrder } from '../../shared/tree'
import { fold } from '../../shared/text'
import type {
  AskResult,
  BuildStep,
  Engine,
  ErrorCode,
  ExportFormat,
  LibraryEntry,
  PublicSettings,
  SavedStory,
  StoryImage,
  StoryQuery
} from '../../shared/types'

interface NodeStatus {
  loading?: boolean
  error?: { message: string; code?: ErrorCode }
}

export default function App(): JSX.Element {
  const [settings, setSettings] = useState<PublicSettings | null>(null)

  useEffect(() => {
    window.storyteller.getSettings().then((s) => {
      applyAppearance(s)
      setSettings(s)
    })
  }, [])

  // "Match system" theme follows OS light/dark changes live.
  useEffect(() => {
    if (!settings || settings.theme !== SYSTEM_THEME) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyAppearance(settings)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings])

  if (!settings) return <div className="boot" />
  return (
    <I18nProvider pref={settings.uiLanguage}>
      <ToastProvider>
        {settings.onboarded ? <Shell settings={settings} setSettings={setSettings} /> : <Onboarding onSaved={setSettings} />}
      </ToastProvider>
    </I18nProvider>
  )
}

function Shell({ settings, setSettings }: { settings: PublicSettings; setSettings: (s: PublicSettings) => void }): JSX.Element {
  const { t, langName } = useI18n()
  const toast = useToast()
  const search = useRef<SearchBarHandle>(null)

  const [library, setLibrary] = useState<LibraryEntry[]>([])
  const [story, setStory] = useState<SavedStory | null>(null)
  const storyRef = useRef(story)
  storyRef.current = story
  const dirty = useRef(false)

  const [view, setView] = useState<View>('tree')
  const [activeId, setActiveId] = useState<string>()
  const [status, setStatus] = useState<Record<string, NodeStatus>>({})
  const statusRef = useRef(status)
  statusRef.current = status
  const [blinkId, setBlinkId] = useState<string>()
  const [highlight, setHighlight] = useState<{ nodeId: string; text: string } | null>(null)
  const [filter, setFilter] = useState('')
  const [building, setBuilding] = useState<{ query: StoryQuery; step: BuildStep | null } | null>(null)
  const [buildError, setBuildError] = useState<{ message: string; code?: ErrorCode; query: StoryQuery } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState<SettingsSection | null>(null)
  const [lightbox, setLightbox] = useState<{ images: StoryImage[]; index: number } | null>(null)
  const [readerScroll, setReaderScroll] = useState<string | null>(null)
  const buildSeq = useRef(0)

  const refreshLibrary = useCallback(() => {
    window.storyteller.listLibrary().then(setLibrary)
  }, [])
  useEffect(refreshLibrary, [refreshLibrary])

  // ---- persistence -------------------------------------------------------
  const updateStory = useCallback((fn: (s: SavedStory) => SavedStory) => {
    setStory((s) => {
      if (!s) return s
      const next = fn(s)
      if (next !== s) dirty.current = true
      return next
    })
  }, [])

  useEffect(() => {
    if (!story || !dirty.current) return
    const timer = window.setTimeout(async () => {
      dirty.current = false
      const res = await window.storyteller.saveStory(story)
      if (!res.ok) toast({ tone: 'error', message: t('toast.saveFailed', { msg: res.error ?? '' }) })
      else refreshLibrary()
    }, 600)
    return () => window.clearTimeout(timer)
  }, [story, refreshLibrary, toast, t])

  /** Save pending progress now (before switching stories). */
  async function flush(): Promise<void> {
    const s = storyRef.current
    if (s && dirty.current) {
      dirty.current = false
      await window.storyteller.saveStory(s)
    }
  }

  // ---- derived -----------------------------------------------------------
  // Machine-translated stories can be shown as originally written.
  const [showOriginal, setShowOriginal] = useState(false)
  useEffect(() => setShowOriginal(false), [story?.outline.id])
  const original = showOriginal && !!story?.outline.translation
  const shown = useMemo(() => (story && original ? originalOutline(story.outline) : story?.outline), [story?.outline, original])
  const shownDetails = useMemo(
    () =>
      story && original
        ? Object.fromEntries(Object.entries(story.details).map(([id, d]) => [id, originalDetail(d, story.outline)]))
        : (story?.details ?? {}),
    [story?.details, story?.outline, original]
  )

  const order = useMemo(() => (shown ? readingOrder(shown.nodes) : []), [shown])
  const readIds = useMemo(() => new Set(story?.read ?? []), [story?.read])
  const loadingIds = useMemo(
    () => new Set(Object.entries(status).filter(([, s]) => s.loading).map(([id]) => id)),
    [status]
  )
  const matchIds = useMemo(() => {
    const q = fold(filter.trim())
    if (!shown || q.length < 2) return null
    // Search what is on screen: the translation, or the original when shown.
    const ids = new Set<string>()
    for (const n of shown.nodes) {
      const hay = fold(
        [n.title, n.summary, shownDetails[n.id]?.body ?? n.text ?? '', ...(n.episodes ?? []).map((e) => `${e.title} ${e.summary}`)].join(' ')
      )
      if (hay.includes(q)) ids.add(n.id)
    }
    return ids
  }, [filter, shown, shownDetails])

  const activeIndex = order.findIndex((n) => n.id === activeId)
  const activeNode = activeIndex >= 0 ? order[activeIndex] : undefined
  const continueNode = story ? (order.find((n) => !readIds.has(n.id)) ?? order.find((n) => n.id === story.lastNodeId) ?? order[0]) : undefined

  // ---- story lifecycle ---------------------------------------------------
  function resetStoryUi(): void {
    stopSpeaking()
    setActiveId(undefined)
    setStatus({})
    setHighlight(null)
    setFilter('')
    setView('tree')
    setBuildError(null)
  }

  async function openSaved(id: string): Promise<void> {
    await flush()
    buildSeq.current++
    const s = await window.storyteller.getStory(id)
    if (!s) return refreshLibrary()
    resetStoryUi()
    setBuilding(null)
    setStory(s)
  }

  async function build(q: StoryQuery, opts: { force?: boolean } = {}): Promise<void> {
    // AI stories cost tokens: reopen a saved one for the same query instead.
    if (!opts.force && settings.engine !== 'sources' && !q.plotSource) {
      const saved = await window.storyteller.findSaved(q.text)
      if (saved) {
        await openSaved(saved.id)
        toast({ message: t('toast.openedSaved'), action: { label: t('toast.rebuild'), run: () => build(q, { force: true }) } })
        return
      }
    }
    await flush()
    const my = ++buildSeq.current
    search.current?.setText(q.text)
    setStory(null)
    resetStoryUi()
    setBuilding({ query: q, step: null })
    const off = window.storyteller.onProgress((step) => {
      if (my === buildSeq.current) setBuilding((b) => b && { ...b, step })
    })
    const res = await window.storyteller.buildOutline(q)
    off()
    if (my !== buildSeq.current) return
    setBuilding(null)
    if (!res.ok || !res.data) {
      setBuildError({ message: res.error ?? '', code: res.code, query: q })
      return
    }

    // Rebuilding a story you've been reading keeps your progress where the
    // chapters are still the same ones.
    const outline = res.data
    const prev = await window.storyteller.getStory(outline.id)
    const ids = new Set(outline.nodes.map((n) => n.id))
    const same = (id: string): boolean =>
      ids.has(id) && prev?.outline.nodes.find((n) => n.id === id)?.title === outline.nodes.find((n) => n.id === id)?.title
    const fresh: SavedStory = {
      outline,
      details: prev && outline.engine !== 'sources' && !opts.force ? Object.fromEntries(Object.entries(prev.details).filter(([id]) => same(id))) : {},
      read: prev ? prev.read.filter(same) : [],
      favorite: prev?.favorite ?? false,
      lastNodeId: prev?.lastNodeId && same(prev.lastNodeId) ? prev.lastNodeId : undefined,
      updatedAt: Date.now()
    }
    setStory(fresh)
    const saved = await window.storyteller.saveStory(fresh, [q.text])
    if (!saved.ok) toast({ tone: 'error', message: t('toast.saveFailed', { msg: saved.error ?? '' }) })
    refreshLibrary()
  }

  async function goHome(): Promise<void> {
    await flush()
    buildSeq.current++
    setBuilding(null)
    setStory(null)
    resetStoryUi()
    refreshLibrary()
  }

  // ---- chapters ----------------------------------------------------------
  function markRead(id: string): void {
    updateStory((st) => (st.read.includes(id) ? st : { ...st, read: [...st.read, id] }))
  }

  /** Fetch a chapter's detail (without opening it). */
  async function ensureDetail(id: string, opts: { forceAi?: boolean } = {}): Promise<void> {
    const s = storyRef.current
    if (!s || statusRef.current[id]?.loading) return
    if (s.details[id] && !opts.forceAi) return markRead(id)
    setStatus((st) => ({ ...st, [id]: { loading: true } }))
    const res = await window.storyteller.buildNode(s.outline, id, { forceAi: opts.forceAi })
    if (storyRef.current?.outline.id !== s.outline.id) return // story changed meanwhile
    if (!res.ok || !res.data) {
      setStatus((st) => ({ ...st, [id]: { error: { message: res.error ?? '', code: res.code } } }))
      if (opts.forceAi) toast({ tone: 'error', message: res.code ? t(`err.${res.code}`, { msg: res.error ?? '', q: '' }) : (res.error ?? '') })
      return
    }
    setStatus((st) => ({ ...st, [id]: {} }))
    const fresh = res.data
    updateStory((st) => ({
      ...st,
      // A retelling that found no pictures keeps the ones the chapter had.
      details: {
        ...st.details,
        [id]: fresh.images.length ? fresh : { ...fresh, images: st.details[id]?.images ?? [] }
      },
      read: st.read.includes(id) ? st.read : [...st.read, id]
    }))
  }

  function openNode(id: string, opts: { forceAi?: boolean } = {}): void {
    setActiveId(id)
    updateStory((st) => (st.lastNodeId === id ? st : { ...st, lastNodeId: id }))
    ensureDetail(id, opts)
  }

  function goRelative(delta: number): void {
    const target = activeIndex === -1 ? (delta > 0 ? order[0] : undefined) : order[activeIndex + delta]
    if (target) openNode(target.id)
  }

  const blink = useCallback((id: string) => {
    setBlinkId(id)
    window.setTimeout(() => setBlinkId((cur) => (cur === id ? undefined : cur)), 2600)
  }, [])

  function ask(question: string): ReturnType<typeof window.storyteller.ask> {
    const s = storyRef.current!
    const corpus = Object.fromEntries(Object.entries(s.details).map(([k, d]) => [k, d.body]))
    return window.storyteller.ask(s.outline, activeId!, corpus, question)
  }

  function onAnswer(a: AskResult): void {
    // Local answers quote the related chapter; AI answers quote the current one.
    const node = a.engine === 'ai' ? activeId : a.relatedNodeId
    setHighlight(a.highlight && node ? { nodeId: node, text: a.highlight } : null)
    // Answers quote the translated text: show it, so the highlight can be found.
    if (a.highlight) setShowOriginal(false)
    if (a.relatedNodeId) blink(a.relatedNodeId)
  }

  // ---- actions -----------------------------------------------------------
  async function saveSettings(patch: Parameters<typeof window.storyteller.saveSettings>[0]): Promise<PublicSettings> {
    const s = await window.storyteller.saveSettings(patch)
    setSettings(s)
    return s
  }

  async function changeEngine(engine: Engine): Promise<void> {
    await saveSettings({ engine })
    toast({ message: t('engine.changed', { name: t(`engine.${engine}`) }) })
  }

  async function exportAs(format: ExportFormat): Promise<void> {
    const s = storyRef.current
    if (!s) return
    await flush()
    const res = await window.storyteller.exportStory(s, format, {
      keyMoments: t('panel.keyMoments'),
      episodes: t('panel.episodes'),
      sources: t('info.sources'),
      chapter: t('common.chapter'),
      generatedBy: t('common.generatedBy'),
      translated: s.outline.translation ? t('export.translated', { lang: langName(s.outline.translation.from) }) : undefined
    })
    if (!res.ok) toast({ tone: 'error', message: res.error ?? '' })
    else if (res.data) toast({ tone: 'success', message: t('story.exported', { path: res.data }) })
  }

  async function importStory(): Promise<void> {
    const res = await window.storyteller.importStory()
    if (!res.ok) return toast({ tone: 'error', message: res.error ?? '' })
    if (!res.data) return
    await window.storyteller.saveStory(res.data)
    await openSaved(res.data.outline.id)
    refreshLibrary()
    toast({ tone: 'success', message: t('toast.imported') })
  }

  async function toggleFavoriteById(id: string): Promise<void> {
    if (storyRef.current?.outline.id === id) return updateStory((s) => ({ ...s, favorite: !s.favorite }))
    const s = await window.storyteller.getStory(id)
    if (!s) return
    await window.storyteller.saveStory({ ...s, favorite: !s.favorite })
    refreshLibrary()
  }

  async function removeStory(id: string): Promise<void> {
    await window.storyteller.removeStory(id)
    if (storyRef.current?.outline.id === id) {
      dirty.current = false
      setStory(null)
    }
    refreshLibrary()
  }

  function onContinue(): void {
    if (!continueNode) return
    if (view === 'reader') setReaderScroll(`${continueNode.id}:${Date.now()}`)
    else {
      setView('tree')
      openNode(continueNode.id)
    }
  }

  // ---- keyboard ----------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        search.current?.focus()
        return
      }
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')
      if (typing || settingsOpen || lightbox || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === '/') {
        e.preventDefault()
        search.current?.focus()
      } else if (e.key === 'Escape') {
        if (activeId) setActiveId(undefined)
        else if (filter) setFilter('')
      } else if (story && (view === 'tree' || activeId) && (e.key === 'ArrowRight' || e.key === 'j')) {
        e.preventDefault()
        goRelative(1)
      } else if (story && (view === 'tree' || activeId) && (e.key === 'ArrowLeft' || e.key === 'k')) {
        e.preventDefault()
        goRelative(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Android back button: close the innermost thing that's open, else go home, else exit.
  const backRef = useRef<() => boolean>(() => false)
  backRef.current = () => {
    if (lightbox) setLightbox(null)
    else if (settingsOpen) {
      applyAppearance(settings)
      setSettingsOpen(null)
    } else if (activeId) setActiveId(undefined)
    else if (filter) setFilter('')
    else if (story || buildError || building) goHome()
    else return false
    return true
  }
  useEffect(() => window.storyteller.onBack?.(() => backRef.current()), [])

  // ---- render ------------------------------------------------------------
  const showPanel = !!story && !!activeNode && (view === 'tree' || view === 'reader')
  const panelStatus = activeId ? status[activeId] : undefined

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={goHome} aria-label={t('story.home')} title={t('story.home')}>
          <span className="brand__mark">✦</span>
          <span className="brand__name">Storyteller</span>
        </button>
        <SearchBar ref={search} busy={!!building} onSearch={(q) => build(q)} />
        <div className="topbar__right">
          <EngineSwitch engine={settings.engine} aiReady={settings.aiReady} onChange={changeEngine} onSetup={() => setSettingsOpen('ai')} />
          <button className="icon-btn" onClick={() => setSettingsOpen('appearance')} aria-label={t('common.settings')} title={t('common.settings')}>
            <Icon name="settings" />
          </button>
        </div>
      </header>

      <main className="stage">
        {building ? (
          <BuildState query={building.query.text} step={building.step} engine={settings.engine} />
        ) : buildError ? (
          <ErrorState
            code={buildError.code}
            message={buildError.message}
            query={buildError.query.text}
            engine={settings.engine}
            aiReady={settings.aiReady}
            onRetry={() => build(buildError.query, { force: true })}
            onSettings={() => setSettingsOpen('ai')}
            onSwitchEngine={async (engine) => {
              await saveSettings({ engine })
              build(buildError.query, { force: true })
            }}
          />
        ) : story ? (
          <div className={`workspace ${showPanel ? 'has-panel' : ''}`}>
            <div className="canvas">
              <StoryHeader
                story={shown ? { ...story, outline: shown } : story}
                showOriginal={original}
                onToggleOriginal={() => setShowOriginal((v) => !v)}
                view={view}
                spoilerShield={settings.spoilerShield}
                storyDetail={settings.storyDetail}
                continueTitle={continueNode?.title ?? null}
                filter={filter}
                matchCount={matchIds ? matchIds.size : null}
                onView={setView}
                onContinue={onContinue}
                onToggleFavorite={() => updateStory((s) => ({ ...s, favorite: !s.favorite }))}
                onToggleSpoiler={() => saveSettings({ spoilerShield: !settings.spoilerShield })}
                onExport={exportAs}
                onRebuild={() => build(story.outline.query, { force: true })}
                onFilter={setFilter}
              />
              <div className="canvas__body">
                {view === 'tree' && (
                  <StoryTree
                    outline={shown ?? story.outline}
                    activeId={activeId}
                    blinkId={blinkId}
                    readIds={readIds}
                    matchIds={matchIds}
                    spoilerShield={settings.spoilerShield}
                    layout={settings.mapLayout}
                    onLayoutChange={(mapLayout) => saveSettings({ mapLayout })}
                    onSelect={(id) => openNode(id)}
                  />
                )}
                {view === 'reader' && (
                  <ReaderView
                    order={order}
                    details={shownDetails}
                    readIds={readIds}
                    matchIds={matchIds}
                    loadingIds={loadingIds}
                    needsLoad={story.outline.engine !== 'sources'}
                    scrollTo={readerScroll?.split(':')[0] ?? null}
                    onLoad={(id) => ensureDetail(id)}
                    onSeen={(id) => (story.details[id] || story.outline.engine === 'sources' ? markRead(id) : undefined)}
                    onOpen={(id) => openNode(id)}
                  />
                )}
                {view === 'characters' && (
                  <CharactersView
                    outline={story.outline}
                    details={story.details}
                    onFind={(name) => {
                      setFilter(name)
                      setView('tree')
                      toast({ message: t('chars.showing', { name }) })
                    }}
                  />
                )}
                {view === 'info' && (
                  <InfoView
                    outline={story.outline}
                    onOpen={(q) => build(q)}
                    onPlotSource={(id) => build({ ...story.outline.query, qid: story.outline.meta.qid ?? story.outline.query.qid, plotSource: id }, { force: true })}
                  />
                )}
              </div>
            </div>

            {showPanel && activeNode && (
              <NodePanel
                outline={shown ?? story.outline}
                node={activeNode}
                index={activeIndex}
                total={order.length}
                detail={shownDetails[activeNode.id]}
                showOriginal={original}
                onToggleOriginal={() => setShowOriginal((v) => !v)}
                loading={!!panelStatus?.loading}
                error={panelStatus?.error}
                highlight={highlight?.nodeId === activeNode.id ? highlight.text : null}
                canRetellAi={story.outline.engine === 'sources' && settings.aiReady && story.details[activeNode.id]?.engine !== 'ai'}
                aiAnswers={settings.engine !== 'sources' && settings.aiReady}
                onClose={() => setActiveId(undefined)}
                onPrev={activeIndex > 0 ? () => goRelative(-1) : undefined}
                onNext={activeIndex < order.length - 1 ? () => goRelative(1) : undefined}
                onRetry={() => ensureDetail(activeNode.id)}
                onRetellAi={() => ensureDetail(activeNode.id, { forceAi: true })}
                onAsk={ask}
                onAnswer={onAnswer}
                onGoTo={(id) => openNode(id)}
                onBlink={blink}
                onImage={(images, index) => setLightbox({ images, index })}
              />
            )}
          </div>
        ) : (
          <Home
            library={library}
            engine={settings.engine}
            onSearch={(q) => build(q)}
            onOpen={openSaved}
            onRemove={removeStory}
            onToggleFavorite={toggleFavoriteById}
            onImport={importStory}
          />
        )}
      </main>

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          section={settingsOpen}
          onClose={() => {
            applyAppearance(settings) // undo live preview
            setSettingsOpen(null)
          }}
          onSaved={(s) => {
            applyAppearance(s)
            setSettings(s)
            setSettingsOpen(null)
          }}
        />
      )}
      {lightbox && <Lightbox images={lightbox.images} start={lightbox.index} onClose={() => setLightbox(null)} />}
    </div>
  )
}
