import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev-only: proxies /bidpilot to the local Express server so `npm run dev`
// (Vite on :5173) sees the API as same-origin, exactly like production does.
// Without this, the session/CSRF cookies (SameSite=Lax) would never be sent
// on API calls during local development — see backend/src/bidpilot/auth/cookies.js.
// Production never uses this file's dev server at all (see backend/server.js's
// express.static + SPA fallback), so this has no effect on the deployed app.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/bidpilot': {
        target: 'http://localhost:8788',
        changeOrigin: false,
      },
    },
  },
})
