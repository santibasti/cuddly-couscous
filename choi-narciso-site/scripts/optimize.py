"""Make WebP versions of every img/*.jpg into img/web/ (long edge capped at 2400px).
Run after adding or replacing photos:  python3 scripts/optimize.py
Needs Pillow:  pip install pillow"""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
out = root / "img" / "web"; out.mkdir(exist_ok=True)
for f in sorted((root / "img").glob("*.jpg")):
    im = Image.open(f).convert("RGB")
    im.thumbnail((2400, 2400))
    im.save(out / (f.stem + ".webp"), quality=82, method=6)
    print(f.name, im.size)
