"""One-time: crop provider logos + highlight icons out of the reference infographic.

Two extraction modes:
  tile  - the coloured rounded tile IS the design (OpenAI, Kimi, Anthropic, Intron).
          Auto-detect the solid block and crop tight to it. No keying.
  bare  - the mark floats on the pill/page background (Google, Meta, MiniMax, Gooey).
          Un-mix it off that background into straight alpha, so it can sit on the
          teal highlight pills without showing a white box.
"""
import json, os
from PIL import Image

# The reference infographic these crops came from. Not in the repo (it is the
# original AI-generated image); set REFERENCE_IMAGE to point at your own copy.
SRC = os.environ.get("REFERENCE_IMAGE",
    "/Users/cmama/.claude/image-cache/90007186-e9e9-42f2-a865-767104b8ee24/1.png")
OUT = "assets/logos"
ICONS = "assets/icons"

# generous search windows (x, y, w, h) - detection tightens them
SPEC = {
    "openai":    ("tile", (340, 396, 36, 38)),
    "moonshot":  ("tile", (372, 212, 36, 40)),
    "anthropic": ("tile", (486, 361, 38, 38)),
    "intron":    ("tile", (1042, 300, 40, 42)),
    "google":    ("bare", (771, 545, 26, 28)),
    "meta":      ("bare", (843, 404, 29, 22)),
    "minimax":   ("bare", (181, 524, 27, 28)),
    "gooey":     ("bare", (682, 707, 40, 36)),
}
ICON_SPEC = {
    "brain":  ("bare", (666, 662, 30, 26)),
    "rabbit": ("bare", (207, 439, 29, 30)),
}

def is_bg(p, thr=238):
    return p[0] >= thr and p[1] >= thr and p[2] >= thr

def tile_bbox(im):
    """Tightest box around the solid block: rows/cols that are mostly non-background."""
    w, h = im.size
    px = im.load()
    def dense_rows():
        return [y for y in range(h)
                if sum(0 if is_bg(px[x, y]) else 1 for x in range(w)) >= 0.55 * w]
    def dense_cols():
        return [x for x in range(w)
                if sum(0 if is_bg(px[x, y]) else 1 for y in range(h)) >= 0.55 * h]
    def longest_run(idxs):
        best = cur = []
        for i in idxs:
            if cur and i == cur[-1] + 1:
                cur.append(i)
            else:
                cur = [i]
            if len(cur) > len(best):
                best = list(cur)
        return best
    rs, cs = longest_run(dense_rows()), longest_run(dense_cols())
    if not rs or not cs:
        return (0, 0, w, h)
    return (cs[0], rs[0], cs[-1] + 1, rs[-1] + 1)

def bg_color(im, ring=2):
    """Modal colour of the window's perimeter ring = the flat background behind the mark."""
    from collections import Counter
    w, h = im.size
    px = im.load()
    c = Counter()
    for y in range(h):
        for x in range(w):
            if x < ring or y < ring or x >= w - ring or y >= h - ring:
                c[px[x, y]] += 1
    return c.most_common(1)[0][0] if c else (255, 255, 255)

def unmix(im, bg, thr=16, full=70):
    """px = a*C + (1-a)*bg  ->  solve for straight-alpha C."""
    w, h = im.size
    src = im.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            p = src[x, y]
            d = max(abs(p[i] - bg[i]) for i in range(3))
            if d <= thr:
                continue
            a = min(1.0, (d - thr) / float(full - thr))
            if a <= 0:
                continue
            c = tuple(max(0, min(255, int(round((p[i] - (1 - a) * bg[i]) / a)))) for i in range(3))
            dst[x, y] = (c[0], c[1], c[2], int(round(a * 255)))
    return out

def content_bbox(rgba):
    bb = rgba.split()[-1].getbbox()
    return bb or (0, 0) + rgba.size

def rounded_mask(size, r):
    from PIL import ImageDraw
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=r, fill=255)
    return m

def run(spec, outdir):
    os.makedirs(outdir, exist_ok=True)
    ref = Image.open(SRC).convert("RGB")
    man = {}
    for name, (mode, (x, y, w, h)) in spec.items():
        win = ref.crop((x, y, x + w, y + h))
        if mode == "tile":
            bb = tile_bbox(win)
            img = win.crop(bb).convert("RGBA")
            img.putalpha(rounded_mask(img.size, max(3, round(img.size[0] * 0.26))))
        else:
            rgba = unmix(win, bg_color(win))
            img = rgba.crop(content_bbox(rgba))
        img.save(os.path.join(outdir, name + ".png"))
        man[name] = {"file": name + ".png", "mode": mode,
                     "w": img.size[0], "h": img.size[1]}
        print(f"  {name:10} {mode:5} -> {img.size[0]}x{img.size[1]}")
    return man

print("logos:")
logos = run(SPEC, OUT)
print("icons:")
icons = run(ICON_SPEC, ICONS)
json.dump(logos, open(os.path.join(OUT, "logos.manifest.json"), "w"), indent=2)
json.dump(icons, open(os.path.join(ICONS, "icons.manifest.json"), "w"), indent=2)
print("\nwrote manifests")
