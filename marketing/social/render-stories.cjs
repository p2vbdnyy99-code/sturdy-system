// Instagram/Facebook story cards, 1080x1920. Usage: node render-stories.cjs <posts.json> <outdir> <logo.svg>
const { chromium } = require('playwright'); const fs = require('fs');
const posts = JSON.parse(fs.readFileSync(process.argv[2])); const out = process.argv[3]; const logo = fs.readFileSync(process.argv[4], 'utf8');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const css = `*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:#0b2545;color:#fff}
.c{width:1080px;height:1920px;padding:250px 90px 330px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:20px;font-weight:800;font-size:48px}.brand svg{width:1.6em;height:1.6em}.brand b{color:#f6891f}
.k{display:inline-block;background:#f6891f;color:#0b2545;font-weight:800;font-size:38px;padding:12px 26px;border-radius:99px;margin-bottom:46px}
h1{font-weight:800;line-height:1.1;margin:0;font-size:92px;letter-spacing:-.02em}ul{list-style:none;padding:0;margin:56px 0 0;font-size:50px}
li{padding-left:1.3em;position:relative;margin-top:.75em;color:#e6edf6;line-height:1.3}li:before{content:"";position:absolute;left:0;top:.45em;width:.5em;height:.5em;border-radius:50%;background:#f6891f}
.f{font-size:40px;color:#a9b8cc;line-height:1.4}.f b{color:#fff}`;
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
 for (const s of posts) {
  await p.setContent(`<style>${css}</style><div class="c"><div class="brand">${logo}<span>Tender<b>Tez</b></span></div>
   <div><span class="k">${esc(s.kicker||'Aaj ka tender tip')}</span><h1>${esc(s.h)}</h1><ul>${s.l.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
   <div class="f">Tender ka apna clause hi tay karta hai.<br><b>Roz naye reels: 12:30 aur 6 baje</b> · tendertez.in</div></div>`);
  await p.screenshot({ path: `${out}/story-${s.d}-${s.k}.jpg`, type: 'jpeg', quality: 90 }); console.log(s.d, s.k);
 } await b.close(); })();
