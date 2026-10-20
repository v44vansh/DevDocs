import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop()
const defaultBasePath = repositoryName?.endsWith('.github.io')
  ? '/'
  : repositoryName
    ? `/${repositoryName}/`
    : '/'

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || defaultBasePath,
  server: {
    port: 5173,
  },
})
