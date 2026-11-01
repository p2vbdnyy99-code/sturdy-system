"""Assemble index.html from src/ and pack data/*.json and img/* into it.

The Claude iOS viewer blocks fetching sibling files, so everything the page needs
travels inside index.html. Run after editing anything in src/ or data/:

    python3 build.py            # build
    python3 build.py --check    # build, then fail if index.html changed (CI guard)
"""
import base64, json, pathlib, sys

root = pathlib.Path(__file__).parent
JS_ORDER = ["core.js", "evidence.js", "modules.js", "analytics.js", "review.js", "boot.js"]  # boot.js last: it starts the app once every route is defined

def build():
    tpl = (root / "src" / "template.html").read_text()
    css = (root / "src" / "styles.css").read_text()
    js = "\n".join((root / "src" / "js" / f).read_text() for f in JS_ORDER if (root / "src" / "js" / f).exists())
    data = {p.name: json.loads(p.read_text()) for p in sorted((root / "data").glob("*.json"))}
    img = {f"img/{p.name}": "data:image/jpeg;base64," + base64.b64encode(p.read_bytes()).decode()
           for p in sorted((root / "img").glob("*.jpg"))}
    payload = json.dumps({"data": data, "img": img}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    bundle = f'<!-- bundle:start --><script type="application/json" id="bundle">{payload}</script><!-- bundle:end -->'
    html = tpl.replace("{{STYLE}}", css).replace("{{BUNDLE}}", bundle).replace("{{SCRIPT}}", js)
    return html, len(data), len(img), len(payload)

if __name__ == "__main__":
    html, nd, ni, size = build()
    out = root / "index.html"
    if "--check" in sys.argv and out.read_text() != html:
        sys.exit("index.html is out of date: run python3 build.py")
    out.write_text(html)
    print(f"built index.html: {nd} data files, {ni} images, bundle {size // 1024} KB, page {len(html) // 1024} KB")
