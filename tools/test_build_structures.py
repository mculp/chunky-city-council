#!/usr/bin/env python3
"""Tests for build_structures.py's own arithmetic. Run: .venv/bin/python -m unittest tools/test_build_structures.py"""
import struct
import sys
import unittest
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_structures import clip_ring, door_edge, inside, read_png, rings_touch, signed_area, simplify  # noqa: E402


def png(width, height, rows):
    """An 8-bit RGB PNG from (filter, row bytes) pairs."""
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    raw = b"".join(bytes([f]) + bytes(r) for f, r in rows)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class ReadPng(unittest.TestCase):
    def test_unfilters_each_kind(self):
        # Five rows, one per filter, that all come out as these pixels
        want = [[10, 20, 30, 40, 50, 60], [11, 22, 33, 44, 55, 66], [100, 90, 80, 70, 60, 50], [200, 150, 100, 50, 25, 12], [1, 2, 3, 4, 5, 6]]
        rows = [(0, want[0])]
        rows.append((1, [(want[1][i] - (want[1][i - 3] if i >= 3 else 0)) & 255 for i in range(6)]))
        rows.append((2, [(want[2][i] - want[1][i]) & 255 for i in range(6)]))
        rows.append((3, [(want[3][i] - ((want[3][i - 3] if i >= 3 else 0) + want[2][i]) // 2) & 255 for i in range(6)]))

        def paeth(a, b, c):
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            return a if pa <= pb and pa <= pc else b if pb <= pc else c
        rows.append((4, [(want[4][i] - paeth(want[4][i - 3] if i >= 3 else 0, want[3][i], want[3][i - 3] if i >= 3 else 0)) & 255 for i in range(6)]))
        width, height, out = read_png(png(2, 5, rows))
        self.assertEqual((width, height), (2, 5))
        self.assertEqual([list(r) for r in out], want)

    def test_refuses_what_it_cannot_read(self):
        with self.assertRaises(ValueError):
            read_png(b"not a png at all")


class Shapes(unittest.TestCase):
    SQUARE = [(0, 0), (10, 0), (10, 10), (0, 10)]

    def test_simplify_drops_repeats_and_straight_corners(self):
        self.assertEqual(simplify([(0, 0), (5, 0), (10, 0), (10, 10), (10, 10), (0, 10), (0, 0)]), self.SQUARE)

    def test_clip_cuts_at_the_line(self):
        cut = clip_ring(self.SQUARE, "z", 4)
        self.assertEqual(sorted(cut), sorted([(0, 0), (10, 0), (10, 4), (0, 4)]))
        self.assertAlmostEqual(signed_area(cut), 40)

    def test_inside(self):
        self.assertTrue(inside(5, 5, self.SQUARE))
        self.assertFalse(inside(15, 5, self.SQUARE))

    def test_rings_touch(self):
        near = [(10.5, 0), (20, 0), (20, 10), (10.5, 10)]
        far = [(13, 0), (20, 0), (20, 10), (13, 10)]
        crossing = [(5, 5), (20, 5), (20, 20), (5, 20)]
        self.assertTrue(rings_touch(self.SQUARE, crossing, 0))
        self.assertFalse(rings_touch(self.SQUARE, near, 0))
        self.assertTrue(rings_touch(self.SQUARE, near, 1))
        self.assertFalse(rings_touch(self.SQUARE, far, 1))


class Doors(unittest.TestCase):
    class World:
        rail = []

        def nearest_road(self, x, z):
            return 20, 7, ((-100, 30), (100, 30))

    # counter-clockwise in x, z, as the build winds them. Edge 2 runs along z = 10, facing the road at z = 30.
    RING = [(0, 0), (10, 0), (10, 10), (0, 10)]

    def test_door_faces_the_road(self):
        self.assertEqual(door_edge(self.RING, self.World()), 2)

    def test_door_faces_where_its_told(self):
        self.assertEqual(door_edge(self.RING, self.World(), "north"), 0)
        self.assertEqual(door_edge(self.RING, self.World(), "east"), 1)
        self.assertEqual(door_edge(self.RING, self.World(), "west"), 3)


if __name__ == "__main__":
    unittest.main()
