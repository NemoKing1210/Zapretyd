"""Crop and present Zapretyd screenshots for README / docs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "screenshots"
RAW = {
    "tray": OUT / "raw" / "tray-source.png",
    "overview": OUT / "raw" / "overview-source.png",
    "versions": OUT / "raw" / "versions-source.png",
    "settings": OUT / "raw" / "settings-source.png",
}


def brightness(rgb: tuple[int, ...]) -> float:
    return sum(rgb[:3]) / 3


def is_panel_color(rgb: tuple[int, ...]) -> bool:
    r, g, b = rgb[:3]
    avg = (r + g + b) / 3
    return 22 <= avg <= 48 and max(r, g, b) - min(r, g, b) <= 18


def crop_tray_popup(im: Image.Image) -> Image.Image:
    """Crop the tray popup tightly, excluding wallpaper and taskbar.

    Bright controls (primary button) break full-row panel detection, so we
    track the dark left/right chrome columns of the popup instead.
    """
    w, h = im.size
    px = im.load()

    def panel_hit(x: int, y: int) -> bool:
        return is_panel_color(px[x, y])

    # Rows where a clear horizontal band of panel chrome exists
    row_hits = [sum(1 for x in range(0, w, 2) if panel_hit(x, y)) for y in range(h)]
    peak = max(row_hits)
    thresh = peak * 0.45
    top = next(y for y, v in enumerate(row_hits) if v >= thresh)

    # Provisional bottom from edge chrome (sample near left of the band)
    # First find provisional left from early panel rows
    sample_y = top + 20
    left = next(x for x in range(w) if panel_hit(x, sample_y))
    right = w - 1 - next(x for x in range(w) if panel_hit(w - 1 - x, sample_y))

    # Walk down using left+8 / right-8 chrome columns (stable even over bright buttons)
    lx, rx = min(left + 8, w - 1), max(right - 8, 0)
    bottom = top
    gap = 0
    for y in range(top, h):
        if panel_hit(lx, y) or panel_hit(rx, y):
            bottom = y
            gap = 0
        else:
            gap += 1
            if gap > 6:
                break

    # Refine left/right over the full panel height
    col_hits = [
        sum(1 for y in range(top, bottom + 1, 3) if panel_hit(x, y)) for x in range(w)
    ]
    cpeak = max(col_hits)
    cthresh = cpeak * 0.4
    left = next(x for x, v in enumerate(col_hits) if v >= cthresh)
    right = w - 1 - next(x for x, v in enumerate(reversed(col_hits)) if v >= cthresh)

    return im.crop((left, top, right + 1, bottom + 1))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def present(
    src: Image.Image,
    *,
    radius: int = 16,
    pad: int = 48,
    bg: tuple[int, int, int] = (16, 16, 20),
    shadow: bool = True,
) -> Image.Image:
    """Place screenshot on a dark canvas with soft shadow and rounded corners."""
    img = src.convert("RGBA")
    mask = rounded_mask(img.size, radius)
    rounded = Image.new("RGBA", img.size, (0, 0, 0, 0))
    rounded.paste(img, (0, 0))
    rounded.putalpha(mask)

    canvas_w = img.width + pad * 2
    canvas_h = img.height + pad * 2
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (*bg, 255))

    if shadow:
        shadow_layer = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        sh = Image.new("RGBA", img.size, (0, 0, 0, 160))
        sh.putalpha(mask.point(lambda a: int(a * 0.5)))
        shadow_layer.paste(sh, (pad + 4, pad + 8), sh)
        shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(16))
        canvas = Image.alpha_composite(canvas, shadow_layer)

    canvas.paste(rounded, (pad, pad), rounded)
    return canvas.convert("RGB")


def make_gallery(paths: list[Path], out: Path, target_h: int = 480) -> None:
    shots = [Image.open(p) for p in paths]
    resized = []
    for s in shots:
        ratio = target_h / s.height
        resized.append(s.resize((int(s.width * ratio), target_h), Image.Resampling.LANCZOS))
    gap = 20
    strip_w = sum(s.width for s in resized) + gap * (len(resized) - 1) + 40
    strip = Image.new("RGB", (strip_w, target_h + 40), (14, 14, 18))
    x = 20
    for s in resized:
        strip.paste(s, (x, 20))
        x += s.width + gap
    strip.save(out, "PNG", optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Tray
    tray_src = Image.open(RAW["tray"]).convert("RGB")
    tray_crop = crop_tray_popup(tray_src)
    print(f"tray crop: {tray_src.size} -> {tray_crop.size}")
    tray_crop.save(OUT / "tray.png", "PNG", optimize=True)
    present(tray_crop, radius=18, pad=56).save(OUT / "tray-framed.png", "PNG", optimize=True)

    # Main windows — keep window chrome; light framing for README
    framed_names = []
    for key, radius in (("overview", 10), ("versions", 10), ("settings", 10)):
        im = Image.open(RAW[key]).convert("RGB")
        im.save(OUT / f"{key}.png", "PNG", optimize=True)
        framed = present(im, radius=radius, pad=36)
        framed_path = OUT / f"{key}-framed.png"
        framed.save(framed_path, "PNG", optimize=True)
        framed_names.append(framed_path)
        print(f"{key}: {im.size} -> framed {framed.size}")

    make_gallery(framed_names, OUT / "gallery.png")
    print(f"gallery: {(OUT / 'gallery.png').stat().st_size // 1024} KB")

    # Clean up debug helper if present
    debug = Path(__file__).with_name("_debug_tray.py")
    if debug.exists():
        debug.unlink()


if __name__ == "__main__":
    main()
