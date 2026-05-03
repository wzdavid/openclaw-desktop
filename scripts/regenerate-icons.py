#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw


def _save_resized(master: Image.Image, dst: Path, size: int) -> None:
    out = master.resize((size, size), Image.Resampling.LANCZOS)
    out.save(dst)


def _generate_macos_template_tray_icon(icons_dir: Path) -> None:
    source = icons_dir / "tray-icon.png"
    if not source.exists():
        return

    src = Image.open(source).convert("RGBA")
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    out_px = out.load()
    src_px = src.load()

    for y in range(src.height):
        for x in range(src.width):
            r, g, b, a = src_px[x, y]
            if a == 0:
                continue
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            saturation = max_c - min_c
            luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b

            # Extract bright, low-saturation foreground strokes from the colorful source.
            if luminance >= 190 and saturation <= 65:
                alpha = int(max(0, min(255, (luminance - 190) * 4.0)))
                out_px[x, y] = (0, 0, 0, alpha)

    out.save(icons_dir / "tray-iconTemplate.png")
    _save_resized(out, icons_dir / "tray-iconTemplate@2x.png", 64)


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icons_dir = root / "resources" / "icons"
    source_png = icons_dir / "icon.png"
    backup_png = icons_dir / "icon.source-square.png"

    if not source_png.exists():
        raise FileNotFoundError(f"Missing source icon: {source_png}")

    original = Image.open(source_png).convert("RGBA")
    if not backup_png.exists():
        original.save(backup_png)

    square_master = Image.open(backup_png).convert("RGBA").resize(
        (1024, 1024), Image.Resampling.LANCZOS
    )

    mask = Image.new("L", (1024, 1024), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, 1023, 1023), radius=220, fill=255)

    mac_master = square_master.copy()
    mac_master.putalpha(mask)

    _save_resized(mac_master, source_png, 512)

    square_master.save(
        icons_dir / "icon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    iconset_map = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    with tempfile.TemporaryDirectory(prefix="iconset-") as tmp_dir:
        iconset_dir = Path(tmp_dir) / "icon.iconset"
        iconset_dir.mkdir(parents=True, exist_ok=True)
        for name, size in iconset_map.items():
            _save_resized(mac_master, iconset_dir / name, size)

        subprocess.run(
            ["iconutil", "-c", "icns", str(iconset_dir), "-o", str(icons_dir / "icon.icns")],
            check=True,
        )
    _generate_macos_template_tray_icon(icons_dir)
    print("Regenerated icon assets successfully.")


if __name__ == "__main__":
    main()
