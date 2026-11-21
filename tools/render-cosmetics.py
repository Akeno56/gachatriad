"""Bake the original cosmetic artwork. Run with NumPy and Pillow installed."""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


OUTPUT = Path(__file__).resolve().parents[1] / "apps/web/public/assets/ui"
FRAME_TIME_MS = 50
FRAME_COUNT = 104
TAU = 2 * np.pi

PALETTES = {
    "astral": {
        "base": (12, 16, 38),
        "body": (67, 81, 178),
        "echo": (91, 57, 153),
        "light": (168, 207, 255),
        "metal": (209, 193, 245),
    },
    "ember": {
        "base": (31, 15, 26),
        "body": (156, 52, 38),
        "echo": (104, 44, 65),
        "light": (255, 144, 75),
        "metal": (253, 206, 139),
    },
}


def grid(width, height):
    return np.meshgrid(
        (np.arange(width, dtype=np.float32) + 0.5) / width,
        (np.arange(height, dtype=np.float32) + 0.5) / height,
    )


def gaussian(distance, width):
    return np.exp(-np.square(distance / width))


def smoothstep(lower, upper, value):
    t = np.clip((value - lower) / (upper - lower), 0, 1)
    return t * t * (3 - 2 * t)


def weave(x, y, phase):
    """Three scales of folded waves, periodic in time."""
    return (
        0.56 * np.sin(8.7 * x + 3.1 * y + 0.8 * np.sin(phase))
        + 0.29 * np.sin(16.3 * x - 7.2 * y - 1.0 * np.cos(phase))
        + 0.15 * np.sin(31.7 * x + 11.4 * y + 0.7 * np.sin(2 * phase))
    )


def light(pixels, amount, color):
    # Screen blend each stream of light into the surface.
    pixels[:] = 1 - (1 - pixels) * (1 - amount[..., None] * np.array(color) / 255)


def make_crest(x, y, phase):
    pixels = np.full(x.shape + (3,), [12, 17, 35], dtype=np.float32) / 255
    mist = weave(x * 0.9 + 0.3, y * 0.75, phase)
    haze = gaussian(y - 0.54 + 0.15 * mist, 0.43) * smoothstep(0.1, 0.93, x)
    light(pixels, haze * 0.44, (87, 55, 163))
    light(pixels, gaussian(y - 0.29 - 0.16 * mist, 0.32) * x**2 * 0.35, (30, 103, 168))

    palettes = [
        ((119, 57, 207), (245, 184, 133)),
        ((62, 137, 211), (185, 228, 255)),
        ((172, 78, 213), (226, 180, 250)),
    ]
    for i, (body_color, rim_color) in enumerate(palettes):
        flow = weave(x + i * 0.22, y + i * 0.19, phase + i * 1.9)
        fold = np.sin(5.8 * x + 0.6 * i + 0.85 * np.sin(phase + i * 1.4))
        center = 0.65 - 0.18 * i + 0.15 * fold + 0.14 * flow
        distance = y - center
        thickness = 0.16 + 0.06 * fold
        reach = smoothstep(0.13 + i * 0.074, 0.86, x)
        pleats = 0.61 + 0.39 * np.sin(63 * x + 4.8 * flow + 2 * np.cos(phase + i)) ** 2
        curtain = gaussian(distance + 0.07, thickness) * reach * pleats
        rim = gaussian(distance - 0.02, 0.036 + 0.018 * (flow + 1)) * reach * pleats
        light(pixels, curtain * 0.35, body_color)
        light(pixels, rim * 0.49, rim_color)

    falloff = 0.69 + 0.31 * gaussian(y - 0.52, 0.48)
    pixels *= falloff[..., None]
    return Image.fromarray(np.uint8(np.clip(pixels, 0, 1) * 255))


def make_frame(x, y, phase):
    rx, ry = x - 0.5, y - 0.5
    ax, ay = np.abs(rx), np.abs(ry)
    edge = np.maximum(
        np.maximum(ax - 0.389, ay - 0.389),
        (ax + ay - 0.713) * 0.7071,
    )
    angle = np.arctan2(ry, rx)
    flow = weave(x * 1.8, y * 1.8, phase)
    current = 0.5 + 0.5 * np.cos(2 * angle + 1.35 * flow - phase)
    silk = 0.56 + 0.44 * np.sin(5 * angle + 2.7 * flow + phase) ** 2
    inner_rail = gaussian(edge + 0.009, 0.006)
    outer_rail = gaussian(edge - 0.015, 0.0075)
    rim = gaussian(edge, 0.019)
    wisp = gaussian(edge - 0.039 - 0.026 * flow, 0.027) * current**2 * silk
    mist = gaussian(edge - 0.032, 0.058) * (0.24 + 0.76 * current**2)

    pixels = np.full(x.shape + (3,), [27, 23, 52], dtype=np.float32) / 255
    light(pixels, mist * 0.65, (121, 82, 244))
    light(pixels, wisp * 0.74, (132, 124, 237))
    light(pixels, rim * (0.4 + 0.42 * current), (111, 128, 226))
    light(pixels, inner_rail * (0.63 + 0.32 * silk), (241, 219, 164))
    light(pixels, outer_rail * (0.42 + 0.55 * current), (203, 227, 255))

    alpha = np.maximum(rim * 0.94, wisp * 0.62 + mist * 0.27)
    # Preserve a square opening for the avatar, including its corners.
    alpha *= smoothstep(0.368, 0.375, np.maximum(ax, ay))
    alpha *= 1 - smoothstep(0.475, 0.498, np.maximum(ax, ay))
    alpha = np.where(alpha > 0.027, alpha, 0)
    return Image.fromarray(np.uint8(np.clip(np.dstack((pixels, alpha)), 0, 1) * 255))


def save_cosmetic(name, width, height, render, quality, keyframe_interval=None):
    x, y = grid(width, height)
    images = [render(x, y, TAU * i / FRAME_COUNT) for i in range(FRAME_COUNT)]
    images[20].save(OUTPUT / f"{name}.webp", quality=88, method=6)
    images[0].save(
        OUTPUT / f"{name}-loop.webp",
        save_all=True,
        append_images=images[1:],
        loop=0,
        duration=FRAME_TIME_MS,
        quality=quality,
        method=4,
        kmax=keyframe_interval,
    )


def theme_plate(x, y, theme, palette, strength):
    """Layer soft enamel and narrow engraved lines over the dark base."""
    pixels = np.full(x.shape + (3,), palette["base"], dtype=np.float32) / 255
    folds = weave(x, y, 1.2) + 0.2 * weave(x * 2.2 - 0.6, y * 2.2, 2.6)
    diagonal = y - 0.8 + 0.63 * x
    light(pixels, gaussian(diagonal + 0.18 * folds, 0.46) * 0.47 * strength, palette["body"])
    light(pixels, gaussian(diagonal - 0.20 * folds, 0.27) * 0.36 * strength, palette["echo"])
    if theme == "astral":
        # Offset elliptical inlays share the slope of the moonlit band.
        arc = np.hypot((x - 0.87) * 1.09, (y - 1.3) * 0.76)
        for radius, opacity in ((0.60, 0.64), (0.69, 0.28), (0.85, 0.33), (0.875, 0.16)):
            rim = arc - radius
            light(pixels, gaussian(rim, 0.033) * opacity * strength, palette["body"])
            light(pixels, gaussian(rim, 0.004) * opacity * strength, palette["light"])
    else:
        # Wavy channels pinch into bright veins through the copper enamel.
        flow = y + 0.71 * x + 0.15 * folds + 0.03 * np.sin(15 * x + 6 * y)
        for center, opacity in ((0.66, 0.17), (0.91, 0.64), (1.10, 0.44), (1.30, 0.24)):
            vein = flow - center
            light(pixels, gaussian(vein, 0.08) * opacity * strength, palette["body"])
            light(pixels, gaussian(vein, 0.008) * opacity * strength, palette["light"])
    return pixels


def bevel_distance(x, y, half_width, half_height, chamfer):
    ax, ay = np.abs(x - 0.5), np.abs(y - 0.5)
    return np.maximum(
        np.maximum(ax - half_width, ay - half_height),
        (ax + ay - half_width - half_height + chamfer) * 0.7071,
    )


def theme_banner(x, y, theme, palette):
    field = theme_plate(x, y, theme, palette, 1.0)
    # Leave the profile name and bio on the dark end of the painting.
    field *= (0.61 + 0.39 * smoothstep(0.15, 0.78, x))[..., None]
    return field


def theme_board(x, y, theme, palette):
    field = theme_plate(x, y, theme, palette, 0.59)
    edge = bevel_distance(x, y, 0.48, 0.465, 0.038)
    light(field, gaussian(edge, 0.002) * 0.38, palette["metal"])
    light(field, gaussian(edge + 0.012, 0.002) * 0.20, palette["metal"])
    # Keep the table a dark surround for cards and board cells.
    field *= (0.78 + 0.22 * gaussian(x - 0.5, 0.42))[..., None]
    return field


def theme_back(x, y, theme, palette):
    # Reflect the enamel about both axes so the back reads in either direction.
    end_x = np.where(y < 0.5, x, 1 - x)
    end_y = np.minimum(y, 1 - y) * 2
    end_field = theme_plate(end_x, end_y, theme, palette, 0.96)
    base = 0.65 * np.array(palette["base"], dtype=np.float32) / 255
    field = base + (end_field - base) * smoothstep(0.028, 0.15, np.abs(y - 0.5))[..., None]
    edge = bevel_distance(x, y, 0.455, 0.464, 0.072)
    light(field, gaussian(edge, 0.006) * 0.7, palette["metal"])
    light(field, gaussian(edge + 0.025, 0.004) * 0.43, palette["metal"])
    rails = np.abs(y - 0.5) - 0.11
    light(
        field,
        gaussian(rails, 0.0025) * gaussian(x - 0.5, 0.36) * 0.46,
        palette["metal"],
    )
    return field


def ember_frame(x, y, palette):
    edge = bevel_distance(x, y, 0.409, 0.409, 0.076)
    angle = np.arctan2(y - 0.5, x - 0.5)
    highlight = 0.64 + 0.36 * np.cos(2 * angle + 0.95)
    field = np.full(x.shape + (3,), palette["base"], dtype=np.float32) / 255
    light(field, gaussian(edge, 0.043) * 0.86, palette["body"])
    light(field, gaussian(edge - 0.012, 0.009) * highlight, palette["metal"])
    light(field, gaussian(edge + 0.015, 0.008) * 0.83, palette["light"])
    corner = np.maximum(np.abs(x - 0.5), np.abs(y - 0.5))
    opening = smoothstep(0.369, 0.382, corner)
    alpha = gaussian(edge, 0.040) * opening * (1 - smoothstep(0.469, 0.495, corner))
    return np.dstack((field, alpha))


def save_static(name, pixels, size):
    image = Image.fromarray(np.uint8(np.clip(pixels, 0, 1) * 255))
    image.resize(size, Image.Resampling.LANCZOS).save(OUTPUT / f"{name}.webp", quality=91, method=6)


def save_themes():
    surfaces = (
        ("banner", (856, 264), theme_banner),
        ("board", (900, 510), theme_board),
        ("back", (270, 360), theme_back),
    )
    for kind, size, render in surfaces:
        x, y = grid(size[0] * 2, size[1] * 2)
        for theme, palette in PALETTES.items():
            save_static(f"{theme}-{kind}", render(x, y, theme, palette), size)
    x, y = grid(288, 288)
    save_static("ember-frame", ember_frame(x, y, PALETTES["ember"]), (144, 144))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seasonal", action="store_true", help="Also rebuild the animated rewards.")
    args = parser.parse_args()
    save_themes()
    if args.seasonal:
        save_cosmetic("astral-frame", 144, 144, make_frame, quality=76)
        # Independently encode each crest frame to keep gradients consistent at the loop seam.
        save_cosmetic("astral-crest", 856, 264, make_crest, quality=90, keyframe_interval=1)
