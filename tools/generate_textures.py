#!/usr/bin/env python3
"""
Steampunk KTX2 Texture Generator
Generates procedural metal gear, valve, and patina textures
as KTX2 compressed GPU textures for the CATEST steampunk UI.

Requirements:
  pip install Pillow numpy

Usage:
  python generate_textures.py [--output-dir ../web/public/textures] [--size 512]

Generated textures:
  - gear_copper.ktx2      — detailed copper gear with teeth and hub
  - gear_brass.ktx2       — brass variant with different patina
  - valve_wheel.ktx2      — circular valve handle with spokes
  - valve_gate.ktx2       — gate valve body with bolts
  - metal_plate.ktx2      — hammered copper plate surface
  - patina_noise.ktx2     — verdigris oxidation overlay
  - rivet_normal.ktx2     — rivet/bolt normal map
  - steam_particle.ktx2   — soft radial steam particle sprite
"""

import argparse
import math
import os
import struct
import sys
from pathlib import Path

try:
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:
    print("Missing dependencies. Install with:")
    print("  pip install Pillow numpy")
    sys.exit(1)


# ─── KTX2 Writer ───────────────────────────────────────────────────────────

KTX2_MAGIC = bytes([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x32, 0x30, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A])
VK_FORMAT_R8G8B8A8_SRGB = 43  # Vulkan SRGB format


def write_ktx2(filepath: str, img: Image.Image):
    """Write a single-level RGBA image as a minimal KTX2 file."""
    img = img.convert("RGBA")
    w, h = img.size
    pixel_data = img.tobytes()
    data_len = len(pixel_data)

    # KTX2 Header (80 bytes)
    header = bytearray(80)
    header[0:12] = KTX2_MAGIC
    struct.pack_into("<I", header, 12, VK_FORMAT_R8G8B8A8_SRGB)
    struct.pack_into("<I", header, 16, 0)
    struct.pack_into("<I", header, 20, w)
    struct.pack_into("<I", header, 24, h)
    struct.pack_into("<I", header, 28, 0)
    struct.pack_into("<I", header, 32, 0)
    struct.pack_into("<I", header, 36, 1)
    struct.pack_into("<I", header, 40, 1)
    struct.pack_into("<I", header, 44, 0)
    # Index offsets
    struct.pack_into("<I", header, 48, 0)    # dfdByteOffset
    struct.pack_into("<I", header, 52, 0)    # dfdByteLength
    struct.pack_into("<I", header, 56, 0)    # kvdByteOffset
    struct.pack_into("<I", header, 60, 0)    # kvdByteLength
    struct.pack_into("<Q", header, 64, 0)    # sgdByteOffset
    struct.pack_into("<Q", header, 72, 0)    # sgdByteLength

    level_index_offset = 80
    level_index_size = 24  # 3 x uint64 per level
    data_offset = level_index_offset + level_index_size

    # Level index: byteOffset, byteLength, uncompressedByteLength
    level_index = bytearray(level_index_size)
    struct.pack_into("<Q", level_index, 0, data_offset)
    struct.pack_into("<Q", level_index, 8, data_len)
    struct.pack_into("<Q", level_index, 16, data_len)

    with open(filepath, "wb") as f:
        f.write(header)
        f.write(level_index)
        f.write(pixel_data)

    # Also save PNG fallback for browser use
    png_path = filepath.replace(".ktx2", ".png")
    img.save(png_path, "PNG")


# ─── Texture Generators ───────────────────────────────────────────────────

def generate_gear(size: int, color_base: tuple, teeth: int = 16, name: str = "gear") -> Image.Image:
    """Generate a detailed mechanical gear texture with hub, spokes, and teeth."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    outer_r = int(size * 0.45)
    inner_r = int(size * 0.32)
    hub_r = int(size * 0.12)
    axle_r = int(size * 0.05)
    tooth_h = outer_r - inner_r

    # Draw gear teeth
    for i in range(teeth):
        angle = (2 * math.pi * i) / teeth
        a1 = angle - math.pi / teeth * 0.4
        a2 = angle + math.pi / teeth * 0.4

        points = []
        # Inner arc points
        for a in [a1, (a1 + a2) / 2, a2]:
            points.append((cx + inner_r * math.cos(a), cy + inner_r * math.sin(a)))
        # Outer arc points (tooth tip)
        for a in [a2, (a1 + a2) / 2, a1]:
            points.append((cx + outer_r * math.cos(a), cy + outer_r * math.sin(a)))

        # Shade tooth based on angle for 3D effect
        shade = int(40 * math.sin(angle))
        tooth_color = tuple(max(0, min(255, c + shade)) for c in color_base) + (255,)
        draw.polygon(points, fill=tooth_color)

    # Gear body circle
    body_color = tuple(max(0, min(255, c - 20)) for c in color_base) + (255,)
    draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=body_color)

    # Spokes (4 spokes)
    spoke_w = int(size * 0.04)
    for i in range(4):
        angle = math.pi / 4 + (math.pi / 2 * i)
        x1 = cx + hub_r * math.cos(angle)
        y1 = cy + hub_r * math.sin(angle)
        x2 = cx + (inner_r - 6) * math.cos(angle)
        y2 = cy + (inner_r - 6) * math.sin(angle)
        perp_x = -math.sin(angle) * spoke_w
        perp_y = math.cos(angle) * spoke_w
        spoke_poly = [
            (x1 - perp_x, y1 - perp_y),
            (x1 + perp_x, y1 + perp_y),
            (x2 + perp_x, y2 + perp_y),
            (x2 - perp_x, y2 - perp_y),
        ]
        spoke_color = tuple(max(0, min(255, c + 10)) for c in color_base) + (255,)
        draw.polygon(spoke_poly, fill=spoke_color)

    # Lightening holes between spokes
    hole_r = int(size * 0.07)
    for i in range(4):
        angle = math.pi / 2 * i
        hx = cx + int((inner_r + hub_r) * 0.55 * math.cos(angle))
        hy = cy + int((inner_r + hub_r) * 0.55 * math.sin(angle))
        draw.ellipse([hx - hole_r, hy - hole_r, hx + hole_r, hy + hole_r], fill=(0, 0, 0, 0))

    # Hub
    hub_color = tuple(max(0, min(255, c + 30)) for c in color_base) + (255,)
    draw.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=hub_color)

    # Hub ring
    ring_color = tuple(max(0, min(255, c - 40)) for c in color_base) + (255,)
    ring_r = hub_r - 3
    draw.ellipse([cx - ring_r, cy - ring_r, cx + ring_r, cy + ring_r], fill=ring_color, outline=hub_color)

    # Axle hole
    draw.ellipse([cx - axle_r, cy - axle_r, cx + axle_r, cy + axle_r], fill=(20, 12, 8, 255))

    # Add specular highlight
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(highlight)
    hl_cx, hl_cy = int(cx * 0.7), int(cy * 0.7)
    hl_r = int(size * 0.2)
    hdraw.ellipse([hl_cx - hl_r, hl_cy - hl_r, hl_cx + hl_r, hl_cy + hl_r],
                  fill=(255, 255, 255, 60))
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=size // 8))
    img = Image.alpha_composite(img, highlight)

    # Add noise for metal grain
    noise = np.random.randint(0, 25, (size, size), dtype=np.uint8)
    noise_img = Image.fromarray(noise, mode="L").convert("RGBA")
    noise_arr = np.array(noise_img)
    noise_arr[:, :, 3] = noise
    noise_arr[:, :, 0:3] = 128
    noise_overlay = Image.fromarray(noise_arr)
    img = Image.alpha_composite(img, noise_overlay)

    return img


def generate_valve(size: int, spokes: int = 6, name: str = "valve_wheel") -> Image.Image:
    """Generate a valve wheel with spokes and central hub."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    outer_r = int(size * 0.42)
    rim_w = int(size * 0.05)
    inner_r = outer_r - rim_w
    hub_r = int(size * 0.1)
    axle_r = int(size * 0.04)

    color = (205, 127, 50)  # Bronze

    # Outer rim (torus-like)
    rim_outer = tuple(max(0, min(255, c + 20)) for c in color) + (255,)
    rim_inner = tuple(max(0, min(255, c - 30)) for c in color) + (255,)
    draw.ellipse([cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r], fill=rim_outer)
    draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=(0, 0, 0, 0))

    # Rim grip bumps
    bump_count = 24
    bump_r = int(size * 0.015)
    for i in range(bump_count):
        angle = (2 * math.pi * i) / bump_count
        bx = cx + int((outer_r - rim_w // 2) * math.cos(angle))
        by = cy + int((outer_r - rim_w // 2) * math.sin(angle))
        shade = int(20 * math.sin(angle * 2))
        bc = tuple(max(0, min(255, c - 10 + shade)) for c in color) + (255,)
        draw.ellipse([bx - bump_r, by - bump_r, bx + bump_r, by + bump_r], fill=bc)

    # Spokes
    spoke_w = int(size * 0.025)
    for i in range(spokes):
        angle = (2 * math.pi * i) / spokes
        x1 = cx + hub_r * math.cos(angle)
        y1 = cy + hub_r * math.sin(angle)
        x2 = cx + inner_r * math.cos(angle)
        y2 = cy + inner_r * math.sin(angle)
        perp_x = -math.sin(angle) * spoke_w
        perp_y = math.cos(angle) * spoke_w
        spoke_poly = [
            (x1 - perp_x, y1 - perp_y), (x1 + perp_x, y1 + perp_y),
            (x2 + perp_x, y2 + perp_y), (x2 - perp_x, y2 - perp_y),
        ]
        shade = int(15 * math.cos(angle))
        sc = tuple(max(0, min(255, c + shade)) for c in color) + (255,)
        draw.polygon(spoke_poly, fill=sc)

    # Hub
    hub_c = tuple(max(0, min(255, c + 30)) for c in color) + (255,)
    draw.ellipse([cx - hub_r, cy - hub_r, cx + hub_r, cy + hub_r], fill=hub_c)

    # Hub ring
    hr2 = hub_r - 3
    draw.ellipse([cx - hr2, cy - hr2, cx + hr2, cy + hr2],
                 fill=tuple(max(0, min(255, c - 20)) for c in color) + (255,))

    # Axle
    draw.ellipse([cx - axle_r, cy - axle_r, cx + axle_r, cy + axle_r], fill=(15, 10, 5, 255))

    # Specular
    highlight = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(highlight)
    hdraw.ellipse([int(cx * 0.65), int(cy * 0.65), int(cx * 1.05), int(cy * 1.0)],
                  fill=(255, 255, 255, 50))
    highlight = highlight.filter(ImageFilter.GaussianBlur(radius=size // 6))
    img = Image.alpha_composite(img, highlight)

    return img


def generate_gate_valve(size: int) -> Image.Image:
    """Generate a gate valve body with bolts and flange."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size // 2, size // 2
    color = (139, 90, 43)  # Dark bronze

    # Main body (octagonal)
    body_r = int(size * 0.35)
    points = []
    for i in range(8):
        angle = (2 * math.pi * i) / 8 - math.pi / 8
        points.append((cx + body_r * math.cos(angle), cy + body_r * math.sin(angle)))
    draw.polygon(points, fill=color + (255,))

    # Flanges (left and right rectangles)
    flange_w = int(size * 0.12)
    flange_h = int(size * 0.5)
    for side in [-1, 1]:
        fx = cx + side * int(size * 0.38)
        draw.rectangle([fx - flange_w // 2, cy - flange_h // 2, fx + flange_w // 2, cy + flange_h // 2],
                       fill=tuple(c + 15 for c in color) + (255,))
        # Bolt holes on flange
        for j in range(4):
            by = cy - flange_h // 2 + int(flange_h * (j + 0.5) / 4)
            bolt_r = int(size * 0.018)
            draw.ellipse([fx - bolt_r, by - bolt_r, fx + bolt_r, by + bolt_r],
                         fill=(201, 168, 76, 255))  # brass bolt
            draw.ellipse([fx - bolt_r + 1, by - bolt_r + 1, fx + bolt_r - 1, by + bolt_r - 1],
                         fill=(30, 20, 10, 255))  # bolt slot

    # Stem (top)
    stem_w = int(size * 0.06)
    stem_h = int(size * 0.25)
    draw.rectangle([cx - stem_w // 2, cy - body_r - stem_h, cx + stem_w // 2, cy - body_r + 5],
                   fill=(160, 110, 60, 255))

    # Center bore
    bore_r = int(size * 0.08)
    draw.ellipse([cx - bore_r, cy - bore_r, cx + bore_r, cy + bore_r],
                 fill=(10, 6, 3, 255))

    # Noise overlay
    noise = np.random.randint(0, 20, (size, size), dtype=np.uint8)
    noise_overlay = Image.fromarray(np.stack([
        np.full((size, size), 128, dtype=np.uint8),
        np.full((size, size), 128, dtype=np.uint8),
        np.full((size, size), 128, dtype=np.uint8),
        noise
    ], axis=-1))
    img = Image.alpha_composite(img, noise_overlay)

    return img


def generate_metal_plate(size: int) -> Image.Image:
    """Generate a hammered copper plate surface texture."""
    # Base copper gradient
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    for y in range(size):
        for x in range(size):
            # Angled gradient
            t = (x + y) / (2 * size)
            r = int(42 + 142 * t)
            g = int(22 + 93 * t)
            b = int(8 + 43 * t)
            arr[y, x] = [r, g, b, 255]

    img = Image.fromarray(arr)

    # Hammered dents
    dent_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ddraw = ImageDraw.Draw(dent_layer)
    rng = np.random.default_rng(42)
    for _ in range(80):
        dx = rng.integers(0, size)
        dy = rng.integers(0, size)
        dr = rng.integers(3, 12)
        alpha = rng.integers(15, 40)
        ddraw.ellipse([dx - dr, dy - dr, dx + dr, dy + dr], fill=(0, 0, 0, alpha))
    dent_layer = dent_layer.filter(ImageFilter.GaussianBlur(radius=2))
    img = Image.alpha_composite(img, dent_layer)

    # Scratch lines
    scratch_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(scratch_layer)
    for _ in range(30):
        sx = rng.integers(0, size)
        sy = rng.integers(0, size)
        ex = sx + rng.integers(-60, 60)
        ey = sy + rng.integers(-60, 60)
        sdraw.line([(sx, sy), (ex, ey)], fill=(255, 255, 255, rng.integers(10, 30)), width=1)
    img = Image.alpha_composite(img, scratch_layer)

    return img


def generate_patina_noise(size: int) -> Image.Image:
    """Generate verdigris/patina noise overlay texture."""
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    rng = np.random.default_rng(7)

    # Perlin-like noise via multiple octaves of random
    for octave in range(4):
        scale = 2 ** octave
        block = size // (4 * scale)
        if block < 1:
            block = 1
        noise = rng.random((size // block + 1, size // block + 1))
        for y in range(size):
            for x in range(size):
                bx = min(x // block, noise.shape[1] - 1)
                by = min(y // block, noise.shape[0] - 1)
                val = noise[by, bx]
                if val > 0.6:
                    # Green patina
                    intensity = int((val - 0.6) * 400)
                    arr[y, x, 0] = min(255, arr[y, x, 0] + int(intensity * 0.2))
                    arr[y, x, 1] = min(255, arr[y, x, 1] + int(intensity * 0.6))
                    arr[y, x, 2] = min(255, arr[y, x, 2] + int(intensity * 0.4))
                    arr[y, x, 3] = min(255, arr[y, x, 3] + int(intensity * 0.3))

    img = Image.fromarray(arr)
    img = img.filter(ImageFilter.GaussianBlur(radius=3))
    return img


def generate_rivet_normal(size: int) -> Image.Image:
    """Generate a normal map for a rivet/bolt head."""
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    cx, cy = size // 2, size // 2
    r = int(size * 0.4)

    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < r:
                # Normal map: XY from position, Z from dome
                nx = dx / r
                ny = dy / r
                nz = math.sqrt(max(0, 1 - nx * nx - ny * ny))
                # Encode to 0-255 range
                arr[y, x, 0] = int((nx * 0.5 + 0.5) * 255)  # R = X
                arr[y, x, 1] = int((ny * 0.5 + 0.5) * 255)  # G = Y
                arr[y, x, 2] = int((nz * 0.5 + 0.5) * 255)  # B = Z
                arr[y, x, 3] = 255
            else:
                arr[y, x] = [128, 128, 255, 0]  # Flat normal, transparent

    img = Image.fromarray(arr)
    return img


def generate_steam_particle(size: int) -> Image.Image:
    """Generate a soft radial steam particle sprite."""
    arr = np.zeros((size, size, 4), dtype=np.uint8)
    cx, cy = size // 2, size // 2
    max_r = size // 2

    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            dist = math.sqrt(dx * dx + dy * dy)
            if dist < max_r:
                t = dist / max_r
                # Soft falloff
                alpha = int(255 * (1 - t * t) * (1 - t))
                arr[y, x] = [255, 255, 255, alpha]

    img = Image.fromarray(arr)
    img = img.filter(ImageFilter.GaussianBlur(radius=size // 16))
    return img


# ─── Main ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate steampunk KTX2 textures")
    parser.add_argument("--output-dir", default=os.path.join(os.path.dirname(__file__), "..", "web", "public", "textures"),
                        help="Output directory for textures")
    parser.add_argument("--size", type=int, default=512, help="Texture resolution (default: 512)")
    args = parser.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    sz = args.size

    textures = [
        ("gear_copper", lambda: generate_gear(sz, (184, 115, 51), teeth=16, name="copper")),
        ("gear_brass", lambda: generate_gear(sz, (201, 168, 76), teeth=12, name="brass")),
        ("valve_wheel", lambda: generate_valve(sz, spokes=6)),
        ("valve_gate", lambda: generate_gate_valve(sz)),
        ("metal_plate", lambda: generate_metal_plate(sz)),
        ("patina_noise", lambda: generate_patina_noise(sz)),
        ("rivet_normal", lambda: generate_rivet_normal(sz)),
        ("steam_particle", lambda: generate_steam_particle(sz)),
    ]

    for name, gen_fn in textures:
        print(f"  Generating {name}...", end=" ", flush=True)
        img = gen_fn()
        ktx2_path = str(out / f"{name}.ktx2")
        write_ktx2(ktx2_path, img)
        png_path = ktx2_path.replace(".ktx2", ".png")
        print(f"OK  ({os.path.getsize(ktx2_path):,} bytes KTX2, {os.path.getsize(png_path):,} bytes PNG)")

    print(f"\nAll textures written to: {out.resolve()}")
    print("PNG fallbacks are available for browser <img> use.")


if __name__ == "__main__":
    main()
