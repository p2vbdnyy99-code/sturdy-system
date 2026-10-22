// drizzle-kit config — used only to GENERATE migration SQL from the schema
// (`npx drizzle-kit generate`). It is a dev-time tool; nothing in the running
// server imports it. Reads DATABASE_URL from the environment so it always
// targets whichever database you point it at (local dev by default here) —
// never hardcode a connection string.
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  // Keeps generated SQL readable/reviewable (see WHATSAPP_SETUP.md-style
  // "commit only what you can read before applying to prod" discipline).
  verbose: true,
  strict: true,
});
