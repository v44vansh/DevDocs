import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Bot,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudUpload,
  Command,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  FileType2,
  FolderOpen,
  Gauge,
  Inbox,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import {
  askKnowledgeBase,
  checkApiHealth,
  createKnowledgeBase,
  listDocuments,
  listKnowledgeBases,
  login,
  toCitation,
  uploadDocument,
  type ApiDocument,
} from './lib/api'
import type { ApiStatus, Citation, ChatMessage, DocumentItem, UploadItem, UploadStatus } from './types'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const SESSION_TOKEN_KEY = 'devdocs.access_token'
const SESSION_KB_KEY = 'devdocs.knowledge_base_id'

const PREVIEW_DOCUMENTS: DocumentItem[] = [
  {
    id: 'preview-1',
    name: 'Platform architecture overview',
    type: 'PDF',
    size: '4.8 MB',
    updatedAt: 'Today, 9:42 AM',
    chunks: 248,
    status: 'indexed',
    tone: 'violet',
  },
  {
    id: 'preview-2',
    name: 'API authentication guide',
    type: 'MD',
    size: '18 KB',
    updatedAt: 'Yesterday',
    chunks: 86,
    status: 'indexed',
    tone: 'blue',
  },
  {
    id: 'preview-3',
    name: 'Incident response runbook',
    type: 'DOCX',
    size: '1.2 MB',
    updatedAt: 'Oct 16, 2024',
    chunks: 124,
    status: 'indexed',
    tone: 'orange',
  },
  {
    id: 'preview-4',
    name: 'Frontend contribution notes',
    type: 'TXT',
    size: '9 KB',
    updatedAt: 'Oct 14, 2024',
    chunks: 42,
    status: 'processing',
    tone: 'green',
  },
]

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'Ask anything about your engineering docs. I’ll keep answers grounded in your connected sources and show the exact passages used.',
  },
]

const quickQuestions = ['How do I rotate an API key?', 'Where is the deploy checklist?', 'Summarize the auth flow']

const navItems: Array<{ label: string; icon: LucideIcon; count?: string }> = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Documents', icon: FolderOpen, count: '12' },
  { label: 'Activity', icon: Activity },
]

const secondaryNavItems: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Team members', icon: UserRound },
  { label: 'Settings', icon: Settings },
]

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileType(fileName: string): DocumentItem['type'] | null {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'PDF'
  if (extension === 'md' || extension === 'markdown') return 'MD'
  if (extension === 'mdown') return 'MD'
  if (extension === 'docx') return 'DOCX'
  if (extension === 'txt' || extension === 'text') return 'TXT'
  if (extension === 'html' || extension === 'htm') return 'HTML'
  return null
}

function toneForType(type: DocumentItem['type']): DocumentItem['tone'] {
  return ({ PDF: 'violet', MD: 'blue', DOCX: 'orange', TXT: 'green', HTML: 'blue' } as const)[type]
}

function documentFromApi(document: ApiDocument): DocumentItem {
  const type = getFileType(document.filename) || 'TXT'
  return {
    id: document.id,
    name: document.title,
    type,
    size: 'Indexed locally',
    updatedAt: new Date(document.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    chunks: document.chunk_count,
    status: 'indexed',
    tone: toneForType(type),
  }
}

function fileIcon(type: DocumentItem['type'], size = 18) {
  const Icon = type === 'PDF' ? FileType2 : type === 'MD' ? FileCode2 : FileText
  return <Icon size={size} strokeWidth={1.8} />
}

function ApiStatusPill({ status, onRetry }: { status: ApiStatus; onRetry: () => void }) {
  if (status === 'checking') {
    return (
      <div className="api-pill is-checking" role="status" data-testid="api-status">
        <Loader2 className="spin" size={13} />
        Checking local API
      </div>
    )
  }

  if (status === 'online') {
    return (
      <div className="api-pill is-online" role="status" data-testid="api-status">
        <span className="status-dot" />
        Local API connected
      </div>
    )
  }

  return (
    <button className="api-pill is-offline" onClick={onRetry} type="button" data-testid="api-status">
      <span className="status-dot" />
      API unavailable
      <RefreshCw size={12} />
    </button>
  )
}

function StatusBadge({ status }: { status: DocumentItem['status'] }) {
  if (status === 'indexed') {
    return (
      <span className="status-badge status-indexed">
        <Check size={12} strokeWidth={2.6} /> Indexed
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="status-badge status-processing">
        <Loader2 className="spin" size={12} /> Processing
      </span>
    )
  }
  return (
    <span className="status-badge status-error">
      <AlertCircle size={12} /> Error
    </span>
  )
}

export function CitationCard({ citation }: { citation: Citation }) {
  return (
    <article className="citation-card" data-testid="citation-card">
      <div className="citation-card-header">
        <span className={`source-file-icon source-${citation.sourceType.toLowerCase()}`}>{fileIcon(citation.sourceType, 14)}</span>
        <div className="citation-heading">
          <strong>{citation.title}</strong>
          <span>{citation.section}</span>
        </div>
        <span className="citation-location">{citation.location}</span>
      </div>
      <p className="citation-excerpt">“{citation.excerpt}”</p>
      <details className="source-preview">
        <summary>
          <span>Preview source</span>
          <ExternalLink size={13} />
        </summary>
        <div className="source-preview-body">
          <div className="preview-line-number">{citation.location.replace(/[^0-9]/g, '') || '1'}</div>
          <p>{citation.excerpt}</p>
        </div>
      </details>
    </article>
  )
}

function ChatMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`chat-message ${isUser ? 'from-user' : 'from-assistant'}`} data-testid={`message-${message.role}`}>
      {!isUser && (
        <div className="assistant-avatar">
          <Sparkles size={15} />
        </div>
      )}
      <div className="message-body">
        <div className={`message-bubble ${message.isError ? 'message-error' : ''}`}>
          {message.content || <span className="typing-dots"><i /><i /><i /></span>}
          {message.isStreaming && message.content && <span className="stream-cursor" />}
        </div>
        {!isUser && message.isError && (
          <div className="message-error-detail">
            <AlertTriangle size={13} />
            Check the API status above and try again when the local service is running.
          </div>
        )}
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="citation-list">
            <div className="citation-list-label"><BookOpen size={13} /> Sources used</div>
            {message.citations.map((citation) => <CitationCard citation={citation} key={citation.id} />)}
          </div>
        )}
        {!isUser && !message.isStreaming && !message.isError && message.content && (
          <div className="message-actions" aria-label="Answer feedback">
            <button type="button" aria-label="Helpful"><Check size={13} /></button>
            <button type="button" aria-label="Not helpful"><AlertCircle size={13} /></button>
            <button type="button" aria-label="Copy answer"><ExternalLink size={13} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function UploadRow({ item }: { item: UploadItem }) {
  const icon = item.status === 'indexed' ? <CheckCircle2 size={16} /> : item.status === 'error' ? <AlertCircle size={16} /> : item.status === 'processing' ? <Loader2 className="spin" size={16} /> : <CloudUpload size={16} />
  const statusText: Record<UploadStatus, string> = {
    uploading: 'Uploading',
    processing: 'Indexing in background',
    indexed: 'Ready to search',
    error: 'Could not upload',
  }

  return (
    <div className={`upload-row upload-${item.status}`}>
      <span className={`upload-file-icon source-${item.fileType.toLowerCase()}`}>{fileIcon(item.fileType, 15)}</span>
      <div className="upload-row-main">
        <div className="upload-row-name"><strong>{item.fileName}</strong><span>{item.fileSize}</span></div>
        <div className="upload-progress-track"><span style={{ width: `${item.progress}%` }} /></div>
        <div className="upload-row-status">{icon}<span>{item.detail || statusText[item.status]}</span></div>
      </div>
      {item.status === 'indexed' && <Check className="upload-done" size={16} />}
    </div>
  )
}

function UploadDialog({
  uploads,
  onClose,
  onFiles,
}: {
  uploads: UploadItem[]
  onClose: () => void
  onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const selectFiles = (files: FileList | File[]) => onFiles(Array.from(files))
  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    selectFiles(event.dataTransfer.files)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="upload-dialog" role="dialog" aria-modal="true" aria-labelledby="upload-title">
        <header className="dialog-header">
          <div>
            <span className="eyebrow">Knowledge base</span>
            <h2 id="upload-title">Add documents</h2>
            <p>Give your workspace more context to search and chat over.</p>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close upload dialog"><X size={18} /></button>
        </header>
        <div
          className={`drop-zone ${isDragging ? 'is-dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setIsDragging(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
        >
          <div className="drop-icon"><UploadCloud size={25} /></div>
          <strong>Drop files here or <span>browse</span></strong>
          <small>PDF, Markdown, DOCX, TXT, or HTML · up to 5 MB each</small>
          <input
            ref={inputRef}
            data-testid="upload-input"
            type="file"
            hidden
            multiple
            accept=".pdf,.md,.markdown,.mdown,.docx,.txt,.text,.html,.htm"
            onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) selectFiles(event.target.files); event.target.value = '' }}
          />
        </div>
        {uploads.length > 0 && (
          <div className="upload-queue">
            <div className="queue-header"><strong>Recent uploads</strong><span>{uploads.length} file{uploads.length === 1 ? '' : 's'}</span></div>
            {uploads.map((item) => <UploadRow item={item} key={item.id} />)}
          </div>
        )}
        <footer className="dialog-footer">
          <div><ShieldCheck size={14} /> Files stay in your configured workspace</div>
          <button className="button button-secondary" type="button" onClick={onClose}>Done</button>
        </footer>
      </section>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, detail, accent }: { icon: LucideIcon; label: string; value: string; detail: string; accent: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}><Icon size={17} /></div>
      <div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
      <ArrowUpRight className="stat-arrow" size={15} />
    </div>
  )
}

function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')
  const [activeView, setActiveView] = useState('Overview')
  const [documents, setDocuments] = useState<DocumentItem[]>(PREVIEW_DOCUMENTS)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES)
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [documentFilter, setDocumentFilter] = useState('')
  const [authToken, setAuthToken] = useState(() => sessionStorage.getItem(SESSION_TOKEN_KEY) || '')
  const [knowledgeBaseId, setKnowledgeBaseId] = useState(() => sessionStorage.getItem(SESSION_KB_KEY) || '')
  const [serverDocuments, setServerDocuments] = useState<ApiDocument[]>([])

  const runHealthCheck = () => {
    setApiStatus('checking')
    void (async () => {
      try {
        await checkApiHealth()
        let token = authToken || sessionStorage.getItem(SESSION_TOKEN_KEY) || ''
        if (!token) {
          const session = await login()
          token = session.access_token
          sessionStorage.setItem(SESSION_TOKEN_KEY, token)
          setAuthToken(token)
        }

        const bases = await listKnowledgeBases(token)
        const base = bases.items[0] || await createKnowledgeBase(token)
        sessionStorage.setItem(SESSION_KB_KEY, base.id)
        setKnowledgeBaseId(base.id)
        const loadedDocuments = await listDocuments(token, base.id)
        setServerDocuments(loadedDocuments.items)
        setDocuments(loadedDocuments.items.map(documentFromApi))
        setApiStatus('online')
      } catch {
        setApiStatus('offline')
        setDocuments(PREVIEW_DOCUMENTS)
      }
    })()
  }

  useEffect(() => {
    runHealthCheck()
  }, [])

  const indexedCount = useMemo(() => documents.reduce((count, document) => count + (document.status === 'indexed' ? 1 : 0), 0), [documents])
  const totalChunks = useMemo(() => documents.reduce((count, document) => count + document.chunks, 0), [documents])
  const visibleDocuments = useMemo(() => {
    const query = documentFilter.trim().toLowerCase()
    return query ? documents.filter((document) => document.name.toLowerCase().includes(query) || document.type.toLowerCase() === query) : documents
  }, [documentFilter, documents])

  const updateUpload = (id: string, update: Partial<UploadItem>) => {
    setUploads((current) => current.map((item) => item.id === id ? { ...item, ...update } : item))
  }

  const processFile = async (file: File, id: string, type: DocumentItem['type']) => {
    updateUpload(id, { status: 'uploading', progress: 12 })
    try {
      if (!authToken || !knowledgeBaseId) throw new Error('Local API unavailable')
      const result = await uploadDocument(authToken, knowledgeBaseId, file, (progress) => updateUpload(id, { progress }))
      const isIndexed = true
      const document: DocumentItem = {
        id: result.id,
        name: result.title,
        type,
        size: formatBytes(file.size),
        updatedAt: 'Just now',
        chunks: result.chunk_count,
        status: isIndexed ? 'indexed' : 'processing',
        tone: toneForType(type),
      }
      setServerDocuments((current) => [result, ...current.filter((item) => item.id !== result.id)])
      setDocuments((current) => [document, ...current.filter((item) => item.id !== id)])
      updateUpload(id, {
        status: isIndexed ? 'indexed' : 'processing',
        progress: 100,
        detail: 'Ready to search',
      })
    } catch (error) {
      updateUpload(id, {
        status: 'error',
        progress: 100,
        detail: error instanceof Error && error.message.includes('fetch')
          ? 'Local API unavailable'
          : error instanceof Error ? error.message : 'Please try again',
      })
      setNotice('Upload could not reach the local API. Your file was not marked as indexed.')
    }
  }

  const handleFiles = (files: File[]) => {
    files.forEach((file) => {
      const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const type = getFileType(file.name)
      const upload: UploadItem = {
        id,
        fileName: file.name,
        fileSize: formatBytes(file.size),
        fileType: type || 'TXT',
        progress: 0,
        status: 'error',
      }
      if (!type) {
        upload.detail = 'Unsupported file type'
        setUploads((current) => [upload, ...current])
        return
      }
      if (file.size > MAX_FILE_SIZE) {
        upload.detail = 'File is larger than 20 MB'
        setUploads((current) => [upload, ...current])
        return
      }
      setUploads((current) => [upload, ...current])
      void processFile(file, id, type)
    })
  }

  const addAssistantError = (id: string, content: string) => {
    setMessages((current) => current.map((message) => message.id === id ? { ...message, content, isStreaming: false, isError: true } : message))
  }

  const submitQuestion = async (question: string) => {
    const content = question.trim()
    if (!content || isSending) return
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', content }
    const assistantId = `assistant-${Date.now()}`
    const assistantMessage: ChatMessage = { id: assistantId, role: 'assistant', content: '', isStreaming: true, citations: [] }
    setMessages((current) => [...current, userMessage, assistantMessage])
    setChatInput('')
    setIsSending(true)

    if (apiStatus !== 'online' || !authToken || !knowledgeBaseId) {
      addAssistantError(assistantId, 'I can’t answer yet because the local API is unavailable. Start the backend and retry this question.')
      setIsSending(false)
      return
    }

    try {
      const response = await askKnowledgeBase(authToken, knowledgeBaseId, content)
      const citations = response.citations.map((citation) => toCitation(citation, serverDocuments))
      setMessages((current) => current.map((message) => message.id === assistantId
        ? { ...message, content: response.answer, citations, isStreaming: false }
        : message))
    } catch (error) {
      addAssistantError(assistantId, error instanceof Error && error.message.includes('fetch')
        ? 'I couldn’t reach the local API. No answer was generated.'
        : 'The API stopped before completing this answer. Please try again.')
      setApiStatus('offline')
    } finally {
      setIsSending(false)
    }
  }

  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submitQuestion(chatInput)
  }

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitQuestion(chatInput)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark"><Sparkles size={17} fill="currentColor" /></div>
          <span>DevDocs <b>AI</b></span>
        </div>
        <button className="workspace-switcher" type="button">
          <span className="workspace-avatar">AC</span>
          <span className="workspace-info"><strong>Acme / Engineering</strong><small>Workspace</small></span>
          <ChevronDown size={15} />
        </button>
        <div className="sidebar-label">Workspace</div>
        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon, count }) => (
            <button className={`nav-item ${activeView === label ? 'is-active' : ''}`} type="button" key={label} onClick={() => setActiveView(label)}>
              <Icon size={17} /> <span>{label}</span>{count && <em>{count}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-label second-label">Manage</div>
        <nav className="main-nav" aria-label="Manage navigation">
          {secondaryNavItems.map(({ label, icon: Icon }) => <button className="nav-item" type="button" key={label}><Icon size={17} /> <span>{label}</span></button>)}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-icon"><CircleHelp size={15} /></div>
          <div><strong>Need a hand?</strong><span>Read the quickstart guide</span></div>
          <ArrowUpRight size={14} />
        </div>
        <div className="user-profile">
          <div className="user-avatar">JD</div>
          <div><strong>Jordan Davis</strong><span>jordan@acme.dev</span></div>
          <MoreHorizontal size={16} />
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><PanelLeft size={18} /> <strong>DevDocs <b>AI</b></strong></div>
          <div className="topbar-search"><Search size={16} /><span>Search workspace</span><kbd><Command size={11} /> K</kbd></div>
          <div className="topbar-actions"><ApiStatusPill status={apiStatus} onRetry={runHealthCheck} /><button className="topbar-icon" type="button" aria-label="Notifications"><Inbox size={17} /><i /></button><button className="topbar-icon" type="button" aria-label="Help"><CircleHelp size={17} /></button></div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div><span className="eyebrow">{activeView === 'Overview' ? 'Workspace overview' : activeView}</span><h1>{activeView === 'Overview' ? 'Good morning, Jordan' : activeView}</h1><p>{activeView === 'Overview' ? 'Your team’s knowledge, organized and ready to query.' : `Manage your ${activeView.toLowerCase()} from one calm workspace.`}</p></div>
            <div className="heading-actions"><button className="button button-ghost" type="button"><MessageCircle size={16} /> Share feedback</button><button className="button button-primary" type="button" onClick={() => setIsUploadOpen(true)}><Plus size={17} /> Upload document</button></div>
          </div>

          {apiStatus === 'offline' && <div className="connection-banner" role="alert"><div className="banner-icon"><AlertTriangle size={16} /></div><div><strong>Local API unavailable</strong><span>Showing clearly labeled preview data. Connect the API at <code>VITE_API_BASE_URL</code> to enable real chat and document indexing.</span></div><button type="button" onClick={runHealthCheck}><RefreshCw size={14} /> Retry</button></div>}
          {notice && <div className="toast-notice" role="status"><AlertCircle size={15} /><span>{notice}</span><button type="button" aria-label="Dismiss notice" onClick={() => setNotice('')}><X size={14} /></button></div>}

          <section className="stats-grid" aria-label="Workspace metrics">
            <StatCard icon={Database} label="Documents" value={apiStatus === 'offline' ? '12' : String(documents.length)} detail={apiStatus === 'offline' ? 'Preview workspace' : `${indexedCount} indexed`} accent="stat-violet" />
            <StatCard icon={Zap} label="Indexed chunks" value={apiStatus === 'offline' ? '48.2k' : totalChunks.toLocaleString()} detail="Across your sources" accent="stat-orange" />
            <StatCard icon={Gauge} label="Answer coverage" value="98.4%" detail="+4.8% this week" accent="stat-blue" />
            <StatCard icon={ShieldCheck} label="Source health" value="Good" detail="Last checked just now" accent="stat-green" />
          </section>

          <div className="workspace-grid">
            <section className="panel documents-panel">
              <div className="panel-heading"><div><span className="eyebrow">Your sources</span><h2>Knowledge base</h2></div><button className="text-button" type="button" onClick={() => setIsUploadOpen(true)}>Manage documents <ArrowUpRight size={14} /></button></div>
              <div className="table-toolbar"><div className="mini-search"><Search size={14} /><input aria-label="Filter documents" placeholder="Filter documents" value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)} /></div><button className="filter-button" type="button">All types <ChevronDown size={14} /></button></div>
              <div className="document-table" role="table" aria-label="Knowledge base documents">
                <div className="table-header" role="row"><span>Document</span><span>Status</span><span>Chunks</span><span>Updated</span><span /></div>
                {visibleDocuments.map((document) => (
                  <div className="document-row" role="row" key={document.id}>
                    <div className="document-name"><span className={`document-icon tone-${document.tone}`}>{fileIcon(document.type)}</span><div><strong>{document.name}</strong><span>{document.type} · {document.size}</span></div></div>
                    <StatusBadge status={document.status} />
                    <span className="table-number">{document.chunks || '—'}</span>
                    <span className="table-date">{document.updatedAt}</span>
                    <button className="row-menu" type="button" aria-label={`More options for ${document.name}`}><MoreHorizontal size={16} /></button>
                  </div>
                ))}
                {visibleDocuments.length === 0 && <div className="empty-table-state" role="status"><Inbox size={20} /><strong>No documents found</strong><span>Try a different filter or upload a new source.</span></div>}
              </div>
              <div className="panel-footer"><span><span className="live-dot" /> {apiStatus === 'offline' ? 'Preview data · API disconnected' : `${documents.length} documents in workspace`}</span><button className="text-button" type="button">View all <ArrowUpRight size={14} /></button></div>
            </section>

            <section className="panel chat-panel">
              <div className="chat-heading"><div className="chat-title"><div className="chat-avatar"><Sparkles size={16} /></div><div><h2>Ask your workspace</h2><span><span className={`tiny-status ${apiStatus}`} /> {apiStatus === 'online' ? 'Ready to answer' : 'Waiting for local API'}</span></div></div><button className="row-menu" type="button" aria-label="Chat options"><MoreHorizontal size={17} /></button></div>
              <div className="chat-scroll" aria-live="polite">
                {messages.map((message) => <ChatMessageBubble key={message.id} message={message} />)}
              </div>
              <div className="quick-prompts"><span>Try asking</span>{quickQuestions.map((question) => <button key={question} type="button" onClick={() => void submitQuestion(question)}>{question}</button>)}</div>
              <form className="chat-composer" onSubmit={handleChatSubmit}>
                <textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={handleChatKeyDown} placeholder={apiStatus === 'online' ? 'Ask about your docs…' : 'Connect the local API to start chatting…'} aria-label="Ask your workspace" rows={1} />
                <div className="composer-footer"><span><Command size={11} /> Enter to send <span className="composer-separator">·</span> Shift + Enter for new line</span><button className="send-button" type="submit" disabled={!chatInput.trim() || isSending} aria-label="Send question">{isSending ? <Loader2 className="spin" size={16} /> : <Send size={16} />}</button></div>
              </form>
            </section>
          </div>
          <div className="bottom-note"><div><Sparkles size={14} /> <strong>DevDocs AI</strong> keeps every answer tied to a source.</div><span>Preview workspace · v0.1</span></div>
        </div>
      </main>
      {isUploadOpen && <UploadDialog uploads={uploads} onClose={() => setIsUploadOpen(false)} onFiles={handleFiles} />}
    </div>
  )
}

export default App
