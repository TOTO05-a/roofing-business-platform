"""Convierte las texturas CC0 descargadas en los mapas WebP del visualizador 3D (C51, D8: 2K en techo y fachada, 1K en suelo).

Uso (Python 3 con Pillow y NumPy):

    python -I packages/ui/scripts/roof-textures/build.py <carpeta-de-descargas>

La carpeta de descargas debe contener las texturas descomprimidas con estas rutas
(ver `packages/ui/src/visualizer/3d/assets/LICENCIAS.md` para las fuentes):

    rooftop_0010/x/rooftop_0010_{color,normal_opengl,roughness,ao,height}_2k.*
    RoofingTiles014A/x/RoofingTiles014A_2K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg
    roof_slates_03/roof_slates_03_{diff,nor_gl,rough,ao}_2k.jpg
    WoodSiding011/x/WoodSiding011_2K-JPG_{Color,NormalGL,Displacement}.jpg
    WoodSiding009/x/WoodSiding009_2K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg
    Grass004/x/Grass004_2K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg
    Concrete048/x/Concrete048_2K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg

Por cada superficie escribe tres mapas en `src/visualizer/3d/assets/textures/`:
`<id>-color.webp` (gris para teñir, o color real en césped y hormigón),
`<id>-normal.webp` (normal OpenGL) y `<id>-orm.webp` (R = oclusión, G = rugosidad, B = metal).
La teja arquitectónica se genera aquí: patrón laminado propio sobre el granulado de `rooftop_0010`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'src' / 'visualizer' / '3d' / 'assets' / 'textures'
SIZE = 2048
QUALITY_COLOR = 90
QUALITY_NORMAL = 85
QUALITY_ORM = 80
#: Luminosidad media (sRGB) de los mapas en gris; el código compensa con `albedoGain`.
GRAY_TARGET = 0.78


def load(path: Path, mode: str = 'RGB', size: tuple[int, int] | None = None) -> np.ndarray:
    im = Image.open(path)
    if im.mode == 'I;16':
        arr = np.asarray(im, dtype=np.float32) / 65535.0
        im = Image.fromarray((arr * 255).astype(np.uint8), 'L')
    im = im.convert(mode)
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, dtype=np.float32) / 255.0


def save(arr: np.ndarray, name: str, quality: int) -> None:
    arr8 = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    mode = 'L' if arr8.ndim == 2 else 'RGB'
    Image.fromarray(arr8, mode).save(OUT / name, 'WEBP', quality=quality, method=6)


def srgb_to_linear(c: np.ndarray | float) -> np.ndarray | float:
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_gray(rgb: np.ndarray, contrast: float = 1.0) -> tuple[np.ndarray, float]:
    """Gris con media `GRAY_TARGET`, conservando la variación entre piezas."""
    g = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    mean = float(g.mean())
    g = (g - mean) * contrast / max(mean, 1e-3) * GRAY_TARGET + GRAY_TARGET
    g = np.clip(g, 0, 1)
    gain = 1.0 / float(srgb_to_linear(g).mean())
    return g, gain


def orm(ao: np.ndarray, rough: np.ndarray, metal: float = 0.0) -> np.ndarray:
    return np.dstack([ao, rough, np.full_like(ao, metal)])


def blur(a: np.ndarray, radius: float) -> np.ndarray:
    """Desenfoque gaussiano periódico (por FFT), así el mosaico no muestra costuras."""
    h, w = a.shape
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.rfftfreq(w)[None, :]
    kernel = np.exp(-2 * (np.pi * radius) ** 2 * (fx**2 + fy**2))
    return np.fft.irfft2(np.fft.rfft2(a) * kernel, s=(h, w)).astype(np.float32)


def normal_from_height(h: np.ndarray, strength: float) -> np.ndarray:
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * 0.5
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * 0.5
    nx, ny, nz = -dx * strength, dy * strength, np.ones_like(h)  # OpenGL: +Y hacia arriba
    n = np.sqrt(nx**2 + ny**2 + nz**2)
    return np.dstack([nx / n, ny / n, nz / n]) * 0.5 + 0.5


def blend_normals(base: np.ndarray, detail: np.ndarray, detail_amount: float) -> np.ndarray:
    """Mezcla de normales (*whiteout*) con el detalle atenuado."""
    b = base * 2 - 1
    d = detail * 2 - 1
    d[..., :2] *= detail_amount
    n = np.dstack([b[..., 0] + d[..., 0], b[..., 1] + d[..., 1], b[..., 2] * d[..., 2]])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def clean_granule(gray: np.ndarray) -> np.ndarray:
    """Granulado de `rooftop_0010` sin las juntas de sus tejas (se rellenan con zonas limpias)."""
    hp = gray - blur(gray, 4)
    hp /= hp.std() + 1e-6
    # Las juntas son líneas oscuras: se detectan por energía local alta y se sustituyen
    # por el mismo granulado desplazado medio módulo, donde esa zona sí está limpia.
    edge = blur(np.abs(gray - blur(gray, 12)), 3)
    bad = edge > np.percentile(edge, 72)
    out = hp.copy()
    for dy, dx in ((64, 103), (32, 51), (96, 154), (16, 77)):
        cand = np.roll(hp, (dy, dx), axis=(0, 1))
        cand_bad = np.roll(bad, (dy, dx), axis=(0, 1))
        use = bad & ~cand_bad
        out[use] = cand[use]
        bad &= ~use
    out[bad] = 0.0
    return out / (out.std() + 1e-6)


def architectural(src: Path, rng: np.random.Generator) -> float:
    """Teja arquitectónica laminada (patrón propio sobre el granulado real de `rooftop_0010`).

    Cada hilera tiene una capa inferior continua y, encima, lengüetas de ancho irregular
    separadas por ranuras trapezoidales («dientes de dragón») donde asoma la capa inferior,
    más oscura. Una banda de sombra impresa cruza la parte alta de cada hilera.
    """
    color = load(src / 'rooftop_0010/x/rooftop_0010_color_2k.jpg')
    gray = color @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    granule = clean_granule(gray)

    courses = 16
    ch = SIZE // courses  # alto de hilera en px (exposición ≈ 14 cm)
    local = (np.arange(ch, dtype=np.float32) / ch)[:, None]  # 0 arriba … 1 borde inferior
    tone = np.zeros((SIZE, SIZE), np.float32)
    height = np.zeros((SIZE, SIZE), np.float32)
    lower = np.zeros((SIZE, SIZE), bool)
    xs = np.arange(SIZE)[None, :]

    for c in range(courses):
        rows = slice(c * ch, (c + 1) * ch)
        row_tone = np.full((ch, SIZE), -0.16, np.float32)  # capa inferior, más oscura
        row_h = np.broadcast_to(0.15 + 0.25 * local, (ch, SIZE)).copy()
        row_lower = np.ones((ch, SIZE), bool)
        start = int(rng.integers(0, SIZE))
        x = start
        while x - start < SIZE:
            w = int(rng.uniform(0.75, 1.7) * ch)
            w = min(w, start + SIZE - x)
            t = float(rng.normal(0, 0.05))
            gap_bottom = rng.uniform(0.18, 0.42) * ch
            gap_top = gap_bottom * rng.uniform(0.25, 0.55)
            # Ranura trapezoidal a la derecha de la lengüeta: más ancha abajo.
            half_gap = (gap_top + (gap_bottom - gap_top) * local) / 2
            dist = (xs - x) % SIZE
            inside = dist < (w - half_gap)  # (ch, SIZE)
            row_tone = np.where(inside, t, row_tone)
            row_h = np.where(inside, 0.5 + 0.5 * local, row_h)
            row_lower &= ~inside
            x += w
        band = np.exp(-(((local - 0.30) / 0.10) ** 2)) * -0.07  # banda de sombra impresa
        cast = np.clip(1 - local / 0.12, 0, 1) ** 1.5 * -0.14  # sombra de la hilera superior
        tone[rows] = row_tone + band + cast
        height[rows] = row_h
        lower[rows] = row_lower

    gray_map = np.clip(GRAY_TARGET * (1 + tone) + granule * 0.055, 0, 1)
    gain = 1.0 / float(srgb_to_linear(gray_map).mean())

    h_soft = blur(height, 1.0)
    base_n = normal_from_height(h_soft, 16.0)
    detail_n = normal_from_height(blur(granule, 0.6), 0.9)
    normal = blend_normals(base_n, detail_n, 1.0)
    ao = np.clip(0.6 + 0.4 * blur(h_soft, 5), 0, 1)
    ao = np.where(lower, ao * 0.88, ao)
    rough = np.clip(0.87 + granule * 0.03, 0, 1)

    save(gray_map, 'architectural-shingle-color.webp', QUALITY_COLOR)
    save(normal, 'architectural-shingle-normal.webp', QUALITY_NORMAL)
    save(orm(ao, rough), 'architectural-shingle-orm.webp', QUALITY_ORM)
    return gain


def standard(
    out_id: str,
    color_path: Path,
    normal_path: Path,
    rough_path: Path | None,
    ao_path: Path | None,
    *,
    tint: bool,
    contrast: float = 1.0,
    rough_default: float = 0.8,
    size: tuple[int, int] = (SIZE, SIZE),
    displacement: Path | None = None,
) -> float:
    color = load(color_path, size=size)
    if tint:
        col, gain = to_gray(color, contrast)
    else:
        col, gain = color, 1.0
    normal = load(normal_path, size=size)
    if rough_path:
        rough = load(rough_path, 'L', size)
    else:
        lum = color @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
        rough = np.clip(rough_default + (lum.mean() - lum) * 0.3, 0, 1)
    if ao_path:
        ao = load(ao_path, 'L', size)
    elif displacement:
        d = load(displacement, 'L', size)
        ao = np.clip(1 - np.clip(blur(d, 8) - d, 0, 1) * 2.5, 0, 1)
    else:
        ao = np.ones(rough.shape, np.float32)
    save(col, f'{out_id}-color.webp', QUALITY_COLOR)
    save(normal, f'{out_id}-normal.webp', QUALITY_NORMAL)
    save(orm(ao, rough), f'{out_id}-orm.webp', QUALITY_ORM)
    return gain


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(20261113)
    gains: dict[str, float] = {}

    r10 = src / 'rooftop_0010/x'
    gains['three-tab-shingle'] = standard(
        'three-tab-shingle',
        r10 / 'rooftop_0010_color_2k.jpg',
        r10 / 'rooftop_0010_normal_opengl_2k.png',
        r10 / 'rooftop_0010_roughness_2k.jpg',
        r10 / 'rooftop_0010_ao_2k.jpg',
        tint=True,
        contrast=0.8,
    )
    gains['architectural-shingle'] = architectural(src, rng)
    rt = src / 'RoofingTiles014A/x/RoofingTiles014A_2K-JPG'
    gains['clay-tile'] = standard(
        'clay-tile',
        Path(f'{rt}_Color.jpg'),
        Path(f'{rt}_NormalGL.jpg'),
        Path(f'{rt}_Roughness.jpg'),
        Path(f'{rt}_AmbientOcclusion.jpg'),
        tint=True,
    )
    sl = src / 'roof_slates_03/roof_slates_03'
    gains['slate'] = standard(
        'slate',
        Path(f'{sl}_diff_2k.jpg'),
        Path(f'{sl}_nor_gl_2k.jpg'),
        Path(f'{sl}_rough_2k.jpg'),
        Path(f'{sl}_ao_2k.jpg'),
        tint=True,
    )
    ws11 = src / 'WoodSiding011/x/WoodSiding011_2K-JPG'
    gains['cedar-shake'] = standard(
        'cedar-shake',
        Path(f'{ws11}_Color.jpg'),
        Path(f'{ws11}_NormalGL.jpg'),
        None,
        None,
        tint=True,
        rough_default=0.82,
        displacement=Path(f'{ws11}_Displacement.jpg'),
    )
    ws9 = src / 'WoodSiding009/x/WoodSiding009_2K-JPG'
    gains['siding'] = standard(
        'siding',
        Path(f'{ws9}_Color.jpg'),
        Path(f'{ws9}_NormalGL.jpg'),
        Path(f'{ws9}_Roughness.jpg'),
        Path(f'{ws9}_AmbientOcclusion.jpg'),
        tint=True,
        contrast=0.6,
        size=(2048, 1024),
    )
    g4 = src / 'Grass004/x/Grass004_2K-JPG'
    gains['grass'] = standard(
        'grass',
        Path(f'{g4}_Color.jpg'),
        Path(f'{g4}_NormalGL.jpg'),
        Path(f'{g4}_Roughness.jpg'),
        Path(f'{g4}_AmbientOcclusion.jpg'),
        tint=False,
        size=(1024, 1024),
    )
    c48 = src / 'Concrete048/x/Concrete048_2K-JPG'
    gains['concrete'] = standard(
        'concrete',
        Path(f'{c48}_Color.jpg'),
        Path(f'{c48}_NormalGL.jpg'),
        Path(f'{c48}_Roughness.jpg'),
        Path(f'{c48}_AmbientOcclusion.jpg'),
        tint=False,
        size=(1024, 1024),
    )

    manifest = {k: round(v, 4) for k, v in gains.items()}
    (OUT / 'albedo-gain.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    total = sum(p.stat().st_size for p in OUT.glob('*.webp'))
    print(json.dumps(manifest, indent=2))
    print(f'Total WebP: {total / 1e6:.2f} MB')


if __name__ == '__main__':
    main()
