import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App, { CitationCard } from './App'
import type { Citation } from './types'

const citation: Citation = {
  id: 'auth-1',
  title: 'API authentication guide',
  section: 'Token rotation',
  excerpt: 'Create a replacement token before revoking the active key so in-flight requests can finish safely.',
  location: 'p. 4',
  sourceType: 'MD',
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('citation rendering', () => {
  it('renders citation metadata and expands an inline source preview', async () => {
    const user = userEvent.setup()
    render(<CitationCard citation={citation} />)

    expect(screen.getByText('API authentication guide')).toBeInTheDocument()
    expect(screen.getByText('Token rotation')).toBeInTheDocument()
    expect(screen.getByText('p. 4')).toBeInTheDocument()

    await user.click(screen.getByText('Preview source'))

    expect(screen.getByText(citation.excerpt)).toBeVisible()
  })
})

describe('chat and upload states', () => {
  it('renders a grounded answer and citations from the local API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/health')) return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ access_token: 'test-token', username: 'demo' }), { status: 200 })
      if (url.endsWith('/knowledge-bases') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'kb-1', name: 'Docs', description: '', document_count: 0, created_at: new Date().toISOString() }), { status: 201 })
      }
      if (url.endsWith('/knowledge-bases')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
      if (url.endsWith('/documents') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'doc-2', title: 'onboarding.md', filename: 'onboarding.md', content_type: 'text/markdown', created_at: new Date().toISOString(), chunk_count: 2 }), { status: 201 })
      }
      if (url.endsWith('/documents')) return new Response(JSON.stringify({ items: [] }), { status: 200 })
      if (url.endsWith('/chat')) {
        return new Response(JSON.stringify({
          model: 'local-grounded',
          answer: 'Rotate keys safely.',
          citations: [{ chunk_id: citation.id, document_id: 'doc-1', document_name: citation.title, heading: citation.section, score: 0.9, excerpt: citation.excerpt }],
        }), { status: 200 })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('api-status')).toHaveTextContent('Local API connected'))

    await user.type(screen.getByRole('textbox', { name: 'Ask your workspace' }), 'How do I rotate a key?')
    await user.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Rotate keys safely.')).toBeInTheDocument()
    expect(await screen.findByTestId('citation-card')).toBeInTheDocument()
    expect(screen.getByText('API authentication guide')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/knowledge-bases/kb-1/chat'), expect.objectContaining({ method: 'POST' }))

    await user.click(screen.getByRole('button', { name: 'Upload document' }))
    fireEvent.change(screen.getByTestId('upload-input'), {
      target: { files: [new File(['# onboarding'], 'onboarding.md', { type: 'text/markdown' })] },
    })
    expect(await screen.findByText('Ready to search')).toBeInTheDocument()
  })

  it('shows an explicit upload error when the local API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch') }))

    const user = userEvent.setup()
    render(<App />)
    await waitFor(() => expect(screen.getByTestId('api-status')).toHaveTextContent('API unavailable'))

    await user.click(screen.getByRole('button', { name: 'Upload document' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const file = new File(['# onboarding'], 'onboarding.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByTestId('upload-input'), { target: { files: [file] } })

    expect(await screen.findByText('onboarding.md')).toBeInTheDocument()
    expect(await screen.findAllByText('Local API unavailable')).toHaveLength(2)
    expect(screen.getByText(/Your file was not marked as indexed/)).toBeInTheDocument()
  })
})
