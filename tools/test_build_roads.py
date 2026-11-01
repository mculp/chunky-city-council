"""Tests for tools/build_roads.py, using small made-up fixtures. They never read a zip.

Run from the repo root. They need nothing but the standard library:

    python3 -m unittest tools/test_build_roads.py

Fixture positions are true metres, turned into 6-decimal lon/lat like TIGER's.
"""

import contextlib
import io
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_roads as build  # noqa: E402
from build_roads import BuildError  # noqa: E402


def lonlat(x, z):
    lon, lat = build.to_lonlat(x, z)
    return round(lon, 6), round(lat, 6)


def record(name, points, mtfcc="S1400", linear_id=None):
    vertices = tuple(lonlat(*point) for point in points)
    return build.Record("Newton", linear_id or name, name, mtfcc, "", vertices)


def bands(*triples):
    """Return compression rows for (trueFrom, trueTo, factor) triples."""
    return build.compression_rows(
        [
            {"axis": "x", "trueFrom": a, "trueTo": b, "factor": factor, "reason": "test"}
            for a, b, factor in triples
        ]
    )


def turn_sign(p, q, r):
    """Return the sign of the turn at q, walking from p to r."""
    cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0])
    return (cross > 0) - (cross < 0)


class RoadClassTest(unittest.TestCase):
    CONFIG = {
        "mtfcc": {"S1400": {"label": "Local", "width": 6.0, "surface": "asphalt"}},
        "overrides": {},
    }
    SPEC = {"id": "church_st", "name": "Church St"}

    def road(self, mtfcc="S1400"):
        line = record("Church St", [(0, 0), (100, 0)], mtfcc)
        return build.RoadLines(self.SPEC, ["Church St"], build.carriers_of([line]))

    def test_class_is_used_without_an_override(self):
        result = build.road_class(self.road(), self.CONFIG, [])
        self.assertEqual(result, ("S1400", 6.0, "asphalt", "class"))

    def test_override_takes_precedence_over_class(self):
        config = {
            **self.CONFIG,
            "overrides": {"church_st": {"width": 9.5, "surface": "gravel", "reason": "test"}},
        }
        result = build.road_class(self.road(), config, [])
        self.assertEqual(result, ("S1400", 9.5, "gravel", "override"))

    def test_partial_override_keeps_the_rest_of_the_class(self):
        config = {**self.CONFIG, "overrides": {"church_st": {"surface": "dirt"}}}
        result = build.road_class(self.road(), config, [])
        self.assertEqual(result, ("S1400", 6.0, "dirt", "override"))

    def test_override_for_another_road_does_not_apply(self):
        config = {**self.CONFIG, "overrides": {"us_80": {"width": 20.0}}}
        self.assertEqual(build.road_class(self.road(), config, [])[3], "class")

    def test_unknown_mtfcc_fails(self):
        with self.assertRaisesRegex(BuildError, "S9999"):
            build.road_class(self.road("S9999"), self.CONFIG, [])

    def test_unknown_mtfcc_fails_even_with_an_override(self):
        config = {**self.CONFIG, "overrides": {"church_st": {"width": 9.5, "surface": "dirt"}}}
        with self.assertRaisesRegex(BuildError, "S9999"):
            build.road_class(self.road("S9999"), config, [])


class NearestComponentTest(unittest.TestCase):
    SPEC = {
        "id": "church_st",
        "tigerNames": ["Church St"],
        "selection": {"rule": "nearest_component", "maxDistanceM": 1000},
    }
    NEAR = [(-1097, -410), (-281, -199)]
    FAR = [(-8451, 812), (-7922, 726)]

    def selected(self, records, spec=None):
        return {r.linear_id for r in build.select_component(records, spec or self.SPEC)}

    def test_picks_the_nearer_of_two_roads_with_one_name(self):
        near = record("Church St", self.NEAR, linear_id="near")
        far = record("Church St", self.FAR, linear_id="far")
        self.assertEqual(self.selected([far, near]), {"near"})
        self.assertEqual(self.selected([near, far]), {"near"})

    def test_a_component_includes_records_joined_by_a_shared_vertex(self):
        near = record("Church St", self.NEAR, linear_id="near")
        joined = record("Church St", [self.NEAR[0], (-3000, -900)], linear_id="joined")
        far = record("Church St", self.FAR, linear_id="far")
        self.assertEqual(self.selected([far, joined, near]), {"near", "joined"})

    def test_distance_is_along_the_segments_not_to_the_vertices(self):
        # The vertices of this one are far off, but it passes right by town center.
        across = record("Church St", [(-5000, 10), (5000, 10)], linear_id="across")
        nearer_vertex = record("Church St", [(1500, 900), (3000, 900)], linear_id="nearer_vertex")
        self.assertEqual(self.selected([nearer_vertex, across]), {"across"})

    def test_other_names_are_ignored(self):
        other = record("Adams St", [(0, 10), (0, 20)], linear_id="other")
        near = record("Church St", self.NEAR, linear_id="near")
        self.assertEqual(self.selected([other, near]), {"near"})

    def test_fails_when_the_nearest_is_too_far(self):
        with self.assertRaisesRegex(BuildError, "over the limit"):
            build.select_component([record("Church St", self.FAR)], self.SPEC)

    def test_fails_when_no_record_has_the_name(self):
        with self.assertRaisesRegex(BuildError, "no record is named"):
            build.select_component([record("Adams St", self.NEAR)], self.SPEC)

    def test_fails_when_the_nearest_component_lacks_a_name(self):
        spec = {**self.SPEC, "tigerNames": ["Church St", "Church St W"]}
        near = record("Church St", self.NEAR)
        far = record("Church St W", self.FAR)
        with self.assertRaisesRegex(BuildError, "doesn't contain"):
            build.select_component([near, far], spec)


class RemapTest(unittest.TestCase):
    ONE = bands((1000, 5000, 0.25))
    TWO = bands((1000, 5000, 0.25), (7000, 8000, 0.5))
    WEST = bands((-4000, -1000, 0.1), (-1000, -500, 0.5), (1000, 5000, 0.25))

    def test_rows_hold_the_game_range(self):
        band = self.ONE[0]
        self.assertEqual(
            {key: band[key] for key in ("axis", "trueFrom", "trueTo", "gameFrom", "gameTo")},
            {"axis": "x", "trueFrom": 1000, "trueTo": 5000, "gameFrom": 1000, "gameTo": 2000},
        )
        self.assertEqual(band["factor"], 0.25)
        self.assertEqual(band["reason"], "test")

    def test_second_band_allows_for_the_first(self):
        second = self.TWO[1]
        self.assertEqual((second["gameFrom"], second["gameTo"]), (4000, 4500))

    def test_identity_west_of_the_band(self):
        for x in (-5000.0, 0.0, 999.5, 1000.0):
            self.assertEqual(build.compress_x(x, self.ONE), x)

    def test_scales_inside_the_band(self):
        self.assertEqual(build.compress_x(1400.0, self.ONE), 1100.0)
        self.assertEqual(build.compress_x(3000.0, self.ONE), 1500.0)

    def test_constant_shift_east_of_the_band(self):
        for x in (5000.0, 5000.5, 6000.0, 20000.0):
            self.assertEqual(build.compress_x(x, self.ONE), x - 3000)

    def test_shifts_add_up_between_and_past_two_bands(self):
        self.assertEqual(build.compress_x(6000.0, self.TWO), 3000.0)
        self.assertEqual(build.compress_x(7500.0, self.TWO), 4250.0)
        self.assertEqual(build.compress_x(9000.0, self.TWO), 5500.0)

    def test_bands_west_of_town_center_move_what_is_past_them_east(self):
        first, second, third = self.WEST
        self.assertEqual((first["gameFrom"], first["gameTo"]), (-1050, -750))
        self.assertEqual((second["gameFrom"], second["gameTo"]), (-750, -500))
        self.assertEqual((third["gameFrom"], third["gameTo"]), (1000, 2000))
        for x in (-500.0, 0.0, 999.5):
            self.assertEqual(build.compress_x(x, self.WEST), x)
        self.assertEqual(build.compress_x(-750.0, self.WEST), -625.0)
        self.assertEqual(build.compress_x(-5000.0, self.WEST), -2050.0)
        self.assertEqual(build.compress_x(6000.0, self.WEST), 3000.0)

    def test_a_band_across_town_center_fails(self):
        with self.assertRaisesRegex(BuildError, "town center"):
            bands((-10, 10, 0.5))

    def test_no_bands_is_the_identity(self):
        self.assertEqual(build.compress_x(1234.5, []), 1234.5)
        self.assertEqual(build.decompress_x(1234.5, []), 1234.5)

    def test_strictly_increasing(self):
        for rows in (self.ONE, self.TWO, self.WEST):
            xs = [-6000 + step * 0.25 for step in range(80000)]
            images = [build.compress_x(x, rows) for x in xs]
            for earlier, later in zip(images, images[1:]):
                self.assertLess(earlier, later)

    def test_continuous_at_each_edge(self):
        for rows in (self.ONE, self.TWO, self.WEST):
            for edge in build.band_edges(rows):
                below = build.compress_x(edge - 1e-6, rows)
                at = build.compress_x(edge, rows)
                above = build.compress_x(edge + 1e-6, rows)
                self.assertLess(below, at)
                self.assertLess(at, above)
                self.assertLess(above - below, 3e-6)

    def test_invertible(self):
        for rows in (self.ONE, self.TWO, self.WEST):
            for step in range(-600, 2000):
                x = step * 7.3
                self.assertAlmostEqual(build.decompress_x(build.compress_x(x, rows), rows), x)
                self.assertAlmostEqual(build.compress_x(build.decompress_x(x, rows), rows), x)

    def test_inverse_of_each_edge_is_exact(self):
        for rows in (self.ONE, self.TWO, self.WEST):
            for row in rows:
                self.assertEqual(build.decompress_x(row["gameFrom"], rows), row["trueFrom"])
                self.assertEqual(build.decompress_x(row["gameTo"], rows), row["trueTo"])

    def test_invalid_bands_fail(self):
        good = {"axis": "x", "trueFrom": 1, "trueTo": 2, "factor": 0.5, "reason": "test"}
        cases = {
            "isn't x": [{**good, "axis": "z"}],
            "west of": [{**good, "trueFrom": 2, "trueTo": 1}],
            "factor 0 ": [{**good, "factor": 0}],
            "factor -1": [{**good, "factor": -1}],
            "factor 1 ": [{**good, "factor": 1}],
            "factor 2 ": [{**good, "factor": 2}],
            "missing": [{key: good[key] for key in ("axis", "trueFrom", "trueTo", "factor")}],
            "not overlap": [
                {**good, "trueFrom": 5, "trueTo": 9},
                {**good, "trueFrom": 8, "trueTo": 10},
            ],
        }
        for message, config_bands in cases.items():
            with self.subTest(message), self.assertRaisesRegex(BuildError, message):
                build.compression_rows(config_bands)

    def test_empty_reason_fails(self):
        with self.assertRaisesRegex(BuildError, "missing"):
            build.compression_rows(
                [{"axis": "x", "trueFrom": 1, "trueTo": 2, "factor": 0.5, "reason": ""}]
            )


class SplitTest(unittest.TestCase):
    ROWS = bands((1000, 5000, 0.25))

    def assert_on_edge_and_segment(self, vertex, edge, a, b):
        position = build.to_xz(vertex)
        self.assertAlmostEqual(position[0], edge, delta=0.0001)
        on_segment = build.closest_on_segment(position, build.to_xz(a), build.to_xz(b))
        self.assertLess(math.dist(position, on_segment), 0.0002)

    def test_a_segment_inside_one_region_is_left_alone(self):
        for points in ([(0, 0), (900, 40)], [(1100, 0), (4900, 40)], [(5100, 0), (9000, 40)]):
            chain = [lonlat(*point) for point in points]
            self.assertEqual(build.split_at_band_edges(chain, self.ROWS), (chain, []))

    def test_no_bands_leaves_the_chain_alone(self):
        chain = [lonlat(0, 0), lonlat(9000, 40)]
        self.assertEqual(build.split_at_band_edges(chain, []), (chain, []))

    def test_splits_where_a_segment_crosses_an_edge(self):
        a, b = lonlat(800, -100), lonlat(1200, 300)
        chain, synthetic = build.split_at_band_edges([a, b], self.ROWS)
        self.assertEqual(synthetic, [1])
        self.assertEqual((chain[0], chain[2]), (a, b))
        self.assert_on_edge_and_segment(chain[1], 1000, a, b)
        self.assertAlmostEqual(build.to_xz(chain[1])[1], 100, delta=0.1)

    def test_splits_a_westward_segment_too(self):
        a, b = lonlat(5200, 0), lonlat(4800, 100)
        chain, synthetic = build.split_at_band_edges([a, b], self.ROWS)
        self.assertEqual(synthetic, [1])
        self.assert_on_edge_and_segment(chain[1], 5000, a, b)

    def test_a_segment_across_the_whole_band_splits_twice_in_walk_order(self):
        west, east = lonlat(0, 0), lonlat(6000, 600)
        chain, synthetic = build.split_at_band_edges([west, east], self.ROWS)
        self.assertEqual(synthetic, [1, 2])
        self.assert_on_edge_and_segment(chain[1], 1000, west, east)
        self.assert_on_edge_and_segment(chain[2], 5000, west, east)
        chain, synthetic = build.split_at_band_edges([east, west], self.ROWS)
        self.assertEqual(synthetic, [1, 2])
        self.assert_on_edge_and_segment(chain[1], 5000, west, east)
        self.assert_on_edge_and_segment(chain[2], 1000, west, east)

    def test_indices_allow_for_earlier_insertions(self):
        points = [(900, 0), (1100, 10), (1200, 20), (900, 30), (800, 40), (1100, 50)]
        chain, synthetic = build.split_at_band_edges([lonlat(*p) for p in points], self.ROWS)
        self.assertEqual(synthetic, [1, 4, 7])
        self.assertEqual(len(chain), len(points) + 3)
        for index in synthetic:
            self.assertAlmostEqual(build.to_xz(chain[index])[0], 1000, delta=0.0001)
        kept = [vertex for index, vertex in enumerate(chain) if index not in synthetic]
        self.assertEqual(kept, [lonlat(*p) for p in points])

    def test_the_image_of_a_split_segment_is_true(self):
        # z is x / 10 anywhere along this segment. Without the split its image would run
        # straight from x 0 to x 3000, putting z 100 at x 500 rather than the true x 1000.
        a, b = lonlat(0, 0), lonlat(6000, 600)
        chain, _ = build.split_at_band_edges([a, b], self.ROWS)
        image = [build.game_position(vertex, self.ROWS) for vertex in chain]
        self.assertEqual(image[1][0], 1000)
        self.assertEqual(image[2][0], 2000)
        self.assertAlmostEqual(image[1][1], 100, delta=0.1)
        self.assertAlmostEqual(image[2][1], 500, delta=0.1)


class TurnSignTest(unittest.TestCase):
    ROWS = bands((1000, 5000, 0.25))
    ZIGZAG = [
        (-300, 0),
        (-100, 200),
        (800, 40),
        (1300, 300),
        (2000, -50),
        (900, 500),
        (4200, 90),
        (5200, 700),
        (4600, 200),
        (7000, 650),
        (9000, -400),
        (200, 800),
        (6000, 1200),
    ]

    def assert_turns_kept(self, points, rows):
        chain = [lonlat(*point) for point in points]
        split, synthetic = build.split_at_band_edges(chain, rows)
        image = [build.game_position(vertex, rows) for vertex in split]
        at = {vertex: index for index, vertex in enumerate(split) if index not in synthetic}
        self.assertEqual(len(at), len(chain))
        for before, here, after in zip(chain, chain[1:], chain[2:]):
            true_turn = turn_sign(build.to_xz(before), build.to_xz(here), build.to_xz(after))
            index = at[here]
            game_turn = turn_sign(image[index - 1], image[index], image[index + 1])
            self.assertNotEqual(true_turn, 0)
            self.assertEqual(game_turn, true_turn, f"The turn flipped at {here}")

    def test_every_turn_keeps_its_sign(self):
        self.assert_turns_kept(self.ZIGZAG, self.ROWS)

    def test_every_turn_keeps_its_sign_with_two_bands(self):
        self.assert_turns_kept(self.ZIGZAG, bands((1000, 3000, 0.25), (3500, 6500, 0.5)))

    def test_every_turn_keeps_its_sign_when_the_chain_is_reversed(self):
        self.assert_turns_kept(self.ZIGZAG[::-1], self.ROWS)

    def test_this_needs_the_split(self):
        # The next vertex lies past the band, so remapping the vertices alone flips the gentle
        # turn at the second vertex. The split keeps it.
        points = [(-100, -100), (0, 0), (5020, 5000)]
        rows = bands((10, 5010, 0.1))
        (x0, z0), (x1, z1), (x2, z2) = points
        self.assertEqual(turn_sign((x0, z0), (x1, z1), (x2, z2)), -1)
        unsplit = [(build.compress_x(x, rows), z) for x, z in points]
        self.assertEqual(turn_sign(*unsplit), 1)
        self.assert_turns_kept(points, rows)

    def test_a_straight_segment_bends_only_at_its_added_vertices(self):
        a, b = lonlat(0, 0), lonlat(6000, 600)
        chain, synthetic = build.split_at_band_edges([a, b], self.ROWS)
        image = [build.game_position(vertex, self.ROWS) for vertex in chain]
        self.assertEqual(synthetic, [1, 2])
        self.assertNotEqual(turn_sign(image[0], image[1], image[2]), 0)
        self.assertNotEqual(turn_sign(image[1], image[2], image[3]), 0)


def line_row(*points):
    vertices = [lonlat(*point) for point in points]
    return {
        "points": [list(build.game_position(vertex)) for vertex in vertices],
        "lonlat": [list(vertex) for vertex in vertices],
    }


def point_row(x, z, **fields):
    lon, lat = lonlat(x, z)
    position = build.game_position((lon, lat))
    return {**fields, "x": position[0], "z": position[1], "lon": lon, "lat": lat}


def small_data():
    """Return data shaped like roads.json before compression, in true metres."""
    road = [(-100, 10), (500, 20), (1200, 40), (3000, 60), (5400, 80), (6000, 90)]
    return {
        "compression": [],
        "nodes": [
            point_row(-100, 10, id="n1", kind="end"),
            point_row(6000, 90, id="n2", kind="end"),
        ],
        "roads": [{"id": "road", "linearIds": ["road-feature"]}],
        "edges": [{"id": "road_e1", "road": "road", "from": "n1", "to": "n2", **line_row(*road)}],
        "reference": {
            "railroad": {"lines": [line_row((-200, 300), (700, 310), (5500, 330), (5950, 340))]},
            "river": {
                "lines": [
                    line_row((-300, -50), (-250, -40)),
                    line_row((4000, -500), (3000, 60), (5300, 500)),
                ]
            },
            "trestles": [point_row(700, 310, id="trestle"), point_row(5950, 340, id="east")],
            "crossings": [point_row(3000, 60, road="road", **{"with": "river"})],
        },
    }


class ApplyCompressionTest(unittest.TestCase):
    BAND = {"axis": "x", "trueFrom": 1000, "trueTo": 5000, "factor": 0.25, "reason": "A reason."}

    def compressed(self, config_bands=None):
        data = small_data()
        build.apply_compression(data, [self.BAND] if config_bands is None else config_bands, [])
        return data

    def test_writes_exactly_the_documented_row(self):
        self.assertEqual(
            self.compressed()["compression"],
            [
                {
                    "axis": "x",
                    "trueFrom": 1000.0,
                    "trueTo": 5000.0,
                    "gameFrom": 1000.0,
                    "gameTo": 2000.0,
                    "factor": 0.25,
                    "reason": "A reason.",
                }
            ],
        )

    def test_no_bands_changes_no_position(self):
        before, after = small_data(), self.compressed([])
        self.assertEqual(after["compression"], [])
        self.assertEqual(after["nodes"], before["nodes"])
        self.assertEqual(after["reference"]["trestles"], before["reference"]["trestles"])
        self.assertEqual(after["reference"]["crossings"], before["reference"]["crossings"])
        for (_, old), (_, new) in zip(build.all_lines(before), build.all_lines(after)):
            self.assertEqual((new["points"], new["lonlat"]), (old["points"], old["lonlat"]))
            self.assertEqual(new["synthetic"], [])

    def test_every_vertex_is_the_image_of_its_lonlat(self):
        data = self.compressed()
        bands_written = data["compression"]
        for _, line in build.all_lines(data):
            for point, vertex in zip(line["points"], line["lonlat"], strict=True):
                x, z = build.to_xz(vertex)
                self.assertEqual(point, [round(build.compress_x(x, bands_written), 3), round(z, 3)])

    def test_no_written_segment_crosses_a_band_edge(self):
        data = self.compressed()
        for _, line in build.all_lines(data):
            xs = [build.to_xz(vertex)[0] for vertex in line["lonlat"]]
            for edge in (1000, 5000):
                for a, b in zip(xs, xs[1:]):
                    self.assertFalse(min(a, b) < edge - 0.001 and edge + 0.001 < max(a, b))

    def test_band_edge_vertices_land_on_the_game_edges(self):
        data = self.compressed()
        points = data["edges"][0]["points"]
        synthetic = data["edges"][0]["synthetic"]
        self.assertEqual(synthetic, [2, 5])
        self.assertEqual([points[i][0] for i in synthetic], [1000, 2000])

    def test_tiger_lonlat_is_kept_and_only_synthetic_vertices_are_new(self):
        before, after = small_data(), self.compressed()
        for (_, old), (_, new) in zip(build.all_lines(before), build.all_lines(after)):
            kept = [v for i, v in enumerate(new["lonlat"]) if i not in new["synthetic"]]
            self.assertEqual(kept, old["lonlat"])

    def test_z_is_unchanged(self):
        before, after = small_data(), self.compressed()
        for (_, old), (_, new) in zip(build.all_lines(before), build.all_lines(after)):
            kept = [p[1] for i, p in enumerate(new["points"]) if i not in new["synthetic"]]
            self.assertEqual(kept, [p[1] for p in old["points"]])

    def test_nodes_trestles_and_crossings_go_through_f(self):
        data = self.compressed()
        west, east = data["nodes"]
        self.assertAlmostEqual(west["x"], -100, delta=0.1)
        self.assertAlmostEqual(east["x"], 3000, delta=0.1)
        node_z = [node["z"] for node in small_data()["nodes"]]
        self.assertEqual([node["z"] for node in data["nodes"]], node_z)
        west_trestle, east_trestle = data["reference"]["trestles"]
        self.assertAlmostEqual(west_trestle["x"], 700, delta=0.1)
        self.assertAlmostEqual(east_trestle["x"], 2950, delta=0.1)
        trestle_z = [row["z"] for row in small_data()["reference"]["trestles"]]
        self.assertEqual([west_trestle["z"], east_trestle["z"]], trestle_z)

    def test_a_crossing_inside_the_band_stays_on_both_lines(self):
        data = self.compressed()
        crossing = data["reference"]["crossings"][0]
        self.assertAlmostEqual(crossing["x"], 1500, delta=0.1)
        spot = [crossing["x"], crossing["z"]]
        self.assertIn(spot, data["edges"][0]["points"])
        self.assertIn(spot, data["reference"]["river"]["lines"][1]["points"])

    def assert_fails_on(self, true_from, true_to, message):
        with self.assertRaisesRegex(BuildError, message):
            self.compressed([{**self.BAND, "trueFrom": true_from, "trueTo": true_to}])

    def test_fails_on_a_graph_node_inside_a_band(self):
        self.assert_fails_on(5900, 6100, "Graph node n2")

    def test_fails_on_a_graph_node_on_a_band_edge(self):
        x = build.to_xz((small_data()["nodes"][1]["lon"], small_data()["nodes"][1]["lat"]))[0]
        self.assert_fails_on(x, x + 100, "Graph node n2")
        self.assert_fails_on(x - 100, x, "Graph node n2")

    def test_fails_on_a_trestle_inside_a_band(self):
        self.assert_fails_on(650, 750, "Trestle trestle")

    def test_a_crossing_inside_a_band_does_not_fail(self):
        self.compressed([{**self.BAND, "trueFrom": 2900, "trueTo": 3100}])

    def test_fails_on_a_band_edge_exactly_on_a_vertex(self):
        data = small_data()
        lines = [
            ("road_e1", data["edges"][0]["lonlat"][2]),
            ("railroad line 1", data["reference"]["railroad"]["lines"][0]["lonlat"][2]),
            ("river line 2", data["reference"]["river"]["lines"][1]["lonlat"][0]),
        ]
        for label, vertex in lines:
            x = build.to_xz(vertex)[0]
            with self.subTest(label):
                self.assert_fails_on(x, 5900, f"lands on a TIGER vertex of {label}")
                self.assert_fails_on(800, x, f"lands on a TIGER vertex of {label}")

    def test_fails_on_a_band_edge_a_rounding_error_off_a_vertex(self):
        x = build.to_xz(small_data()["edges"][0]["lonlat"][2])[0]
        self.assert_fails_on(round(x, 3), 5900, "lands on a TIGER vertex")

    def test_a_band_edge_clear_of_every_vertex_does_not_fail(self):
        x = build.to_xz(small_data()["edges"][0]["lonlat"][2])[0]
        self.compressed([{**self.BAND, "trueFrom": x + 0.01, "trueTo": 5000}])


def tiger_data(lonlats, kinds=("junction", "junction"), synthetic=(), compression=()):
    """Return the parts of roads.json that the TIGER check reads, for one edge."""
    return {
        "compression": list(compression),
        "nodes": [{"id": "a", "kind": kinds[0]}, {"id": "b", "kind": kinds[1]}],
        "roads": [{"id": "road", "linearIds": ["one", "two"]}],
        "edges": [
            {
                "id": "road_e1",
                "road": "road",
                "from": "a",
                "to": "b",
                "lonlat": [list(vertex) for vertex in lonlats],
                "synthetic": list(synthetic),
            }
        ],
    }


class TigerCheckTest(unittest.TestCase):
    # Feature one runs x 0 to 400, then two carries on from there to x 700. A third
    # feature touches one at x 200, and it's not one of this road's.
    ONE = [(0, 0), (100, 10), (200, 0), (300, 15), (400, 0)]
    TWO = [(400, 0), (500, 25), (600, 0), (700, 30)]
    OTHER = [(200, 0), (200, 100), (200, 200)]
    RECORDS = [
        record("One", ONE, linear_id="one"),
        record("Two", TWO, linear_id="two"),
        record("Other", OTHER, linear_id="other"),
    ]
    ROWS = bands((250, 650, 0.25))

    def report_from(self, lonlats, **options):
        report = []
        data = tiger_data(lonlats, **options)
        build.check_edges_against_tiger(data, self.RECORDS, report)
        return report

    def run_of(self, *points):
        return [lonlat(*point) for point in points]

    def assert_fails(self, lonlats, message="doesn't follow", **options):
        with self.assertRaisesRegex(BuildError, message):
            self.report_from(lonlats, **options)

    def test_a_whole_feature_passes(self):
        self.report_from(self.run_of(*self.ONE))

    def test_a_run_inside_a_feature_passes(self):
        self.report_from(self.run_of(*self.ONE[1:4]))

    def test_a_backward_run_passes(self):
        self.report_from(self.run_of(*self.ONE[1:4][::-1]))

    def test_a_run_through_two_features_where_both_end_passes(self):
        forward = self.run_of(*self.ONE[2:], *self.TWO[1:3])
        report = self.report_from(forward)
        self.assertIn("road_e1 (one then two)", report[-1])
        self.report_from(forward[::-1])

    def test_a_skipped_vertex_fails(self):
        self.assert_fails(self.run_of(self.ONE[0], self.ONE[1], self.ONE[3], self.ONE[4]))

    def test_a_swapped_pair_of_vertices_fails(self):
        self.assert_fails(self.run_of(self.ONE[0], self.ONE[2], self.ONE[1], self.ONE[3]))

    def test_a_moved_vertex_fails(self):
        run = self.run_of(*self.ONE)
        run[2] = (run[2][0] + 0.000001, run[2][1])
        self.assert_fails(run)

    def test_a_vertex_past_the_end_of_the_feature_fails(self):
        self.assert_fails(self.run_of(*self.TWO, (800, 0)))

    def test_a_run_along_another_roads_feature_fails(self):
        self.assert_fails(self.run_of(*self.OTHER))

    def assert_join_fails(self, second_feature, *run):
        records = [
            record("One", self.ONE, linear_id="one"),
            record("Two", second_feature, linear_id="two"),
        ]
        data = tiger_data(self.run_of(*run))
        with self.assertRaisesRegex(BuildError, "doesn't follow"):
            build.check_edges_against_tiger(data, records, [])

    def test_turning_off_between_features_midway_fails(self):
        # Both features are this road's and they share x 200, but neither ends there.
        second = [(150, 300), (200, 0), (250, 300)]
        self.assert_join_fails(second, self.ONE[1], self.ONE[2], (250, 300))

    def test_leaving_a_feature_before_its_end_fails(self):
        # The second feature starts at x 200, but the first carries on past it.
        second = [(200, 0), (250, 300)]
        self.assert_join_fails(second, self.ONE[1], self.ONE[2], (250, 300))

    def test_joining_a_feature_midway_fails(self):
        # The first feature ends at x 400, but the second carries on either side of it.
        second = [(350, 300), (400, 0), (450, 300)]
        self.assert_join_fails(second, self.ONE[3], self.ONE[4], (450, 300))

    def test_doubling_back_at_the_end_of_a_feature_fails(self):
        self.assert_fails(self.run_of(*self.ONE[2:], self.ONE[3]))

    def test_an_edge_left_with_no_tiger_vertices_fails(self):
        run = self.run_of((50, 5), (60, 5))
        self.assert_fails(run, "has no TIGER vertices", kinds=("clip", "clip"))

    def test_a_feature_missing_from_the_zips_fails(self):
        data = tiger_data(self.run_of(*self.ONE))
        with self.assertRaisesRegex(BuildError, "aren't in the zips"):
            build.check_edges_against_tiger(data, self.RECORDS[:1], [])

    def split_run(self):
        """Return one feature's whole run with both band edges added, and their indices."""
        chain = self.run_of(*self.ONE, *self.TWO[1:])
        return build.split_at_band_edges(chain, self.ROWS)

    def test_synthetic_vertices_are_left_out_of_the_run(self):
        chain, synthetic = self.split_run()
        self.assertEqual(len(synthetic), 2)
        self.report_from(chain, synthetic=synthetic, compression=self.ROWS)

    def test_an_unlisted_synthetic_vertex_fails(self):
        chain, synthetic = self.split_run()
        self.assert_fails(chain, synthetic=synthetic[:1], compression=self.ROWS)

    def test_a_tiger_vertex_cannot_hide_in_the_synthetic_list(self):
        chain, synthetic = self.split_run()
        off_edge = synthetic[0] - 1
        self.assert_fails(
            chain, "isn't where", synthetic=[off_edge, *synthetic], compression=self.ROWS
        )

    def test_a_synthetic_vertex_away_from_a_band_edge_fails(self):
        # It's on the straight line between its neighbours, but x 50 isn't a band edge.
        a, b = lonlat(*self.ONE[0]), lonlat(*self.ONE[1])
        middle = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        chain = [a, middle, b, *self.run_of(*self.ONE[2:])]
        self.assert_fails(chain, "isn't where", synthetic=[1], compression=self.ROWS)

    def test_a_synthetic_vertex_off_its_segment_fails(self):
        chain, synthetic = self.split_run()
        chain[synthetic[0]] = (chain[synthetic[0]][0], chain[synthetic[0]][1] + 0.0001)
        self.assert_fails(chain, "isn't where", synthetic=synthetic, compression=self.ROWS)

    def test_a_synthetic_list_with_an_end_or_a_repeat_fails(self):
        chain, synthetic = self.split_run()
        for bad in ([0], [len(chain) - 1], [synthetic[0], synthetic[0]], synthetic[::-1]):
            with self.subTest(bad):
                self.assert_fails(chain, "bad synthetic list", synthetic=bad, compression=self.ROWS)

    def test_a_clip_endpoint_may_be_off_the_feature(self):
        run = self.run_of((50, 5), *self.ONE[1:3], (250, 7))
        report = self.report_from(run, kinds=("clip", "clip"))
        self.assertIn("Clip endpoints off their features: 2", report[0])

    def test_an_endpoint_that_is_not_a_clip_must_be_on_the_feature(self):
        run = self.run_of((50, 5), *self.ONE[1:3])
        self.assert_fails(run, kinds=("junction", "clip"))
        self.assert_fails(run[::-1], kinds=("clip", "end"))

    def test_only_the_endpoint_is_excused_at_a_clip(self):
        run = self.run_of(self.ONE[0], (50, 5), *self.ONE[1:3])
        self.assert_fails(run, kinds=("clip", "clip"))

    def test_a_clip_endpoint_on_the_feature_must_still_be_contiguous(self):
        run = self.run_of(self.ONE[0], *self.ONE[2:4])
        self.assert_fails(run, kinds=("clip", "junction"))


class RenderedDataTest(unittest.TestCase):
    def test_the_check_reads_the_written_text(self):
        # main parses the rendered text, so synthetic and lon/lat must survive rendering.
        data = small_data()
        build.apply_compression(data, [ApplyCompressionTest.BAND], [])
        parsed = json.loads(build.render_json(data))
        self.assertEqual(parsed["edges"], data["edges"])
        self.assertEqual(parsed["compression"], data["compression"])
        self.assertEqual(parsed["reference"]["crossings"], data["reference"]["crossings"])


class CheckFlagTest(unittest.TestCase):
    FRESH = '{"fresh": true}\n'

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name) / "roads.json"
        generate = mock.Mock(return_value=({}, [], self.FRESH))
        for name, value in (
            ("REPO_ROOT", Path(directory.name)),
            ("OUTPUT_PATH", self.path),
            ("SOURCE_FILES", ()),
            ("CONFIG_PATH", Path(directory.name) / "config.json"),
            ("generate", generate),
            ("print_summary", mock.Mock()),
        ):
            patcher = mock.patch.object(build, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        build.CONFIG_PATH.write_text("{}", encoding="utf-8")

    def run_main(self, *argv):
        stdout = io.TextIOWrapper(io.BytesIO(), encoding="utf-8")  # main reconfigures stdout.
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()) as err:
            code = build.main(list(argv))
        return code, err.getvalue()

    def test_passes_when_the_file_matches(self):
        self.path.write_text(self.FRESH, encoding="utf-8")
        self.assertEqual(self.run_main("--check"), (0, ""))

    def test_fails_when_the_file_differs_and_leaves_it_alone(self):
        self.path.write_text('{"fresh": false}\n', encoding="utf-8")
        code, err = self.run_main("--check")
        self.assertEqual(code, 1)
        self.assertIn("line 1", err)
        self.assertEqual(self.path.read_text(encoding="utf-8"), '{"fresh": false}\n')

    def test_fails_on_a_difference_only_in_line_endings(self):
        self.path.write_bytes(self.FRESH.replace("\n", "\r\n").encode("utf-8"))
        self.assertEqual(self.run_main("--check")[0], 1)

    def test_fails_on_extra_lines(self):
        self.path.write_text(self.FRESH + "more\n", encoding="utf-8")
        self.assertEqual(self.run_main("--check")[0], 1)

    def test_fails_when_the_file_is_missing_and_does_not_create_it(self):
        code, err = self.run_main("--check")
        self.assertEqual(code, 1)
        self.assertIn("doesn't exist", err)
        self.assertFalse(self.path.exists())

    def test_without_the_flag_it_writes(self):
        self.assertEqual(self.run_main(), (0, ""))
        self.assertEqual(self.path.read_text(encoding="utf-8"), self.FRESH)

    def test_a_failed_build_writes_nothing_and_fails(self):
        self.path.write_text("old", encoding="utf-8")
        build.generate.side_effect = BuildError("no")
        for argv in ((), ("--check",)):
            code, err = self.run_main(*argv)
            self.assertEqual(code, 1)
            self.assertIn("FAILED: no", err)
        self.assertEqual(self.path.read_text(encoding="utf-8"), "old")


if __name__ == "__main__":
    unittest.main()
