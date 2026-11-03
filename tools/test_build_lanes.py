#!/usr/bin/env python3
"""Tests for build_lanes.py's own logic. Run: .venv/bin/python -m unittest tools/test_build_lanes.py"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_lanes import Places, clear_of_buildings, closed_ends, crossings_of, lane_spec, measured_lanes, moves_buildings, rounded, split_off  # noqa: E402

CONFIG = {
    "classes": {"S1400named": {"width": 5.5, "surface": "asphalt"}, "S1400": {"width": 4.2, "surface": "gravel"}, "S1740": {"width": 3.2, "surface": "dirt"}},
    "byName": {"Wide Rd": {"width": 6.5, "surface": "asphalt", "paint": True}},
}


class Record:
    def __init__(self, name, mtfcc):
        self.name, self.mtfcc = name, mtfcc


def lane(points, name=None, mtfcc="S1740", lane_id="lane"):
    return {"id": lane_id, "name": name, "mtfcc": mtfcc, "width": 3.2, "surface": "dirt", "points": points}


def building(x, z, size=4, building_id=1):
    return {"id": building_id, "x": x, "z": z, "ring": [[-size, -size], [size, -size], [size, size], [-size, size]]}


ROADS = {"edges": [{"points": [[0, 0], [100, 0]]}], "reference": {"river": {"lines": []}, "railroad": {"lines": [{"points": [[50, -50], [50, 50]]}]}}}


class LaneSpec(unittest.TestCase):
    def test_a_named_local_road_is_paved_and_one_without_a_name_is_not(self):
        self.assertEqual(lane_spec(Record("Long Rd", "S1400"), CONFIG)["surface"], "asphalt")
        self.assertEqual(lane_spec(Record(None, "S1400"), CONFIG)["surface"], "gravel")
        self.assertEqual(lane_spec(Record(None, "S1740"), CONFIG)["surface"], "dirt")

    def test_a_road_that_has_been_looked_at_goes_by_what_was_seen(self):
        self.assertTrue(lane_spec(Record("Wide Rd", "S1400"), CONFIG)["paint"])

    def test_only_a_named_road_or_a_highway_moves_a_building_off_it(self):
        self.assertTrue(moves_buildings(lane([[0, 0], [1, 1]], "Long Rd", "S1400")))
        self.assertTrue(moves_buildings(lane([[0, 0], [1, 1]], None, "S1200")))
        self.assertFalse(moves_buildings(lane([[0, 0], [1, 1]], None, "S1400")))


class GivingWay(unittest.TestCase):
    def test_a_track_through_a_building_is_cut_and_says_where(self):
        out, gaps = clear_of_buildings([lane([[0, 0], [20, 0], [40, 0], [60, 0], [80, 0]])], [building(40, 0)])
        self.assertEqual(len(out), 2)
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0][0], [20, 0])
        self.assertEqual(gaps[0][1], [60, 0])

    def test_a_named_road_stays_whole(self):
        out, gaps = clear_of_buildings([lane([[0, 0], [40, 0], [80, 0]], "Long Rd", "S1400")], [building(40, 0)])
        self.assertEqual(out[0]["points"], [[0, 0], [40, 0], [80, 0]])
        self.assertEqual(gaps, [])


class JoiningUp(unittest.TestCase):
    def test_what_shares_a_vertex_with_the_roads_is_joined_and_the_rest_are_pieces(self):
        rows = [lane([[100, 0], [100, 40]]), lane([[100, 40], [120, 60]]), lane([[300, 300], [320, 300]]), lane([[320, 300], [340, 300]])]
        joined, pieces = split_off(rows, ROADS)
        self.assertEqual(sorted(joined), [0, 1])
        self.assertEqual([sorted(p) for p in pieces], [[2, 3]])


class Crossings(unittest.TestCase):
    def test_a_lane_that_shares_a_vertex_with_the_tracks_crosses_them(self):
        # TIGER puts a vertex where a road meets a railroad, so neither line goes properly across the other
        roads = {"reference": {"river": {"lines": []}, "railroad": {"lines": [{"points": [[50, -50], [50, 0], [50, 50]]}]}}}
        found = crossings_of([lane([[0, 0], [50, 0], [100, 0]], lane_id="a")], roads, [])
        self.assertEqual(found, [{"road": "a", "with": "railroad", "x": 50, "z": 0}])

    def test_so_does_one_that_goes_properly_across(self):
        found = crossings_of([lane([[0, 10], [100, 10]], lane_id="a")], ROADS, [])
        self.assertEqual(found, [{"road": "a", "with": "railroad", "x": 50, "z": 10}])

    def test_one_that_stops_at_them_does_not(self):
        roads = {"reference": {"river": {"lines": []}, "railroad": {"lines": [{"points": [[50, -50], [50, 0], [50, 50]]}]}}}
        self.assertEqual(crossings_of([lane([[0, 0], [50, 0]], lane_id="a")], roads, []), [])

    def test_two_lanes_meeting_on_them_cross_them_once(self):
        roads = {"reference": {"river": {"lines": []}, "railroad": {"lines": [{"points": [[50, -50], [50, 0], [50, 50]]}]}}}
        found = crossings_of([lane([[0, 0], [50, 0]], lane_id="a"), lane([[50, 0], [100, 0]], lane_id="b")], roads, [])
        self.assertEqual(len(found), 1)


class ClosedEnds(unittest.TestCase):
    def test_a_road_that_carries_on_is_closed_at_its_free_end_and_only_there(self):
        rows = [{**lane([[100, 0], [100, 40]], lane_id="a"), "carriesOn": [[100, 40]]}, {**lane([[100, 40], [100, 80]], lane_id="b"), "carriesOn": [[100, 80]]}, {**lane([[0, 0], [0, 40]], lane_id="c"), "carriesOn": []}]
        self.assertEqual(closed_ends(rows, ROADS), [{"road": "b", "x": 100, "z": 80}])


class Corners(unittest.TestCase):
    def test_rounding_keeps_the_ends_and_cuts_the_corner(self):
        out = rounded([(0, 0), (10, 0), (10, 10)])
        self.assertEqual(out[0], (0, 0))
        self.assertEqual(out[-1], (10, 10))
        self.assertNotIn((10, 0), out)


class TestMeasured(unittest.TestCase):
    def test_starts_from_the_nearest_vertex(self):
        config = {"measured": [{"width": 4, "surface": "gravel", "points": [[10, 20], [10, 50]]}, {"width": 3, "surface": "gravel", "points": [[10, 50], [30, 50]]}]}
        first, second = measured_lanes(ROADS, [], config)
        self.assertEqual(first["points"][0], [0, 0])
        self.assertTrue(first["measured"])
        self.assertIsNone(first["linearId"])
        # already on one: it isn't joined to itself
        self.assertEqual(second["points"], [[10, 50], [30, 50]])

    def test_one_measured_from_a_road_between_its_vertices_starts_there_and_is_joined(self):
        drive, = measured_lanes(ROADS, [], {"measured": [{"width": 4.5, "surface": "gravel", "points": [[40, 0], [40, -25]]}]})
        self.assertEqual(drive["points"], [[40, 0], [40, -25]])
        joined, pieces = split_off([drive], ROADS)
        self.assertEqual(joined, [0])
        self.assertEqual(pieces, [])

    def test_one_thats_a_buildings_own_says_so(self):
        drive, = measured_lanes(ROADS, [], {"measured": [{"width": 4.5, "surface": "gravel", "for": 7, "points": [[40, 0], [40, -25]]}]})
        self.assertEqual(drive["for"], 7)

    def test_too_far_from_anything_stops_the_build(self):
        with self.assertRaises(SystemExit):
            measured_lanes(ROADS, [], {"measured": [{"width": 4, "surface": "gravel", "points": [[500, 500], [510, 500]]}]})


class NearestRoad(unittest.TestCase):
    def test_a_drive_thats_one_buildings_own_can_be_passed_over(self):
        places = Places()
        places.add_line([(0, 0), (100, 0)], 3, "road")
        places.add_line([(40, 10), (60, 10)], 2, "lane_9")
        self.assertEqual(places.nearest_road(50, 14)[3], "lane_9")
        self.assertEqual(places.nearest_road(50, 14, skip={"lane_9"})[3], "road")


if __name__ == "__main__":
    unittest.main()
