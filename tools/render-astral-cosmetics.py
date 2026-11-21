"""Bake the original Astral cosmetic loops. Run with NumPy and Pillow installed."""

from pathlib import Path

import numpy as np
from PIL import Image


OUTPUT = Path(__file__).resolve().parents[1] / "apps/web/public/assets/ui"
FRAME_TIME_MS = 50
FRAME_COUNT = 104
TAU = 2 * np.pi


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


if __name__ == "__main__":
    save_cosmetic("astral-frame", 144, 144, make_frame, quality=76)
    # Independently encode each crest frame to keep gradients consistent at the loop seam.
    save_cosmetic("astral-crest", 856, 264, make_crest, quality=90, keyframe_interval=1)
