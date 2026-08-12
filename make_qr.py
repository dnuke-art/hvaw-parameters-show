#!/usr/bin/env python3
"""Generate real, scannable QR codes for the piece labels -> qr.js.

Stdlib only: there is no qrcode/segno on this box, and the previz has to stay a
single self-contained file anyway, so the codes travel inline as module bitmaps
rather than as images.

Byte mode, ECC level M (~15% recovery), versions 1-10 auto-selected. That covers
URLs up to 213 characters, which is far more than any of these need.

    python3 make_qr.py                      # uses BASE below
    python3 make_qr.py --base https://x.y/  # override the target
    python3 make_qr.py --show decimated-78  # ASCII-render one code to check it

Writes qr.js next to this script. Re-run build.py afterwards.

NOTE: BASE is a placeholder until the real Curiate links exist. Change it here,
re-run, rebuild - nothing else in the project hardcodes a URL.
"""

import argparse
import base64
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / 'qr.js'

BASE = 'https://parameters.dnuke.art/p/'

# The gallery cards. One row per work, and the single source of truth for both
# the QR target and the card text the previz draws - scene.js reads all of this
# back out of qr.js, so nothing is typed twice.
#
# ARTIST, YEAR, and every `medium` are Dan's to correct. Dimensions come from
# the model and are real; media are a first pass.
ARTIST = 'Dan Newcome'
YEAR = 2026

# slug, title, medium, dimensions
PIECES = [
    ('split',        'Split',            'Two Jetson AGX Xavier, 27" panel, cut steel', '21 x 32 in'),
    ('routed',       'Routed',           'Single-channel video, 27" panel, cut steel',  '21 x 32 in'),
    ('observed',     'Observed',         'Single-channel video, 27" panel, cut steel',  '21 x 32 in'),
    ('present',      'Present',          'Live camera, 27" panel, cut steel',           '21 x 32 in'),
    ('springback-1', 'Springback I',     'Bent steel wire',                             '16 x 11 x 16 in'),
    ('springback-2', 'Springback II',    'Bent steel wire',                             '16 x 7 x 4 in'),
    ('cyanotype-1',  'Shadow I',         'Cyanotype photogram on cotton rag',           '14 x 18 in'),
    ('cyanotype-2',  'Shadow II',        'Cyanotype photogram on cotton rag',           '14 x 18 in'),
    ('cyanotype-3',  'Shadow III',       'Cyanotype photogram on cotton rag',           '14 x 18 in'),
    ('mobius-heart', 'Mobius Heart',     'Addressable LED panels, half-twist ribbon',   '21 x 19 x 2 in'),
    ('decimated-78', 'Decimated (78)',   'Faceted heart, 78 triangles',                 '21 x 17 x 12 in'),
    ('the-bender',   'The Bender',       'CNC wire bender, steel, running',             'Dimensions variable'),
]

# ---------------------------------------------------------------- GF(256)

EXP = [0] * 512
LOG = [0] * 256


def _init_tables():
    x = 1
    for i in range(255):
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D          # QR's primitive polynomial
    for i in range(255, 512):
        EXP[i] = EXP[i - 255]


_init_tables()


def gmul(a, b):
    if a == 0 or b == 0:
        return 0
    return EXP[LOG[a] + LOG[b]]


def poly_mul(p, q):
    r = [0] * (len(p) + len(q) - 1)
    for i, a in enumerate(p):
        if a:
            for j, b in enumerate(q):
                r[i + j] ^= gmul(a, b)
    return r


def rs_generator(n):
    g = [1]
    for i in range(n):
        g = poly_mul(g, [1, EXP[i]])
    return g


def rs_encode(data, n):
    """Remainder of data*x^n mod generator - the EC codewords."""
    g = rs_generator(n)
    res = list(data) + [0] * n
    for i in range(len(data)):
        c = res[i]
        if c:
            for j, gj in enumerate(g):
                res[i + j] ^= gmul(gj, c)
    return res[len(data):]


def syndromes_zero(codeword, n):
    """A full codeword evaluated at a^0..a^(n-1) must be 0 everywhere.

    This is the real check on the RS maths - if the generator, the polynomial
    ordering or the remainder were wrong, these would not vanish.
    """
    for i in range(n):
        acc = 0
        for c in codeword:
            acc = gmul(acc, EXP[i]) ^ c
        if acc != 0:
            return False
    return True


# ------------------------------------------------------------ version data

# ECC level M: (ec codewords per block, [(block count, data codewords), ...])
ECC_M = {
    1:  (10, [(1, 16)]),
    2:  (16, [(1, 28)]),
    3:  (26, [(1, 44)]),
    4:  (18, [(2, 32)]),
    5:  (24, [(2, 43)]),
    6:  (16, [(4, 27)]),
    7:  (18, [(4, 31)]),
    8:  (22, [(2, 38), (2, 39)]),
    9:  (22, [(3, 36), (2, 37)]),
    10: (26, [(4, 43), (1, 44)]),
}

ALIGN = {
    1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
    6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
}


def data_codewords(version):
    return sum(cnt * dcw for cnt, dcw in ECC_M[version][1])


def count_bits(version):
    # byte mode: 8-bit character count for v1-9, 16-bit from v10
    return 8 if version <= 9 else 16


def pick_version(nbytes):
    for v in range(1, 11):
        cap = (data_codewords(v) * 8 - 4 - count_bits(v)) // 8
        if nbytes <= cap:
            return v
    raise SystemExit(f'URL too long for version 10 ECC M: {nbytes} bytes')


# ---------------------------------------------------------------- encoding

def encode_data(text, version):
    data = text.encode('utf-8')
    bits = []

    def put(val, n):
        for i in range(n - 1, -1, -1):
            bits.append((val >> i) & 1)

    put(0b0100, 4)                       # byte mode
    put(len(data), count_bits(version))
    for b in data:
        put(b, 8)

    total = data_codewords(version) * 8
    put(0, min(4, total - len(bits)))    # terminator
    while len(bits) % 8:
        bits.append(0)

    cw = [int(''.join(str(b) for b in bits[i:i + 8]), 2) for i in range(0, len(bits), 8)]
    pad = [0xEC, 0x11]
    i = 0
    while len(cw) < data_codewords(version):
        cw.append(pad[i % 2])
        i += 1
    return cw


def interleave(cw, version):
    ecc_n, groups = ECC_M[version]

    blocks, ecblocks, pos = [], [], 0
    for cnt, dcw in groups:
        for _ in range(cnt):
            blk = cw[pos:pos + dcw]
            pos += dcw
            blocks.append(blk)
            ec = rs_encode(blk, ecc_n)
            if not syndromes_zero(blk + ec, ecc_n):
                raise SystemExit('RS self-check failed - encoder is wrong')
            ecblocks.append(ec)

    out = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b):
                out.append(b[i])
    for i in range(ecc_n):
        for b in ecblocks:
            out.append(b[i])
    return out


# ------------------------------------------------------------ matrix build

def new_matrix(version):
    size = 17 + 4 * version
    m = [[None] * size for _ in range(size)]   # None = free
    return m, size


def place_finder(m, size, r, c):
    for dr in range(-1, 8):
        for dc in range(-1, 8):
            rr, cc = r + dr, c + dc
            if not (0 <= rr < size and 0 <= cc < size):
                continue
            inring = (0 <= dr <= 6 and 0 <= dc <= 6)
            if not inring:
                m[rr][cc] = 0                        # separator
            else:
                edge = dr in (0, 6) or dc in (0, 6)
                core = 2 <= dr <= 4 and 2 <= dc <= 4
                m[rr][cc] = 1 if (edge or core) else 0


def place_function_patterns(m, size, version):
    place_finder(m, size, 0, 0)
    place_finder(m, size, 0, size - 7)
    place_finder(m, size, size - 7, 0)

    for i in range(size):                            # timing
        if m[6][i] is None:
            m[6][i] = 1 if i % 2 == 0 else 0
        if m[i][6] is None:
            m[i][6] = 1 if i % 2 == 0 else 0

    centres = ALIGN[version]
    for r in centres:
        for c in centres:
            # skip the three that would sit on a finder
            if (r < 8 and c < 8) or (r < 8 and c > size - 9) or (r > size - 9 and c < 8):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    ring = max(abs(dr), abs(dc))
                    m[r + dr][c + dc] = 1 if ring != 1 else 0

    m[size - 8][8] = 1                               # dark module


def reserve_format(m, size, version):
    spots = []
    for i in range(9):
        if m[8][i] is None:
            spots.append((8, i))
        if m[i][8] is None:
            spots.append((i, 8))
    for i in range(8):
        spots.append((8, size - 1 - i))
        spots.append((size - 1 - i, 8))
    if version >= 7:
        for i in range(6):
            for j in range(3):
                spots.append((size - 11 + j, i))
                spots.append((i, size - 11 + j))
    return set(spots)


def place_data(m, size, codewords, reserved):
    bits = []
    for cw in codewords:
        for i in range(7, -1, -1):
            bits.append((cw >> i) & 1)

    idx = 0
    col = size - 1
    upward = True
    while col > 0:
        if col == 6:                                 # skip the timing column
            col -= 1
        rows = range(size - 1, -1, -1) if upward else range(size)
        for r in rows:
            for c in (col, col - 1):
                if m[r][c] is None and (r, c) not in reserved:
                    m[r][c] = bits[idx] if idx < len(bits) else 0
                    idx += 1
        upward = not upward
        col -= 2
    return idx


MASKS = [
    lambda r, c: (r + c) % 2 == 0,
    lambda r, c: r % 2 == 0,
    lambda r, c: c % 3 == 0,
    lambda r, c: (r + c) % 3 == 0,
    lambda r, c: (r // 2 + c // 3) % 2 == 0,
    lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
    lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
    lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
]


def penalty(m, size):
    score = 0

    # rule 1: runs of 5+ same-colour modules
    for line in list(m) + [list(col) for col in zip(*m)]:
        run, prev = 1, line[0]
        for v in line[1:]:
            if v == prev:
                run += 1
            else:
                if run >= 5:
                    score += 3 + (run - 5)
                run, prev = 1, v
        if run >= 5:
            score += 3 + (run - 5)

    # rule 2: 2x2 blocks of one colour
    for r in range(size - 1):
        for c in range(size - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3

    # rule 3: the 1:1:3:1:1 finder-lookalike, with 4 light either side
    pats = ([1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1])
    for line in list(m) + [list(col) for col in zip(*m)]:
        for i in range(size - 10):
            if list(line[i:i + 11]) in pats:
                score += 40

    # rule 4: deviation from 50% dark
    dark = sum(v for row in m for v in row)
    pct = dark * 100 // (size * size)
    score += 10 * (min(abs(pct - 50) // 5, 10))
    return score


def format_bits(mask):
    """15-bit format info for ECC M (indicator 00) + BCH(15,5) + XOR mask."""
    data = (0b00 << 3) | mask
    v = data << 10
    g = 0b10100110111
    for i in range(14, 9, -1):
        if v & (1 << i):
            v ^= g << (i - 10)
    return ((data << 10) | v) ^ 0b101010000010010


def version_bits(version):
    v = version << 12
    g = 0b1111100100101
    for i in range(17, 11, -1):
        if v & (1 << i):
            v ^= g << (i - 12)
    return (version << 12) | v


def apply_format(m, size, version, mask):
    fmt = format_bits(mask)
    bits = [(fmt >> i) & 1 for i in range(15)]       # bit 0 = LSB first

    # copy 1: around the top-left finder
    pos = []
    for i in range(6):
        pos.append((8, i))
    pos.append((8, 7))
    pos.append((8, 8))
    pos.append((7, 8))
    for i in range(5, -1, -1):
        pos.append((i, 8))
    for i, (r, c) in enumerate(pos):
        m[r][c] = bits[i]

    # copy 2: 7 bits up the left column, then 8 along row 8 on the right.
    # (size-8, 8) is NOT one of them - that's the dark module, always 1.
    for i in range(7):
        m[size - 1 - i][8] = bits[i]
    for i in range(8):
        m[8][size - 8 + i] = bits[7 + i]

    if version >= 7:
        vb = version_bits(version)
        for i in range(18):
            b = (vb >> i) & 1
            r, c = i // 3, i % 3
            m[size - 11 + c][r] = b
            m[r][size - 11 + c] = b


def make_matrix(text):
    nbytes = len(text.encode('utf-8'))
    version = pick_version(nbytes)
    cw = interleave(encode_data(text, version), version)

    best = None
    for mask in range(8):
        m, size = new_matrix(version)
        place_function_patterns(m, size, version)
        reserved = reserve_format(m, size, version)
        used = place_data(m, size, cw, reserved)
        if used < len(cw) * 8:
            raise SystemExit(f'only placed {used} of {len(cw)*8} data bits')

        # mask only the data region: rebuild knowing which cells were data
        m2, _ = new_matrix(version)
        place_function_patterns(m2, size, version)
        datacells = [(r, c) for r in range(size) for c in range(size)
                     if m2[r][c] is None and (r, c) not in reserved]
        for (r, c) in datacells:
            if MASKS[mask](r, c):
                m[r][c] ^= 1

        apply_format(m, size, version, mask)
        if any(m[r][c] is None for r in range(size) for c in range(size)):
            raise SystemExit('matrix has unfilled modules')
        p = penalty(m, size)
        if best is None or p < best[0]:
            best = (p, m, size, version, mask)

    _, m, size, version, mask = best
    return m, size, version, mask


def to_rows(m):
    return [''.join(str(v) for v in row) for row in m]


def ascii_art(m):
    out = []
    pad = '  ' * (len(m) + 4)
    out.append(pad)
    out.append(pad)
    for row in m:
        out.append('    ' + ''.join('##' if v else '  ' for v in row) + '    ')
    out.append(pad)
    out.append(pad)
    return '\n'.join(out)


# ------------------------------------------------------------- self-test

# Published 15-bit format strings for ECC M, masks 0-7. An independent oracle:
# if the BCH maths or the XOR mask were wrong, these would not match.
FORMAT_M = [
    0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011,
    0b100010111111001, 0b100000011001110, 0b100111110010111, 0b100101010100000,
]


def decode(m):
    """Read a finished matrix back to a string. Deliberately walks the symbol
    from scratch - format info, mask, placement, interleaving, RS - so a fault
    anywhere in the encoder shows up as a mismatch or a bad syndrome."""
    size = len(m)
    version = (size - 17) // 4

    pos = [(8, i) for i in range(6)] + [(8, 7), (8, 8), (7, 8)] + \
          [(i, 8) for i in range(5, -1, -1)]
    raw = 0
    for i, (r, c) in enumerate(pos):
        raw |= m[r][c] << i
    fmt = raw ^ 0b101010000010010
    ecc_ind, mask = (fmt >> 13) & 0b11, (fmt >> 10) & 0b111
    if ecc_ind != 0b00:
        raise SystemExit(f'decoded ECC indicator {ecc_ind:02b}, expected 00 (M)')

    ref, _ = new_matrix(version)
    place_function_patterns(ref, size, version)
    reserved = reserve_format(ref, size, version)
    datacells = [(r, c) for r in range(size) for c in range(size)
                 if ref[r][c] is None and (r, c) not in reserved]
    dataset = set(datacells)

    bits = []
    col, upward = size - 1, True
    while col > 0:
        if col == 6:
            col -= 1
        for r in (range(size - 1, -1, -1) if upward else range(size)):
            for c in (col, col - 1):
                if (r, c) in dataset:
                    b = m[r][c]
                    if MASKS[mask](r, c):
                        b ^= 1
                    bits.append(b)
        upward = not upward
        col -= 2

    cw = [int(''.join(str(b) for b in bits[i:i + 8]), 2) for i in range(0, len(bits) - 7, 8)]

    ecc_n, groups = ECC_M[version]
    sizes = [d for cnt, d in groups for _ in range(cnt)]
    nblocks = len(sizes)
    blocks = [[] for _ in range(nblocks)]
    idx = 0
    for i in range(max(sizes)):
        for b in range(nblocks):
            if i < sizes[b]:
                blocks[b].append(cw[idx]); idx += 1
    ecs = [[] for _ in range(nblocks)]
    for i in range(ecc_n):
        for b in range(nblocks):
            ecs[b].append(cw[idx]); idx += 1
    for b in range(nblocks):
        if not syndromes_zero(blocks[b] + ecs[b], ecc_n):
            raise SystemExit(f'block {b} fails its syndrome check after round-trip')

    stream = [bit for c in [x for blk in blocks for x in blk] for bit in
              [(c >> i) & 1 for i in range(7, -1, -1)]]
    p = 0

    def take(n):
        nonlocal p
        v = 0
        for _ in range(n):
            v = (v << 1) | stream[p]; p += 1
        return v

    if take(4) != 0b0100:
        raise SystemExit('round-trip: mode indicator is not byte mode')
    ln = take(count_bits(version))
    return bytes(take(8) for _ in range(ln)).decode('utf-8')


def selftest(base):
    for mask, want in enumerate(FORMAT_M):
        got = format_bits(mask)
        if got != want:
            raise SystemExit(f'format bits mask {mask}: got {got:015b}, want {want:015b}')
    print(f'  format-info table   {len(FORMAT_M)}/8 masks match the spec')

    n = 0
    for slug, *_ in PIECES:
        url = base + slug
        m, size, version, mask = make_matrix(url)
        back = decode(m)
        if back != url:
            raise SystemExit(f'round-trip mismatch for {slug}:\n  in  {url}\n  out {back}')
        n += 1
    print(f'  round-trip decode   {n}/{n} codes decode back to their URL')
    print(f'  RS syndromes        all blocks vanish (checked on encode and decode)')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default=BASE)
    ap.add_argument('--show', help='ASCII-render this slug and exit')
    ap.add_argument('--selftest', action='store_true', help='verify the encoder')
    args = ap.parse_args()

    if args.selftest:
        return selftest(args.base)

    if args.show:
        url = args.base + args.show
        m, size, version, mask = make_matrix(url)
        print(f'{url}\n  version {version}, {size}x{size}, mask {mask}\n')
        print(ascii_art(m))
        return 0

    lines = ['/* Generated by make_qr.py - do not edit by hand. */',
             '/* Card text and QR targets for every work. scene.js reads this. */',
             f'window.QR = {{ artist: {ARTIST!r}, year: {YEAR}, '
             f'base: {args.base!r}, placeholder: true, codes: {{']
    for slug, title, medium, dims in PIECES:
        url = args.base + slug
        m, size, version, mask = make_matrix(url)
        print(f'  {slug:<14} v{version:<2} {size}x{size} mask {mask}  {url}')
        packed = base64.b64encode(''.join(to_rows(m)).encode()).decode()
        lines.append(f'  {slug!r}: {{ title: {title!r}, medium: {medium!r}, '
                     f'dims: {dims!r}, url: {url!r}, n: {size}, rows: "{packed}" }},')
    lines.append('} };')
    OUT.write_text('\n'.join(lines) + '\n', encoding='ascii')

    print(f'\n  qr.js  {OUT.stat().st_size / 1024:.1f} KB  ({len(PIECES)} cards)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
