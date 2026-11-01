"""Build data/roads.json, the road graph for real Chunky, MS, from TIGER/Line 2025.

Run from the repo root, using the project venv, after tools/fetch_tiger.py:

    .venv/bin/python tools/build_roads.py

tools/road_config.json says which roads to take and how to clip and style them. The
zips are read in place and never extracted. The same zips and config give the same
bytes. Any failure exits non-zero and leaves roads.json as it was. The report on
stdout lists what the docs need to record: the seam, crossings added, near-misses,
branches, extra components, unconnected roads, the area the railroad and river are
clipped to, gaps in those lines and the rail features left out.

Connections mean shared vertices compared exactly, because TIGER is one planar
topology. Every TIGER vertex is kept and none is moved, so a near-miss is reported
and never snapped. The only vertex that isn't TIGER's is one added where two lines
cross with no shared vertex, and the report lists each of those.

The railroad, river and trestles go in `reference`, beside the graph and not part of
it. Rail features are identified by LINEARID only: TIGER's rail names can be real
operator brands, so that field isn't even read.

Only read_features needs pyshp, and it imports it itself. Everything else works on
plain records, so it can be imported and run without the venv.
"""

import hashlib
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from itertools import groupby
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = REPO_ROOT / "data" / "raw"
CONFIG_PATH = REPO_ROOT / "tools" / "road_config.json"
OUTPUT_PATH = REPO_ROOT / "data" / "roads.json"

VINTAGE = "TIGER/Line 2025"
BASE_URL = "https://www2.census.gov/geo/tiger/TIGER2025/"
NEWTON, LAUDERDALE = "Newton", "Lauderdale"
ROAD_FILES = {
    "ROADS/tl_2025_28101_roads.zip": NEWTON,
    "ROADS/tl_2025_28075_roads.zip": LAUDERDALE,
}
RAIL_FILE = "RAILS/tl_2025_us_rails.zip"
WATER_FILES = {
    "LINEARWATER/tl_2025_28101_linearwater.zip": NEWTON,
    "LINEARWATER/tl_2025_28075_linearwater.zip": LAUDERDALE,
}
SOURCE_FILES = (*ROAD_FILES, RAIL_FILE, *WATER_FILES)

ORIGIN_LAT, ORIGIN_LON = 32.32583, -88.92806  # Town center, per CLAUDE.md.
EARTH_RADIUS_M = 6_371_000

SEAM_ROAD = "us_80"  # Runs through both county files, so it has to join between them.
WEST_TO_EAST_ROAD = "us_80"  # Other roads walk away from where they join the rest.
RAMP_MTFCC = "S1630"
I20 = "I-20"
NEAR_MISS_M = 5
TABLES = ("nodes", "roads", "edges")  # Written with one row per line, to keep diffs readable.

REFERENCE_MARGIN_M = 500  # How far past the roads the railroad and river are kept.
RAILROAD_NAME = "Railroad"  # Never TIGER's rail name, which can be a real operator brand.
RAIL_MTFCC = "R1011"
RIVER_NAME = "Chunky River"
RIVER_TIGER_NAME = "Chunky Riv"
RAILROAD, RIVER = "railroad", "river"  # The values of `with` on a crossing.

# Where the railroad meets the river, per the ticket. distanceM is the straight line from
# town center. The build fails unless TIGER has exactly these, within the tolerance.
TRESTLES = (
    {"id": "trestle-east-near", "side": "east", "distanceM": 580},
    {"id": "trestle-east-far", "side": "east", "distanceM": 1070},
    {"id": "trestle-west", "side": "west", "distanceM": 4160, "label": "break down"},
)
TRESTLE_TOLERANCE_M = 100
TRESTLE_CLUSTER_M = 30  # Hits this close are one trestle. It also clears a gap at a contact.


class BuildError(Exception):
    """TIGER or the config contradicts what the graph needs. Stop rather than guess."""


@dataclass(eq=False)  # Hash by identity, not by walking every vertex.
class Record:
    county: str
    linear_id: str
    name: str
    mtfcc: str
    rttyp: str
    points: tuple


@dataclass(eq=False)
class RoadLines:
    """One road's kept geometry, before it's split into edges."""

    spec: dict
    tiger_names: list
    carriers: dict  # {segment: set of records carrying it}, so duplicates merge.
    clip_vertices: set = field(default_factory=set)
    terminal: tuple = None  # Where a continuation was clipped.
    connects_to: str = None

    @property
    def id(self):
        return self.spec["id"]

    @property
    def name(self):
        return self.spec["name"]

    def adjacency(self):
        return adjacency_of(self.carriers)


def read_features(rel_path, fields, bbox=None):
    """Yield (attributes, points) for a zip's records. This is the only use of pyshp.

    bbox is (west, south, east, north) and keeps the records whose bounding box overlaps it.
    """
    import shapefile  # Imported here so the geometry below works without the venv.

    with shapefile.Reader(str(RAW_DIR / Path(rel_path).name)) as reader:
        for item in reader.iterShapeRecords(fields=fields, bbox=bbox):
            attributes = item.record.as_dict()
            if len(item.shape.parts) != 1:
                # Joining parts end to end would invent a connection.
                raise BuildError(f"{rel_path}: multipart record {attributes['LINEARID']}")
            yield attributes, tuple(tuple(point) for point in item.shape.points)


def read_road_records():
    """Return every record in both county road files."""
    records = []
    fields = ["LINEARID", "FULLNAME", "RTTYP", "MTFCC"]
    for rel_path, county in ROAD_FILES.items():
        for attributes, points in read_features(rel_path, fields):
            records.append(
                Record(
                    county,
                    attributes["LINEARID"],
                    attributes["FULLNAME"],
                    attributes["MTFCC"],
                    attributes["RTTYP"],
                    points,
                )
            )
    return records


def read_rail_records(area):
    """Return the R1011 features whose bounding box overlaps the area, whole."""
    west, north = to_lonlat(area["xMinM"], area["zMinM"])
    east, south = to_lonlat(area["xMaxM"], area["zMaxM"])
    bbox = (west, south, east, north)
    return [
        Record("", attributes["LINEARID"], RAILROAD_NAME, attributes["MTFCC"], "", points)
        for attributes, points in read_features(RAIL_FILE, ["LINEARID", "MTFCC"], bbox)
        if attributes["MTFCC"] == RAIL_MTFCC
    ]


def read_river_records():
    """Return every record of the river in both county water files, whole."""
    records = []
    fields = ["LINEARID", "FULLNAME", "MTFCC"]
    for rel_path, county in WATER_FILES.items():
        for attributes, points in read_features(rel_path, fields):
            if attributes["FULLNAME"] == RIVER_TIGER_NAME:
                records.append(
                    Record(
                        county,
                        attributes["LINEARID"],
                        attributes["FULLNAME"],
                        attributes["MTFCC"],
                        "",
                        points,
                    )
                )
    return records


def describe_files(rel_paths):
    """Return the source entry for each file, computed from the zip itself."""
    files = []
    for rel_path in rel_paths:
        content = (RAW_DIR / Path(rel_path).name).read_bytes()
        files.append(
            {
                "path": rel_path,
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        )
    return files


# Geometry. Vertices are (lon, lat) tuples. Game positions are (x, z) tuples.


def to_xz(point):
    """Project (lon, lat) to game metres, per the Coordinates section of CLAUDE.md."""
    lon, lat = point
    x = EARTH_RADIUS_M * math.radians(lon - ORIGIN_LON) * math.cos(math.radians(ORIGIN_LAT))
    z = -EARTH_RADIUS_M * math.radians(lat - ORIGIN_LAT)
    return x, z


def to_lonlat(x, z):
    """Return the (lon, lat) that to_xz projects to true metres x, z."""
    lon = ORIGIN_LON + math.degrees(x / (EARTH_RADIUS_M * math.cos(math.radians(ORIGIN_LAT))))
    lat = ORIGIN_LAT - math.degrees(z / EARTH_RADIUS_M)
    return lon, lat


def segments_of(points):
    """Yield a polyline's segments as sorted vertex pairs, skipping any of zero length."""
    for a, b in zip(points, points[1:]):
        if a != b:
            yield (a, b) if a < b else (b, a)


def adjacency_of(segments):
    """Return {vertex: set of neighbouring vertices} for undirected segments."""
    neighbours = defaultdict(set)
    for a, b in segments:
        neighbours[a].add(b)
        neighbours[b].add(a)
    return dict(neighbours)


def segment_length(segment):
    return math.dist(to_xz(segment[0]), to_xz(segment[1]))


def closest_on_segment(point, a, b):
    """Return the point of segment ab nearest to point, all in x/z."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length_squared = dx * dx + dz * dz
    if length_squared == 0:
        return a
    t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length_squared
    t = max(0.0, min(1.0, t))
    return a[0] + t * dx, a[1] + t * dz


def segment_gap(a, b, c, d):
    """Return (metres, point on ab, point on cd) for two segments that don't touch."""
    pairs = (
        (a, closest_on_segment(a, c, d)),
        (b, closest_on_segment(b, c, d)),
        (closest_on_segment(c, a, b), c),
        (closest_on_segment(d, a, b), d),
    )
    return min(((math.dist(p, q), p, q) for p, q in pairs), key=lambda row: row[0])


def microdegrees(point):
    return round(point[0] * 1e6), round(point[1] * 1e6)


def orientation(p, q, r):
    """Return the sign-carrying cross product of pq and pr. Zero means collinear."""
    return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])


def within_box(p, a, b):
    return min(a[0], b[0]) <= p[0] <= max(a[0], b[0]) and min(a[1], b[1]) <= p[1] <= max(a[1], b[1])


def segment_contacts(a, b, c, d):
    """Return where segments ab and cd touch, other than at an endpoint they share.

    The test runs in whole microdegrees, which TIGER's 6 decimals convert to exactly,
    so whether a point is on a line doesn't depend on float rounding. The projection
    is linear in each axis, so the answer is the same in game metres. A computed
    crossing is rounded to 6 decimals like every other vertex.
    """
    int_a, int_b, int_c, int_d = (microdegrees(point) for point in (a, b, c, d))
    c_side, d_side = orientation(int_a, int_b, int_c), orientation(int_a, int_b, int_d)
    a_side, b_side = orientation(int_c, int_d, int_a), orientation(int_c, int_d, int_b)
    if c_side * d_side < 0 and a_side * b_side < 0:
        t = a_side / (a_side - b_side)
        return [(round(a[0] + t * (b[0] - a[0]), 6), round(a[1] + t * (b[1] - a[1]), 6))]
    contacts = []
    if c_side == 0 and c not in (a, b) and within_box(int_c, int_a, int_b):
        contacts.append(c)
    if d_side == 0 and d not in (a, b) and within_box(int_d, int_a, int_b):
        contacts.append(d)
    if a_side == 0 and a not in (c, d) and within_box(int_a, int_c, int_d):
        contacts.append(a)
    if b_side == 0 and b not in (c, d) and within_box(int_b, int_c, int_d):
        contacts.append(b)
    return contacts


def close_segment_pairs(roads, margin_m):
    """Yield each pair of (road, segment) whose bounding boxes are within margin_m."""
    rows = []
    for road in roads:
        for segment in road.carriers:
            (ax, az), (bx, bz) = to_xz(segment[0]), to_xz(segment[1])
            rows.append((min(ax, bx), max(ax, bx), min(az, bz), max(az, bz), road, segment))
    rows.sort(key=lambda row: row[0])
    for index, first in enumerate(rows):
        for later in range(index + 1, len(rows)):
            second = rows[later]
            if second[0] > first[1] + margin_m:
                break
            if second[2] <= first[3] + margin_m and first[2] <= second[3] + margin_m:
                yield (first[4], first[5]), (second[4], second[5])


def where(point):
    x, z = to_xz(point)
    return f"{point[0]:.6f}, {point[1]:.6f} (x {x:.0f}, z {z:.0f})"


def closest_vertices(vertices_a, vertices_b):
    """Return (metres, a, b) for the closest two vertices, for reporting a gap."""
    return min(
        ((math.dist(to_xz(a), to_xz(b)), a, b) for a in vertices_a for b in vertices_b),
        key=lambda row: row[0],
    )


# Selecting each road: nearest component, clip, seam and continuation.


def distance_from_origin(record):
    """Return the record's smallest distance from town center, along its segments."""
    projected = [to_xz(point) for point in record.points]
    return min(
        math.dist((0.0, 0.0), closest_on_segment((0.0, 0.0), a, b))
        for a, b in zip(projected, projected[1:])
    )


def connected_components(records):
    """Group records that connect by shared vertices."""
    by_vertex = defaultdict(list)
    for record in records:
        for point in record.points:
            by_vertex[point].append(record)
    seen = set()
    components = []
    for first in records:
        if first in seen:
            continue
        seen.add(first)
        component = []
        stack = [first]
        while stack:
            record = stack.pop()
            component.append(record)
            for point in record.points:
                for other in by_vertex[point]:
                    if other not in seen:
                        seen.add(other)
                        stack.append(other)
        components.append(component)
    return components


def select_component(records, spec):
    """Apply the road's selection rule, as described in the config's notes."""
    selection = spec["selection"]
    if selection["rule"] != "nearest_component":
        raise BuildError(f"{spec['id']}: unknown selection rule {selection['rule']!r}")
    names = spec["tigerNames"]
    candidates = [record for record in records if record.name in names]
    if not candidates:
        raise BuildError(f"{spec['id']}: no record is named {names}")
    components = connected_components(candidates)
    distance, index = min(
        (min(distance_from_origin(record) for record in component), index)
        for index, component in enumerate(components)
    )
    if distance >= selection["maxDistanceM"]:
        raise BuildError(
            f"{spec['id']}: the nearest {names} is {distance:.0f} m from town center, "
            f"over the limit of {selection['maxDistanceM']} m"
        )
    nearest = components[index]
    missing = sorted(set(names) - {record.name for record in nearest})
    if missing:
        raise BuildError(f"{spec['id']}: the nearest component doesn't contain {missing}")
    return nearest


def carriers_of(records):
    carriers = {}
    for record in records:
        for segment in segments_of(record.points):
            carriers.setdefault(segment, set()).add(record)
    return carriers


def inside_clip(vertex, clip):
    return clip["xMinM"] <= to_xz(vertex)[0] <= clip["xMaxM"]


def clip_carriers(carriers, clip):
    """Keep segments with both ends inside the bounds. Return them and the cut vertices.

    Whole TIGER vertices only, per the config's notes: the clip vertex at a boundary is
    the last one inside it, so nothing is interpolated and it keeps its real lon/lat.
    """
    kept = {}
    cut = set()
    for segment, records in carriers.items():
        a_inside, b_inside = inside_clip(segment[0], clip), inside_clip(segment[1], clip)
        if a_inside and b_inside:
            kept[segment] = records
        elif a_inside:
            cut.add(segment[0])
        elif b_inside:
            cut.add(segment[1])
    return kept, cut & {vertex for segment in kept for vertex in segment}


def check_seam(road_id, records, clip):
    """Return the vertices joining the county files. Fail if the road doesn't join there.

    This looks at every record with the road's name, not only the selected component,
    because a gap at the seam would leave one side out of that component altogether.
    """
    vertices = {NEWTON: set(), LAUDERDALE: set()}
    for record in records:
        vertices[record.county].update(p for p in record.points if inside_clip(p, clip))
    for county, found in vertices.items():
        if not found:
            raise BuildError(f"{road_id}: nothing from {county} County inside the clip bounds")
    shared = vertices[NEWTON] & vertices[LAUDERDALE]
    if not shared:
        gap, a, b = closest_vertices(vertices[NEWTON], vertices[LAUDERDALE])
        raise BuildError(
            f"{road_id} doesn't join at the county line: the closest vertices are "
            f"{gap:.1f} m apart, {where(a)} and {where(b)}. Not snapping them."
        )
    return sorted(shared)


def walk_continuation(carriers, spec, records):
    """Return the path and carriers from the road's named end along its continuation.

    The continuation's names can also overlap the road itself, so the walk never steps
    back onto it. It fails on a branch, on a dead end before clipAt, and on any segment
    that doesn't carry every name, because the config says one geometry carries them.
    """
    continuation = spec["continuation"]
    if continuation["fromEnd"] != "north":
        raise BuildError(f"{spec['id']}: unknown fromEnd {continuation['fromEnd']!r}")
    names = continuation["tigerNames"]
    named = carriers_of(record for record in records if record.name in names)
    onward = adjacency_of(named)
    own = adjacency_of(carriers)
    ends = [vertex for vertex, neighbours in own.items() if len(neighbours) == 1]
    if not ends:
        raise BuildError(f"{spec['id']}: no end to continue from")
    target = (continuation["clipAt"]["lon"], continuation["clipAt"]["lat"])

    path = [max(ends, key=lambda vertex: vertex[1])]
    while path[-1] != target:
        options = [v for v in onward.get(path[-1], ()) if v not in own and v not in path]
        if len(options) != 1:
            raise BuildError(
                f"{spec['id']}: continuation {names} has {len(options)} way(s) on from "
                f"{where(path[-1])}, before reaching clipAt {where(target)}"
            )
        path.append(options[0])

    walked = {}
    for segment in segments_of(path):
        walked[segment] = named[segment]
        absent = sorted(set(names) - {record.name for record in named[segment]})
        if absent:
            raise BuildError(
                f"{spec['id']}: {absent} don't carry the continuation at {where(segment[0])}"
            )
    return path, walked


def is_i20(record):
    """Compare the route number, because TIGER typically spells it 'I- 20'."""
    number = re.search(r"\d+", record.name) if record.rttyp == "I" else None
    return number is not None and int(number.group()) == 20


def i20_vertices(records):
    """Return the vertices of I-20 and of every ramp connected to it through other ramps."""
    reached = {point for record in records if is_i20(record) for point in record.points}
    ramps = [record for record in records if record.mtfcc == RAMP_MTFCC]
    while True:
        touching = [ramp for ramp in ramps if not reached.isdisjoint(ramp.points)]
        if not touching:
            return reached
        ramps = [ramp for ramp in ramps if reached.isdisjoint(ramp.points)]
        reached.update(point for ramp in touching for point in ramp.points)


def select_road(spec, records, report):
    """Apply the config's selection, clip and continuation for one road."""
    carriers = carriers_of(select_component(records, spec))
    road = RoadLines(spec, list(spec["tigerNames"]), carriers)

    if "clip" in spec:
        if spec["id"] == SEAM_ROAD:
            named = [record for record in records if record.name in spec["tigerNames"]]
            for vertex in check_seam(spec["id"], named, spec["clip"]):
                report.append(f"{road.name} joins at the county line at {where(vertex)}")
        road.carriers, road.clip_vertices = clip_carriers(carriers, spec["clip"])
        if not road.carriers:
            raise BuildError(f"{spec['id']}: the clip bounds leave no road")

    if "continuation" in spec:
        path, walked = walk_continuation(road.carriers, spec, records)
        road.carriers = {**road.carriers, **walked}
        road.tiger_names += spec["continuation"]["tigerNames"]
        road.terminal = path[-1]
        road.clip_vertices = road.clip_vertices | {road.terminal}
        reached = i20_vertices(records)
        early = [vertex for vertex in path[:-1] if vertex in reached]
        if early:
            raise BuildError(
                f"{spec['id']}: reaches {I20} at {where(early[0])}, before clipAt. "
                f"Check the config."
            )
        if road.terminal in reached:
            road.connects_to = I20
            report.append(f"{road.name} reaches {I20} at {where(road.terminal)}")
        else:
            report.append(f"{road.name} does not reach {I20} at {where(road.terminal)}")
    return road


# Geometric checks, independent of the shared vertices.


def split_segment(road, segment, vertices):
    """Insert vertices into a segment, in order along it. Its endpoints are skipped."""
    a, b = segment
    inner = sorted(
        (vertex for vertex in vertices if vertex not in segment),
        key=lambda vertex: math.dist(to_xz(a), to_xz(vertex)),
    )
    if not inner:
        return
    records = road.carriers.pop(segment)
    for part in segments_of([a, *inner, b]):
        road.carriers.setdefault(part, set()).update(records)


def add_crossings(roads, report):
    """Split segments that touch away from a shared vertex, which makes that vertex shared."""
    splits = defaultdict(set)
    added = {}
    for first, second in close_segment_pairs(roads, 0):
        if first[1] == second[1]:
            continue
        for vertex in segment_contacts(*first[1], *second[1]):
            splits[first].add(vertex)
            splits[second].add(vertex)
            added.setdefault(vertex, set()).update((first[0].name, second[0].name))
    for (road, segment), vertices in splits.items():
        split_segment(road, segment, vertices)
    for vertex in sorted(added):
        names = " and ".join(sorted(added[vertex]))
        report.append(f"Added a node where {names} meet with no shared vertex: {where(vertex)}")
    if not added:
        report.append("Geometric check: no crossing away from a shared vertex")


def find_near_misses(roads, contacts=(), clear_m=NEAR_MISS_M):
    """Return (metres, road names, position) where two roads almost touch.

    A gap within clear_m of a vertex the two roads share, or of one of the given contacts,
    is just that junction, so it doesn't count.
    """
    found = {}
    for (road_a, seg_a), (road_b, seg_b) in close_segment_pairs(roads, NEAR_MISS_M):
        if road_a is road_b or set(seg_a) & set(seg_b):
            continue
        if road_b.name < road_a.name:  # So one place always reports the same position.
            road_a, seg_a, road_b, seg_b = road_b, seg_b, road_a, seg_a
        gap, near_a, _ = segment_gap(*map(to_xz, seg_a), *map(to_xz, seg_b))
        if gap >= NEAR_MISS_M:
            continue
        shared = road_a.adjacency().keys() & road_b.adjacency().keys()
        if any(math.dist(near_a, to_xz(vertex)) < clear_m for vertex in (*shared, *contacts)):
            continue
        names = (road_a.name, road_b.name)
        position = (round(near_a[0], 3), round(near_a[1], 3))
        found[(names, position)] = gap
    return sorted((gap, names, position) for (names, position), gap in found.items())


def report_near_misses(roads, report):
    misses = find_near_misses(roads)
    for gap, names, (x, z) in misses:
        report.append(
            f"Near-miss, not snapped: {' and '.join(names)} pass {gap:.2f} m apart at "
            f"x {x:.0f}, z {z:.0f}"
        )
    if not misses:
        report.append(f"Geometric check: no near-miss under {NEAR_MISS_M} m")


def report_unconnected(roads, report):
    """Report selected roads that don't connect to the first. No connector is added."""
    connected = {roads[0]}
    pending = roads[1:]
    while True:
        joined = [
            road
            for road in pending
            if any(road.adjacency().keys() & other.adjacency().keys() for other in connected)
        ]
        if not joined:
            break
        connected.update(joined)
        pending = [road for road in pending if road not in joined]
    if pending:
        names = ", ".join(road.name for road in pending)
        report.append(f"Not connected to {roads[0].name}: {names}. No connector added.")
    else:
        report.append("All selected roads connect by shared vertices")


# Nodes, and walking between them.


def find_node_vertices(roads):
    """Return {vertex: roads there} for each vertex that needs a node.

    That's every vertex with a degree other than 2 on some road, and every vertex on
    more than one road.
    """
    roads_at = defaultdict(list)
    for road in roads:
        for vertex in road.adjacency():
            roads_at[vertex].append(road)
    adjacencies = {road: road.adjacency() for road in roads}
    return {
        vertex: here
        for vertex, here in roads_at.items()
        if len(here) > 1 or len(adjacencies[here[0]][vertex]) != 2
    }


def node_kind(vertex, roads_here):
    if len(roads_here) > 1 or len(roads_here[0].adjacency()[vertex]) > 2:
        return "junction"
    return "clip" if vertex in roads_here[0].clip_vertices else "end"


def next_start(road, adjacency, candidates, node_vertices):
    """Choose where to start walking: an end if there is one.

    US 80 starts at its west end. Other roads start where they join another road, so
    they run away from the rest of the graph, and otherwise nearest to town center.
    """
    ends = [vertex for vertex in candidates if len(adjacency[vertex]) == 1] or candidates
    if road.id == WEST_TO_EAST_ROAD:
        return min(ends, key=lambda vertex: (to_xz(vertex)[0], vertex))
    return min(
        ends,
        key=lambda v: (len(node_vertices[v]) == 1, math.hypot(*to_xz(v)), v),
    )


def walk_road(road, node_vertices):
    """Return (nodes, chains, component count) in walk order. Chains keep every vertex.

    The walk is depth first. A road that doesn't branch comes out as one line, in order.
    Where it does branch, the westernmost way on goes first.
    """
    adjacency = road.adjacency()
    road_nodes = sorted(vertex for vertex in adjacency if vertex in node_vertices)
    visited_nodes = []
    chains = []
    walked = set()
    components = 0

    while True:
        remaining = [vertex for vertex in road_nodes if vertex not in visited_nodes]
        if not remaining:
            break
        components += 1
        stack = [next_start(road, adjacency, remaining, node_vertices)]
        while stack:
            node = stack[-1]
            if node not in visited_nodes:
                visited_nodes.append(node)
            for neighbour in sorted(adjacency[node]):
                first_segment = (node, neighbour) if node < neighbour else (neighbour, node)
                if first_segment in walked:
                    continue
                chain = [node, neighbour]
                while chain[-1] not in node_vertices:
                    onward = adjacency[chain[-1]] - {chain[-2]}
                    chain.append(next(iter(onward)))
                walked.update(segments_of(chain))
                chains.append(chain)
                stack.append(chain[-1])
                break
            else:
                stack.pop()

    unwalked = len(road.carriers) - len(walked)
    if unwalked:
        raise BuildError(f"{road.id}: {unwalked} segment(s) in a closed loop with no node")
    return visited_nodes, chains, components


def report_road_shape(road, components, report):
    branches = sorted(vertex for vertex, near in road.adjacency().items() if len(near) > 2)
    if components > 1:
        report.append(f"{road.name} has {components} components, kept in walk order")
    for vertex in branches:
        report.append(f"{road.name} branches at {where(vertex)}, kept in walk order")


# Output.


def game_position(vertex):
    """Return rounded x, z. Adding 0.0 turns a rounded -0.0 into 0.0."""
    x, z = to_xz(vertex)
    return round(x, 3) + 0.0, round(z, 3) + 0.0


def lonlat_position(vertex):
    return round(vertex[0], 6), round(vertex[1], 6)


def road_class(road, config, report):
    """Return (mtfcc, width, surface, specSource), using the dominant class by length."""
    lengths = defaultdict(float)
    for segment, records in road.carriers.items():
        for mtfcc in {record.mtfcc for record in records}:
            lengths[mtfcc] += segment_length(segment)
    missing = sorted(set(lengths) - set(config["mtfcc"]))
    if missing:
        raise BuildError(f"{road.id}: MTFCC {missing} missing from the table in the config")
    mtfcc = min(lengths, key=lambda code: (-lengths[code], code))
    if len(lengths) > 1:
        detail = ", ".join(f"{code} {lengths[code]:.0f} m" for code in sorted(lengths))
        report.append(f"{road.name} has more than one MTFCC ({detail}), using {mtfcc}")
    table_row = config["mtfcc"][mtfcc]
    override = config["overrides"].get(road.id)
    if override is None:
        return mtfcc, table_row["width"], table_row["surface"], "class"
    width = override.get("width", table_row["width"])
    surface = override.get("surface", table_row["surface"])
    return mtfcc, width, surface, "override"


def build_road_graph(records, config, source_files):
    """Return (the roads.json structure, the report lines) from plain road records."""
    unknown = sorted(set(config["overrides"]) - {spec["id"] for spec in config["roads"]})
    if unknown:
        raise BuildError(f"Overrides name unknown roads: {unknown}")

    report = []
    roads = [select_road(spec, records, report) for spec in config["roads"]]
    add_crossings(roads, report)
    report_near_misses(roads, report)
    report_unconnected(roads, report)
    node_vertices = find_node_vertices(roads)

    node_rows = {}
    road_rows = []
    edge_rows = []
    for road in roads:
        visited, chains, components = walk_road(road, node_vertices)
        report_road_shape(road, components, report)
        for vertex in visited:
            if vertex not in node_rows:
                here = node_vertices[vertex]
                x, z = game_position(vertex)
                lon, lat = lonlat_position(vertex)
                node_rows[vertex] = {
                    "id": f"n{len(node_rows) + 1}",
                    "x": x,
                    "z": z,
                    "lon": lon,
                    "lat": lat,
                    "roads": [other.id for other in here],
                    "kind": node_kind(vertex, here),
                }
                connections = {o.connects_to for o in here if o.terminal == vertex} - {None}
                if connections:
                    node_rows[vertex]["connectsTo"] = connections.pop()
        edge_ids = []
        for number, chain in enumerate(chains, start=1):
            edge_ids.append(f"{road.id}_e{number}")
            edge_rows.append(
                {
                    "id": edge_ids[-1],
                    "road": road.id,
                    "from": node_rows[chain[0]]["id"],
                    "to": node_rows[chain[-1]]["id"],
                    "points": [list(game_position(vertex)) for vertex in chain],
                    "lonlat": [list(lonlat_position(vertex)) for vertex in chain],
                }
            )
        mtfcc, width, surface, spec_source = road_class(road, config, report)
        linear_ids = {record.linear_id for records in road.carriers.values() for record in records}
        road_rows.append(
            {
                "id": road.id,
                "name": road.name,
                "tigerNames": road.tiger_names,
                "linearIds": sorted(linear_ids),
                "mtfcc": mtfcc,
                "width": width,
                "surface": surface,
                "specSource": spec_source,
                "nodes": [node_rows[vertex]["id"] for vertex in visited],
                "edges": edge_ids,
            }
        )

    data = {
        "version": 1,
        "units": "m",
        "axes": {"+x": "east", "+y": "up", "-z": "north"},
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON},
        "projection": {
            "type": "equirectangular",
            "radiusM": EARTH_RADIUS_M,
            "x": "R * dLon * cos(lat0)",
            "z": "-R * dLat",
            "angles": "radians",
            "datum": "NAD83, used as-is with no datum shift",
        },
        "source": {"vintage": VINTAGE, "baseUrl": BASE_URL, "files": source_files},
        "roadClasses": config["mtfcc"],
        "nodes": list(node_rows.values()),
        "roads": road_rows,
        "edges": edge_rows,
    }
    return data, report


# Reference lines: the railroad and river. Same projection as the roads, but not in the graph.


@dataclass(eq=False)
class LineSet:
    """Named segments, which is all the geometric checks need from a road."""

    name: str
    carriers: dict  # {segment: what's known about it}. Records, for the railroad and river.

    def adjacency(self):
        return adjacency_of(self.carriers)


def reference_area(data):
    """Return the bounding box of every included road plus the margin, in true metres."""
    xs, zs = zip(*(to_xz(vertex) for edge in data["edges"] for vertex in edge["lonlat"]))
    return {
        "xMinM": min(xs) - REFERENCE_MARGIN_M,
        "xMaxM": max(xs) + REFERENCE_MARGIN_M,
        "zMinM": min(zs) - REFERENCE_MARGIN_M,
        "zMaxM": max(zs) + REFERENCE_MARGIN_M,
    }


def inside_area(vertex, area):
    x, z = to_xz(vertex)
    return area["xMinM"] <= x <= area["xMaxM"] and area["zMinM"] <= z <= area["zMaxM"]


def chain_segments(segments):
    """Join segments into polylines that break at every end and branch, keeping every vertex.

    A closed loop has neither, so it starts and stops at its lowest vertex.
    """
    adjacency = adjacency_of(segments)
    breaks = {vertex for vertex, near in adjacency.items() if len(near) != 2}
    chains = []
    walked = set()
    for start in (*sorted(breaks), *sorted(adjacency)):
        for neighbour in sorted(adjacency[start]):
            if ((start, neighbour) if start < neighbour else (neighbour, start)) in walked:
                continue
            chain = [start, neighbour]
            while chain[-1] not in breaks and chain[-1] != start:
                chain.extend(adjacency[chain[-1]] - {chain[-2]})
            walked.update(segments_of(chain))
            chains.append(chain)
    return chains


def order_chains(chains):
    """Return the chains, each pointing onward, in running order, and the gaps between them.

    The first starts at the westernmost end. Each next one starts where an earlier one
    stopped if it can. Otherwise it starts at the end nearest where the last one stopped,
    which leaves a gap, returned as (metres, from, to). Nothing bridges a gap.
    """
    remaining = list(chains)
    ends = [end for chain in remaining for end in (chain[0], chain[-1])]
    tail = min(ends, key=lambda vertex: (to_xz(vertex)[0], vertex))
    joined = {tail}
    ordered = []
    gaps = []
    while remaining:
        gap, line, index = min(
            (0.0 if line[0] in joined else math.dist(to_xz(tail), to_xz(line[0])), line, index)
            for index, chain in enumerate(remaining)
            for line in (chain, chain[::-1])
        )
        if gap:
            gaps.append((gap, tail, line[0]))
        del remaining[index]
        ordered.append(line)
        joined.update((line[0], line[-1]))
        tail = line[-1]
    return ordered, gaps


def clip_to_area(chain, area):
    """Return the runs of a chain inside the area.

    Whole TIGER vertices only, like the roads: a run stops at its last vertex inside, so
    nothing is interpolated and every vertex keeps its real lon/lat.
    """
    runs = (list(run) for inside, run in groupby(chain, lambda v: inside_area(v, area)) if inside)
    return [run for run in runs if len(run) > 1]


def clipped_lines(line_set, area, report):
    """Return a line set's polylines inside the area, in running order. Report what's odd."""
    chains, gaps = order_chains(chain_segments(line_set.carriers))
    for gap, start, end in gaps:
        if inside_area(start, area) or inside_area(end, area):
            report.append(
                f"{line_set.name} has a {gap:.1f} m gap in TIGER from {where(start)} to "
                f"{where(end)}. Not bridged."
            )
    for vertex, near in sorted(line_set.adjacency().items()):
        if len(near) > 2 and inside_area(vertex, area):
            report.append(f"{line_set.name} branches at {where(vertex)}, kept as separate lines")
    lines = [run for chain in chains for run in clip_to_area(chain, area)]
    if not lines:
        raise BuildError(f"{line_set.name}: nothing inside the reference area")
    return lines


def kept_linear_ids(line_set, lines, report):
    """Return the features carrying the kept lines, sorted. Report any read but left out."""
    kept = {
        record.linear_id
        for line in lines
        for segment in segments_of(line)
        for record in line_set.carriers[segment]
    }
    read = {record.linear_id for records in line_set.carriers.values() for record in records}
    for linear_id in sorted(read - kept):
        report.append(f"{line_set.name} feature {linear_id} has no segment inside the area")
    return sorted(kept)


def line_rows(lines):
    return [
        {
            "points": [list(game_position(vertex)) for vertex in line],
            "lonlat": [list(lonlat_position(vertex)) for vertex in line],
        }
        for line in lines
    ]


def line_contacts(first, second):
    """Yield (segment of first, point) for everywhere two line sets touch.

    That means every endpoint their segments share and every other point they touch.
    """
    for row_a, row_b in close_segment_pairs([first, second], 0):
        if row_a[0] is row_b[0]:
            continue
        if row_a[0] is second:
            row_a, row_b = row_b, row_a
        for vertex in sorted(set(row_a[1]) & set(row_b[1])):
            yield row_a[1], vertex
        for vertex in segment_contacts(*row_a[1], *row_b[1]):
            yield row_a[1], vertex


def report_unshared(first, second, contacts, report):
    """Report contacts that aren't a vertex of both lines. Such a point is computed."""
    shared = first.adjacency().keys() & second.adjacency().keys()
    for vertex in sorted(set(contacts) - shared):
        report.append(f"{first.name} meets {second.name} with no shared vertex: {where(vertex)}")


def cluster_points(vertices, within_m):
    """Group vertices that link up at within_m or less, one vertex to the next."""
    clusters = []
    for vertex in sorted(vertices):
        near = [
            cluster
            for cluster in clusters
            if any(math.dist(to_xz(vertex), to_xz(other)) <= within_m for other in cluster)
        ]
        clusters = [cluster for cluster in clusters if cluster not in near]
        clusters.append([vertex, *(other for cluster in near for other in cluster)])
    return clusters


def cluster_center(cluster):
    """Return the member nearest the cluster's middle, so it lies on both lines."""
    xs, zs = zip(*(to_xz(vertex) for vertex in cluster))
    middle = (sum(xs) / len(xs), sum(zs) / len(zs))
    return min(cluster, key=lambda vertex: (math.dist(to_xz(vertex), middle), vertex))


def find_trestles(hits):
    """Return reference.trestles from where the rail meets the river, on true geometry.

    Fails unless the hits cluster into exactly the trestles the ticket lists.
    """
    centers = [cluster_center(cluster) for cluster in cluster_points(hits, TRESTLE_CLUSTER_M)]
    found = "; ".join(
        f"{where(center)}, {math.hypot(*to_xz(center)):.0f} m from center"
        for center in sorted(centers)
    )
    if len(centers) != len(TRESTLES):
        raise BuildError(
            f"The railroad meets {RIVER_TIGER_NAME} in {len(centers)} place(s), not "
            f"{len(TRESTLES)}: {found or 'none'}"
        )
    rows = []
    for expected in TRESTLES:
        matches = [
            center
            for center in centers
            if ("east" if to_xz(center)[0] > 0 else "west") == expected["side"]
            and abs(math.hypot(*to_xz(center)) - expected["distanceM"]) <= TRESTLE_TOLERANCE_M
        ]
        if len(matches) != 1:
            raise BuildError(
                f"{expected['id']}: {len(matches)} crossing(s) within {TRESTLE_TOLERANCE_M} m "
                f"of {expected['distanceM']} m {expected['side']}, not 1. Found {found}"
            )
        x, z = game_position(matches[0])
        lon, lat = lonlat_position(matches[0])
        rows.append(
            {
                "id": expected["id"],
                "side": expected["side"],
                "x": x,
                "z": z,
                "lon": lon,
                "lat": lat,
                "distanceFromCenterM": round(math.hypot(*to_xz(matches[0])), 3),
                **({"label": expected["label"]} if "label" in expected else {}),
            }
        )
    return rows


def road_walk(road, edges):
    """Return {segment: (edge number, segment number, start vertex)} in walk order."""
    walk = {}
    for edge_number, edge_id in enumerate(road["edges"]):
        chain = [tuple(vertex) for vertex in edges[edge_id]["lonlat"]]
        for segment_number, (a, b) in enumerate(zip(chain, chain[1:])):
            walk[(a, b) if a < b else (b, a)] = (edge_number, segment_number, a)
    return walk


def find_crossings(road_id, road_line, lines):
    """Return (road id, label, point) for each contact with a line, in order along the road.

    lines is {label: LineSet}. road_line carries road_walk's places. The geometry is
    unclipped, so a long segment that runs out of the area can't hide a crossing.
    """
    places = {}
    for label, line in lines.items():
        for segment, vertex in line_contacts(road_line, line):
            edge_number, segment_number, start = road_line.carriers[segment]
            place = (edge_number, segment_number, math.dist(to_xz(start), to_xz(vertex)))
            places[(label, vertex)] = min(place, places.get((label, vertex), place))
    ordered = sorted(places, key=lambda key: (places[key], key))
    return [(road_id, label, vertex) for label, vertex in ordered]


def build_reference(data, rail_records, river_records, area, report):
    """Return the reference block for the finished road graph, from plain records."""
    x_range = f"x {area['xMinM']:.0f} to {area['xMaxM']:.0f}"
    z_range = f"z {area['zMinM']:.0f} to {area['zMaxM']:.0f}"
    report.append(f"Reference area, the roads plus {REFERENCE_MARGIN_M} m: {x_range}, {z_range}")
    rail = LineSet(RAILROAD_NAME, carriers_of(rail_records))
    river = LineSet(RIVER_NAME, carriers_of(river_records))

    hits = {vertex for _, vertex in line_contacts(rail, river)}
    report_unshared(rail, river, hits, report)
    trestles = find_trestles(hits)

    rail_lines = clipped_lines(rail, area, report)
    river_lines = clipped_lines(river, area, report)

    edges = {edge["id"]: edge for edge in data["edges"]}
    lines = {RAILROAD: rail, RIVER: river}
    road_lines = {}
    crossings = []
    for road in data["roads"]:
        road_lines[road["id"]] = LineSet(road["name"], road_walk(road, edges))
        crossings += find_crossings(road["id"], road_lines[road["id"]], lines)
    for road_id, label, vertex in crossings:
        report_unshared(road_lines[road_id], lines[label], [vertex], report)

    contacts = {*hits, *(vertex for _, _, vertex in crossings)}
    report_reference_near_misses(list(road_lines.values()), [rail, river], contacts, report)

    return {
        RAILROAD: {
            "name": RAILROAD_NAME,
            "linearIds": kept_linear_ids(rail, rail_lines, report),
            "mtfcc": RAIL_MTFCC,
            "lines": line_rows(rail_lines),
        },
        RIVER: {
            "name": RIVER_NAME,
            "tigerName": RIVER_TIGER_NAME,
            "linearIds": kept_linear_ids(river, river_lines, report),
            "lines": line_rows(river_lines),
        },
        "trestles": trestles,
        "crossings": [
            dict(zip(("road", "with", "x", "z"), (road_id, label, *game_position(vertex))))
            for road_id, label, vertex in crossings
        ],
    }


def report_reference_near_misses(road_lines, lines, contacts, report):
    """Report where a line passes a road or the other line closely with no contact there.

    That's how a missing crossing would show up, and nothing is snapped to close one.
    """
    names = {line.name for line in lines}
    misses = [
        miss
        for miss in find_near_misses([*road_lines, *lines], contacts, TRESTLE_CLUSTER_M)
        if names & set(miss[1])
    ]
    for gap, pair, (x, z) in misses:
        report.append(
            f"Near-miss, no crossing recorded: {' and '.join(pair)} pass {gap:.2f} m apart at "
            f"x {x:.0f}, z {z:.0f}"
        )
    if not misses:
        report.append(
            f"Geometric check: the railroad and river have no near-miss under {NEAR_MISS_M} m"
        )


def render_rows(rows, indent):
    """Return a JSON array with one row per line, for a key at the given indent."""
    pad = " " * indent
    body = ",\n".join(f"{pad}  {json.dumps(row)}" for row in rows)
    return f"[\n{body}\n{pad}]"


def render_reference(reference):
    """Return the reference block, with one trestle, crossing or line per line."""
    parts = []
    for key, value in reference.items():
        if isinstance(value, list):
            parts.append(f"    {json.dumps(key)}: {render_rows(value, 4)}")
            continue
        fields = ",\n".join(
            f"      {json.dumps(name)}: "
            f"{render_rows(item, 6) if name == 'lines' else json.dumps(item)}"
            for name, item in value.items()
        )
        parts.append(f"    {json.dumps(key)}: {{\n{fields}\n    }}")
    return "{\n" + ",\n".join(parts) + "\n  }"


def render_json(data):
    """Return JSON text with one node, road, edge, trestle, crossing or line per line."""
    parts = []
    for key, value in data.items():
        if key in TABLES:
            parts.append(f"  {json.dumps(key)}: {render_rows(value, 2)}")
        elif key == "reference":
            parts.append(f"  {json.dumps(key)}: {render_reference(value)}")
        else:
            text = json.dumps(value, indent=2).replace("\n", "\n  ")
            parts.append(f"  {json.dumps(key)}: {text}")
    return "{\n" + ",\n".join(parts) + "\n}\n"


def print_summary(data, report):
    print(f"{VINTAGE}, read from data/raw/")
    for row in data["roads"]:
        edges = [edge for edge in data["edges"] if edge["road"] == row["id"]]
        vertices = 1 + sum(len(edge["points"]) - 1 for edge in edges)
        print(
            f"  {row['name']}: {len(edges)} edge(s), {vertices} vertices, "
            f"{row['mtfcc']} {row['width']} m {row['surface']} ({row['specSource']}), "
            f"walk {' '.join(row['nodes'])}, features {' '.join(row['linearIds'])}"
        )
    print("Nodes:")
    for node in data["nodes"]:
        connection = f", connects to {node['connectsTo']}" if "connectsTo" in node else ""
        print(
            f"  {node['id']} {node['kind']} x {node['x']:.0f}, z {node['z']:.0f}: "
            f"{' '.join(node['roads'])}{connection}"
        )
    reference = data["reference"]
    print("Reference lines, clipped to the reference area:")
    for row in (reference[RAILROAD], reference[RIVER]):
        print(f"  {row['name']}: features {' '.join(row['linearIds'])}")
        for line in row["lines"]:
            (start_x, start_z), (end_x, end_z) = line["points"][0], line["points"][-1]
            print(
                f"    {len(line['points'])} vertices, "
                f"x {start_x:.0f}, z {start_z:.0f} to x {end_x:.0f}, z {end_z:.0f}"
            )
    print("Trestles:")
    for row in reference["trestles"]:
        label = f", {row['label']}" if "label" in row else ""
        print(
            f"  {row['id']} x {row['x']:.0f}, z {row['z']:.0f}: "
            f"{row['distanceFromCenterM']:.1f} m {row['side']} of center{label}"
        )
    print("Crossings, in order along each road:")
    for row in reference["crossings"]:
        print(f"  {row['road']} x {row['x']:.0f}, z {row['z']:.0f}: {row['with']}")
    print("Report:")
    for line in report:
        print(f"  {line}")


def main():
    sys.stdout.reconfigure(line_buffering=True)  # Keep order with stderr when piped.
    missing = [p for p in SOURCE_FILES if not (RAW_DIR / Path(p).name).exists()]
    if missing:
        print(f"Missing {', '.join(missing)}. Run tools/fetch_tiger.py first.", file=sys.stderr)
        return 1
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    try:
        records = read_road_records()
        data, report = build_road_graph(records, config, describe_files(SOURCE_FILES))
        area = reference_area(data)
        data["reference"] = build_reference(
            data, read_rail_records(area), read_river_records(), area, report
        )
    except BuildError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1
    OUTPUT_PATH.write_text(render_json(data), encoding="utf-8")
    print_summary(data, report)
    print(f"Wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
