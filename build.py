#!/usr/bin/env python3
"""Inline layout.html's three <script src> tags into one self-contained file.

layout.html stays the editable source: it loads vendor/three.global.min.js,
prints.js and scene.js as *classic* scripts, which is what lets you open it
straight off disk with no server and no CORS complaints. This script folds
those three files in so the result can be published or emailed as one page.

    python3 build.py            -> dist/layout-standalone.html
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'layout.html'

# docs/ is what GitHub Pages serves; dist/ is the same bytes under the name the
# published artifact tracks. Both are generated - edit layout.html, not these.
OUTS = [ROOT / 'docs' / 'index.html', ROOT / 'dist' / 'layout-standalone.html']

SCRIPT_SRC = re.compile(r'[ \t]*<script src="([^"]+)"></script>\n?')


def main() -> int:
    html = SRC.read_text(encoding='utf-8')
    inlined = []

    def swap(match: re.Match) -> str:
        rel = match.group(1)
        path = ROOT / rel
        if not path.exists():
            raise SystemExit(f'missing script: {rel}')
        body = path.read_text(encoding='utf-8')
        # </script> anywhere in the payload would close the wrapper early
        body = body.replace('</script>', '<\\/script>')
        inlined.append((rel, len(body)))
        return f'<script>\n/* ---- inlined from {rel} ---- */\n{body}\n</script>\n'

    built = SCRIPT_SRC.sub(swap, html)

    if not inlined:
        raise SystemExit('no <script src> tags matched - did layout.html change?')
    if '<script src=' in built:
        raise SystemExit('a <script src> tag survived inlining')

    for out in OUTS:
        out.parent.mkdir(exist_ok=True)
        out.write_text(built, encoding='utf-8')

    # keep Pages from running the file through Jekyll
    (ROOT / 'docs' / '.nojekyll').touch()

    # docs/CNAME carries the custom domain and must survive a rebuild — this
    # script only ever writes index.html and .nojekyll, so it does.
    cname = ROOT / 'docs' / 'CNAME'
    if not cname.exists():
        raise SystemExit('docs/CNAME is missing — Pages would drop the custom domain')

    for rel, n in inlined:
        print(f'  inlined {rel:<32} {n / 1024:8.1f} KB')
    print()
    for out in OUTS:
        print(f'  {str(out.relative_to(ROOT)):<32} {len(built) / 1024:8.1f} KB')
    return 0


if __name__ == '__main__':
    sys.exit(main())
