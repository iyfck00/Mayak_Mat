import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Mayak_Mat/',
  plugins: [react()],
  server: {
    host: true
  }
})