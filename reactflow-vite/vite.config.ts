import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy Notion API requests during development
      '/notion-api': {
        target: 'https://api.notion.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/notion-api/, ''),
        headers: {
          'Authorization': 'Bearer ntn_Y4956693031esIvt8ydLIJtlx7QozKmnTq7sBV4YO4c2XJ',
          'Notion-Version': '2022-06-28',
        },
      },
    },
  },
})
