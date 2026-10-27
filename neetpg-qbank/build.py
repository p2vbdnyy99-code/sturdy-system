"""Pack data/*.json and img/* into index.html so the page needs no extra downloads.
Run after editing any data file:  python3 build.py"""
import base64, json, pathlib, re
root = pathlib.Path(__file__).parent
data = {p.name: json.loads(p.read_text()) for p in sorted((root/"data").glob("*.json"))}
img = {f"img/{p.name}": "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode() for p in sorted((root/"img").glob("*.jpg"))}
payload = json.dumps({"data": data, "img": img}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
html = (root/"index.html").read_text()
block = f'<script type="application/json" id="bundle">{payload}</script>'
start, end = "<!-- bundle:start -->", "<!-- bundle:end -->"
if start in html:
    html = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda m: f"{start}{block}{end}", html, flags=re.S)
else:
    html = html.replace("<script>\n\"use strict\";", f"{start}{block}{end}\n<script>\n\"use strict\";", 1)
(root/"index.html").write_text(html)
print(f"packed {len(data)} data files, {len(img)} images, {len(payload)//1024} KB")
