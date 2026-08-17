from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "responsive" / "ui"
TARGETS = {
    ROOT / "assets/ui/cninelogo.png": ("cninelogo", (240, 480)),
    ROOT / "assets/ui/packs/standard-pack.png": ("standard-pack", (160, 320)),
    ROOT / "assets/ui/packs/advanced-pack.png": ("advanced-pack", (160, 320)),
    ROOT / "assets/ui/packs/premium-pack.png": ("premium-pack", (160, 320)),
    ROOT / "assets/ui/packs/limited-pack.png": ("limited-pack", (160, 320)),
    ROOT / "assets/ui/packs/ultimate-pack.png": ("ultimate-pack", (160, 320)),
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    generated = 0
    for source, (name, widths) in TARGETS.items():
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGBA")
            for width in widths:
                height = max(1, round(image.height * width / image.width))
                resized = image.resize((width, height), Image.Resampling.LANCZOS)
                resized.save(OUTPUT / f"{name}-{width}.avif", "AVIF", quality=52, speed=8)
                resized.save(OUTPUT / f"{name}-{width}.webp", "WEBP", quality=76, method=4)
                generated += 2
    print(f"generated={generated}")


if __name__ == "__main__":
    main()
