// Renders the app icon to PNGs with the preinstalled Playwright Chromium.
import { createRequire } from 'node:module';
// Uses the globally installed Playwright (not a project dependency).
const { chromium } = createRequire(import.meta.url)('playwright');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa9e6"/><stop offset="1" stop-color="#1d2733"/></linearGradient></defs>
<rect width="512" height="512" rx="0" fill="url(#s)"/>
<g fill="#e9eef3"><rect x="70" y="250" width="70" height="190"/><rect x="160" y="150" width="80" height="290"/><rect x="260" y="90" width="90" height="350"/><rect x="370" y="210" width="72" height="230"/></g>
<g fill="#7f9db3"><rect x="180" y="175" width="14" height="14"/><rect x="206" y="175" width="14" height="14"/><rect x="180" y="210" width="14" height="14"/><rect x="206" y="210" width="14" height="14"/><rect x="282" y="120" width="16" height="16"/><rect x="314" y="120" width="16" height="16"/><rect x="282" y="160" width="16" height="16"/><rect x="314" y="160" width="16" height="16"/><rect x="282" y="200" width="16" height="16"/><rect x="314" y="200" width="16" height="16"/></g>
<rect x="0" y="440" width="512" height="72" fill="#3d4044"/><g fill="#e8c547"><rect x="40" y="472" width="60" height="8"/><rect x="160" y="472" width="60" height="8"/><rect x="280" y="472" width="60" height="8"/><rect x="400" y="472" width="60" height="8"/></g>
</svg>`;
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/icon-${size}.png`, omitBackground: false });
}
await browser.close();
