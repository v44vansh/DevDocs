import type { Citation, ChatMessage } from '../types'

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
export const API_PREFIX = '/api/v1'

export interface ApiKnowledgeBase {
  id: string
  name: string
  description: string
  document_count: number
  created_at: string
}

export interface ApiDocument {
  id: string
  title: string
  filename: string
  content_type: string
  created_at: string
  chunk_count: number
}

export interface ApiChatResponse {
  model: string
  answer: string
  citations: Array<{
    chunk_id: string
    document_id: string
    document_name: string
    heading?: string | null
    score: number
    excerpt: string
  }>
}

export function apiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

function jsonHeaders(token?: string) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function parseError(response: Response, fallback: string) {
  try {
    const payload = await response.json() as { detail?: string }
    return payload.detail || fallback
  } catch {
    return fallback
  }
}

export async function checkApiHealth(signal?: AbortSignal) {
  const response = await fetch(apiUrl('/health'), { signal })
  if (!response.ok) throw new Error(`Health check failed (${response.status})`)
  return true
}

export async function login(username = 'demo', password = 'demo') {
  const response = await fetch(apiUrl(`${API_PREFIX}/auth/login`), {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw new Error(await parseError(response, `Login failed (${response.status})`))
  return await response.json() as { access_token: string; username: string }
}

export async function listKnowledgeBases(token: string) {
  const response = await fetch(apiUrl(`${API_PREFIX}/knowledge-bases`), { headers: jsonHeaders(token) })
  if (!response.ok) throw new Error(await parseError(response, `Could not load knowledge bases (${response.status})`))
  return await response.json() as { items: ApiKnowledgeBase[] }
}

export async function createKnowledgeBase(token: string, name = 'My documentation') {
  const response = await fetch(apiUrl(`${API_PREFIX}/knowledge-bases`), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ name, description: 'Local DevDocs AI knowledge base' }),
  })
  if (!response.ok) throw new Error(await parseError(response, `Could not create knowledge base (${response.status})`))
  return await response.json() as ApiKnowledgeBase
}

export async function listDocuments(token: string, knowledgeBaseId: string) {
  const response = await fetch(apiUrl(`${API_PREFIX}/knowledge-bases/${knowledgeBaseId}/documents`), {
    headers: jsonHeaders(token),
  })
  if (!response.ok) throw new Error(await parseError(response, `Could not load documents (${response.status})`))
  return await response.json() as { items: ApiDocument[] }
}

export async function uploadDocument(token: string, knowledgeBaseId: string, file: File, onProgress?: (progress: number) => void) {
  const formData = new FormData()
  formData.append('file', file)
  onProgress?.(18)

  const response = await fetch(apiUrl(`${API_PREFIX}/knowledge-bases/${knowledgeBaseId}/documents`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!response.ok) throw new Error(await parseError(response, `Upload failed (${response.status})`))
  onProgress?.(100)
  return await response.json() as ApiDocument
}

export async function askKnowledgeBase(token: string, knowledgeBaseId: string, message: string, topK = 5) {
  const response = await fetch(apiUrl(`${API_PREFIX}/knowledge-bases/${knowledgeBaseId}/chat`), {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ message, top_k: topK }),
  })
  if (!response.ok) throw new Error(await parseError(response, `Chat request failed (${response.status})`))
  return await response.json() as ApiChatResponse
}

export function toCitation(citation: ApiChatResponse['citations'][number], documents: ApiDocument[]): Citation {
  const document = documents.find((item) => item.id === citation.document_id)
  const fileName = document?.filename || citation.document_name
  const extension = fileName.split('.').pop()?.toUpperCase()
  const sourceType = extension === 'HTML' || extension === 'HTM' ? 'HTML' : extension === 'MARKDOWN' || extension === 'MDOWN' ? 'MD' : extension === 'PDF' ? 'PDF' : extension === 'DOCX' ? 'DOCX' : 'TXT'
  return {
    id: citation.chunk_id,
    title: citation.document_name,
    section: citation.heading || 'Document content',
    excerpt: citation.excerpt,
    location: citation.heading ? `Section: ${citation.heading}` : 'Indexed chunk',
    sourceType,
    confidence: citation.score,
  }
}

// Kept as a small compatibility type for callers that want to render a local
// conversation before the server responds. The current MVP uses JSON chat;
// streaming can be added behind the same interface later.
export type StreamEvent =
  | { type: 'token'; value: string }
  | { type: 'citation'; value: Citation }
  | { type: 'done' }

export type ChatHistory = ChatMessage[]
