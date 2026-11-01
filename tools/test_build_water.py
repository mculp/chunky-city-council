#!/usr/bin/env python3
"""Tests for build_water.py's own arithmetic. Run: .venv/bin/python -m unittest tools/test_build_water.py"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_water import LAKE_POND, area_of, build, render, shore_of, to_lonlat  # noqa: E402

SWAMP = 466
ROADS = {
    "origin": {"lat": 32.32583, "lon": -88.92806},
    "projection": "equirectangular",
    "opening": {"road": "r"},
    "edges": [{"id": "e", "points": [[0, 0], [1000, 0]]}],
    "roads": [{"id": "r", "edges": ["e"]}],
    "reference": {"railroad": {"lines": []}, "crossings": [{"road": "r", "with": "river", "x": 900, "z": 200}]},
}


def square(x, z, size=20):
    return [[x, z], [x + size, z], [x + size, z + size], [x, z + size], [x, z]]


def feature(pond_id, x, z, ftype=LAKE_POND, holes=(), name=None):
    rings = [[list(to_lonlat(*p)) for p in ring] for ring in (square(x, z), *holes)]
    return {"properties": {"PERMANENT_IDENTIFIER": pond_id, "FTYPE": ftype, "GNIS_NAME": name}, "geometry": {"type": "Polygon", "coordinates": rings}}


def run(features, extras=None):
    return build({"features": features}, "2026-11-01", "abc", ROADS, {"open": [], "ponds": [], **(extras or {})})


class Build(unittest.TestCase):
    def test_keeps_a_pond_by_a_road(self):
        out = run([feature("a", 100, 50, name="Some Lake")])
        self.assertEqual([p["id"] for p in out["ponds"]], ["a"])
        pond = out["ponds"][0]
        self.assertEqual((pond["source"], pond["area"], pond["name"]), ("nhd", 400, "Some Lake"))
        self.assertEqual(pond["ring"], [[100, 50], [120, 50], [120, 70], [100, 70]])
        self.assertEqual(len(pond["lonlat"]), 4)

    def test_leaves_out_a_swamp_and_counts_it(self):
        out = run([feature("a", 100, 50, SWAMP)])
        self.assertEqual((out["ponds"], out["left"]["swamps"]), ([], 1))

    def test_a_swamp_thats_really_open_water_comes_in(self):
        out = run([feature("a", 100, 50, SWAMP), feature("b", 200, 50, SWAMP)], {"open": [{"id": "a"}]})
        self.assertEqual([p["id"] for p in out["ponds"]], ["a"])
        self.assertEqual(out["left"]["swamps"], 1)

    def test_says_so_when_one_it_was_told_about_has_gone(self):
        with self.assertRaises(SystemExit):
            run([feature("a", 100, 50)], {"open": [{"id": "gone"}]})

    def test_leaves_out_what_no_road_comes_near(self):
        out = run([feature("a", 100, 600), feature("b", 100, 470)])
        self.assertEqual([p["id"] for p in out["ponds"]], ["b"])
        self.assertEqual(out["left"]["outOfReach"], 1)

    def test_nothing_goes_by_the_bridge(self):
        out = run([feature("a", 900, 300)])
        self.assertEqual((out["ponds"], out["left"]["byTheBridge"]), ([], 1))

    def test_an_island_is_an_error_until_something_handles_one(self):
        with self.assertRaises(SystemExit):
            run([feature("a", 100, 50, holes=[square(105, 55, 5)])])

    def test_the_extras_come_through_marked_and_in_order(self):
        out = run([feature("z", 100, 50)], {"ponds": [{"id": "b", "ring": square(0, 30)[:-1]}, {"id": "a", "ring": square(30, 30)[:-1]}]})
        self.assertEqual([(p["id"], p["source"]) for p in out["ponds"]], [("a", "naip"), ("b", "naip"), ("z", "nhd")])

    def test_points_that_round_to_the_same_place_are_one_point(self):
        points = [to_lonlat(*p) for p in [[0, 0], [20, 0], [20.01, 0], [20, 20], [0, 20], [0.01, 0.01]]]
        ring, lonlat = shore_of(points)
        self.assertEqual(ring, [[0, 0], [20, 0], [20, 20], [0, 20]])
        self.assertEqual(len(lonlat), 4)

    def test_area_of_any_winding(self):
        self.assertEqual(area_of(square(3, 4)[:-1]), 400)
        self.assertEqual(area_of(square(3, 4)[:-1][::-1]), 400)

    def test_renders_as_the_same_json(self):
        out = run([feature("a", 100, 50), feature("b", 200, 50)])
        self.assertEqual(json.loads(render(out)), out)
        self.assertEqual(render(out).count("\n    {"), 2)


if __name__ == "__main__":
    unittest.main()
