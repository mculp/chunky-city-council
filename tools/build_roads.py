"""Build data/roads.json, the road graph for real Chunky, MS, from TIGER/Line 2025.

Run from the repo root, using the project venv, after tools/fetch_tiger.py:

    .venv/bin/python tools/build_roads.py

tools/road_config.json says which roads to take and how to clip and style them. The
zips are read in place and never extracted. The same zips and config give the same
bytes. Any failure exits non-zero and leaves roads.json as it was. The report on
stdout lists what the docs need to record: the seam, crossings added, near-misses,
branches, extra components and unconnected roads.

Connections mean shared vertices compared exactly, because TIGER is one planar
topology. Every TIGER vertex is kept and none is moved, so a near-miss is reported
and never snapped. The only vertex that isn't TIGER's is one added where two lines
cross with no shared vertex, and the report lists each of those.

Only read_road_records needs pyshp, and it imports it itself. Everything else works
on plain records, so it can be imported and run without the venv.
"""

import hashlib
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
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

ORIGIN_LAT, ORIGIN_LON = 32.32583, -88.92806  # Town center, per CLAUDE.md.
EARTH_RADIUS_M = 6_371_000

SEAM_ROAD = "us_80"  # Runs through both county files, so it has to join between them.
WEST_TO_EAST_ROAD = "us_80"  # Other roads walk away from where they join the rest.
RAMP_MTFCC = "S1630"
I20 = "I-20"
NEAR_MISS_M = 5
TABLES = ("nodes", "roads", "edges")  # Written with one row per line, to keep diffs readable.


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


def read_road_records():
    """Return every record in both county road files. This is the only use of pyshp."""
    import shapefile  # Imported here so the geometry below works without the venv.

    records = []
    fields = ["LINEARID", "FULLNAME", "RTTYP", "MTFCC"]
    for rel_path, county in ROAD_FILES.items():
        with shapefile.Reader(str(RAW_DIR / Path(rel_path).name)) as reader:
            for item in reader.iterShapeRecords(fields=fields):
                attributes = item.record.as_dict()
                if len(item.shape.parts) != 1:
                    # Joining parts end to end would invent a connection.
                    raise BuildError(f"{rel_path}: multipart record {attributes['LINEARID']}")
                records.append(
                    Record(
                        county,
                        attributes["LINEARID"],
                        attributes["FULLNAME"],
                        attributes["MTFCC"],
                        attributes["RTTYP"],
                        tuple(tuple(point) for point in item.shape.points),
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


def find_near_misses(roads):
    """Return (metres, road names, position) where two roads almost touch.

    A gap beside a vertex the two roads share is just that junction, so it doesn't count.
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
        if any(math.dist(near_a, to_xz(vertex)) < NEAR_MISS_M for vertex in shared):
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


def render_json(data):
    """Return JSON text with one node, road or edge per line."""
    parts = []
    for key, value in data.items():
        if key in TABLES:
            rows = ",\n".join(f"    {json.dumps(row)}" for row in value)
            parts.append(f"  {json.dumps(key)}: [\n{rows}\n  ]")
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
    print("Report:")
    for line in report:
        print(f"  {line}")


def main():
    sys.stdout.reconfigure(line_buffering=True)  # Keep order with stderr when piped.
    missing = [p for p in ROAD_FILES if not (RAW_DIR / Path(p).name).exists()]
    if missing:
        print(f"Missing {', '.join(missing)}. Run tools/fetch_tiger.py first.", file=sys.stderr)
        return 1
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    try:
        records = read_road_records()
        data, report = build_road_graph(records, config, describe_files(ROAD_FILES))
    except BuildError as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 1
    OUTPUT_PATH.write_text(render_json(data), encoding="utf-8")
    print_summary(data, report)
    print(f"Wrote {OUTPUT_PATH.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
