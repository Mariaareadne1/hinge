/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// HINGE_BASE lets the GitHub Pages workflow serve from /hinge/ while local dev stays at /.
export default defineConfig({
  base: process.env.HINGE_BASE ?? '/',
  plugins: [react()],
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.test.tsx'],
    environment: 'node',
  },
})
