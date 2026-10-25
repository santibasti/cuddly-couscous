#!/usr/bin/env python3
"""SimplyGachamia asset tooling: init | cutout | qa | manifest | sheets.

Filename convention (inside Expressions/, Poses/, Master/, Flashback/):
  <Char>_<Expression>_<Pose>.png   e.g. Yuna_Happy_Standing.png
  <Char>_<Pose>.png                e.g. Minho_HoldingUmbrella.png (pose-only)
  <Char>_Flashback_<Pose>.png      e.g. Yuna_Flashback_Sitting.png
"""
import argparse, json, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SPECS = json.loads((Path(__file__).with_name("character_specs.json")).read_text())
CHARS = SPECS["characters"]
SUBDIRS = {"Yuna": ["Master", "Expressions", "Poses", "Flashback"],
           "Minho": ["Master", "Expressions", "Poses", "Flashback"],
           "Jihoon": ["Master", "Expressions", "Poses"],
           "Sera": ["Master", "Expressions", "Poses"]}


def root_of(base): return Path(base) / "SimplyGachamia" / "StrangersAgain"


def cmd_init(a):
    r = root_of(a.base)
    for c, subs in SUBDIRS.items():
        for s in subs: (r / "Characters" / c / s).mkdir(parents=True, exist_ok=True)
    for d in ("CharacterSheets", "References", "ProjectSettings"): (r / d).mkdir(parents=True, exist_ok=True)
    (r / "ProjectSettings" / "character_specs.json").write_text(json.dumps(SPECS, indent=2))
    print("created", r)


def cutout(im, bg=None, tol=24):
    """Remove a solid background by flood-filling from the border (keeps interior
    pixels that happen to match, e.g. white socks) and softening the edge."""
    im = im.convert("RGBA"); px = np.array(im); h, w = px.shape[:2]
    rgb = px[..., :3].astype(int)
    if bg is None: bg = tuple(rgb[0, 0])
    close = (np.abs(rgb - np.array(bg)).sum(-1) <= tol * 3)
    seen = np.zeros((h, w), bool); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1,0),(-1,0),(0,1),(0,-1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # 1px edge softening + decontaminate border pixels toward foreground
    a_img = Image.fromarray(alpha).filter(__import__("PIL.ImageFilter", fromlist=["x"]).GaussianBlur(0.7))
    px[..., 3] = np.array(a_img)
    return Image.fromarray(px)


def cmd_cutout(a):
    # Use a background colour NOT present in the character (e.g. pure green #00FF00).
    bg = tuple(int(a.bg.lstrip("#")[i:i+2], 16) for i in (0, 2, 4)) if a.bg else None
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for f in sorted(Path(a.src).glob("*.png")):
        im = cutout(Image.open(f), bg, a.tol)
        bbox = im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if a.crop and bbox: im = im.crop(bbox)
        im.save(out / f.name); print("cutout", f.name, im.size)


def parse_name(stem):
    p = stem.split("_")
    if p[0] not in CHARS: return None
    c = CHARS[p[0]]
    if len(p) == 3 and p[1] in c["expressions"] and p[2] in c["poses"]: return dict(character=p[0], outfit="Main", expression=p[1], pose=p[2])
    if len(p) == 3 and p[1] == "Flashback" and p[2] in c["poses"]: return dict(character=p[0], outfit="Flashback", expression=None, pose=p[2])
    if len(p) == 2 and p[1] in c["poses"]: return dict(character=p[0], outfit="Main", expression=None, pose=p[1])
    if len(p) == 2 and p[1] in c["expressions"]: return dict(character=p[0], outfit="Main", expression=p[1], pose=None)
    if len(p) == 2 and p[1] == "Master": return dict(character=p[0], outfit="Main", expression="Neutral", pose="Standing")
    return None


def scan(r):
    for f in sorted((r / "Characters").rglob("*.png")):
        yield f, parse_name(f.stem)


def cmd_qa(a):
    r = root_of(a.base); bad = 0; n = 0
    for f, meta in scan(r):
        n += 1; issues = []
        if meta is None: issues.append("filename does not match convention/specs")
        try:
            im = Image.open(f); im.verify(); im = Image.open(f)
        except Exception as e:
            print("FAIL", f.name, "invalid PNG", e); bad += 1; continue
        if im.mode != "RGBA": issues.append(f"mode {im.mode}, expected RGBA (transparent)")
        else:
            al = np.array(im.getchannel("A"))
            if al.min() == 255: issues.append("no transparency (background not removed)")
            if (al[0].max() > 8) or (al[-1].max() > 8) or (al[:, 0].max() > 8) or (al[:, -1].max() > 8):
                issues.append("subject touches image edge (possible crop)")
            if (al > 8).mean() < 0.02: issues.append("almost empty image")
        if im.height < SPECS["frame"]["min_height_px"]: issues.append(f"height {im.height}px < {SPECS['frame']['min_height_px']}px")
        print(("FAIL " if issues else "ok   ") + f.relative_to(r).as_posix() + ("  -> " + "; ".join(issues) if issues else ""))
        bad += bool(issues)
    print(f"\n{n} files, {bad} failing"); sys.exit(1 if bad else 0)


def cmd_manifest(a):
    r = root_of(a.base); items = []
    for f, meta in scan(r):
        if meta is None: continue
        im = Image.open(f)
        items.append({**meta, "file": f.name, "path": f.relative_to(r).as_posix(), "width": im.width, "height": im.height,
                      "has_alpha": im.mode == "RGBA"})
    # per-character completeness vs. spec
    missing = {}
    have = {(i["character"], i["expression"], i["pose"]) for i in items}
    for c, s in CHARS.items():
        miss = [f"{e}_Standing" for e in s["expressions"] if (c, e, "Standing") not in have]
        miss += [f"Pose:{p}" for p in s["poses"] if not any(i["character"] == c and i["pose"] == p for i in items)]
        missing[c] = miss
    settings = {}
    sp = r / "ProjectSettings" / "customization"
    if sp.exists():
        for j in sp.glob("*.json"): settings[j.stem] = json.loads(j.read_text())
    out = {"series": SPECS["series"], "assets": items, "customization_settings": settings, "missing_vs_spec": missing}
    (r / "ProjectSettings" / "manifest.json").write_text(json.dumps(out, indent=2))
    print(f"manifest: {len(items)} assets")


def font(sz):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        try: return ImageFont.truetype(p, sz)
        except OSError: pass
    return ImageFont.load_default()


def fit(im, w, h):
    s = min(w / im.width, h / im.height); return im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)


def cmd_sheets(a):
    r = root_of(a.base); out = r / "CharacterSheets"; out.mkdir(exist_ok=True)
    imgs = {c: {f.stem: f for f in (r / "Characters" / c).rglob("*.png")} for c in CHARS}
    for c, s in CHARS.items():
        m = imgs[c].get(f"{c}_Neutral_Standing") or imgs[c].get(f"{c}_Master")
        if not m: print("skip", c, "(no master/neutral standing image)"); continue
        W, H = 2400, 1600; sh = Image.new("RGB", (W, H), "#FAF7F2"); d = ImageDraw.Draw(sh)
        d.text((60, 40), f"{s['full_name']}  ·  age {s['age']}", fill="#222", font=font(56))
        body = Image.open(m).convert("RGBA"); sh.paste(fit(body, 700, 1400), (60, 140), fit(body, 700, 1400))
        face = body.crop((0, 0, body.width, int(body.height * 0.28))); fc = fit(face, 600, 450); sh.paste(fc, (820, 140), fc)
        x = 820
        for k, hexv in s["palette"].items():
            d.rectangle((x, 640, x + 90, 730), fill=hexv, outline="#999"); d.text((x, 740), k, fill="#333", font=font(20)); x += 105
        d.text((820, 800), "Outfits: " + " | ".join(f"{k}: {v}" for k, v in s["outfits"].items()), fill="#333", font=font(22))
        tiles = [imgs[c][k] for k in sorted(imgs[c]) if parse_name(k) and parse_name(k)["expression"] and parse_name(k)["pose"] == "Standing"]
        for i, t in enumerate(tiles[:12]):
            im = Image.open(t).convert("RGBA"); f = im.crop((0, 0, im.width, int(im.height * 0.28))); f = fit(f, 170, 130)
            sh.paste(f, (820 + (i % 6) * 190, 860 + (i // 6) * 160), f)
            d.text((820 + (i % 6) * 190, 990 + (i // 6) * 160), parse_name(t.stem)["expression"], fill="#333", font=font(18))
        d.text((820, 1200), "Poses: " + ", ".join(s["poses"]), fill="#333", font=font(22))
        sh.save(out / f"{c}_CharacterSheet.png"); print("sheet", c)
    group = [(c, imgs[c].get(f"{c}_Neutral_Standing") or imgs[c].get(f"{c}_Master")) for c in CHARS]
    if all(p for _, p in group):
        G = Image.new("RGB", (2400, 1300), "#FAF7F2"); gd = ImageDraw.Draw(G); gd.line((100, 1200, 2300, 1200), fill="#bbb", width=3)
        # shared scale: keeps true relative heights (Minho taller than Yuna etc.)
        ims = [Image.open(p).convert("RGBA") for _, p in group]; sc = min(1100 / max(i.height for i in ims), 1)
        for k, ((c, _), im) in enumerate(zip(group, ims)):
            t = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
            G.paste(t, (150 + k * 570, 1200 - t.height), t); gd.text((150 + k * 570, 1220), CHARS[c]["full_name"], fill="#222", font=font(32))
        G.save(out / "Group_Reference.png"); print("sheet group")


if __name__ == "__main__":
    p = argparse.ArgumentParser(); p.add_argument("--base", default="."); sp = p.add_subparsers(dest="cmd", required=True)
    sp.add_parser("init").set_defaults(f=cmd_init)
    c = sp.add_parser("cutout"); c.add_argument("src"); c.add_argument("out"); c.add_argument("--bg"); c.add_argument("--tol", type=int, default=24); c.add_argument("--crop", action="store_true"); c.set_defaults(f=cmd_cutout)
    sp.add_parser("qa").set_defaults(f=cmd_qa); sp.add_parser("manifest").set_defaults(f=cmd_manifest); sp.add_parser("sheets").set_defaults(f=cmd_sheets)
    a = p.parse_args(); a.f(a)
