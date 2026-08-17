from __future__ import annotations

import argparse
import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageOps


WIDTHS = (192, 384)


def normalize(value: str) -> str:
    return value.strip().replace("\\", "/").lstrip("/").split("?", 1)[0]


def convert(source: Path, target_dir: Path, digest: str) -> tuple[str, int] | None:
    try:
        with Image.open(source) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            if image.width < WIDTHS[-1]:
                return None
            for width in WIDTHS:
                height = max(1, round(image.height * width / image.width))
                resized = image.resize((width, height), Image.Resampling.LANCZOS)
                resized.save(target_dir / f"{digest}-{width}.avif", "AVIF", quality=48, speed=8)
                resized.save(target_dir / f"{digest}-{width}.webp", "WEBP", quality=74, method=4)
            return digest, image.width
    except (OSError, ValueError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate responsive AVIF/WebP card-list images.")
    parser.add_argument("--input", required=True, help="JSON array containing active card image paths")
    parser.add_argument("--root", default=".")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    root = Path(args.root).resolve()
    source_paths = json.loads(Path(args.input).read_text(encoding="utf-8-sig"))
    normalized = sorted({normalize(str(value)) for value in source_paths if str(value).strip()})
    target_dir = root / "assets" / "responsive" / "cards"
    target_dir.mkdir(parents=True, exist_ok=True)

    jobs = []
    for relative in normalized:
        source = root / relative
        if not source.is_file():
            continue
        digest = hashlib.sha1(relative.casefold().encode("utf-8")).hexdigest()[:16]
        jobs.append((relative, source, digest))

    manifest: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = {executor.submit(convert, source, target_dir, digest): (relative, digest) for relative, source, digest in jobs}
        for future, (relative, digest) in futures.items():
            if future.result() is not None:
                manifest[relative] = f"/assets/responsive/cards/{digest}"

    output = root / "js" / "responsive-card-images-v1729.js"
    payload = json.dumps(manifest, ensure_ascii=False, separators=(",", ":"))
    output.write_text(f"window.CNineResponsiveCardImages=Object.freeze({payload});\n", encoding="utf-8")
    print(json.dumps({"sources": len(normalized), "generated": len(manifest), "files": len(manifest) * len(WIDTHS) * 2}, ensure_ascii=False))


if __name__ == "__main__":
    main()
