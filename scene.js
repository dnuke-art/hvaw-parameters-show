/* ==========================================================================
   Springback — 3D layout previz for the HVAW 20' container show.

   All dimensions are INCHES. One three.js unit == one inch.
   Every number that describes the real world lives in DIM or WORKS below,
   so the model and the hang plan can't drift apart.
   ========================================================================== */

(function () {
const T = window.THREE;

/* ---------------------------------------------------------------- constants */

const DIM = {
  len:        232,   // 19'4"  interior length
  wid:         92,   // 7'8"   interior width
  hgt:         94,   // 7'10"  interior height, standard 20'
  hgtHiCube:  106,   // 8'10"  interior height, high-cube
  wallT:        3,   // wall thickness drawn
  ribPitch:  10.5,   // corrugation pitch
  ribDepth:   1.4,
  doorSill:     4,
};

const MON = {
  diag:      27,          // inches, 16:9
  bezel:    0.55,
  depth:     2.4,
  standoff:  3.2,         // wall to back of panel
  count:       4,
  gap:       6.0,
  centerY:    57,         // centre height, adjustable
  margin:     26,   // wall end to first frame
};
// Panels are hung PORTRAIT: the short side is the width. A 27" 16:9 rotated is
// 13.2" x 23.5" - which is also, not incidentally, the proportion of a person.
MON.w = MON.diag *  9 / Math.hypot(16, 9);
MON.h = MON.diag * 16 / Math.hypot(16, 9);

/* Cut surrounds, fabricated by hand. The material is a live decision: plasma on
   steel is bold and heavy and cannot cut fine; a laser on ply or acrylic is fine,
   light and fast. The plate hangs off the gallery's boards, so weight is a load
   question, and the cut process sets how ornate the pattern can be. */
const MATERIALS = {
  steel: {
    label: 'Steel', process: 'plasma',
    thick: 0.125, density: 0.284,   // 1/8" mild steel
    color: 0x4a5257, metalness: 0.86, roughness: 0.46,
    fine: 1.0,                       // plasma can't cut below plate thickness
  },
  ply: {
    label: 'Plywood', process: 'laser',
    thick: 0.5, density: 0.021,      // 1/2" baltic birch
    color: 0xc39a62, metalness: 0.02, roughness: 0.86,
    fine: 2.2,                       // laser kerf ~0.2mm: much finer ornament
  },
  acrylic: {
    label: 'Acrylic', process: 'laser',
    thick: 0.375, density: 0.043,
    color: 0xd8e4ea, metalness: 0.05, roughness: 0.22, translucent: true,
    fine: 2.2,
  },
};

const FRAME = {
  border: 4,        // plate showing around the panel
  material: 'steel',
};
FRAME.mat = () => MATERIALS[FRAME.material];
FRAME.thick = () => FRAME.mat().thick;
FRAME.density = () => FRAME.mat().density;
FRAME.w = () => MON.w + MON.bezel * 2 + FRAME.border * 2;
FRAME.h = () => MON.h + MON.bezel * 2 + FRAME.border * 2;

/* Flat work is DesignJet output on the soul wall, hung PORTRAIT. `ratio` is
   width/height, so the sheet keeps its proportion when the height slider moves.

   Two sheet sizes off the 24" roll, both PORTRAIT and both 2:3, so the works
   keep their proportion and only their scale changes:

   - large  24 x 36. What Dan reached for first. Seven things share this wall,
            though, and at 24" wide the clearances close to ~5.6" - the stats
            panel flags it rather than letting it look fine in a render.
   - small  16 x 24. Same proportion, ~9.6" clearances, wall breathes. */
const FLAT_SIZES = {
  large: { w: 24, h: 36 },
  small: { w: 16, h: 24 },
};

const PRINT = {
  size:     'large',
  height:   FLAT_SIZES.large.h,
  ratio:    FLAT_SIZES.large.w / FLAT_SIZES.large.h,
  gap:      12,
  centerY:  60,
  standoff: 1.2,
};
PRINT.w = () => PRINT.height * PRINT.ratio;

// The gallery hangs wooden boards on the container sides to mount into — so the
// real mounting surface is a band of wood standing proud of the corrugation,
// not the steel. Anything hung outside top..bottom has nothing to screw into.
const BOARD = {
  top:    80,     // MEASURE THESE
  bottom: 32,
  thick:  0.75,   // nominal 3/4" ply
  gap:    1.5,    // furring space behind, over the corrugation
  inset:  6,      // how far the board run stops short of each end
};
BOARD.proud = BOARD.thick + BOARD.gap;

// z of the mounting face on each side (sign -1 = compute wall, +1 = object wall)
const mountZ = sign => sign * (DIM.wid / 2 - BOARD.proud);

const PLINTH = { w: 36, d: 24, h: 34 };   // black gallery plinth, not a work table
const BENCH = PLINTH;
const RACK  = { w: 52, h: 30, y: 48 };

/* One pedestal spec for every sculpture in the room - the wire pieces and both
   hearts. Nothing on this wall sits on a bracket any more: the wall carries
   flat work only, objects stand on the floor. Keeping a single size means the
   pedestals read as fixtures and the eye compares the work, not the furniture. */
const PEDESTAL = { w: 15, d: 15, h: 40 };

/* ------------------------------------------------------- soul wall layout

   Seven things share this wall - two wire pieces on pedestals, three flat
   works, two hearts - so their positions are solved rather than hardcoded.
   Give it the running order and the widths and it spreads them with equal
   clear gaps between SPAN.from and SPAN.to. Change the print size and
   everything re-spaces instead of quietly overlapping.

   SPAN.to stops at 202 because the bender's plinth starts at x=206.
   The gap it returns is reported in the stats panel and warns under minGap:
   at 24" prints this wall is genuinely tight, and that should be visible. */
const SOUL = { from: 18, to: 202, minGap: 8 };

// nominal widths - the wire pieces are fit to 16", a heart is ~1.21 x its height
const SOUL_W = { sculpt: 16, heart: 21 };

function soulLayout() {
  const items = [
    { key: 'sculpt', w: SOUL_W.sculpt },
    { key: 'flat',   w: 0 },
    { key: 'heart',  w: SOUL_W.heart },
    { key: 'flat',   w: 0 },
    { key: 'heart',  w: SOUL_W.heart },
    { key: 'flat',   w: 0 },
    { key: 'sculpt', w: SOUL_W.sculpt },
  ];
  const fw = PRINT.height * PRINT.ratio + 1.4;      // backer is the visual edge
  items.forEach(it => { if (it.key === 'flat') it.w = fw; });

  const used = items.reduce((a, b) => a + b.w, 0);
  const gap = (SOUL.to - SOUL.from - used) / (items.length - 1);
  let x = SOUL.from;
  items.forEach(it => { it.x = x + it.w / 2; x += it.w + gap; });

  const pick = k => items.filter(it => it.key === k).map(it => it.x);
  return { gap, flat: pick('flat'), heart: pick('heart'), sculpt: pick('sculpt') };
}

/* Camera fov is VERTICAL in three.js, so a portrait phone crops the sides -
   and this room is a 19' corridor whose whole subject is horizontal.

   Widening the lens cannot fix it: holding the desktop horizontal field at a
   0.48 aspect would need a ~115 degree vertical fov, which is a fisheye. So
   orbit views PULL BACK instead (fitScale), and only the walk view - where you
   are inside a 92"-wide box and cannot back up - widens the lens a little. */
const FOV_REF_ASPECT = 1.6;
const FOV_WALK_MAX = 78;
/* Capped low on purpose. Matching the desktop horizontal field at a 0.48
   aspect needs ~3.3x the distance, which shrinks the room to a chip floating in
   a tall empty frame. A long horizontal subject simply cannot fill a portrait
   screen from a 3/4 orbit - so pull back modestly and pick a better default
   view for narrow screens instead (see the door default below). */
const FIT_MAX = 1.5;

const EYE = 65;          // viewer eye height
const FIGURE_H = 70;     // 5'10"

// Running off an inverter makes this an ENERGY budget, not just a power one:
// watts decide whether the inverter copes, watt-hours decide whether you make
// it to closing time. Draws are typical-not-peak; measure yours with a meter.
const POWER = {
  monitor: 30,   // 27" LED panel
  jetson:  30,   // AGX Xavier at MAXN
  bender:  70,   // three steppers, duty-cycled
  track:   45,   // LED track lighting
  uv:      60,   // 395 nm panel, only during exposures
  backlight: 8,  // LED strip behind each frame
};

const SHOW = {
  hoursOpen:  4,     // hours per day the doors are open
  batteryKWh: 2.0,   // usable capacity of the inverter bank
  inverterEff: 0.85, // DC->AC plus conversion losses
};

const C = {
  shellOut:  0x59656b,
  shellIn:   0x7b878c,
  rib:       0x6d797f,
  floor:     0x333c40,
  ceiling:   0x5d686d,
  bezel:     0x15181a,
  shelf:     0x2b3236,
  jetson:    0x1d2427,
  bench:     0x4a5257,
  machine:   0xc2571f,
  machine2:  0x8f9aa0,
  wire:      0xd8dee0,
  figure:    0x8fa0a8,
  sight:     0x4a7e99,
  channel:   0xb3501b,
};

/* ------------------------------------------------------------------- helpers */

// deterministic PRNG so the bent-wire pieces are the same every reload
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

// Source stays pure ASCII: the primes are \u escapes so the file decodes the
// same whether or not the server sends a charset.
const PR = '\u2032', DPR = '\u2033', TIMES = '\u00d7', DOT = '\u00b7';

function feetInches(inches) {
  let ft = Math.floor(inches / 12);
  let inch = Math.round(inches - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }   // 107.6" is 9', not 8'12"
  return inch ? `${ft}${PR}${inch}${DPR}` : `${ft}${PR}`;
}

function box(w, h, d, mat) {
  return new T.Mesh(new T.BoxGeometry(w, h, d), mat);
}

// One bent-wire path, used three ways: as a hung sculpture, as a piece on the
// rack, and — projected flat — as the shadow in its own cyanotype.
function bentCurve(seed, segs = 7) {
  const r = rng(seed);
  const pts = [new T.Vector3(0, 0, 0)];
  let dir = new T.Vector3(1, 0.3, 0).normalize();
  for (let i = 0; i < segs; i++) {
    const len = 1.6 + r() * 3.4;
    dir = dir.clone().applyAxisAngle(
      new T.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
      0.7 + r() * 1.5
    ).normalize();
    pts.push(pts[pts.length - 1].clone().addScaledVector(dir, len));
  }
  return new T.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
}

const matte = (color, opts = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.05, ...opts });

const metal = (color, opts = {}) =>
  new T.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.72, ...opts });

const wireMat = metal(C.wire, { roughness: 0.3, metalness: 0.85 });

/* `fit` normalises the longest axis to that many inches. bentCurve is random
   per seed and its raw extent varies about 2:1 between seeds, so a bare scale
   multiplier gives pieces of wildly different sizes - which is how a pedestal
   piece ended up 42" wide and running into the cyanotype beside it. Pass fit
   whenever the piece has to live in a known slot. */
function bentPiece(seed, radius = 0.13, scale = 1, fit = 0) {
  const curve = bentCurve(seed);

  /* Work the scale out from the CURVE, before the tube exists. Scaling a
     finished tube would scale its radius too, so fitting a piece into a
     smaller slot would silently thin the wire - which is how the pedestal
     pieces ended up as 0.2"-diameter thread you couldn't see. Dividing the
     radius by the final scale here makes `radius` the real world-space wire
     radius in inches, whatever the piece's overall size. */
  let s = scale;
  if (fit > 0) {
    const sz = new T.Box3().setFromPoints(curve.getPoints(160)).getSize(new T.Vector3());
    s = fit / Math.max(sz.x, sz.y, sz.z);
  }

  const mesh = new T.Mesh(new T.TubeGeometry(curve, 90, radius / s, 7, false), wireMat);
  mesh.scale.setScalar(s);
  mesh.castShadow = true;

  // recentre so it hangs sensibly wherever it's placed
  const bb = new T.Box3().setFromObject(mesh);
  mesh.position.sub(bb.getCenter(new T.Vector3()));
  return mesh;
}

/* ------------------------------------------------------------- gallery cards

   One card per work, drawn to a canvas and hung as a plane. Everything on it -
   title, medium, dimensions, and the QR target - comes out of qr.js, which
   make_qr.py generates, so the card and the code can never disagree.

   The QR codes are REAL and scannable (make_qr.py --selftest round-trips every
   one). They point at parameters.dnuke.art/p/<slug>, which is a placeholder
   until the Curiate links exist - change BASE in make_qr.py, re-run, rebuild.

   Cards hang BELOW their work rather than beside it: at 24" wide the flat works
   leave only ~5.6" between neighbours, and a 6" card would not fit in the gap.
   Below the work there is always the rest of the board. */

const CARD = { w: 6, h: 3.6, px: 100 };
const cardGroup = [];               // every card, for the show/hide toggle

function cardTexture(slug, dimsOverride) {
  const info = (window.QR && window.QR.codes && window.QR.codes[slug]) || null;
  if (!info) return null;

  const W = CARD.w * CARD.px, H = CARD.h * CARD.px;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');

  x.fillStyle = '#F4F2ED'; x.fillRect(0, 0, W, H);
  x.strokeStyle = '#D8D3C8'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, W - 3, H - 3);

  const pad = 26;

  // QR block, right-aligned, with its own quiet zone
  const q = 250, qx = W - pad - q, qy = (H - q) / 2;
  const rows = atob(info.rows), n = info.n;
  const quiet = 4, cell = q / (n + quiet * 2);
  x.fillStyle = '#FFFFFF'; x.fillRect(qx, qy, q, q);
  x.fillStyle = '#101010';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (rows[r * n + c] === '1') {
        // +0.5 so neighbouring modules meet instead of leaving scan-breaking seams
        x.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, cell + 0.5, cell + 0.5);
      }
    }
  }

  const colW = qx - pad - 18;
  let y = pad + 20;

  x.fillStyle = '#8A8478';
  x.font = '600 15px ui-monospace, monospace';
  x.fillText((window.QR.artist || '').toUpperCase(), pad, y);

  y += 40;
  x.fillStyle = '#14181A';
  x.font = '700 33px Georgia, serif';
  x.fillText(info.title, pad, y);

  y += 27;
  x.fillStyle = '#6E6A61';
  x.font = '17px Georgia, serif';
  x.fillText(String(window.QR.year || ''), pad, y);

  // medium, wrapped to the text column
  y += 34;
  x.fillStyle = '#3C4145';
  x.font = '16px Helvetica, Arial, sans-serif';
  const words = info.medium.split(' ');
  let line = '';
  words.forEach(w => {
    const t = line ? line + ' ' + w : w;
    if (x.measureText(t).width > colW && line) { x.fillText(line, pad, y); y += 21; line = w; }
    else line = t;
  });
  if (line) { x.fillText(line, pad, y); y += 21; }

  x.fillStyle = '#6E6A61';
  x.fillText(dimsOverride || info.dims, pad, y + 4);

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/* Returns a card mesh, or null if qr.js has no entry for the slug. Callers add
   it to the same group as the work so it inherits the work's facing. */
function galleryCard(slug, dimsOverride) {
  const tex = cardTexture(slug, dimsOverride);
  if (!tex) return null;
  const mesh = new T.Mesh(
    new T.PlaneGeometry(CARD.w, CARD.h),
    new T.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 })
  );
  mesh.userData.card = true;
  cardGroup.push(mesh);
  return mesh;
}

/* ----------------------------------------------------------- wall labels

   [/mind] [/soul] [/body] as closing tags - the wall names read as markup,
   which is the right register for a show called Parameters. Vinyl-scale, in
   mono, at the door end of each wall and BELOW the board band, so they sit on
   the container skin rather than competing with the work. */

const WALL_LABEL = { w: 26, h: 7, y: 20 };

function wallLabel(text, tint) {
  const cv = document.createElement('canvas');
  cv.width = WALL_LABEL.w * 40; cv.height = WALL_LABEL.h * 40;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  x.font = '600 150px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  x.textAlign = 'left'; x.textBaseline = 'middle';
  x.fillStyle = tint;
  x.letterSpacing = '14px';
  x.fillText(text, 16, cv.height / 2);

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return new T.Mesh(
    new T.PlaneGeometry(WALL_LABEL.w, WALL_LABEL.h),
    new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
}

const labelGroup = new T.Group();
let labelsPlaced = false;

/* --------------------------------------------------------------- scene setup */

const scene = new T.Scene();
scene.background = new T.Color(0x0f1416);

const camera = new T.PerspectiveCamera(50, 1, 1, 4000);
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

/* ------------------------------------------------------------------ lighting */

scene.add(new T.HemisphereLight(0xa8c0cc, 0x39423f, 1.15));
scene.add(new T.AmbientLight(0xdfe9ee, 0.32));

// bounce fill down the corridor, so the far end doesn't read as a black hole
for (let i = 0; i < 4; i++) {
  const f = new T.PointLight(0xd8e6ee, 2600, 210, 2);
  f.position.set(34 + i * 58, DIM.hgt - 16, 0);
  scene.add(f);
}

// daylight raking in through the open doors at x = 0
const sun = new T.DirectionalLight(0xfff2e0, 1.15);
sun.position.set(-160, 150, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 300, top: 160, bottom: -20, near: 1, far: 700 });
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(120, 30, 0);

// track lighting: heads washing each long wall from the opposite side
[[+1, 3], [-1, 3]].forEach(([side, n]) => {
  for (let i = 0; i < n; i++) {
    const s = new T.SpotLight(0xfff6ec, 11000, 280, Math.PI / 6, 0.55, 2);
    s.position.set(52 + i * 62, DIM.hgt - 8, -side * 10);
    s.target.position.set(52 + i * 62, PRINT.centerY, side * (DIM.wid / 2));
    scene.add(s, s.target);
  }
});

// the hero spot on the machine
const heroSpot = new T.SpotLight(0xffe9d5, 26000, 300, Math.PI / 7, 0.4, 2);
heroSpot.position.set(DIM.len - 70, DIM.hgt - 6, 0);
heroSpot.target.position.set(DIM.len - 12, 30, 0);
heroSpot.castShadow = true;
heroSpot.shadow.mapSize.set(1024, 1024);
scene.add(heroSpot, heroSpot.target);

/* ------------------------------------------------------------------ the shell */

const shell = new T.Group();
scene.add(shell);

const floor = box(DIM.len, 2, DIM.wid, matte(C.floor, { roughness: 0.94 }));
floor.position.set(DIM.len / 2, -1, 0);
floor.receiveShadow = true;
shell.add(floor);

function longWall(sign) {
  const g = new T.Group();
  const panel = box(DIM.len, DIM.hgt, DIM.wallT, matte(C.shellIn));
  panel.position.set(DIM.len / 2, DIM.hgt / 2, sign * (DIM.wid / 2 + DIM.wallT / 2));
  panel.receiveShadow = true;
  g.add(panel);

  // corrugation
  const ribGeo = new T.BoxGeometry(DIM.ribPitch * 0.45, DIM.hgt - 6, DIM.ribDepth);
  const ribMat = matte(C.rib);
  const n = Math.floor(DIM.len / DIM.ribPitch);
  const ribs = new T.InstancedMesh(ribGeo, ribMat, n);
  const m = new T.Matrix4();
  for (let i = 0; i < n; i++) {
    m.setPosition(
      DIM.ribPitch * (i + 0.5),
      DIM.hgt / 2,
      sign * (DIM.wid / 2 - DIM.ribDepth / 2)
    );
    ribs.setMatrixAt(i, m);
  }
  ribs.receiveShadow = true;
  g.add(ribs);
  return g;
}

const wallNeg = longWall(-1); // compute wall side
const wallPos = longWall(+1); // render wall side
shell.add(wallNeg, wallPos);

// The mounting boards. Everything hangs off these, so they are drawn as real
// geometry rather than assumed — if a hang height sits off the band, you see it.
const boardMat = matte(0xb99a6f, { roughness: 0.92 });
const boardEdge = matte(0x8e7350, { roughness: 0.94 });
const boards = { [-1]: null, [+1]: null };

function buildBoards() {
  [-1, +1].forEach(sign => {
    if (boards[sign]) { (sign < 0 ? wallNeg : wallPos).remove(boards[sign]); }
    const h = Math.max(2, BOARD.top - BOARD.bottom);
    const len = DIM.len - BOARD.inset * 2;
    const g = new T.Group();

    // sits proud of the corrugation by the furring gap, so it clears the ribs
    const face = box(len, h, BOARD.thick, boardMat);
    face.position.z = -sign * (BOARD.gap + BOARD.thick / 2);
    face.castShadow = true; face.receiveShadow = true;
    g.add(face);

    // furring strips holding it off the steel
    [BOARD.bottom + 1.5, BOARD.top - 1.5].forEach(y => {
      const strip = box(len, 2, BOARD.gap, boardEdge);
      strip.position.set(0, y - (BOARD.bottom + h / 2), -sign * (BOARD.gap / 2));
      g.add(strip);
    });

    g.position.set(DIM.len / 2, BOARD.bottom + h / 2, sign * (DIM.wid / 2));
    (sign < 0 ? wallNeg : wallPos).add(g);
    boards[sign] = g;
  });
}
buildBoards();

const backWall = box(DIM.wallT, DIM.hgt, DIM.wid, matte(C.shellIn));
backWall.position.set(DIM.len + DIM.wallT / 2, DIM.hgt / 2, 0);
backWall.receiveShadow = true;
shell.add(backWall);

// door frame at the entrance — grouped so it can be culled when the camera
// rises above the box, where the header would otherwise slice the view in half
const doorFrame = new T.Group();
const frameMat = metal(0x4c5559);
[[-1], [1]].forEach(([s]) => {
  const jamb = box(6, DIM.hgt, 4, frameMat);
  jamb.position.set(-3, DIM.hgt / 2, s * (DIM.wid / 2 - 2));
  doorFrame.add(jamb);
});
const header = box(6, 5, DIM.wid, frameMat);
header.position.set(-3, DIM.hgt - 2.5, 0);
doorFrame.add(header);
shell.add(doorFrame);

const ceiling = box(DIM.len, 2, DIM.wid, matte(C.ceiling, { transparent: true, opacity: 0.9 }));
ceiling.position.set(DIM.len / 2, DIM.hgt + 1, 0);
shell.add(ceiling);

/* ------------------------------------------------- pane 1-4: screen textures

   One argument in four panes, read left to right in the direction people walk:
   a mind split across two bodies, a mind that routes to a few of its many
   experts, a mind whose memories belong to an observer, and then you.
   -------------------------------------------------------------------------- */

function screenTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = 360; cv.height = 640;               // 9:16, hung portrait
  const x = cv.getContext('2d');
  const r = rng(kind.length * 977 + 13);

  const grad = x.createLinearGradient(0, 0, 0, 640);
  if (kind === 'split')    { grad.addColorStop(0, '#0d1a22'); grad.addColorStop(1, '#132630'); }
  if (kind === 'routed')   { grad.addColorStop(0, '#1a1424'); grad.addColorStop(1, '#0e0a16'); }
  if (kind === 'observed') { grad.addColorStop(0, '#0b1210'); grad.addColorStop(1, '#0e1a15'); }
  if (kind === 'present')  { grad.addColorStop(0, '#241a12'); grad.addColorStop(1, '#120d09'); }
  x.fillStyle = grad; x.fillRect(0, 0, 360, 640);

  x.font = '11px monospace';

  if (kind === 'split') {
    // two boards stacked, the wire running down between them
    [[70, 'BOARD 1'], [370, 'BOARD 2']].forEach(([by, name]) => {
      x.strokeStyle = '#4d7f9c'; x.lineWidth = 1.4;
      x.strokeRect(46, by, 268, 190);
      x.fillStyle = 'rgba(120,190,225,.62)';
      x.fillText(name, 46, by - 8);
      for (let i = 0; i < 20; i++) {
        x.fillStyle = r() > 0.25 ? `rgba(127,196,232,${0.3 + r() * 0.5})` : 'rgba(127,196,232,.10)';
        x.fillRect(56 + (i % 10) * 26, by + 14 + Math.floor(i / 10) * 88, 20, 76);
      }
      x.fillStyle = 'rgba(120,190,225,.4)';
      x.fillText('40 layers', 46, by + 206);
    });
    x.strokeStyle = '#d8c15a'; x.lineWidth = 2.6;
    x.beginPath(); x.moveTo(180, 284); x.lineTo(180, 370); x.stroke();
    for (let i = 0; i < 3; i++) {
      x.fillStyle = `rgba(216,193,90,${1 - i * 0.3})`;
      x.beginPath(); x.arc(180, 300 + i * 25, 3.6, 0, 7); x.fill();
    }
    x.fillStyle = 'rgba(216,193,90,.75)';
    x.fillText('activations', 192, 330);
    x.fillStyle = 'rgba(180,215,235,.5)';
    x.fillText('42.5 GB', 46, 606);
    x.fillText('one model, two machines', 46, 622);
  }

  if (kind === 'routed') {
    // 128 experts as a tall grid, the router feeding it from the top
    const cols = 8, rows = 16;
    const lit = new Set();
    while (lit.size < 8) lit.add(Math.floor(r() * cols * rows));
    for (let i = 0; i < cols * rows; i++) {
      x.fillStyle = lit.has(i) ? '#d9a3f0' : 'rgba(150,120,180,.16)';
      x.fillRect(44 + (i % cols) * 34, 150 + Math.floor(i / cols) * 27, 26, 19);
    }
    x.strokeStyle = 'rgba(217,163,240,.32)'; x.lineWidth = 1;
    [...lit].forEach(i => {
      x.beginPath(); x.moveTo(180, 96);
      x.lineTo(44 + (i % cols) * 34 + 13, 150 + Math.floor(i / cols) * 27 + 9);
      x.stroke();
    });
    x.fillStyle = '#d9a3f0';
    x.beginPath(); x.arc(180, 96, 7, 0, 7); x.fill();
    x.fillStyle = 'rgba(217,163,240,.62)';
    x.fillText('router', 158, 78);
    x.fillStyle = 'rgba(217,163,240,.5)';
    x.fillText('8 of 128 experts active', 44, 606);
    x.fillText('3.5B of 30B parameters', 44, 622);
  }

  if (kind === 'observed') {
    const nodes = [];
    for (let i = 0; i < 10; i++) nodes.push([56 + r() * 248, 110 + r() * 300]);
    x.strokeStyle = 'rgba(157,232,189,.24)'; x.lineWidth = 1;
    nodes.forEach((n, i) => {
      const m = nodes[(i + 3) % nodes.length];
      x.beginPath(); x.moveTo(n[0], n[1]); x.lineTo(m[0], m[1]); x.stroke();
    });
    const obs = [180, 512];
    x.strokeStyle = 'rgba(157,232,189,.5)'; x.setLineDash([3, 3]);
    nodes.forEach(n => { x.beginPath(); x.moveTo(obs[0], obs[1]); x.lineTo(n[0], n[1]); x.stroke(); });
    x.setLineDash([]);
    nodes.forEach(n => {
      x.fillStyle = 'rgba(157,232,189,.72)';
      x.beginPath(); x.arc(n[0], n[1], 4.6, 0, 7); x.fill();
    });
    x.fillStyle = '#9de8bd';
    x.beginPath(); x.arc(obs[0], obs[1], 8, 0, 7); x.fill();
    x.fillStyle = 'rgba(157,232,189,.62)';
    x.fillText('observer', 156, 536);
    x.fillStyle = 'rgba(157,232,189,.5)';
    x.fillText('no fact without', 56, 84);
    x.fillText('someone holding it', 56, 100);
  }

  if (kind === 'present') {
    // portrait suits this one exactly: a standing person, framed and labelled
    x.strokeStyle = 'rgba(230,180,140,.5)'; x.lineWidth = 1.4;
    [[30, 40, 1, 1], [330, 40, -1, 1], [30, 600, 1, -1], [330, 600, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      x.beginPath();
      x.moveTo(cx + 26 * sx, cy); x.lineTo(cx, cy); x.lineTo(cx, cy + 24 * sy);
      x.stroke();
    });
    x.fillStyle = 'rgba(232,200,170,.30)';
    x.beginPath(); x.ellipse(180, 400, 52, 128, 0, 0, 7); x.fill();
    x.beginPath(); x.arc(180, 236, 34, 0, 7); x.fill();
    x.strokeStyle = 'rgba(226,138,80,.85)'; x.lineWidth = 1.6;
    x.strokeRect(114, 194, 132, 350);
    x.fillStyle = 'rgba(226,138,80,.95)';
    x.fillText('1 person detected', 114, 186);
    x.fillStyle = 'rgba(226,138,80,.9)';
    x.beginPath(); x.arc(28, 26, 4.6, 0, 7); x.fill();
    x.fillText('LIVE', 40, 30);
    x.fillStyle = 'rgba(232,200,170,.5)';
    x.fillText('you are inside the model', 30, 622);
  }

  const label = { split: 'SPLIT', routed: 'ROUTED', observed: 'OBSERVED', present: 'PRESENT' }[kind];
  x.fillStyle = 'rgba(255,255,255,.42)';
  x.font = '600 12px monospace';
  x.fillText(label, 30, 56);

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

/* -------------------------------------------------------- wall A: compute wall */

const computeWall = new T.Group();
scene.add(computeWall);

const PANES = ['split', 'routed', 'observed', 'present'];
const screenMats = PANES.map(k => new T.MeshBasicMaterial({ map: screenTexture(k) }));
const screenOffMat = new T.MeshStandardMaterial({ color: 0x0a0d0e, roughness: 0.28, metalness: 0.1 });
const monitors = [];

/* Each panel sits behind a plasma-cut steel surround. The frame is built as a
   real plate with holes - screen aperture plus a cut pattern - so the cutouts
   are geometry, not a texture, and so their area can be weighed and vented.

   Two of the four frames carry a Xavier behind the plate. Those get a denser
   cut cluster low and high: the ornament doubles as the convection path, which
   matters in a sealed steel box in August. */

function plateMaterial() {
  const m = FRAME.mat();
  return new T.MeshStandardMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness,
    // cast acrylic picks up the backlight and carries it to every cut edge
    ...(m.translucent ? { transparent: true, opacity: 0.86, emissive: 0x7ea8c4, emissiveIntensity: 0.35 } : {}),
  });
}

function framePlate(seed, hasBoard) {
  const w = FRAME.w(), h = FRAME.h();
  const ap = { w: MON.w + MON.bezel * 2, h: MON.h + MON.bezel * 2 };
  const r = rng(seed);

  const shape = new T.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w / 2, h / 2);
  shape.closePath();

  const holes = [];
  let cutArea = 0;

  // the screen aperture
  const aperture = new T.Path();
  aperture.moveTo(-ap.w / 2, -ap.h / 2);
  aperture.lineTo(-ap.w / 2, ap.h / 2);
  aperture.lineTo(ap.w / 2, ap.h / 2);
  aperture.lineTo(ap.w / 2, -ap.h / 2);
  aperture.closePath();
  holes.push(aperture);
  cutArea += ap.w * ap.h;

  const circle = (cx, cy, rad) => {
    const pth = new T.Path();
    pth.absarc(cx, cy, rad, 0, Math.PI * 2, true);
    holes.push(pth);
    cutArea += Math.PI * rad * rad;
  };
  const slot = (cx, cy, sw, sh) => {
    const pth = new T.Path();
    pth.moveTo(cx - sw / 2, cy - sh / 2);
    pth.lineTo(cx - sw / 2, cy + sh / 2);
    pth.lineTo(cx + sw / 2, cy + sh / 2);
    pth.lineTo(cx + sw / 2, cy - sh / 2);
    pth.closePath();
    holes.push(pth);
    cutArea += sw * sh;
  };

  const mid = FRAME.border / 2;
  const colX = ap.w / 2 + mid;
  const rowY = ap.h / 2 + mid;

  // side columns - a run of slots, rhythm varies per frame
  const fine = FRAME.mat().fine;
  const nSide = Math.round((5 + Math.floor(r() * 3)) * fine);
  for (let i = 0; i < nSide; i++) {
    const yy = -ap.h / 2 + (ap.h / (nSide - 1)) * i;
    [-1, 1].forEach(sx => slot(sx * colX, yy, (1.5 + r() * 0.8) / fine, (2.2 + r() * 2.4) / fine));
  }

  // top and bottom - circles, denser on the boards that need to breathe
  const nTop = Math.round((hasBoard ? 9 : 5 + Math.floor(r() * 3)) * fine);
  for (let i = 0; i < nTop; i++) {
    const xx = -ap.w / 2 + (ap.w / (nTop - 1)) * i;
    [-1, 1].forEach(sy => circle(xx, sy * rowY, (hasBoard ? 0.72 : 0.5 + r() * 0.45) / fine));
  }

  // corner marks
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sy]) =>
    circle(sx * (w / 2 - mid), sy * (h / 2 - mid), 0.62));

  shape.holes = holes;

  const geo = new T.ExtrudeGeometry(shape, { depth: FRAME.thick(), bevelEnabled: false });
  geo.translate(0, 0, -FRAME.thick() / 2);
  const mesh = new T.Mesh(geo, plateMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.cutArea = cutArea;
  mesh.userData.plateArea = w * h;
  return mesh;
}

// spread the four frames across most of the wall, so the two carrying boards
// sit far apart and the run between them is worth walking
function frameCenters() {
  const fw = FRAME.w();
  const first = MON.margin + fw / 2;
  const last = DIM.len - MON.margin - fw / 2;
  return Array.from({ length: MON.count }, (_, i) =>
    first + (last - first) * (i / (MON.count - 1)));
}

function buildMonitors() {
  monitors.forEach(m => computeWall.remove(m));
  monitors.length = 0;
  const z = mountZ(-1);
  const centers = frameCenters();

  centers.forEach((cx, i) => {
    const g = new T.Group();
    const hasBoard = i === 0 || i === MON.count - 1;

    const panel = box(MON.w + MON.bezel * 2, MON.h + MON.bezel * 2, MON.depth, matte(C.bezel, { roughness: 0.5 }));
    panel.position.z = MON.standoff + MON.depth / 2;
    panel.castShadow = true;
    g.add(panel);

    const screen = new T.Mesh(new T.PlaneGeometry(MON.w, MON.h), screenMats[i % 4]);
    screen.position.z = MON.standoff + MON.depth + 0.06;
    g.add(screen);
    g.userData.screen = screen;

    const plate = framePlate(700 + i * 137, hasBoard);
    plate.position.z = MON.standoff + MON.depth + 0.55;
    g.add(plate);
    g.userData.plate = plate;

    // a Xavier riding on the back of the outer two frames
    if (hasBoard) {
      const j = new T.Group();
      const body = box(4.2, 4.2, 2.7, metal(C.jetson, { roughness: 0.55 }));
      body.castShadow = true;
      j.add(body);
      const fin = box(4.4, 4.4, 0.35, metal(0x39434a));
      fin.position.z = -1.5;
      j.add(fin);
      const led = new T.Mesh(new T.SphereGeometry(0.3), new T.MeshBasicMaterial({ color: 0x7fd8a8 }));
      led.position.set(1.6, -1.6, 1.5);
      j.add(led);
      j.position.set(0, -MON.h / 2 - FRAME.border / 2 - 1.4, MON.standoff - 1.6);
      g.add(j);
      g.userData.xavier = j;
    }

    const arm = box(3, 3, MON.standoff, matte(0x22282b));
    arm.position.z = MON.standoff / 2;
    g.add(arm);

    /* Light behind the plate, so the cut pattern reads as a halo on the board
       and the cutouts glow rather than just being holes. One accent per pane,
       matching its screen, so the wall reads as four coloured portraits. */
    const accent = [0x6fb6dd, 0xa87fd8, 0x7fd8a8, 0xdd9152][i % 4];

    const halo = new T.Mesh(
      new T.PlaneGeometry(FRAME.w() + 7, FRAME.h() + 7),
      new T.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.42 })
    );
    halo.position.z = 0.25;
    g.add(halo);
    g.userData.halo = halo;

    const back = new T.PointLight(accent, 1500, 90, 2);
    back.position.z = 2.6;
    g.add(back);

    const glow = new T.PointLight(accent, 500, 110, 2);
    glow.position.z = MON.standoff + 14;
    g.add(glow);
    g.userData.glow = glow;
    g.userData.backlight = back;

    g.position.set(cx, MON.centerY, z);
    computeWall.add(g);
    const card = galleryCard(PANES[i % 4]);
    if (card) {
      card.position.set(0, -(FRAME.h() / 2) - 1 - CARD.h / 2, MON.standoff + 0.1);
      g.add(card);
    }

    monitors.push(g);
  });
}
buildMonitors();

/* The two boards live in the outer frames, so what runs between them is just
   the wire - left long, slack and lit. That distance was going to be the piece.

   OFF BY DEFAULT: Dan doesn't want wiring shown on the boards. The geometry
   stays because the run length feeds the stats readout either way, and because
   this is one checkbox away if he wants the idea back. Anything that rebuilds
   the cable has to re-apply cableVisible, or it pops back on when a slider
   moves - which is why buildCable() sets it rather than the toggle handler. */

const cableMat = new T.MeshStandardMaterial({ color: 0xd8c15a, roughness: 0.55, metalness: 0.05 });
let cable = null;
let cableVisible = false;        // must match the t-cable checkbox default

function buildCable() {
  if (cable) computeWall.remove(cable);
  const centers = frameCenters();
  const a = centers[0], b = centers[centers.length - 1];
  const dropY = MON.centerY - FRAME.h() / 2 - 2;
  const z = mountZ(-1) + 3.2;

  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new T.Vector3(
      a + (b - a) * t,
      dropY - Math.sin(Math.PI * t) * 7,
      z
    ));
  }
  cable = new T.Mesh(
    new T.TubeGeometry(new T.CatmullRomCurve3(pts), 180, 0.34, 8, false),
    cableMat
  );
  cable.castShadow = true;
  cable.visible = cableVisible;
  computeWall.add(cable);
  return b - a;
}
let cableRun = buildCable();


/* --------------------------------------------------------- wall B: object wall

   Physical work, not a second wall of screens. The wall carries the cyanotypes
   only; the wire pieces that cast them stand on pedestals in front (see
   SCULPTS below). Object and its own shadow-image, but the shadow hangs and
   the object stands. Flat works can be swapped to cv-draw prints to compare.
   -------------------------------------------------------------------------- */

const objectWall = new T.Group();
scene.add(objectWall);

// A cyanotype: the wire's shadow, contact-printed. Masked wire stays paper-white,
// exposed ground goes Prussian blue, and the coat has a hand-brushed edge.
function cyanotypeTexture(seed) {
  const cv = document.createElement('canvas');
  cv.width = 400; cv.height = 500;
  const x = cv.getContext('2d');
  const r = rng(seed * 31 + 7);

  const PAPER = '#EDE6D4';
  x.fillStyle = PAPER;
  x.fillRect(0, 0, 400, 500);

  // Hand-coated region with a ragged brush edge. Held as an explicit Path2D:
  // drawing the mottling below replaces the context's current path, so clipping
  // to "the current path" later would clip to the last stray ellipse instead.
  const coat = new Path2D();
  const inset = 22;
  coat.moveTo(inset, inset);
  for (let i = 0; i <= 30; i++) {
    coat.lineTo(inset + (i / 30) * (400 - inset * 2), inset + (r() - 0.5) * 11);
  }
  for (let i = 0; i <= 30; i++) {
    coat.lineTo(400 - inset + (r() - 0.5) * 11, inset + (i / 30) * (500 - inset * 2));
  }
  for (let i = 0; i <= 30; i++) {
    coat.lineTo(400 - inset - (i / 30) * (400 - inset * 2), 500 - inset + (r() - 0.5) * 11);
  }
  for (let i = 0; i <= 30; i++) {
    coat.lineTo(inset + (r() - 0.5) * 11, 500 - inset - (i / 30) * (500 - inset * 2));
  }
  coat.closePath();

  const g = x.createLinearGradient(0, 0, 260, 500);
  g.addColorStop(0, '#1E4470');
  g.addColorStop(0.55, '#12304F');
  g.addColorStop(1, '#0B2039');
  x.fillStyle = g;
  x.fill(coat);

  // uneven coating
  x.save();
  x.clip(coat);
  for (let i = 0; i < 90; i++) {
    x.fillStyle = `rgba(${r() > 0.5 ? '90,140,190' : '5,20,40'},${0.02 + r() * 0.05})`;
    x.beginPath();
    x.ellipse(r() * 400, r() * 500, 20 + r() * 90, 14 + r() * 60, r() * 3, 0, 7);
    x.fill();
  }
  x.restore();

  // the shadow itself — project the wire path flat and fit it to the sheet
  const pts = bentCurve(seed).getPoints(240);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(p => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  const pad = 74;
  const s = Math.min((400 - pad * 2) / (maxX - minX || 1), (500 - pad * 2) / (maxY - minY || 1));
  const ox = (400 - (maxX - minX) * s) / 2 - minX * s;
  const oy = (500 - (maxY - minY) * s) / 2 - minY * s;

  x.save();
  x.clip(coat);
  // penumbra first, then the hard core — a point source still softens with distance
  [[14, 0.30], [7, 0.52], [0, 1]].forEach(([blur, alpha]) => {
    x.strokeStyle = `rgba(237,230,212,${alpha})`;
    x.lineWidth = 13 + blur * 0.8;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.filter = blur ? `blur(${blur}px)` : 'none';
    x.beginPath();
    pts.forEach((p, i) => {
      const px = ox + p.x * s, py = 500 - (oy + p.y * s);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    });
    x.stroke();
  });
  x.filter = 'none';
  x.restore();

  const tex = new T.CanvasTexture(cv);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

const FLAT_SLOTS = 3;
const flatWorks = [];
let flatMode = 'cyano';

function buildObjectWall() {
  flatWorks.forEach(o => objectWall.remove(o));
  flatWorks.length = 0;

  const data = window.PRINTS || {};
  const keys = Object.keys(data);
  const z = mountZ(1) - PRINT.standoff;
  const at = soulLayout().flat;

  for (let i = 0; i < FLAT_SLOTS; i++) {
    // both modes hang at the same 24 x 36 portrait sheet - the toggle swaps
    // what is ON the paper, not the paper
    const w = PRINT.w();

    const g = new T.Group();
    const tex = flatMode === 'cyano'
      ? cyanotypeTexture(400 + i * 53)
      : (() => {
          const t = new T.TextureLoader().load(data[keys[i % keys.length]].uri);
          t.colorSpace = T.SRGBColorSpace;
          return t;
        })();

    const face = new T.Mesh(
      new T.PlaneGeometry(w, PRINT.height),
      new T.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 })
    );
    face.rotation.y = Math.PI;
    face.position.z = -0.05;
    g.add(face);

    const backer = box(w + 1.4, PRINT.height + 1.4, 1.1, matte(0x20262a));
    backer.position.z = 0.6;
    backer.castShadow = true;
    g.add(backer);

    // card hangs under the work, on the board
    const card = galleryCard(`cyanotype-${i + 1}`,
      `${Math.round(PRINT.w())} x ${Math.round(PRINT.height)} in`);
    if (card) {
      card.rotation.y = Math.PI;
      card.position.set(0, -(PRINT.height / 2) - 1 - CARD.h / 2, -0.05);
      g.add(card);
    }

    g.position.set(at[i], PRINT.centerY, z);
    g.userData.slug = `cyanotype-${i + 1}`;
    objectWall.add(g);
    flatWorks.push(g);
  }
  return at[FLAT_SLOTS - 1] - at[0] + PRINT.w();
}
let wallRun = buildObjectWall();

/* ------------------------------------------- the wire pieces, on pedestals

   These used to sit on little wall shelves. They're free-standing sculpture,
   so they stand on the floor like sculpture: same pedestal as the hearts, set
   in the gaps between the cyanotypes rather than under them, so nothing is
   read as a caption for the thing above it. */

const sculptGroup = new T.Group();
scene.add(sculptGroup);

/* The soul wall is laid out on one 26" pitch, centred on the container, so the
   whole run alternates cleanly and nothing crowds anything:

     38  sculpture     64  cyanotype   90  LED heart   116  cyanotype
     142 decimated heart          168  cyanotype      194  sculpture

   Which also gives the walk a shape: a wire piece at the door, its own shadow
   next to it, the hearts in the middle, then the last wire piece immediately
   before you meet the machine that bent it. */
const SCULPTS = [
  { seed: 2200, slug: 'springback-1' },
  { seed: 2291, slug: 'springback-2' },
];

function pedestal(g) {
  const pl = box(PEDESTAL.d, PEDESTAL.h, PEDESTAL.w,
    matte(0x0d1012, { roughness: 0.72, metalness: 0.02 }));
  pl.position.y = PEDESTAL.h / 2;
  pl.castShadow = true; pl.receiveShadow = true;
  g.add(pl);

  const rev = box(PEDESTAL.d + 0.5, 0.4, PEDESTAL.w + 0.5,
    matte(0x22282b, { roughness: 0.6 }));
  rev.position.y = PEDESTAL.h - 0.2;
  g.add(rev);
  return g;
}

SCULPTS.forEach((spec, i) => {
  const g = pedestal(new T.Group());
  // 16" across: reads as sculpture, still sits inside the 15" pedestal top
  const piece = bentPiece(spec.seed, 0.15, 1, 16);   // 0.3" wire, 16" across
  // bentPiece recentres on its own origin, so half its height puts the bottom
  // flush on the pedestal top rather than floating above it
  const ph = new T.Box3().setFromObject(piece).getSize(new T.Vector3()).y;
  piece.position.y = PEDESTAL.h + ph / 2;
  g.add(piece);

  // same aimed head the decimated heart gets - these are unlit objects too
  const head = new T.SpotLight(0xfff6ec, 2600, 120, Math.PI * 26 / 180, 0.45, 2);
  head.position.set(0, 78, -22);
  head.target.position.set(0, PEDESTAL.h + 7, 0);
  g.add(head, head.target);

  const card = galleryCard(spec.slug);
  if (card) {
    card.rotation.y = Math.PI;
    card.position.set(0, PEDESTAL.h - 5, -PEDESTAL.w / 2 - 0.06);
    g.add(card);
  }

  g.position.set(soulLayout().sculpt[i], 0, DIM.wid / 2 - BOARD.proud - PEDESTAL.d / 2);
  g.userData.slug = spec.slug;
  sculptGroup.add(g);
});

/* ---------------------------------------- Mobius LED hearts, on two plinths

   A scaled-down build of mobius-led-heart: a heart-shaped ribbon of LED panels
   carrying a half twist, so one run of panels lights what reads as both sides.
   The ribbon starts on-edge (cookie-cutter) and rotates through 180 degrees
   around the loop - which is the whole point of the piece, and the reason it
   has to be modelled as oriented panels rather than a swept tube.

   Two of them: see HEARTS below for why the second one holds a mesh.
   -------------------------------------------------------------------------- */

const HEART = {
  height: 17,          // overall, scaled down from the ~57" full build
  panels: 30,
  ribbon: 2.2,         // width across the ribbon
  thick: 0.42,
  plinth: PEDESTAL,          // same pedestal as the wire pieces
};

/* A pair on matching plinths, at matching size: the LED ribbon heart, and
   decimated-78.stl - which is also a heart, reduced to 78 triangles. Neither
   contains the other; they stand as equals and the viewer does the comparing.
   One subject at two resolutions: the ribbon is the continuous curve, the mesh
   is what survives when you throw parameters away. That is the show's title,
   stated in objects. Check the clearances against the prints at x=50.6/116/181.4
   if the hang spacing or HEART.height changes. */
const HEARTS = [
  { contents: 'ribbon' },
  { contents: 'mesh'   },
];

const heartGroup = new T.Group();
scene.add(heartGroup);

function heartCurve() {
  const pts = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const st = Math.sin(t);
    pts.push(new T.Vector3(
      16 * st * st * st,
      13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
      0
    ));
  }
  return new T.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
}

/* The STL rides in as base64 float32 positions (see make_mesh.py). STL has no
   shared vertices, so this is a flat position array with computed normals.
   Returns null when mesh.js hasn't been generated yet. */
function meshGeometry() {
  const src = window.MESH;
  if (!src || !src.positions) return null;
  const bin = atob(src.positions);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(bytes.buffer), 3));
  geo.computeVertexNormals();
  geo.center();
  return geo;
}

/* Match on HEIGHT, not on the largest axis. Both hearts are wider than they are
   tall, so fitting the bounding cube would leave the mesh visibly shorter than
   the ribbon - and "the same size" is the entire point of the pairing. */
function fitHeight(geo, target) {
  geo.computeBoundingBox();
  return target / geo.boundingBox.getSize(new T.Vector3()).y;
}

function buildHeart(spec, atX) {
  const g = new T.Group();
  const zWall = DIM.wid / 2 - BOARD.proud - HEART.plinth.d / 2;

  // Identical plinths. If these ever drift apart the comparison stops being
  // about the hearts and starts being about the furniture.
  const pl = box(HEART.plinth.d, HEART.plinth.h, HEART.plinth.w,
    matte(0x0d1012, { roughness: 0.72, metalness: 0.02 }));
  pl.position.y = HEART.plinth.h / 2;
  pl.castShadow = true; pl.receiveShadow = true;
  g.add(pl);

  const rev = box(HEART.plinth.d + 0.5, 0.4, HEART.plinth.w + 0.5, matte(0x22282b, { roughness: 0.6 }));
  rev.position.y = HEART.plinth.h - 0.2;
  g.add(rev);

  // Shared centre height, so both hearts hang at the same eye level.
  const yMid = HEART.plinth.h + HEART.height / 2 + 1.2;

  const card = galleryCard(spec.contents === 'mesh' ? 'decimated-78' : 'mobius-heart');
  if (card) {
    card.rotation.y = Math.PI;
    card.position.set(0, PEDESTAL.h - 5, -PEDESTAL.w / 2 - 0.06);
    g.add(card);
  }

  if (spec.contents === 'mesh') {
    const geo = meshGeometry();
    /* Pewter, flat-shaded: at 78 triangles the facets ARE the piece. Keep
       metalness moderate - three.js scales indirect diffuse by (1 - metalness)
       and there is no env map here, so a high-metal surface has nothing to
       reflect and sinks to a dark blob away from a direct source. It got away
       with 0.62 while it sat inside a glowing ribbon; standing alone it can't. */
    const heart = geo
      ? new T.Mesh(geo, new T.MeshStandardMaterial({
          color: 0xa2acb1, roughness: 0.42, metalness: 0.32, flatShading: true }))
      // placeholder until make_mesh.py has been run - obviously a stand-in
      : new T.Mesh(new T.IcosahedronGeometry(1, 1), new T.MeshStandardMaterial({
          color: 0x6b7a80, roughness: 0.7, metalness: 0.1,
          flatShading: true, wireframe: true }));
    heart.scale.setScalar(fitHeight(heart.geometry, HEART.height));
    heart.position.y = yMid;
    heart.castShadow = true;
    heart.userData.placeholder = !geo;
    g.add(heart);
    g.userData.heart = heart;

    /* The head you'd actually aim at a sculpture on a plinth. The ribbon heart
       doesn't get one - it's its own source, and lighting it would only wash
       out the LEDs. Deliberately not a shadow caster: the directional already
       gives this heart a shadow, and a second one just fights it. */
    const head = new T.SpotLight(0xfff6ec, 3400, 120, Math.PI * 26 / 180, 0.45, 2);
    head.position.set(0, 78, -22);
    head.target.position.set(0, yMid, 0);
    g.add(head, head.target);

    g.position.set(atX, 0, zWall);
    heartGroup.add(g);
    return g;
  }

  const ribbon = new T.Group();
  const curve = heartCurve();
  const bb = new T.Box3().setFromPoints(curve.getPoints(200));
  const size = bb.getSize(new T.Vector3());
  const scale = HEART.height / size.y;
  const centre = bb.getCenter(new T.Vector3());

  const lit = new T.MeshStandardMaterial({
    color: 0x2a1016, emissive: 0xff3d6b, emissiveIntensity: 1.5,
    roughness: 0.4, metalness: 0.1,
  });
  const backing = new T.MeshStandardMaterial({ color: 0x14171a, roughness: 0.8, metalness: 0.2 });

  const segLen = curve.getLength() * scale / HEART.panels;
  const up = new T.Vector3(0, 0, 1);

  for (let i = 0; i < HEART.panels; i++) {
    const u = i / HEART.panels;
    const p = curve.getPointAt(u).sub(centre).multiplyScalar(scale);
    const tan = curve.getTangentAt(u).normalize();

    const twist = u * Math.PI;                       // the half twist
    const w = up.clone().applyAxisAngle(tan, twist).normalize();
    const side = new T.Vector3().crossVectors(tan, w).normalize();

    const panel = new T.Mesh(
      new T.BoxGeometry(HEART.ribbon, HEART.thick, segLen * 0.92),
      [backing, backing, lit, backing, backing, backing]
    );
    panel.position.copy(p);
    panel.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(w, side, tan));
    panel.castShadow = true;
    ribbon.add(panel);
  }

  ribbon.position.y = yMid;
  g.add(ribbon);
  g.userData.heart = ribbon;

  // Behind the ribbon plane rather than in it, so the panels read as the source
  // and the spill lands on the wall. Reaches the neighbouring plinth at 40",
  // which is how the decimated heart picks up its pink - that spill is real.
  const glow = new T.PointLight(0xff3d6b, 900, 70, 2);
  glow.position.set(0, yMid, -9);
  g.add(glow);

  g.position.set(atX, 0, zWall);
  heartGroup.add(g);
  return g;
}

HEARTS.forEach((spec, i) => buildHeart(spec, soulLayout().heart[i]));

/* Placed once the container dimensions are settled. Under the boards
   (BOARD.bottom = 32) on the container skin, at the door end. */
if (!labelsPlaced) {
  labelsPlaced = true;
  scene.add(labelGroup);

  // Proud of the corrugation, not flat on the skin: the ribs stand 1.4" in from
  // the wall, so a label sitting on the wall itself is chopped into fragments by
  // them. This is the vinyl applied across the rib faces, which is how it would
  // actually go on.
  const proud = DIM.ribDepth + 0.3;

  const mind = wallLabel('[/mind]', '#6FA8C6');
  mind.position.set(26, WALL_LABEL.y, -DIM.wid / 2 + proud);
  labelGroup.add(mind);

  const soul = wallLabel('[/soul]', '#3E7FB5');
  soul.rotation.y = Math.PI;
  soul.position.set(26, WALL_LABEL.y, DIM.wid / 2 - proud);
  labelGroup.add(soul);

  const body = wallLabel('[/body]', '#DE7B41');
  body.rotation.y = -Math.PI / 2;
  body.position.set(DIM.len - proud, WALL_LABEL.y, -26);
  labelGroup.add(body);
}

/* ------------------------------------------------- back wall: the wirebender */

const heroGroup = new T.Group();
scene.add(heroGroup);

const plinthX = DIM.len - PLINTH.d / 2 - 2;
const plinth = box(PLINTH.d, PLINTH.h, PLINTH.w, matte(0x0d1012, { roughness: 0.72, metalness: 0.02 }));
plinth.position.set(plinthX, PLINTH.h / 2, 0);
plinth.castShadow = true; plinth.receiveShadow = true;
heroGroup.add(plinth);

// a hairline reveal at the top so the black mass reads as a made object
const reveal = box(PLINTH.d + 0.5, 0.4, PLINTH.w + 0.5, matte(0x22282b, { roughness: 0.6 }));
reveal.position.set(plinthX, PLINTH.h - 0.2, 0);
heroGroup.add(reveal);

// the machine, read off the wirebender README: base plate, uprights carrying a
// rotating feed tube, extruder feeding from a spool, bending head on the end.
const bender = new T.Group();
bender.position.set(plinthX, PLINTH.h + 0.3, 0);

const benderCard = galleryCard('the-bender');
if (benderCard) {
  benderCard.rotation.y = -Math.PI / 2;                 // faces back down the corridor
  benderCard.position.set(plinthX - PLINTH.d / 2 - 0.06, PLINTH.h - 5, 0);
  heroGroup.add(benderCard);
}
heroGroup.add(bender);

const basePlate = box(9, 0.6, 30, metal(C.machine2));
basePlate.position.y = 0.3;
basePlate.castShadow = true;
bender.add(basePlate);

[[-9.5], [7.5]].forEach(([z]) => {
  const up = box(6.5, 7, 0.5, metal(C.machine2));
  up.position.set(0, 3.8, z);
  up.castShadow = true;
  bender.add(up);
});

const tube = new T.Mesh(
  new T.CylinderGeometry(0.75, 0.75, 20, 20),
  metal(0xb9c2c6, { roughness: 0.3 })
);
tube.rotation.x = Math.PI / 2;
tube.position.set(0, 5.2, -1);
tube.castShadow = true;
bender.add(tube);

// bending head — the orange end of the machine
const head = new T.Group();
head.position.set(0, 5.2, 9.6);
bender.add(head);
const cyclo = new T.Mesh(new T.CylinderGeometry(2.6, 2.6, 2.2, 28), metal(C.machine, { roughness: 0.35 }));
cyclo.rotation.z = Math.PI / 2;
cyclo.castShadow = true;
head.add(cyclo);
const motor = box(2.4, 2.4, 3.4, metal(0x2c3336));
motor.position.set(0, -3.4, 0.4);
head.add(motor);
const pin = new T.Mesh(new T.CylinderGeometry(0.28, 0.28, 2.4, 12), metal(0xe8eaea));
pin.position.set(1.7, 0, 1.6);
head.add(pin);

// extruder + spool feeding it
const extruder = box(4, 5, 4, metal(0x2c3336));
extruder.position.set(0, 4, -12);
extruder.castShadow = true;
bender.add(extruder);
const spool = new T.Mesh(new T.CylinderGeometry(5.5, 5.5, 3.2, 30), matte(0x53595d));
spool.rotation.z = Math.PI / 2;
spool.position.set(0, 6.5, -17.5);
spool.castShadow = true;
bender.add(spool);
const coil = new T.Mesh(new T.TorusGeometry(4.2, 1.5, 10, 32), metal(C.wire, { roughness: 0.35 }));
coil.rotation.y = Math.PI / 2;
coil.position.copy(spool.position);
bender.add(coil);

/* ------------------------------- the grid rack, and what accumulates on it */

const rack = new T.Group();
rack.position.set(DIM.len - 2.5, RACK.y + RACK.h / 2, 0);
heroGroup.add(rack);

const gridMat = metal(0x6a7479, { roughness: 0.5 });
for (let i = 0; i <= 8; i++) {
  const v = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, RACK.h, 6), gridMat);
  v.position.set(0, 0, -RACK.w / 2 + (RACK.w / 8) * i);
  rack.add(v);
}
for (let i = 0; i <= 5; i++) {
  const h = new T.Mesh(new T.CylinderGeometry(0.16, 0.16, RACK.w, 6), gridMat);
  h.rotation.x = Math.PI / 2;
  h.position.set(0, -RACK.h / 2 + (RACK.h / 5) * i, 0);
  rack.add(h);
}

// bent-wire pieces — this is what the machine makes while the show is open
const pieces = [];

function buildPieces(n) {
  pieces.forEach(p => rack.remove(p));
  pieces.length = 0;
  const cols = 4, rows = 3;
  for (let i = 0; i < n && i < cols * rows; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const g = new T.Group();
    g.add(bentPiece(1000 + i * 37));
    g.position.set(
      1.6,
      RACK.h / 2 - 6 - row * 9.5,
      -RACK.w / 2 + 7 + col * ((RACK.w - 14) / (cols - 1))
    );
    rack.add(g);
    pieces.push(g);
  }
}
buildPieces(6);

/* --------------------------------------------------- floor + sightline overlays */

const overlays = new T.Group();
scene.add(overlays);

// 36" clear circulation channel
const channel = new T.Group();
[-18, 18].forEach(z => {
  const stripe = box(DIM.len - 20, 0.12, 1.1, new T.MeshBasicMaterial({
    color: C.channel, transparent: true, opacity: 0.55,
  }));
  stripe.position.set(DIM.len / 2, 0.14, z);
  channel.add(stripe);
});
overlays.add(channel);

// the one long sightline in the box
const sightGeo = new T.BufferGeometry().setFromPoints([
  new T.Vector3(-10, EYE, 0),
  new T.Vector3(DIM.len - BENCH.d - 6, BENCH.h + 8, 0),
]);
const sight = new T.Line(sightGeo, new T.LineDashedMaterial({
  color: C.sight, dashSize: 5, gapSize: 4, transparent: true, opacity: 0.9,
}));
sight.computeLineDistances();
overlays.add(sight);

// max standoff from each long wall, drawn across the box
[[0.36], [0.62]].forEach(([f]) => {
  const g = new T.BufferGeometry().setFromPoints([
    new T.Vector3(DIM.len * f, 3, -DIM.wid / 2 + 2),
    new T.Vector3(DIM.len * f, 3, DIM.wid / 2 - 2),
  ]);
  const l = new T.Line(g, new T.LineDashedMaterial({
    color: 0x8c9aa0, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.55,
  }));
  l.computeLineDistances();
  overlays.add(l);
});

/* ------------------------------------------------------------- human figure */

// Opaque on purpose: overlapping transparent parts don't depth-sort against
// each other, which made the figure read as two disconnected blobs.
function makeFigure() {
  const g = new T.Group();
  const m = matte(C.figure, { roughness: 0.88 });

  const legs = new T.Mesh(new T.CylinderGeometry(5.4, 4.2, 34, 16), m);
  legs.position.y = 17; g.add(legs);

  const torso = new T.Mesh(new T.CapsuleGeometry(6.0, 14, 6, 16), m);
  torso.position.y = 47; g.add(torso);

  const neck = new T.Mesh(new T.CylinderGeometry(2.1, 2.4, 5, 12), m);
  neck.position.y = 60.5; g.add(neck);

  const head = new T.Mesh(new T.SphereGeometry(3.8, 20, 16), m);
  head.position.y = FIGURE_H - 3.8; g.add(head);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
const figure = makeFigure();
figure.position.set(96, 0, 6);
// off by default - it's a scale reference, not part of the show. The view
// switcher re-reads t-figure, but nothing sets the initial state, so set it
// here or the figure is visible on load with its checkbox unticked.
figure.visible = false;
scene.add(figure);

/* -------------------------------------------------------------- camera rig */

// Default: elevated, just outside the open doors, looking straight down the
// corridor. Both long walls stay in frame and neither needs culling.
const HOME = { az: -3.068, pol: 1.185, dist: 236, tx: 138, ty: 50 };

const target = new T.Vector3(HOME.tx, HOME.ty, 0);
const orbit = { az: HOME.az, pol: HOME.pol, dist: HOME.dist };
let mode = 'orbit';
let walkX = 26, walkYaw = 0, walkPitch = -0.04;

function applyCamera() {
  if (mode === 'walk') {
    camera.position.set(walkX, EYE, 0);
    const dir = new T.Vector3(
      Math.cos(walkPitch) * Math.cos(walkYaw),
      Math.sin(walkPitch),
      Math.cos(walkPitch) * Math.sin(walkYaw)
    );
    camera.lookAt(camera.position.clone().add(dir));
    camera.fov = fovFor(62);
  } else {
    const d = orbit.dist * fitScale();
    const p = new T.Vector3(
      target.x + d * Math.sin(orbit.pol) * Math.cos(orbit.az),
      target.y + d * Math.cos(orbit.pol),
      target.z + d * Math.sin(orbit.pol) * Math.sin(orbit.az)
    );
    camera.position.copy(p);
    camera.lookAt(target);
    camera.fov = 50;
  }
  camera.updateProjectionMatrix();
}

// how much further back an orbit view sits on a narrower-than-reference screen
function fitScale() {
  if (!(camera.aspect < FOV_REF_ASPECT)) return 1;
  return Math.min(FOV_REF_ASPECT / camera.aspect, FIT_MAX);
}

function fovFor(base) {
  if (!(camera.aspect < FOV_REF_ASPECT)) return base;
  const halfH = Math.tan(base * Math.PI / 360) * FOV_REF_ASPECT;
  return Math.min(2 * Math.atan(halfH / camera.aspect) * 180 / Math.PI, FOV_WALK_MAX);
}

/* ------------------------------------------------------------ interaction */

const el = renderer.domElement;
let drag = null;

/* Touch: pointer events already give us drag-to-look for free, but a phone has
   no wheel, so without a pinch handler there is no way to zoom or to walk the
   corridor. Track every live pointer; two down means pinch, and we suspend the
   one-finger orbit so the model doesn't lurch while zooming. The canvas sets
   touch-action:none or the browser pans the page instead of telling us. */
const touches = new Map();
let pinch = 0;

const pinchGap = () => {
  const [a, b] = [...touches.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
};

function zoomBy(factor) {
  if (mode === 'walk') {
    walkX = Math.max(-24, Math.min(DIM.len - 34, walkX + (factor - 1) * 220));
  } else {
    orbit.dist = Math.max(40, Math.min(900, orbit.dist / factor));
  }
  applyCamera();
}

el.addEventListener('pointerdown', e => {
  el.setPointerCapture(e.pointerId);
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { pinch = pinchGap(); drag = null; return; }
  drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
});

function endPointer(e) {
  touches.delete(e.pointerId);
  if (touches.size < 2) pinch = 0;
  drag = null;
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
}
el.addEventListener('pointerup', endPointer);
el.addEventListener('pointercancel', endPointer);
el.addEventListener('contextmenu', e => e.preventDefault());

el.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (touches.size === 2) {
    const gap = pinchGap();
    if (pinch > 0 && gap > 0) zoomBy(gap / pinch);
    pinch = gap;
    return;
  }

  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;

  if (mode === 'walk') {
    walkYaw += dx * 0.005;
    walkPitch = Math.max(-0.85, Math.min(0.85, walkPitch - dy * 0.004));
  } else if (drag.pan) {
    const right = new T.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new T.Vector3().setFromMatrixColumn(camera.matrix, 1);
    target.addScaledVector(right, -dx * orbit.dist * 0.0016);
    target.addScaledVector(up, dy * orbit.dist * 0.0016);
  } else {
    orbit.az += dx * 0.006;
    orbit.pol = Math.max(0.12, Math.min(Math.PI - 0.12, orbit.pol - dy * 0.006));
  }
  applyCamera();
});

el.addEventListener('wheel', e => {
  e.preventDefault();
  if (mode === 'walk') {
    walkX = Math.max(-24, Math.min(DIM.len - 34, walkX - e.deltaY * 0.22));
  } else {
    orbit.dist = Math.max(40, Math.min(900, orbit.dist * (1 + e.deltaY * 0.0011)));
  }
  applyCamera();
}, { passive: false });

addEventListener('keydown', e => {
  if (mode !== 'walk') return;
  const step = 7;
  if (e.key === 'ArrowUp' || e.key === 'w') walkX = Math.min(DIM.len - 34, walkX + step);
  if (e.key === 'ArrowDown' || e.key === 's') walkX = Math.max(-24, walkX - step);
  applyCamera();
});

/* ------------------------------------------------------------------- views */

const VIEWS = {
  orbit: () => {
    mode = 'orbit';
    Object.assign(orbit, { az: HOME.az, pol: HOME.pol, dist: HOME.dist });
    target.set(HOME.tx, HOME.ty, 0);
  },
  plan:  () => { mode = 'orbit'; Object.assign(orbit, { az: -Math.PI / 2, pol: 0.13, dist: 290 }); target.set(DIM.len * 0.5, 0, 0); },
  hero:  () => { mode = 'walk'; walkX = 24; walkYaw = 0; walkPitch = -0.03; },
  door:  () => { mode = 'orbit'; Object.assign(orbit, { az: -3.05, pol: 1.42, dist: 150 }); target.set(70, 46, 0); },
  // Face-on elevations. Each puts the eye outside one long wall, so the culling
  // drops the near wall and its work, and you read the far wall square-on.
  wallA: () => {
    mode = 'orbit';
    Object.assign(orbit, { az: Math.PI / 2, pol: 1.53, dist: 196 });
    target.set(DIM.len / 2, 52, -DIM.wid / 2);
  },
  wallB: () => {
    mode = 'orbit';
    Object.assign(orbit, { az: -Math.PI / 2, pol: 1.53, dist: 196 });
    target.set(DIM.len / 2, 52, DIM.wid / 2);
  },
};

/* ------------------------------------------------------------------- stats */

const OK = '\u2713', NO = '\u2717';

// Does a piece of given height, centred at cy, land entirely on the boards?
function onBoard(cy, h) {
  return cy - h / 2 >= BOARD.bottom && cy + h / 2 <= BOARD.top;
}

function updateStats() {
  const monRun = DIM.len - MON.margin * 2;
  // boards and the frame plate both eat width off the walkway
  const clear = DIM.wid - BOARD.proud * 2 - (MON.standoff + MON.depth + FRAME.thick()) - PRINT.standoff - 1.1;
  const corridor = DIM.len - BENCH.d - 2;

  // the STEEL is what has to land on the boards, not the panel
  const monOK = onBoard(MON.centerY, FRAME.h());

  // plate weight: what actually hangs on the gallery's boards
  let steelLb = 0;
  monitors.forEach(m => {
    const p = m.userData.plate;
    if (p) steelLb += (p.userData.plateArea - p.userData.cutArea) * FRAME.thick() * FRAME.density();
  });
  const rigLb = steelLb + MON.count * 10;   // + roughly 10 lb a panel
  const flatOK = onBoard(PRINT.centerY, PRINT.height);

  const rows = [
    ['Container', `${feetInches(DIM.len)} ${TIMES} ${feetInches(DIM.wid)} ${TIMES} ${feetInches(DIM.hgt)}`],
    ['Mounting boards', `${BOARD.bottom}${DPR}\u2013${BOARD.top}${DPR} ${DOT} ${feetInches(BOARD.top - BOARD.bottom)} band`],
    ['Frames on board', `${monOK ? OK : NO} ${FRAME.w().toFixed(0)}${DPR} ${TIMES} ${FRAME.h().toFixed(0)}${DPR} plate`],
    ['Flat work on board', `${flatOK ? OK : NO} centre ${PRINT.centerY}${DPR}`],
    ['Frame run', `${feetInches(monRun)} ${DOT} ${MON.count} ${TIMES} ${MON.diag}${DPR} portrait`],
    ['Ethernet run', `${feetInches(cableRun)} ${DOT} board to board`],
    [`${FRAME.mat().label} on the wall`, `${steelLb.toFixed(0)} lb plate ${DOT} ${rigLb.toFixed(0)} lb rigged`],
    ['Cut process', `${FRAME.mat().process} ${DOT} ${FRAME.thick()}${DPR} stock`],
    ['Soul wall run', `${feetInches(wallRun)} ${DOT} ${flatWorks.length} flat + ${SCULPTS.length} on pedestals`],
    ['Soul wall clearance', `${soulLayout().gap < SOUL.minGap ? NO : OK} ${soulLayout().gap.toFixed(1)}${DPR} between works`],
    ['Clear channel', `${feetInches(clear)} (need 3${PR})`],
    ['Corridor to machine', feetInches(corridor)],
    ['Pieces on rack', `${pieces.length} of 12`],
  ];

  document.getElementById('stats').innerHTML = rows.map(([k, v]) =>
    `<div class="srow"><span>${k}</span><b>${v}</b></div>`
  ).join('');

  /* --- energy budget --- */

  const screensOn = document.getElementById('t-screens').checked;
  const draw =
    (screensOn ? MON.count * (POWER.monitor + POWER.backlight) + 2 * POWER.jetson : 0) +
    POWER.bender + POWER.track;

  const dailyKWh = draw * SHOW.hoursOpen / 1000;
  const runtimeH = draw > 0
    ? SHOW.batteryKWh * 1000 * SHOW.inverterEff / draw
    : Infinity;
  const short = runtimeH < SHOW.hoursOpen;

  const prows = [
    ['Continuous draw', `${Math.round(draw)} W`],
    ['With UV panel', `${Math.round(draw + POWER.uv)} W`],
    ['Per ' + SHOW.hoursOpen + '-hour day', `${dailyKWh.toFixed(2)} kWh`],
    ['Runtime on one charge', `${runtimeH.toFixed(1)} h`],
    ['Covers the day', short ? `${NO} short by ${(SHOW.hoursOpen - runtimeH).toFixed(1)} h` : `${OK} with margin`],
  ];

  document.getElementById('power').innerHTML = prows.map(([k, v]) =>
    `<div class="srow"><span>${k}</span><b>${v}</b></div>`
  ).join('');

  document.getElementById('warn').style.display = clear < 36 ? 'block' : 'none';
  document.getElementById('warn-board').style.display = (monOK && flatOK) ? 'none' : 'block';
  document.getElementById('warn-power').style.display = short ? 'block' : 'none';
}

/* ------------------------------------------------------------------ ui wiring */

function bind(id, fn) {
  const n = document.getElementById(id);
  if (!n) return;
  const evt = n.type === 'checkbox' || n.tagName === 'BUTTON' ? 'click' : 'input';
  n.addEventListener(evt, () => fn(n));
}

bind('t-ceiling', n => { ceilingWanted = n.checked; });
bind('t-hicube', n => {
  const h = n.checked ? DIM.hgtHiCube : 94;
  const s = h / DIM.hgt;
  shell.scale.y = s;
  DIM.hgt = h;
  updateStats();
});
bind('t-sight', n => { sight.visible = n.checked; });
bind('t-channel', n => { channel.visible = n.checked; });
bind('t-screens', n => {
  monitors.forEach((m, i) => {
    m.userData.screen.material = n.checked ? screenMats[i % 4] : screenOffMat;
    m.userData.glow.visible = n.checked;
  });
  updateStats();          // screens are most of the load
});
document.querySelectorAll('[data-mat]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-mat]').forEach(o => o.classList.remove('on'));
    b.classList.add('on');
    FRAME.material = b.dataset.mat;
    buildMonitors();
    cableRun = buildCable();
    // re-apply the toggles the rebuild just discarded
    ['t-screens', 't-backlight'].forEach(id => document.getElementById(id).dispatchEvent(new Event('click')));
    updateStats();
  });
});

bind('t-backlight', n => {
  monitors.forEach(m => {
    m.userData.halo.visible = n.checked;
    m.userData.backlight.visible = n.checked;
  });
});
bind('t-figure', n => { figure.visible = n.checked; });
bind('t-heart', n => { heartGroup.visible = n.checked; });
bind('t-cards', n => { cardGroup.forEach(c => { c.visible = n.checked; }); });
bind('t-walllabels', n => { labelGroup.visible = n.checked; });
bind('t-cable', n => {
  cableVisible = n.checked;
  if (cable) cable.visible = cableVisible;
});

bind('s-monh', n => {
  MON.centerY = +n.value;
  monitors.forEach(m => { m.position.y = MON.centerY; });
  cableRun = buildCable();
  document.getElementById('v-monh').textContent = `${MON.centerY}${DPR}`;
  updateStats();          // re-check the steel still lands on the boards
});
function rebuildSoulWall() {
  wallRun = buildObjectWall();
  const L = soulLayout();
  sculptGroup.children.forEach((g, i) => { g.position.x = L.sculpt[i]; });
  heartGroup.children.forEach((g, i) => { g.position.x = L.heart[i]; });
  document.getElementById('v-printh').textContent = `${PRINT.height}${DPR}`;
  document.getElementById('v-flatsz').textContent =
    `${Math.round(PRINT.w())} ${TIMES} ${Math.round(PRINT.height)}${DPR}`;
  updateStats();
}

bind('s-printh', n => {
  PRINT.height = +n.value;
  rebuildSoulWall();
});

bind('t-flatbig', n => {
  const sz = FLAT_SIZES[n.checked ? 'large' : 'small'];
  PRINT.size = n.checked ? 'large' : 'small';
  PRINT.height = sz.h;
  PRINT.ratio = sz.w / sz.h;
  document.getElementById('s-printh').value = String(Math.round(PRINT.height));
  rebuildSoulWall();
});
bind('t-cyano', n => {
  flatMode = n.checked ? 'cyano' : 'prints';
  wallRun = buildObjectWall();
  updateStats();
});
bind('t-boards', n => {
  boards[-1].visible = boards[+1].visible = n.checked;
});

function rebuildBoards() {
  buildBoards();
  buildMonitors();
  wallRun = buildObjectWall();
  document.getElementById('v-btop').textContent = `${BOARD.top}${DPR}`;
  document.getElementById('v-bbot').textContent = `${BOARD.bottom}${DPR}`;
  updateStats();
}
bind('s-btop', n => { BOARD.top = Math.max(+n.value, BOARD.bottom + 6); rebuildBoards(); });
bind('s-bbot', n => { BOARD.bottom = Math.min(+n.value, BOARD.top - 6); rebuildBoards(); });

bind('s-hours', n => {
  SHOW.hoursOpen = +n.value;
  document.getElementById('v-hours').textContent = `${SHOW.hoursOpen} h`;
  updateStats();
});
bind('s-batt', n => {
  SHOW.batteryKWh = +n.value / 10;
  document.getElementById('v-batt').textContent = `${SHOW.batteryKWh.toFixed(1)} kWh`;
  updateStats();
});
bind('s-figx', n => {
  figure.position.x = +n.value;
  document.getElementById('v-figx').textContent = feetInches(+n.value);
});
bind('s-pieces', n => {
  buildPieces(+n.value);
  document.getElementById('v-pieces').textContent = `day ${Math.max(1, Math.round(+n.value / 2.2))}`;
  updateStats();
});

document.querySelectorAll('[data-view]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('[data-view]').forEach(o => o.classList.remove('on'));
    b.classList.add('on');
    const v = b.dataset.view;
    VIEWS[v]();
    applyCamera();
    // The elevations exist to judge hang heights; a 5'10" body parked mid-wall
    // just occludes them.
    const elevation = v === 'wallA' || v === 'wallB';
    figure.visible = !elevation && document.getElementById('t-figure').checked;
    document.getElementById('walkhint').style.display = mode === 'walk' ? 'block' : 'none';
  });
});

/* ------------------------------------------------------------------- loop */

function resize() {
  const w = el.parentElement.clientWidth, h = el.parentElement.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  applyCamera();          // re-derives the fov for the new aspect
}
addEventListener('resize', resize);

/* ------------------------------------------------------------ mobile drawer */

const handle = document.getElementById('drawer-handle');
const scrim = document.getElementById('scrim');

function setPanel(open) {
  document.body.classList.toggle('panel-open', open);
  handle.setAttribute('aria-expanded', open ? 'true' : 'false');
  handle.textContent = open ? 'Close' : 'Controls';
}
handle.addEventListener('click', () => setPanel(!document.body.classList.contains('panel-open')));
scrim.addEventListener('click', () => setPanel(false));
addEventListener('keydown', e => { if (e.key === 'Escape') setPanel(false);

/* On a phone the corridor orbit reads as a small object in a tall frame. The
   door view looks straight down the length of the container, which is a
   naturally tall composition and fills a portrait screen. */
if (matchMedia('(max-width: 860px)').matches) {
  const btn = document.querySelector('[data-view="door"]');
  if (btn) btn.click();
} });

// picking a view on a phone means you want to see it, not the panel you tapped
document.querySelectorAll('[data-view]').forEach(b =>
  b.addEventListener('click', () => {
    if (matchMedia('(max-width: 860px)').matches) setPanel(false);

/* On a phone the corridor orbit reads as a small object in a tall frame. The
   door view looks straight down the length of the container, which is a
   naturally tall composition and fills a portrait screen. */
if (matchMedia('(max-width: 860px)').matches) {
  const btn = document.querySelector('[data-view="door"]');
  if (btn) btn.click();
}
  }));

setPanel(false);

/* On a phone the corridor orbit reads as a small object in a tall frame. The
   door view looks straight down the length of the container, which is a
   naturally tall composition and fills a portrait screen. */
if (matchMedia('(max-width: 860px)').matches) {
  const btn = document.querySelector('[data-view="door"]');
  if (btn) btn.click();
}

resize();
applyCamera();
updateStats();

// Doll's-house culling: drop whichever shell faces sit between the eye and the
// interior, so an orbiting camera always looks *into* the box instead of at it.
let ceilingWanted = false;

function cullShell() {
  if (mode === 'walk') {
    wallNeg.visible = wallPos.visible = backWall.visible = true;
    computeWall.visible = objectWall.visible = true;
    ceiling.visible = ceilingWanted;
    return;
  }
  // A wall and the work hung on it cull together — hiding only the wall would
  // leave the backs of the monitors and frames floating in mid-air.
  const seeNeg = camera.position.z > -DIM.wid / 2;
  const seePos = camera.position.z < DIM.wid / 2;
  wallNeg.visible = computeWall.visible = seeNeg;
  wallPos.visible = objectWall.visible = seePos;
  backWall.visible = camera.position.x < DIM.len;
  ceiling.visible = ceilingWanted && camera.position.y < DIM.hgt;
  doorFrame.visible = camera.position.y < DIM.hgt && camera.position.x < 0;
}

// Exposed so the layout can be poked from the console while hanging the show.
window.SB = { scene, camera, objectWall, computeWall, flatWorks, sculptGroup, heartGroup,
              pieces, DIM, MON, PRINT, PEDESTAL, buildObjectWall };

renderer.setAnimationLoop(() => {
  cullShell();
  renderer.render(scene, camera);
});

})();
