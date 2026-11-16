"""Small Java structure-NBT reader for the local visual preview (stdlib only)."""
from __future__ import annotations

import gzip
import hashlib
import io
from pathlib import Path
import struct
from functools import lru_cache

ROOT = Path(__file__).resolve().parent


class NbtReader:
    def __init__(self, raw: bytes):
        self.source = io.BytesIO(raw)

    def number(self, fmt):
        size = struct.calcsize(fmt)
        return struct.unpack(fmt, self.source.read(size))[0]

    def string(self):
        return self.source.read(self.number('>H')).decode('utf-8')

    def payload(self, tag):
        if 1 <= tag <= 6:
            return self.number({1: '>b', 2: '>h', 3: '>i', 4: '>q', 5: '>f', 6: '>d'}[tag])
        if tag == 8:
            return self.string()
        if tag == 9:
            child, count = self.number('>B'), self.number('>i')
            if not 0 <= count <= 2_000_000:
                raise ValueError('NBT list too large')
            return [self.payload(child) for _ in range(count)]
        if tag == 10:
            result = {}
            while child := self.number('>B'):
                name = self.string()
                result[name] = self.payload(child)
            return result
        if tag in (7, 11, 12):
            count = self.number('>i')
            if not 0 <= count <= 2_000_000:
                raise ValueError('NBT array too large')
            return [self.number({7: '>b', 11: '>i', 12: '>q'}[tag]) for _ in range(count)]
        raise ValueError(f'Unsupported NBT tag: {tag}')


@lru_cache(maxsize=4)
def decode_template(raw: bytes):
    reader = NbtReader(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
    if reader.number('>B') != 10:
        raise ValueError('Expected a Java structure NBT compound')
    reader.string()
    root = reader.payload(10)
    size = root['size']
    if size != [13, 13, 24]:
        raise ValueError(f'tunnel_long: expected 13 x 13 x 24, got {size}')
    palette = root.get('palette') or root['palettes'][0]
    ignored = {'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:structure_void'}
    blocks = [[*block['pos'], block['state']] for block in root['blocks']
              if palette[block['state']]['Name'] not in ignored]
    # Structure-block offset (-13, 1, 1) positions the saved volume relative to
    # that editor block. Saved block positions are already local to this volume.
    return dict(name='tunnel_long', size=size, palette=palette, blocks=blocks,
                editorOffset=[-13, 1, 1], revision=hashlib.sha256(raw).hexdigest())


def tunnel_preview():
    return decode_template((ROOT / 'imports_nbt' / 'tunnel_long.nbt').read_bytes())
