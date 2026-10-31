// Build step after `vite build --ssr`: renders every server-rendered public
// page once and fails the build if one has no H1 or almost no text, so a
// page that silently renders empty never ships.
import { render, PRERENDER_PATHS } from '../dist-ssr/prerender.js';

const MIN_WORDS = 150;
const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

let failed = false;
for (const path of PRERENDER_PATHS) {
  const html = render(path);
  const n = words(html);
  const ok = /<h1[\s>]/.test(html) && n >= MIN_WORDS;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${path} ${n} words`);
  if (!ok) failed = true;
}
if (failed) {
  console.error(`check-prerender: every page needs an H1 and at least ${MIN_WORDS} words`);
  process.exit(1);
}
