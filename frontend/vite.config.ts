import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
      // Use local shims for leaflet packages - must come before other aliases
      'leaflet': path.resolve(__dirname, './src/app/shims/leaflet.ts'),
      'react-leaflet': path.resolve(__dirname, './src/app/shims/react-leaflet.tsx'),
      '@react-leaflet/core': path.resolve(__dirname, './src/app/shims/react-leaflet-core.tsx'),
    },
  },
  optimizeDeps: {
    exclude: ['leaflet', 'react-leaflet', '@react-leaflet/core'],
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
  server: {
    host: true,
    allowedHosts: [
      'maizeyieldhub.bigdataghana.com',
      'localhost',
    ],
  },
})
