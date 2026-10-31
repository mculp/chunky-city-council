"""Print what the TIGER/Line 2025 files say about the roads Chunky is built from.

Run from the repo root, using the project venv, after tools/fetch_tiger.py:

    .venv/bin/python tools/inspect_tiger.py

Sections:

    (a) each target road name's records, grouped into connected components
    (b) the shortest path from the north end of Adams St to I-20
    (c) whether Meehan Savoy Rd and Church St touch US 80 or Adams St
    (d) the rail/river crossings and the junction that set US 80's clip bounds

tools/road_config.json is written by hand from this output, and
data/tiger-inspection.md keeps a copy of it. This script only reads: the zips are
opened in place with pyshp and never extracted.

Connections mean shared vertices, because TIGER is one planar topology. Vertices
are compared exactly, so a near-miss is reported as a gap and never snapped.

Rail features are identified by LINEARID only. TIGER's rail names can be real
operator brands, so that field isn't even read.
"""

import heapq
import itertools
import math
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

import shapefile

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
ROAD_ZIPS = {"tl_2025_28101_roads.zip": "Newton", "tl_2025_28075_roads.zip": "Lauderdale"}
WATER_ZIPS = ("tl_2025_28101_linearwater.zip", "tl_2025_28075_linearwater.zip")
RAILS_ZIP = "tl_2025_us_rails.zip"

ORIGIN_LAT, ORIGIN_LON = 32.32583, -88.92806  # Town center, per CLAUDE.md.
EARTH_RADIUS_M = 6_371_000

TARGET_NAMES = ("US Hwy 80", "Adams St", "Church St", "Meehan Savoy Rd S", "Meehan Savoy Rd W")
RIVER_NAME = "Chunky Riv"
RAMP_MTFCC = "S1630"
CLIP_MARGIN_M = 500
CLIP_ROUND_M = 10

SAME_POINT_M = 0.01  # Rounding tolerance when matching a computed crossing to a vertex.


@dataclass(eq=False)  # Hash by identity, not by walking every vertex.
class Feature:
    linear_id: str
    name: str
    mtfcc: str
    rttyp: str
    counties: list
    points: tuple


def read_polylines(zip_name, fields, bbox=None):
    """Yield (attributes, points) for each record, with points as (lon, lat) tuples."""
    with shapefile.Reader(str(RAW_DIR / zip_name)) as reader:
        for item in reader.iterShapeRecords(fields=fields, bbox=bbox):
            if len(item.shape.parts) != 1:
                # Joining parts end to end would invent a connection.
                raise ValueError(f"{zip_name}: multipart record {item.record.as_dict()}")
            yield item.record.as_dict(), tuple(tuple(point) for point in item.shape.points)


def load_roads():
    """Return every road feature in both counties and the number of file records.

    A road on the county line is in both files with the same LINEARID and geometry,
    so it becomes one feature with two counties.
    """
    features = {}
    records = 0
    for zip_name, county in ROAD_ZIPS.items():
        fields = ["LINEARID", "FULLNAME", "RTTYP", "MTFCC"]
        for attributes, points in read_polylines(zip_name, fields):
            records += 1
            key = (attributes["LINEARID"], points)
            if key in features:
                features[key].counties.append(county)
            else:
                features[key] = Feature(
                    attributes["LINEARID"],
                    attributes["FULLNAME"],
                    attributes["MTFCC"],
                    attributes["RTTYP"],
                    [county],
                    points,
                )
    return list(features.values()), records


def load_river():
    return [
        Feature(attributes["LINEARID"], attributes["FULLNAME"], attributes["MTFCC"], "", [], points)
        for zip_name in WATER_ZIPS
        for attributes, points in read_polylines(zip_name, ["LINEARID", "FULLNAME", "MTFCC"])
        if attributes["FULLNAME"] == RIVER_NAME
    ]


def load_rails_near(features):
    """Return the rail features overlapping the bounding box of the given features."""
    points = [point for feature in features for point in feature.points]
    lons, lats = zip(*points)
    bbox = (min(lons), min(lats), max(lons), max(lats))
    return [
        Feature(attributes["LINEARID"], "Railroad", attributes["MTFCC"], "", [], polyline)
        for attributes, polyline in read_polylines(RAILS_ZIP, ["LINEARID", "MTFCC"], bbox)
    ]


def to_xz(point):
    """Project (lon, lat) to game metres, per the Coordinates section of CLAUDE.md."""
    lon, lat = point
    x = EARTH_RADIUS_M * math.radians(lon - ORIGIN_LON) * math.cos(math.radians(ORIGIN_LAT))
    z = -EARTH_RADIUS_M * math.radians(lat - ORIGIN_LAT)
    return x, z


def polyline_length(points):
    return sum(math.dist(to_xz(a), to_xz(b)) for a, b in itertools.pairwise(points))


def point_to_segment(point, a, b):
    """Return the distance in metres from a point to segment ab, all in x/z."""
    dx, dz = b[0] - a[0], b[1] - a[1]
    length_squared = dx * dx + dz * dz
    if length_squared == 0:
        return math.dist(point, a)
    t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / length_squared
    t = max(0.0, min(1.0, t))
    return math.dist(point, (a[0] + t * dx, a[1] + t * dz))


def segment_crossing(a, b, c, d):
    """Return where segments ab and cd meet in x/z, or None if not or if parallel."""
    ab_x, ab_z = b[0] - a[0], b[1] - a[1]
    cd_x, cd_z = d[0] - c[0], d[1] - c[1]
    denominator = ab_x * cd_z - ab_z * cd_x
    if denominator == 0:
        return None
    t = ((c[0] - a[0]) * cd_z - (c[1] - a[1]) * cd_x) / denominator
    u = ((c[0] - a[0]) * ab_z - (c[1] - a[1]) * ab_x) / denominator
    if 0 <= t <= 1 and 0 <= u <= 1:
        return a[0] + t * ab_x, a[1] + t * ab_z
    return None


def distance_from_origin(points):
    """Return the feature's smallest distance from town center, along its segments."""
    projected = [to_xz(point) for point in points]
    return min(point_to_segment((0.0, 0.0), a, b) for a, b in itertools.pairwise(projected))


def group_distance(features):
    return min(distance_from_origin(feature.points) for feature in features)


def connected_components(features):
    """Group features that connect by shared vertices, nearest to town center first."""
    by_vertex = defaultdict(list)
    for feature in features:
        for point in feature.points:
            by_vertex[point].append(feature)
    seen = set()
    components = []
    for first in features:
        if first in seen:
            continue
        seen.add(first)
        component = []
        stack = [first]
        while stack:
            feature = stack.pop()
            component.append(feature)
            for point in feature.points:
                for other in by_vertex[point]:
                    if other not in seen:
                        seen.add(other)
                        stack.append(other)
        components.append(component)
    return sorted(components, key=group_distance)


def named(features, *names):
    return [feature for feature in features if feature.name in names]


def is_i20(feature):
    """Compare the route number, because TIGER typically spells it 'I- 20'."""
    number = re.search(r"\d+", feature.name)
    return feature.rttyp == "I" and number is not None and int(number.group()) == 20


def ramp_hops(features, i20):
    """Map each S1630 feature connected to I-20 to how many other ramps lie between."""
    ramps = [feature for feature in features if feature.mtfcc == RAMP_MTFCC]
    reached = {point for feature in i20 for point in feature.points}
    hops = {}
    for level in itertools.count():
        touching = [r for r in ramps if r not in hops and not reached.isdisjoint(r.points)]
        if not touching:
            return hops
        for ramp in touching:
            hops[ramp] = level
        reached.update(point for ramp in touching for point in ramp.points)


def build_graph(features):
    """Return {vertex: {neighbour: metres}} and the features carrying each edge."""
    neighbours = defaultdict(dict)
    edge_features = defaultdict(set)
    for feature in features:
        for a, b in itertools.pairwise(feature.points):
            if a != b:
                neighbours[a][b] = neighbours[b][a] = math.dist(to_xz(a), to_xz(b))
                edge_features[frozenset((a, b))].add(feature)
    return neighbours, edge_features


def shortest_path(neighbours, start, goals):
    """Run Dijkstra to the nearest goal. Return (path or None, metres to each reached vertex)."""
    metres_to = {start: 0.0}
    previous = {}
    queue = [(0.0, start)]
    while queue:
        metres, vertex = heapq.heappop(queue)
        if metres > metres_to[vertex]:
            continue
        if vertex in goals:
            path = [vertex]
            while path[-1] != start:
                path.append(previous[path[-1]])
            return path[::-1], metres_to
        for neighbour, step in neighbours[vertex].items():
            if metres + step < metres_to.get(neighbour, math.inf):
                metres_to[neighbour] = metres + step
                previous[neighbour] = vertex
                heapq.heappush(queue, (metres + step, neighbour))
    return None, metres_to


def closest_pair(vertices_a, vertices_b):
    """Return (metres, a, b) for the closest two vertices, for reporting a gap."""
    return min(
        ((math.dist(to_xz(a), to_xz(b)), a, b) for a in vertices_a for b in vertices_b),
        key=lambda pair: pair[0],
    )


def where(point):
    x, z = to_xz(point)
    return f"{point[0]:.6f}, {point[1]:.6f} (x {x:.0f}, z {z:.0f})"


def describe(feature):
    return f"{feature.name or '(unnamed)'} {feature.linear_id} {feature.mtfcc}"


def print_component(feature_group):
    records = sum(len(feature.counties) for feature in feature_group)
    mtfccs = " ".join(sorted({feature.mtfcc for feature in feature_group}))
    total = sum(polyline_length(feature.points) for feature in feature_group)
    print(
        f"    {group_distance(feature_group):.0f} m from town center at nearest, "
        f"{records} record(s), {total:.0f} m in total, MTFCC {mtfccs}"
    )
    for feature in sorted(feature_group, key=lambda f: distance_from_origin(f.points)):
        start_x, start_z = to_xz(feature.points[0])
        end_x, end_z = to_xz(feature.points[-1])
        print(
            f"      {feature.linear_id:<14} {feature.mtfcc} {'+'.join(feature.counties):<10} "
            f"{polyline_length(feature.points):>6.0f} m long, "
            f"{distance_from_origin(feature.points):>6.0f} m from center, "
            f"x {start_x:.0f}, z {start_z:.0f} to x {end_x:.0f}, z {end_z:.0f}"
        )


def print_names(roads):
    print("(a) Target road names, grouped into connected components by shared vertices")
    print("    Components are listed nearest to town center first. Lengths are sums over")
    print("    records, so a divided stretch counts both carriageways.")
    for name in TARGET_NAMES:
        components = connected_components(named(roads, name))
        print(f"\n  {name}: {len(components)} component(s)")
        for component in components:
            print_component(component)
    meehan = connected_components(named(roads, "Meehan Savoy Rd S", "Meehan Savoy Rd W"))
    print(f"\n  Meehan Savoy Rd S and W together: {len(meehan)} component(s)")


def print_path_to_i20(roads, start):
    print("\n(b) Shortest path from the north end of Adams St to I-20, over all road features")
    print(f"\n  Start: {where(start)}")
    i20 = [feature for feature in roads if is_i20(feature)]
    print(f"  I-20: {', '.join(feature.linear_id for feature in i20)} (RTTYP I, route number 20)")
    hops = ramp_hops(roads, i20)
    direct_ramps = [ramp for ramp, level in hops.items() if level == 0]
    print(
        f"  Ramps: {len(direct_ramps)} S1630 features share a vertex with I-20, "
        f"and {len(hops) - len(direct_ramps)} more connect to it through other ramps"
    )

    i20_vertices = {point for feature in i20 for point in feature.points}
    goals = i20_vertices | {point for ramp in direct_ramps for point in ramp.points}
    neighbours, edge_features = build_graph(roads)
    path, metres_to = shortest_path(neighbours, start, goals)
    if path is None:
        gap, near, far = closest_pair(metres_to, goals)
        print(f"\n  No connection. Remaining gap: {gap:.1f} m, from {where(near)} to {where(far)}")
        return

    print(f"\n  Reached {where(path[-1])} after {metres_to[path[-1]]:.1f} m. On that path:")
    on_path = {}
    for a, b in itertools.pairwise(path):
        for feature in sorted(edge_features[frozenset((a, b))], key=lambda f: f.name):
            on_path[feature] = on_path.get(feature, 0.0) + neighbours[a][b]
    for feature, metres in on_path.items():
        print(f"    {metres:>6.1f} m  {describe(feature)}")
    print("    Features on the same edges are each listed in full, so these overlap.")

    # The path is the shortest way to any qualifying ramp, which can leave the road
    # that continues Adams St. So also walk that road on to I-20 itself, listing
    # what it touches in order. The first contact is where config clips the road.
    first_edge = frozenset(path[:2])
    continuation = sorted(edge_features[first_edge], key=lambda f: f.name)
    names = ", ".join(sorted({feature.name or "(unnamed)" for feature in continuation}))
    print(f"\n  Ramps and I-20 along the road that continues Adams St ({names}):")
    route, route_metres = shortest_path(build_graph(continuation)[0], start, i20_vertices)
    if route is None:
        print("    That road doesn't reach I-20 itself by shared vertices.")
        return
    by_vertex = defaultdict(list)
    for feature in roads:
        for point in feature.points:
            by_vertex[point].append(feature)
    for point in route:
        for feature in by_vertex[point]:
            if feature in hops:
                detail = (
                    "touches I-20"
                    if hops[feature] == 0
                    else f"{hops[feature]} other ramp(s) from I-20"
                )
            elif feature in i20:
                detail = "I-20 itself"
            else:
                continue
            print(
                f"    {route_metres[point]:>6.1f} m  {where(point)}  "
                f"{describe(feature)}, {detail}"
            )


def compare_lines(features_a, features_b):
    """Check two groups geometrically, independently of their shared vertices.

    Return their smallest gap in metres and any crossing away from a shared vertex.
    """
    shared = [to_xz(point) for point in shared_vertices(features_a, features_b)]
    segments_a, segments_b = (
        [
            pair
            for feature in group
            for pair in itertools.pairwise([to_xz(point) for point in feature.points])
        ]
        for group in (features_a, features_b)
    )
    smallest_gap = math.inf
    crossings = []
    for a, b in segments_a:
        for c, d in segments_b:
            crossing = segment_crossing(a, b, c, d)
            if crossing is not None:
                smallest_gap = 0.0
                if all(math.dist(crossing, point) > SAME_POINT_M for point in shared):
                    crossings.append(crossing)
            elif smallest_gap > 0:
                smallest_gap = min(
                    smallest_gap,
                    point_to_segment(a, c, d),
                    point_to_segment(b, c, d),
                    point_to_segment(c, a, b),
                    point_to_segment(d, a, b),
                )
    return smallest_gap, crossings


def shared_vertices(features_a, features_b):
    """Return the vertices the two groups share, in order along the first group."""
    points_b = {point for feature in features_b for point in feature.points}
    shared = {}
    for feature in features_a:
        for point in feature.points:
            if point in points_b:
                shared[point] = None
    return list(shared)


def print_contacts(us80, adams, meehan, church):
    print("\n(c) Do Meehan Savoy Rd and Church St touch US 80 or Adams St?")
    print("    US 80, Adams St and Church St here are the components nearest town center.")
    print("    Adams St against US 80 is included, since the road starts there.")
    pairs = (
        ("Meehan Savoy Rd", meehan, "US 80", us80),
        ("Meehan Savoy Rd", meehan, "Adams St", adams),
        ("Church St", church, "US 80", us80),
        ("Church St", church, "Adams St", adams),
        ("Adams St", adams, "US 80", us80),
    )
    for name_a, group_a, name_b, group_b in pairs:
        shared = shared_vertices(group_a, group_b)
        gap, crossings = compare_lines(group_a, group_b)
        answer = "touches" if shared else "does not touch"
        print(f"\n  {name_a} {answer} {name_b}")
        for point in shared:
            on_a = [f.linear_id for f in group_a if point in f.points]
            on_b = [f.linear_id for f in group_b if point in f.points]
            print(f"    shared vertex {where(point)}, on {on_a} and {on_b}")
        print(
            f"    geometric check: smallest gap {gap:.1f} m, "
            f"{len(crossings)} crossing(s) away from a shared vertex"
        )


def print_clip_bound(us80, anchor_name, anchor_xz, direction):
    """Print the bound CLIP_MARGIN_M past an anchor and how US 80 meets it.

    direction is -1 for west and +1 for east. The bound is rounded outward to
    CLIP_ROUND_M. Clipping keeps the whole TIGER vertices inside it, so that no end
    vertex has to be interpolated.
    """
    target = direction * (anchor_xz[0] + direction * CLIP_MARGIN_M)
    bound = direction * math.ceil(target / CLIP_ROUND_M) * CLIP_ROUND_M
    cuts = []
    for feature in us80:
        for a, b in itertools.pairwise(feature.points):
            if (to_xz(a)[0] - bound) * (to_xz(b)[0] - bound) < 0:
                inside = a if direction * (to_xz(a)[0] - bound) < 0 else b
                cuts.append((feature, inside))
    print(f"\n  x = {bound}: {CLIP_MARGIN_M} m past {anchor_name} (x {anchor_xz[0]:.1f}), rounded")
    print(f"    US 80 crosses this bound {len(cuts)} time(s)")
    for feature, inside in cuts:
        print(
            f"    last whole vertex inside: {where(inside)} on {feature.linear_id}, "
            f"{abs(to_xz(inside)[0] - anchor_xz[0]):.0f} m in x and "
            f"{math.dist(anchor_xz, to_xz(inside)):.0f} m in a straight line from {anchor_name}"
        )


def print_clip_anchors(us80, meehan):
    print("\n(d) Trestles and the junction that set US 80's clip bounds")
    river = load_river()
    print(f"\n  {RIVER_NAME}:")
    for feature in river:
        print(f"    {feature.linear_id:<14} {polyline_length(feature.points):>6.0f} m")
    rails = load_rails_near(river)
    print("  Railroad features overlapping the river's bounding box:")
    for feature in rails:
        print(
            f"    {feature.linear_id:<14} {polyline_length(feature.points):>6.0f} m, "
            f"x {to_xz(feature.points[0])[0]:.0f} to x {to_xz(feature.points[-1])[0]:.0f}"
        )

    trestles = sorted(shared_vertices(rails, river), key=lambda point: to_xz(point)[0])
    print(f"\n  Railroad meets {RIVER_NAME} at {len(trestles)} shared vertices:")
    for point in trestles:
        x, _ = to_xz(point)
        direction = "east" if x > 0 else "west"
        print(f"    {abs(x) / 1000:.2f} km {direction} of center: {where(point)}")
    gap, crossings = compare_lines(rails, river)
    print(
        f"  Geometric check: smallest gap {gap:.1f} m, "
        f"{len(crossings)} crossing(s) away from a shared vertex"
    )

    print_clip_bound(us80, "the west trestle", to_xz(trestles[0]), -1)
    junctions = shared_vertices(meehan, us80)
    if not junctions:
        print("\n  Meehan Savoy Rd has no junction with US 80, so no east bound is derived here.")
        return
    junction = to_xz(junctions[0])
    print_clip_bound(us80, "the Meehan Savoy Rd junction", junction, +1)

    vertices = [to_xz(point) for feature in meehan for point in feature.points]
    nearest_x, nearest_z = min(vertices, key=lambda vertex: math.hypot(*vertex))
    print(
        f"\n  Meehan Savoy Rd spans x {min(v[0] for v in vertices):.0f} to "
        f"x {max(v[0] for v in vertices):.0f}. Its junction with US 80 is "
        f"{math.hypot(*junction):.0f} m from center. Its nearest vertex is a bend at "
        f"x {nearest_x:.0f}, z {nearest_z:.0f}, {math.hypot(nearest_x, nearest_z):.0f} m away."
    )


def print_header(roads, records):
    print("TIGER/Line 2025, read from data/raw/")
    print(f"Origin {ORIGIN_LAT}, {ORIGIN_LON}. Metres: +x is east, -z is north.")
    decimals = all(
        coordinate == round(coordinate, 6)
        for feature in roads
        for point in feature.points
        for coordinate in point
    )
    print(
        f"Road files: {records} records, {len(roads)} features after merging county-line "
        f"duplicates. Every coordinate is exactly 6 decimals: {decimals}."
    )
    counts = Counter(feature.mtfcc for feature in roads)
    print("MTFCC counts: " + ", ".join(f"{m} {counts[m]}" for m in sorted(counts)))
    print()


def main():
    sys.stdout.reconfigure(line_buffering=True)  # Keep order with stderr when piped.
    zips = (*ROAD_ZIPS, *WATER_ZIPS, RAILS_ZIP)
    missing = [zip_name for zip_name in zips if not (RAW_DIR / zip_name).exists()]
    if missing:
        print(f"Missing {', '.join(missing)}. Run tools/fetch_tiger.py first.", file=sys.stderr)
        return 1

    roads, records = load_roads()
    print_header(roads, records)
    print_names(roads)

    us80 = connected_components(named(roads, "US Hwy 80"))[0]
    adams = connected_components(named(roads, "Adams St"))[0]
    church = connected_components(named(roads, "Church St"))[0]
    meehan = connected_components(named(roads, "Meehan Savoy Rd S", "Meehan Savoy Rd W"))[0]

    north_end = max(
        (point for feature in adams for point in feature.points), key=lambda point: point[1]
    )
    print_path_to_i20(roads, north_end)
    print_contacts(us80, adams, meehan, church)
    print_clip_anchors(us80, meehan)
    return 0


if __name__ == "__main__":
    sys.exit(main())
