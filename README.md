# hvaw-show — *Parameters*

Planning for a two-week show at **Hayes Valley Art Works**, in the 20′ shipping
container. Opens ~Aug 25 2026.

**The concept.** In a model, *parameters* are the weights — 30B of them, ~3.5B
active per token. In a life, they're the limits you work inside. The show is
about the second meaning arriving through the first: AI hands us a vocabulary
for what a mind is, and we turn it on ourselves. The collective is literal —
`distributed-70b` splits one model across two Xaviers, and mixture-of-experts
routes to 8 of 128 specialists per token. *Springback* survives as the title of
the wire work.

Two deliverables live here:

| file | what it is |
|---|---|
| `plan.html` | The written plan — concept, wall assignments, inventory audit, photograms, day-by-day schedule with a go/no-go gate, risks. |
| `layout.html` | Interactive 3D previz of the container. Hang heights, sightlines, circulation, and a cyanotype/print A/B on live sliders. |

## The layout previz

Open `layout.html` **directly off disk** — no server, no build step. Everything
loads as classic `<script src>` tags, which (unlike ES modules) file:// allows.

```
xdg-open layout.html
```

Controls: drag to orbit, right-drag or shift-drag to pan, scroll to zoom. In
**Walk in**, drag to look and scroll or ↑↓ to move down the corridor.

### Layout

```
layout.html                  UI shell + panel; the editable source
scene.js                     the whole scene, in inches (1 three.js unit == 1 inch)
prints.js                    generated — cv-draw thumbnails as data URIs
vendor/three.global.min.js   generated — three r160, IIFE-wrapped
make_prints.py               regenerates prints.js from ../cv-draw/out/
build.py                     inlines everything → dist/layout-standalone.html
```

All real-world dimensions live in the `DIM` / `MON` / `PRINT` / `BENCH` / `RACK`
constants at the top of `scene.js`, so the model and the hang plan can't drift
apart. Container interior is set to a standard 20′ (19′4″ × 7′8″ × 7′10″);
there's a high-cube toggle for 8′10″. **Confirm the real numbers with HVAW.**

`window.SB` exposes the scene, camera and work groups for poking from the
console while hanging the show.

### The three walls

- **The mind** (left) — 4 × 27″ panels hung **portrait** in plasma-cut steel
  surrounds, spread across 15′. A Xavier rides in the outer two frames, so the
  ethernet between them runs 13′ in the open. Four panes: *split* (one model,
  two boards), *routed* (8 of 128 experts), *observed* (pansophist's observer),
  *present* (live camera on the visitor).
- **The record** (right) — physical work, deliberately not a second wall of
  screens. Bent-wire sculpture on brackets alternating with the cyanotype each
  piece cast.
- **The body** (back) — the bender, running, with a grid rack above it that
  fills up over the run of the show.

## Regenerating

```bash
python3 make_prints.py    # after re-rendering cv-draw
python3 build.py          # → dist/layout-standalone.html, fully self-contained
```

### Rebuilding vendor/three.global.min.js

`three.module.min.js` is an ES module, which file:// won't load. It's converted
to a classic script whose only global is `THREE` — the trailing `export{...}` is
rewritten to `window.THREE={...}` and the whole thing wrapped in an IIFE, so the
minifier's ~400 single-letter top-level names don't leak and collide with
`scene.js`:

```python
import re
s = open('vendor/three.module.min.js').read()
m = re.search(r'export\{([^}]*)\};?\s*$', s)
pairs = []
for item in m.group(1).split(','):
    local, public = ([p.strip() for p in item.split(' as ')]
                     if ' as ' in item else (item.strip(),) * 2)
    pairs.append(f'{public}:{local}')
open('vendor/three.global.min.js', 'w').write(
    '(function(){' + s[:m.start()] + 'window.THREE={' + ','.join(pairs) + '};})();')
```

## Notes that cost time to learn

- **Source stays pure ASCII.** Primes and multiplication signs are `\u` escapes
  in JS and HTML entities in markup. Served without a charset header, a UTF-8
  file gets sniffed as windows-1252 and every `″` becomes mojibake.
- **`ctx.clip()` clips to the *current* path**, and every `fill()` in a loop
  replaces it. The cyanotype coat is held as an explicit `Path2D` for this
  reason — otherwise the wire shadow gets clipped to the last stray ellipse.
- **Doll's-house culling has to move a wall's artwork with it.** Hiding just the
  wall leaves the backs of monitors and frames floating in space.
- **The figure is opaque on purpose.** Overlapping transparent parts don't
  depth-sort against each other and it read as two disconnected blobs.

## Related

- `punkfab/wirebender` — the machine. CAD, MuJoCo sim and G-code toolchain are
  well advanced; bench calibration is the show's long pole.
- `dnuke-art/cv-draw` — the renders. Note they're web-resolution (~1500px); a
  print needs `W, H` raised and an overnight re-render.
- `dnewcome/jetson-llm` — the two AGX Xaviers and what they can hold.
- `dnuke-art/entropy-brush` — the simulated-bristle painting app.
