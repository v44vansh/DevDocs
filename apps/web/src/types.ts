export type ApiStatus = 'checking' | 'online' | 'offline'

export type DocumentStatus = 'indexed' | 'processing' | 'error'

export interface DocumentItem {
  id: string
  name: string
  type: 'PDF' | 'MD' | 'DOCX' | 'TXT' | 'HTML'
  size: string
  updatedAt: string
  chunks: number
  status: DocumentStatus
  tone: 'violet' | 'blue' | 'orange' | 'green'
}

export interface Citation {
  id: string
  title: string
  section: string
  excerpt: string
  location: string
  sourceType: 'PDF' | 'MD' | 'DOCX' | 'TXT' | 'HTML'
  confidence?: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  isStreaming?: boolean
  isError?: boolean
}

export type UploadStatus = 'uploading' | 'processing' | 'indexed' | 'error'

export interface UploadItem {
  id: string
  fileName: string
  fileSize: string
  fileType: DocumentItem['type']
  progress: number
  status: UploadStatus
  detail?: string
}
