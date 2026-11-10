"""Export editable binary masks matching the current noise-map sampling."""
from pathlib import Path

from PIL import Image


def export_masks():
    root = Path(__file__).resolve().parent
    source = Image.open(root / "noisemap_10000_redone_16.png").convert("RGB")
    world, cell, threshold = 10000, 16, 0.94
    size = (world + cell - 1) // cell
    mask = Image.new("L", (size, size))
    for z in range(size):
        for x in range(size):
            px = min(source.width - 1, int((x + 0.5) * cell / world * source.width))
            pz = min(source.height - 1, int((z + 0.5) * cell / world * source.height))
            empty = sum(source.getpixel((px, pz))) / (255 * 3) >= threshold
            mask.putpixel((x, z), 255 if empty else 0)

    # A mixed 32-block chunk remains occupied if any of its 16-block cells is solid.
    chunks = Image.new("L", ((size + 1) // 2, (size + 1) // 2))
    for z in range(chunks.height):
        for x in range(chunks.width):
            values = [mask.getpixel((xx, zz))
                      for zz in range(z * 2, min(z * 2 + 2, size))
                      for xx in range(x * 2, min(x * 2 + 2, size))]
            chunks.putpixel((x, z), min(values))

    out = root / "exports"
    out.mkdir(exist_ok=True)
    for name, image in [("noisemap_10000_exact_16.png", mask),
                        ("noisemap_10000_chunks_32.png", chunks)]:
        path = out / name
        image.convert("RGB").save(path)
        with Image.open(path) as saved:
            assert set(saved.convert("L").getdata()) == {0, 255}
        print(f"{path}: {image.width} x {image.height}")


if __name__ == "__main__":
    export_masks()
