const { chromium } = require('playwright'); const fs = require('fs');
const posts = JSON.parse(fs.readFileSync(__dirname + '/posts.json')); const out = process.argv[2];
const logo = fs.readFileSync(process.argv[3], 'utf8');
const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const css = `*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;background:#0b2545;color:#fff}
.brand{display:flex;align-items:center;gap:20px;font-weight:800}.brand svg{width:1.6em;height:1.6em}.brand b{color:#f6891f}
h1{font-weight:800;line-height:1.12;margin:0;letter-spacing:-.02em}li,p{line-height:1.35}ul{list-style:none;padding:0;margin:0}
li{padding-left:1.3em;position:relative;margin-top:.7em;color:#e6edf6}li:before{content:"";position:absolute;left:0;top:.45em;width:.5em;height:.5em;border-radius:50%;background:#f6891f}
.foot{color:#a9b8cc}`;
const brand = `<div class="brand">${logo}<span>Tender<b>Tez</b></span></div>`;
const card = (p, w, h, video) => `<style>${css}.c{width:${w}px;height:${h}px;padding:${video?120:90}px 90px;display:flex;flex-direction:column;justify-content:space-between}
.brand{font-size:44px}h1{font-size:${video?92:78}px}ul{font-size:${video?48:40}px;margin-top:50px}.foot{font-size:32px}</style>
<div class="c">${brand}<div><h1>${esc(p.h)}</h1><ul>${p.l.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="foot">The tender's own clause decides. Guides and a free EMD calculator: tendertez.in</div></div>`;
const cover = (w, h, fs1, pad) => `<style>${css}.c{width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:${pad}px}
.brand{font-size:${fs1}px;justify-content:center}h1{font-size:${fs1*0.62}px;margin-top:.5em;font-weight:700}p{font-size:${fs1*0.42}px;color:#a9b8cc;margin:.6em 0 0}</style>
<div class="c">${brand}<h1>AI tender analysis for Indian government tenders</h1><p>Every point with its page number · First 5 tenders free · tendertez.in</p></div>`;
(async () => { const b = await chromium.launch();
 const shot = async (html, w, h, file) => { const p = await b.newPage({ viewport: { width: w, height: h } }); await p.setContent(html); await p.screenshot({ path: file, type: file.endsWith('.jpg') ? 'jpeg' : 'png', quality: file.endsWith('.jpg') ? 92 : undefined }); await p.close(); };
 for (const p of posts) await shot(card(p, 1080, 1080), 1080, 1080, `${out}/${p.d}-${p.k}.jpg`);
 await shot(cover(1500, 500, 84, 40), 1500, 500, `${out}/cover-x-1500x500.png`);
 await shot(cover(1640, 624, 92, 60), 1640, 624, `${out}/cover-facebook-1640x624.png`);
 await shot(cover(2560, 1440, 96, 500), 2560, 1440, `${out}/cover-youtube-2560x1440.png`);
 await shot(cover(1128, 191, 44, 10), 1128, 191, `${out}/cover-linkedin-1128x191.png`);
 // video slides: EMD short
 const slides = [
  {h:'How much EMD does your tender need?', l:['Work it out in 3 steps.']},
  {h:'1. Find the value the tender names', l:['Estimated cost or estimated value.','Example: Rs. 40,35,586.00 (a real AIIMS Bhubaneswar tender).']},
  {h:'2. Find the EMD percentage', l:['GFR Rule 170: ordinarily 2% to 5%.','Example: 2% of the estimated value.']},
  {h:'3. Multiply', l:['2% of Rs. 40,35,586.00','= Rs. 80,711.72']},
  {h:'Check before you pay', l:['Is there an exemption clause?','Did a corrigendum change the EMD?','The tender\'s own clause decides.']},
  {h:'Free EMD calculator', l:['tendertez.in/guides/emd-calculator','No sign-in needed.']}];
 let i = 0; for (const s of slides) await shot(card(s, 1080, 1920, true), 1080, 1920, `${__dirname}/slide${i++}.png`);
 await b.close(); })();
