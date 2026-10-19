"""Render the README demo GIF.

Produces `docs/demo.gif`: a four-beat loop showing a chat file reference, the
pointer arriving on it, the reveal chip appearing, and Explorer opening with the
file selected. Kept in the repo so the asset can be regenerated instead of
hand-edited.

Usage: python docs/render-demo.py
Requires Pillow (the bundled DSH runtime already provides it).
"""

from __future__ import annotations

import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "demo.gif")

W, H = 720, 300
BG = (16, 18, 22)
PANEL = (30, 33, 39)
BORDER = (52, 58, 69)
TEXT = (238, 242, 248)
MUTED = (154, 164, 178)
DIM = (127, 138, 153)
BLUE = (103, 158, 254)
BLUE_DIM = (47, 74, 122)
ACCENT = (91, 140, 255)
HOVER_BG = (42, 74, 122)

FONT_DIR = r"C:\Windows\Fonts"


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    path = os.path.join(FONT_DIR, name)
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default(size)


UI = font("msyh.ttc", 15)
UI_SMALL = font("msyh.ttc", 12)
UI_TINY = font("msyh.ttc", 11)
MONO = font("consola.ttf", 14)
MONO_SMALL = font("consola.ttf", 11)
# Consolas has no CJK glyphs, so mixed Latin/CJK labels use the UI face; the
# size matches MONO so the two read as one family.
FILE_FONT = font("msyh.ttc", 14)
FILE_FONT_SMALL = font("msyh.ttc", 11)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def base_frame() -> Image.Image:
    """The static chat backdrop every frame starts from."""
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    rounded(draw, (0, 0, W - 1, H - 1), 14, fill=BG, outline=BORDER)

    draw.text((40, 52), "已生成下载脚本，入口文件：", font=UI, fill=MUTED)
    return image


def reference(draw: ImageDraw.ImageDraw, hovered: bool) -> None:
    """The blue file reference chip inside the transcript."""
    box = (40, 84, 236, 114)
    rounded(draw, box, 8, fill=HOVER_BG if hovered else (27, 36, 51), outline=BLUE_DIM)
    draw.line((52, 96, 59, 96, 61, 98.5, 68, 98.5, 68, 106, 52, 106, 52, 96), fill=BLUE, width=1)
    draw.text((72, 88), "B站下载器代码.txt", font=FILE_FONT, fill=BLUE if hovered else (137, 173, 235))


def cursor(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    points = [(x, y), (x, y + 18), (x + 4.6, y + 13.6), (x + 7.6, y + 20.6),
              (x + 11.2, y + 19), (x + 8.2, y + 12.2), (x + 14.4, y + 12)]
    draw.polygon(points, fill=(255, 255, 255), outline=(17, 17, 17))


def reveal_chip(draw: ImageDraw.ImageDraw, x: int, y: int, label: str) -> None:
    width = 96 + len(label) * 14
    box = (x, y, x + width, y + 34)
    draw.rounded_rectangle((box[0] + 2, box[1] + 4, box[2] + 2, box[3] + 4), radius=11, fill=(10, 11, 14))
    rounded(draw, box, 11, fill=(35, 40, 51), outline=(58, 65, 80))
    draw.line((box[0] + 16, y + 14, box[0] + 23, y + 14, box[0] + 25, y + 16.5,
               box[0] + 33, y + 16.5, box[0] + 33, y + 24, box[0] + 16, y + 24, box[0] + 16, y + 14),
              fill=TEXT, width=1)
    draw.text((box[0] + 44, y + 8), label, font=UI, fill=TEXT)


def explorer(draw: ImageDraw.ImageDraw, offset_y: int = 0, selected: bool = True) -> None:
    """The Explorer window that opens after a successful reveal."""
    x0, y0 = 392, 44 + offset_y
    rounded(draw, (x0, y0, x0 + 288, y0 + 196), 10, fill=PANEL, outline=BORDER)
    rounded(draw, (x0, y0, x0 + 288, y0 + 30), 10, fill=(38, 43, 52))
    draw.rectangle((x0, y0 + 18, x0 + 288, y0 + 30), fill=(38, 43, 52))
    for index, colour in enumerate(((255, 95, 87), (254, 188, 46), (40, 200, 64))):
        cx = x0 + 16 + index * 14
        draw.ellipse((cx - 4, y0 + 11, cx + 4, y0 + 19), fill=colour)
    draw.text((x0 + 62, y0 + 8), "资源管理器 — I:\\work\\bili-下载", font=UI_TINY, fill=MUTED)

    draw.rectangle((x0, y0 + 30, x0 + 288, y0 + 56), fill=(26, 29, 35))
    draw.text((x0 + 14, y0 + 36), "← → ↑   I:\\work\\bili-下载", font=UI_TINY, fill=DIM)

    draw.rectangle((x0, y0 + 56, x0 + 96, y0 + 196), fill=(25, 28, 34))
    draw.text((x0 + 12, y0 + 64), "快速访问", font=UI_TINY, fill=DIM)
    draw.text((x0 + 12, y0 + 84), "桌面", font=UI_TINY, fill=MUTED)
    draw.text((x0 + 12, y0 + 102), "下载", font=UI_TINY, fill=MUTED)
    draw.text((x0 + 12, y0 + 120), "bili-下载", font=UI_TINY, fill=BLUE)

    draw.rectangle((x0 + 96, y0 + 56, x0 + 288, y0 + 196), fill=(27, 30, 36))
    row_fill = (42, 74, 122) if selected else (32, 36, 43)
    row_outline = (63, 110, 168) if selected else None
    rounded(draw, (x0 + 108, y0 + 70, x0 + 276, y0 + 94), 5, fill=row_fill, outline=row_outline)
    draw.line((x0 + 118, y0 + 78, x0 + 125, y0 + 78, x0 + 127, y0 + 80.5,
               x0 + 134, y0 + 80.5, x0 + 134, y0 + 88, x0 + 118, y0 + 88, x0 + 118, y0 + 78),
              fill=(207, 224, 255), width=1)
    draw.text((x0 + 140, y0 + 74), "B站下载器代码.txt", font=FILE_FONT_SMALL, fill=TEXT)

    for index, name in enumerate(("downloader.py", "README.md")):
        top = y0 + 102 + index * 26
        rounded(draw, (x0 + 108, top, x0 + 276, top + 20), 4, fill=(32, 36, 43))
        draw.text((x0 + 120, top + 3), name, font=MONO_SMALL, fill=(141, 151, 165))


def caption(draw: ImageDraw.ImageDraw, text: str) -> None:
    draw.text((40, 214), text, font=UI_SMALL, fill=DIM)


def frame_idle() -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    reference(draw, hovered=False)
    cursor(draw, 250, 130)
    caption(draw, "聊天里的蓝色文件名，点它只会打开右侧栏预览")
    return image


def frame_approach() -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    reference(draw, hovered=True)
    cursor(draw, 200, 112)
    caption(draw, "把鼠标移上去，停留 160ms")
    return image


def frame_chip() -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    reference(draw, hovered=True)
    reveal_chip(draw, 248, 82, "在资源管理器中显示")
    cursor(draw, 268, 96)
    caption(draw, "浮层出现在引用右侧，不遮住正文")
    return image


def frame_opened() -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    reference(draw, hovered=False)
    explorer(draw)
    caption(draw, "点一下 → 资源管理器打开并选中该文件")
    return image


def main() -> None:
    frames = [frame_idle(), frame_approach(), frame_chip(), frame_chip(), frame_opened(), frame_opened()]
    durations = [900, 700, 900, 900, 2200, 1200]
    palette = frames[0].convert("P", palette=Image.Palette.ADAPTIVE, colors=128)
    quantized = [frame.convert("RGB").quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    quantized[0].save(
        OUT,
        save_all=True,
        append_images=quantized[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"wrote {OUT} ({os.path.getsize(OUT) // 1024} KiB)")


if __name__ == "__main__":
    main()
