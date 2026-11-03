"""Build data/lanes.json: the smaller roads from TIGER/Line 2025, and a drive to every building that needs one.

Run from the repo root, using the project venv, after tools/build_structures.py, which works out the same TIGER roads for itself
to say which buildings are in reach, because the drives go up to those buildings:

    .venv/bin/python tools/build_structures.py
    .venv/bin/python tools/build_lanes.py
    .venv/bin/python tools/build_lanes.py --check     # builds it again in memory, and fails if it differs

data/lanes.md says what it all means. Every TIGER vertex is kept where TIGER has it. A drive isn't TIGER's, and says so: it's
generated from where the road and the building are, and nothing comes from any imagery.
"""

import argparse
import hashlib
import heapq
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_roads import BASE_URL, RAW_DIR, ROAD_FILES, VINTAGE, read_road_records, to_xz  # noqa: E402
from build_structures import BOUND, OUT as STRUCTURES, ROADS, World, bbox_of, centroid, download, footprint, inside, seg_dist  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "lanes.json"
CONFIG = Path(__file__).parent / "lane_config.json"
WATER = ROOT / "data" / "water.json"

# What's a road for this purpose. Not the interstate or its ramps, because you can't get off them.
CLASSES = {"S1200", "S1400", "S1500", "S1640", "S1730", "S1740", "S1750", "S1780"}
ON_A_ROAD = 60  # A building this close to a road gets a drive. Any further and it looks for a road of its own.
CELL = 40  # The same as MAP.inBounds in src/map.js.
OPENING = 280  # World metres from Stuckey's Bridge, on both axes. Nothing new goes in there, because the opening has to stay as it was.
DRIVE_CLEAR = 1.8  # Past the wall of a building that isn't the one it's going to.
RIVER_GAP = 22  # Past the middle of the river, where the bank has come up to the level of the land.
OFF_THE_WALL = 3.5  # Where it stops.
MEASURED_JOIN = 45  # How far the end of a drive measured on the aerial can be from the road it leaves.
SHORT_GAP = 350  # How long a stretch of one road can be and still be filled in because there's road in the game at both ends of it.
FRONTING = 3  # Past the road's edge. A building this close doesn't need a drive.
SHED_NEAR = 35  # A shed this close to a building that's been seen to shares its way in.
LINK_REACH = 300  # How far a piece of track that's been cut off will look for the rest.


def norm(point):
    return round(point[0], 6), round(point[1], 6)


class Network:
    """TIGER's roads as one graph, and how far every vertex of it is from the roads the game already has."""

    def __init__(self, roads, records):
        self.records = [r for r in records if r.mtfcc in CLASSES]
        self.points = [[norm(p) for p in r.points] for r in self.records]
        self.xz = [[to_xz(p) for p in r.points] for r in self.records]
        self.kept_pairs, kept = set(), set()
        for e in roads["edges"]:
            line = [norm(p) for p in e["lonlat"]]
            kept.update(line)
            for a, b in zip(line, line[1:]):
                self.kept_pairs.add((a, b))
                self.kept_pairs.add((b, a))
        self.kept = kept
        self.graph = defaultdict(list)
        for fi, pts in enumerate(self.points):
            for k, (a, b) in enumerate(zip(pts, pts[1:])):
                length = math.dist(self.xz[fi][k], self.xz[fi][k + 1])
                self.graph[a].append((b, length, fi, k))
                self.graph[b].append((a, length, fi, k))
        self.dist = {p: 0.0 for p in kept if p in self.graph}
        self.prev = {}
        heap = [(0.0, p) for p in self.dist]
        heapq.heapify(heap)
        while heap:
            d, p = heapq.heappop(heap)
            if d > self.dist[p]:
                continue
            for q, length, fi, k in self.graph[p]:
                if d + length < self.dist.get(q, math.inf):
                    self.dist[q] = d + length
                    self.prev[q] = (p, fi, k)
                    heapq.heappush(heap, (d + length, q))
        # a coarse grid of every segment the game could get to
        self.cells = defaultdict(list)
        for fi, pts in enumerate(self.points):
            for k in range(len(pts) - 1):
                if pts[k] in self.dist or pts[k + 1] in self.dist:
                    self.index(self.cells, fi, k)

    def index(self, cells, fi, k):
        a, b = self.xz[fi][k], self.xz[fi][k + 1]
        n = int(math.dist(a, b) / 40) + 1
        for t in range(n + 1):
            cells[(int((a[0] + (b[0] - a[0]) * t / n) // 80), int((a[1] + (b[1] - a[1]) * t / n) // 80))].append((fi, k))

    def is_kept(self, fi, k):
        return (self.points[fi][k], self.points[fi][k + 1]) in self.kept_pairs

    def nearest(self, x, z, cells=None, reach=4000):
        """The nearest segment: (metres, feature, segment)."""
        cells = self.cells if cells is None else cells
        best, cx, cz = (math.inf, None, None), int(x // 80), int(z // 80)
        for r in range(int(reach / 80) + 2):
            for i in range(-r, r + 1):
                for j in range(-r, r + 1):
                    if max(abs(i), abs(j)) != r:
                        continue
                    for fi, k in cells.get((cx + i, cz + j), ()):
                        d = seg_dist(x, z, self.xz[fi][k], self.xz[fi][k + 1])
                        if d < best[0]:
                            best = (d, fi, k)
            if best[0] < (r - 1) * 80:
                break
        return best

    def way_back(self, point, chosen):
        """Adds the shortest way from a vertex back to the game's roads."""
        while point in self.prev:
            q, fi, k = self.prev[point]
            if (fi, k) in chosen:
                # it's already joined up from here
                return
            chosen.add((fi, k))
            point = q


class Bound:
    """MAP.inBounds, in true metres: everywhere within BOUND of a line."""

    def __init__(self):
        self.cells = set()
        self.r = math.ceil(BOUND / CELL)
        self.disc = [(i, j) for i in range(-self.r, self.r + 1) for j in range(-self.r, self.r + 1) if i * i + j * j <= self.r * self.r]

    def mark(self, a, b):
        n = math.ceil(math.dist(a, b) / 30) or 1
        for t in range(n + 1):
            cx, cz = int((a[0] + (b[0] - a[0]) * t / n) // CELL), int((a[1] + (b[1] - a[1]) * t / n) // CELL)
            for i, j in self.disc:
                self.cells.add((cx + i, cz + j))

    def has(self, x, z):
        return (int(x // CELL), int(z // CELL)) in self.cells


def choose_roads(roads, network, config, world):
    """Which of TIGER's segments the game gets: what's inside the map, and the way to every building it brings in."""
    bound = Bound()
    for e in roads["edges"]:
        for a, b in zip(e["points"], e["points"][1:]):
            bound.mark(a, b)
    for line in roads["reference"]["railroad"]["lines"]:
        for a, b in zip(line["points"], line["points"][1:]):
            bound.mark(a, b)

    def clear_of_the_opening(fi, k):
        return not any(abs(world.from_true(*network.xz[fi][i])[0]) < OPENING and abs(world.from_true(*network.xz[fi][i])[1]) < OPENING for i in (k, k + 1))

    chosen = set()
    # every little road that's already inside the map
    for fi, pts in enumerate(network.points):
        if network.records[fi].name in config["leaveOut"]:
            continue
        for k in range(len(pts) - 1):
            if network.is_kept(fi, k) or not clear_of_the_opening(fi, k):
                continue
            a, b = network.xz[fi][k], network.xz[fi][k + 1]
            if bound.has(*a) and bound.has(*b) and (pts[k] in network.dist or pts[k + 1] in network.dist):
                chosen.add((fi, k))
    print("inside the map", round(sum(math.dist(network.xz[f][k], network.xz[f][k + 1]) for f, k in chosen) / 1000, 1), "km")

    # the way back from each of those
    for fi, k in sorted(chosen):
        network.way_back(network.points[fi][k], chosen)
    print("joined up", round(sum(math.dist(network.xz[f][k], network.xz[f][k + 1]) for f, k in chosen) / 1000, 1), "km")

    # A road doesn't stop for a stretch just because nothing on that stretch needed it
    def fill_short_gaps():
        by_feature = defaultdict(list)
        for fi, k in chosen:
            by_feature[fi].append(k)
        for fi, ks in by_feature.items():
            ks.sort()
            for a, b in zip(ks, ks[1:]):
                gap = range(a + 1, b)
                if not gap or any(network.is_kept(fi, k) or not clear_of_the_opening(fi, k) for k in gap):
                    continue
                if sum(math.dist(network.xz[fi][k], network.xz[fi][k + 1]) for k in gap) <= SHORT_GAP:
                    chosen.update((fi, k) for k in gap)

    # and then round again for what that brings in, until it stops bringing in any more
    raw, _ = download(bbox_of(roads), False)
    centres = []
    for f in raw["features"]:
        cx, cz = centroid(footprint(f))
        if not (abs(world.from_true(cx, cz)[0]) < OPENING and abs(world.from_true(cx, cz)[1]) < OPENING):
            centres.append((cx, cz))
    print("buildings in the source", len(centres))
    for round_no in range(12):
        fill_short_gaps()
        for fi, k in chosen:
            bound.mark(network.xz[fi][k], network.xz[fi][k + 1])
        here = defaultdict(list)
        for fi, pts in enumerate(network.points):
            for k in range(len(pts) - 1):
                if (fi, k) in chosen or network.is_kept(fi, k):
                    network.index(here, fi, k)
        added = 0
        for cx, cz in centres:
            if not bound.has(cx, cz):
                continue
            if network.nearest(cx, cz, here, reach=ON_A_ROAD + 160)[0] <= ON_A_ROAD:
                continue
            _, fi, k = network.nearest(cx, cz)
            if fi is None or not clear_of_the_opening(fi, k) or network.is_kept(fi, k):
                continue
            pts = network.points[fi]
            start = pts[k] if network.dist.get(pts[k], math.inf) < network.dist.get(pts[k + 1], math.inf) else pts[k + 1]
            before = len(chosen)
            chosen.add((fi, k))
            network.way_back(start, chosen)
            added += len(chosen) - before
        km = sum(math.dist(network.xz[f][k], network.xz[f][k + 1]) for f, k in chosen) / 1000
        print("round", round_no, "added", added, "segments, to", round(km, 1), "km,", sum(1 for c in centres if bound.has(*c)), "buildings in reach")
        if not added:
            break
    return chosen


def lane_spec(record, config):
    named = record.name or ""
    if named in config["byName"]:
        return config["byName"][named]
    if record.mtfcc == "S1400" and named:
        return config["classes"]["S1400named"]
    return config["classes"].get(record.mtfcc) or config["classes"]["S1740"]


def moves_buildings(lane):
    """A real road's in the right place and a building beside it moves off it. Somebody's track is only roughly where TIGER has it, so it gives way to the building."""
    return bool(lane["name"]) or lane["mtfcc"] == "S1200"


def build_tiger_lanes(roads, records, config):
    """The TIGER roads, as lanes in true metres, with every vertex where TIGER has it."""
    world = World(roads)
    network = Network(roads, records)
    chosen = choose_roads(roads, network, config, world)
    lanes = []
    every = {frozenset((network.points[fi][k], network.points[fi][k + 1])) for fi, k in chosen}
    # Whether TIGER's road carries on from here, past where the game stops
    carries_on = lambda p: any(frozenset((p, q)) not in every and (p, q) not in network.kept_pairs for q, *_ in network.graph[p])
    # TIGER has the same stretch twice where a road goes by two names. It goes to the fuller name, and that's a choice to look at if it's wrong.
    by_feature, taken = defaultdict(list), set()
    for fi, k in sorted(chosen, key=lambda c: (-len(network.records[c[0]].name or ""), network.records[c[0]].linear_id, c)):
        pair = frozenset((network.points[fi][k], network.points[fi][k + 1]))
        if pair not in taken:
            taken.add(pair)
            by_feature[fi].append(k)
    for fi in sorted(by_feature, key=lambda f: (network.records[f].linear_id, f)):
        record, runs = network.records[fi], []
        for k in sorted(by_feature[fi]):
            if runs and runs[-1][-1] == k:
                runs[-1].append(k + 1)
            else:
                runs.append([k, k + 1])
        spec = lane_spec(record, config)
        for run in runs:
            lanes.append({
                "name": record.name or None, "mtfcc": record.mtfcc, "linearId": record.linear_id, "width": spec["width"], "surface": spec["surface"],
                **({"paint": True} if spec.get("paint") else {}),
                "points": [[round(network.xz[fi][i][0], 3), round(network.xz[fi][i][1], 3)] for i in run],
                "carriesOn": [[round(network.xz[fi][i][0], 3), round(network.xz[fi][i][1], 3)] for i in (run[0], run[-1]) if carries_on(network.points[fi][i])],
            })
    return lanes


# ---------------------------------------------------------------- the drives


class Places:
    """Everything a drive has to know about, in world metres, on a grid."""

    def __init__(self, cell=48):
        self.cell = cell
        self.segs = defaultdict(list)
        self.rings = defaultdict(list)
        self.ponds = defaultdict(list)
        self.all_rings = []

    def add_line(self, line, half, owner):
        for a, b in zip(line, line[1:]):
            n = int(math.dist(a, b) / (self.cell / 2)) + 1
            done = set()
            for t in range(n + 1):
                key = (int((a[0] + (b[0] - a[0]) * t / n) // self.cell), int((a[1] + (b[1] - a[1]) * t / n) // self.cell))
                if key not in done:
                    done.add(key)
                    self.segs[key].append((a, b, half, owner))

    def add_ring(self, ring, owner, store):
        x0, x1 = min(p[0] for p in ring), max(p[0] for p in ring)
        z0, z1 = min(p[1] for p in ring), max(p[1] for p in ring)
        entry = (ring, owner, x0, x1, z0, z1)
        for i in range(int((x0 - 6) // self.cell), int((x1 + 6) // self.cell) + 1):
            for j in range(int((z0 - 6) // self.cell), int((z1 + 6) // self.cell) + 1):
                store[(i, j)].append(entry)
        return entry

    def nearest_road(self, x, z, reach=5000, skip_drives=False):
        """(metres, (px, pz), half, owner) of the nearest road or drive."""
        best, cx, cz = (math.inf, None, 0, None), int(x // self.cell), int(z // self.cell)
        for r in range(int(reach / self.cell) + 2):
            for i in range(-r, r + 1):
                for j in range(-r, r + 1):
                    if max(abs(i), abs(j)) != r:
                        continue
                    for a, b, half, owner in self.segs.get((cx + i, cz + j), ()):
                        if skip_drives and owner and owner.startswith("drive"):
                            continue
                        dx, dz = b[0] - a[0], b[1] - a[1]
                        l2 = dx * dx + dz * dz
                        t = max(0, min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)) if l2 else 0
                        px, pz = a[0] + dx * t, a[1] + dz * t
                        d = math.hypot(x - px, z - pz)
                        if d < best[0]:
                            best = (d, (px, pz), half, owner)
            if best[0] < (r - 1) * self.cell:
                break
        return best

    def near(self, store, x, z):
        return store.get((int(x // self.cell), int(z // self.cell)), ())


def ring_gap(x, z, entry):
    """How far a point is from a footprint, 0 if it's in it."""
    ring, _, x0, x1, z0, z1 = entry
    if x < x0 - 8 or x > x1 + 8 or z < z0 - 8 or z > z1 + 8:
        return 8
    if inside(x, z, ring):
        return 0
    return min(seg_dist(x, z, a, b) for a, b in zip(ring, ring[1:] + ring[:1]))


def rounded(pts):
    """Cuts the corners, twice, so that a drive that's had to find its way round something doesn't turn like a ruler. Its ends stay where they are."""
    for _ in range(2):
        out = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            out += [(a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25), (a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75)]
        out.append(pts[-1])
        pts = out
    return pts


class Drives:
    def __init__(self, roads, lanes, structures, water, config):
        self.world = World(roads)
        self.places = Places()
        self.config = config
        self.margin = DRIVE_CLEAR
        self.rail = self.world.rail
        self.river = self.world.river
        for width, line in self.world.roads:
            self.places.add_line(line, width / 2, "road")
        for lane in lanes:
            self.places.add_line([self.world.point(*p) for p in lane["points"]], lane["width"] / 2, lane.get("id"))
        self.entries = {}
        for s in structures:
            ring = [self.world.point(s["x"] + p[0], s["z"] + p[1]) for p in s["ring"]]
            self.entries[s["id"]] = self.places.add_ring(ring, s["id"], self.places.rings)
        for p in water["ponds"]:
            self.places.add_ring([self.world.point(*q) for q in p["ring"]], p["id"], self.places.ponds)

    def rail_crossed(self, a, b):
        for line in self.rail:
            for c, d in zip(line, line[1:]):
                if max(a[0], b[0]) < min(c[0], d[0]) or min(a[0], b[0]) > max(c[0], d[0]) or max(a[1], b[1]) < min(c[1], d[1]) or min(a[1], b[1]) > max(c[1], d[1]):
                    continue
                side = lambda o, p, q: (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
                if side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0:
                    return True
        return False

    def spot_clear(self, x, z, own):
        if abs(x) < OPENING and abs(z) < OPENING:
            return False
        for entry in self.places.near(self.places.rings, x, z):
            if ring_gap(x, z, entry) < (1.0 if entry[1] == own else self.margin):
                return False
        for entry in self.places.near(self.places.ponds, x, z):
            if ring_gap(x, z, entry) < 1.5:
                return False
        return self.river_gap(x, z) >= RIVER_GAP

    def river_gap(self, x, z):
        cell = (int(x // 64), int(z // 64))
        if not hasattr(self, "river_cells"):
            self.river_cells = defaultdict(list)
            for line in self.river:
                for a, b in zip(line, line[1:]):
                    n = int(math.dist(a, b) / 32) + 1
                    for t in range(n + 1):
                        i, j = int((a[0] + (b[0] - a[0]) * t / n) // 64), int((a[1] + (b[1] - a[1]) * t / n) // 64)
                        for u in (i - 1, i, i + 1):
                            for v in (j - 1, j, j + 1):
                                self.river_cells[(u, v)].append((a, b))
        return min((seg_dist(x, z, a, b) for a, b in self.river_cells.get(cell, ())), default=99)

    def line_clear(self, a, b, own, rail_ok=False):
        if not rail_ok and self.rail_crossed(a, b):
            return False
        n = int(math.dist(a, b) / 1.5) + 1
        return all(self.spot_clear(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, own) for t in range(n + 1))

    def path_clear(self, pts, own, rail_ok=False):
        return all(self.line_clear(a, b, own, rail_ok) for a, b in zip(pts, pts[1:]))

    def where_it_stops(self, s, entry):
        """Beside the door, on the side of it towards the road, a few metres off the wall."""
        ring, *_ = entry
        cx, cz = centroid(ring)
        _, on, _, _ = self.places.nearest_road(cx, cz)
        i = s.get("door", 0) % len(ring)
        a, b = ring[i], ring[(i + 1) % len(ring)]
        ex, ez = b[0] - a[0], b[1] - a[1]
        length = math.hypot(ex, ez) or 1
        nx, nz = ez / length, -ex / length
        mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
        if nx * (mx - cx) + nz * (mz - cz) < 0:
            nx, nz = -nx, -nz
        if nx * (on[0] - mx) + nz * (on[1] - mz) < 0:
            # the door's round the back, so it stops at the wall that's nearest the road
            best = min(zip(ring, ring[1:] + ring[:1]), key=lambda e: math.hypot((e[0][0] + e[1][0]) / 2 - on[0], (e[0][1] + e[1][1]) / 2 - on[1]))
            a, b = best
            ex, ez = b[0] - a[0], b[1] - a[1]
            length = math.hypot(ex, ez) or 1
            nx, nz = ez / length, -ex / length
            mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            if nx * (mx - cx) + nz * (mz - cz) < 0:
                nx, nz = -nx, -nz
        side = 1 if (s["id"] >> 3) & 1 else -1
        along = min(length * .32, 4.5)
        ux, uz = ex / length, ez / length
        for off in (OFF_THE_WALL, OFF_THE_WALL + 2):
            for k in (side, -side, 0):
                t = (mx + nx * off + ux * along * k, mz + nz * off + uz * along * k)
                if self.spot_clear(t[0], t[1], s["id"]):
                    return t
        # anywhere round it, nearest the road first
        spots = []
        for a, b in zip(ring, ring[1:] + ring[:1]):
            length = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
            nx, nz = (b[1] - a[1]) / length, -(b[0] - a[0]) / length
            mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
            if nx * (mx - cx) + nz * (mz - cz) < 0:
                nx, nz = -nx, -nz
            for off in (2.2, OFF_THE_WALL, 6, 9):
                spots.append((mx + nx * off, mz + nz * off))
        spots.sort(key=lambda t: math.hypot(t[0] - on[0], t[1] - on[1]))
        return next((t for t in spots if self.spot_clear(t[0], t[1], s["id"])), None)

    def bowed(self, a, b, seed):
        """A drive's not ruled: it wanders a little, by a hash of whose it is."""
        length = math.dist(a, b)
        if length < 26:
            return [a, b]
        nx, nz = -(b[1] - a[1]) / length, (b[0] - a[0]) / length
        h = ((seed * 2654435761) % (1 << 32)) / (1 << 32)
        bow = (h - .5) * 2 * min(length * .1, 7)
        c = ((a[0] + b[0]) / 2 + nx * bow, (a[1] + b[1]) / 2 + nz * bow)
        steps = 6
        return [((1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t * t * b[1]) for t in (i / steps for i in range(steps + 1))]

    def around(self, target, own, cell=4.0, limit=30000):
        """Finds its way round what's in the way, on a grid, out to the nearest road. A coarser grid gets further, and a finer one gets through more."""
        start = (round(target[0] / cell), round(target[1] / cell))
        best = {start: 0.0}
        came = {}
        heap = [(0.0, start)]
        seen = 0
        cost_rail = 400
        while heap and seen < limit:
            d, at = heapq.heappop(heap)
            if d > best[at]:
                continue
            seen += 1
            here = (at[0] * cell, at[1] * cell)
            road = self.places.nearest_road(here[0], here[1], reach=cell * 2)
            if road[0] <= road[2] + cell * .4 and (cell <= 4 or self.line_clear(road[1], here, own, True)):
                pts = [road[1], here]
                while at != start:
                    at = came[at]
                    pts.append((at[0] * cell, at[1] * cell))
                pts[-1] = target
                return self.pulled(pts, own)
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if not dx and not dz:
                        continue
                    nb = (at[0] + dx, at[1] + dz)
                    there = (nb[0] * cell, nb[1] * cell)
                    step = cell * math.hypot(dx, dz)
                    if not self.spot_clear(there[0], there[1], own):
                        continue
                    # further than a building's width apart, a step could go right through one
                    if cell > 4 and not self.line_clear(here, there, own, True):
                        continue
                    extra = cost_rail if self.rail_crossed(here, there) else 0
                    nd = d + step + extra
                    if nd < best.get(nb, math.inf):
                        best[nb] = nd
                        came[nb] = at
                        heapq.heappush(heap, (nd, nb))
        return None

    def pulled(self, pts, own):
        """Takes out the grid's corners wherever a straight line will do."""
        out = [pts[0]]
        i = 0
        while i < len(pts) - 1:
            j = len(pts) - 1
            while j > i + 1 and not self.line_clear(pts[i], pts[j], own, rail_ok=self.path_crosses_rail(pts[i : j + 1])):
                j -= 1
            out.append(pts[j])
            i = j
        return out

    def path_crosses_rail(self, pts):
        return any(self.rail_crossed(a, b) for a, b in zip(pts, pts[1:]))

    def drive_to(self, s):
        entry = self.entries[s["id"]]
        target = self.where_it_stops(s, entry)
        if target is None:
            return None, "no room"
        d, on, half, owner = self.places.nearest_road(target[0], target[1])
        if d <= half + FRONTING:
            return None, "fronts"
        # straight, or as near as, to whatever's nearest, and then to the nearest real road, and failing that round whatever's in the way
        tries = [on]
        if owner and str(owner).startswith("drive"):
            real = self.places.nearest_road(target[0], target[1], skip_drives=True)
            tries.append(real[1])
        for start in tries:
            for pts in (self.bowed(start, target, s["id"]), [start, target]):
                if self.path_clear(pts, s["id"]):
                    return pts, "straight"
        for cell, limit in ((4.0, 30000), (10.0, 40000), (2.0, 60000)):
            pts = self.around(target, s["id"], cell, limit)
            if pts and self.path_clear(pts[1:], s["id"], rail_ok=True):
                soft = rounded(pts)
                return (soft if self.path_clear(soft[1:], s["id"], rail_ok=True) else pts), "round"
        return None, "stuck"

    def bypass(self, a, b):
        """A way round a building for a track that TIGER has going through it, from one bit of the track to the next."""
        goal, start = (round(b[0] / 4), round(b[1] / 4)), (round(a[0] / 4), round(a[1] / 4))
        best, came, heap, seen = {start: 0.0}, {}, [(0.0, start)], 0
        while heap and seen < 12000:
            _, cell = heapq.heappop(heap)
            seen += 1
            if cell == goal:
                pts = [b]
                while cell != start:
                    cell = came[cell]
                    pts.append((cell[0] * 4.0, cell[1] * 4.0))
                pts[-1] = a
                pts.reverse()
                return self.pulled(pts, None)
            for dx in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    if not dx and not dz:
                        continue
                    nb = (cell[0] + dx, cell[1] + dz)
                    if nb != goal and not self.spot_clear(nb[0] * 4.0, nb[1] * 4.0, None):
                        continue
                    nd = best[cell] + 4 * math.hypot(dx, dz)
                    if nd < best.get(nb, math.inf):
                        best[nb], came[nb] = nd, cell
                        heapq.heappush(heap, (nd + math.hypot((nb[0] - goal[0]) * 4, (nb[1] - goal[1]) * 4), nb))
        return None


def measured_lanes(roads, lanes, config):
    """Somebody's real drive, measured on the aerial, where TIGER hasn't got it and a generated one would go through the woods. Each starts at the nearest vertex of what's there, so that it's joined up."""
    out = []
    for m in config.get("measured", []):
        pts = [list(p) for p in m["points"]]
        others = [p for e in roads["edges"] for p in e["points"]] + [p for lane in lanes + out for p in lane["points"]]
        near = min(others, key=lambda p: math.dist(p, pts[0]))
        if math.dist(near, pts[0]) > MEASURED_JOIN:
            raise SystemExit("a measured drive starts %.0f m from anything: %s" % (math.dist(near, pts[0]), pts[0]))
        out.append({"name": None, "mtfcc": "S1740", "linearId": None, "width": m["width"], "surface": m["surface"], "measured": True, "points": pts if list(near) == pts[0] else [list(near), *pts]})
    return out


def build_drives(roads, lanes, structures, water, config):
    """A drive up to every building that's not on the road or beside one that has a drive."""
    maker = Drives(roads, lanes, structures, water, config)
    world, places = maker.world, maker.places
    own = set(config["ownDrive"])
    wants = [s for s in structures if s["id"] not in own and not (abs(world.point(s["x"], s["z"])[0]) < OPENING and abs(world.point(s["x"], s["z"])[1]) < OPENING)]
    # nearest the road first, so that the ones behind them can branch off their drives, and sheds after houses
    wants.sort(key=lambda s: (s["use"] == "shed", places.nearest_road(*world.point(s["x"], s["z"]))[0], s["id"]))
    drives, tally, stuck = [], defaultdict(int), []
    # a shed by a building that has its own way in doesn't need one either
    served = [world.point(s["x"], s["z"]) for s in structures if s["id"] in own]
    for s in wants:
        at = world.point(s["x"], s["z"])
        if s["use"] == "shed" and any(math.hypot(at[0] - p[0], at[1] - p[1]) < SHED_NEAR for p in served):
            tally["shed by a house"] += 1
            continue
        served.append(at)
        stuck.append(s)

    def attempt(s):
        pts, how = maker.drive_to(s)
        if pts is None:
            return how
        spec = config["drive"]
        places.add_line(pts, spec["width"] / 2, "drive_%d" % s["id"])
        drives.append({"id": "drive_%d" % s["id"], "structure": s["id"], "generated": True, "width": spec["width"], "surface": spec["surface"], "points": [[round(p[0] + world.bridge_x, 2), round(p[1] + world.bridge_z, 2)] for p in pts]})
        return how

    # again for whatever's left, because a drive made later can be the way in for one that was stuck. And one last time with less room past the walls.
    for margin in (DRIVE_CLEAR, DRIVE_CLEAR, DRIVE_CLEAR, 1.0):
        maker.margin = margin
        left = []
        for s in stuck:
            how = attempt(s)
            if how == "stuck" or how == "no room":
                left.append(s)
            else:
                tally[how] += 1
        progress = len(left) < len(stuck)
        stuck = left
        if not stuck or (not progress and margin != DRIVE_CLEAR):
            break
    maker.margin = DRIVE_CLEAR
    tally["stuck"] = len(stuck)
    for s in stuck:
        print("no drive for", s["id"], s["use"], [round(v) for v in world.point(s["x"], s["z"])])
    print("drives", len(drives), dict(tally), "km", round(sum(math.dist(a, b) for d in drives for a, b in zip(d["points"], d["points"][1:])) / 1000, 1))
    return drives


def clear_of_buildings(lanes, structures):
    """Somebody's track gives way to a building, a segment at a time. Returns what's left of the lanes and the gaps in them, each with the lane it's from."""
    rings = defaultdict(list)
    for s in structures:
        ring = [(s["x"] + p[0], s["z"] + p[1]) for p in s["ring"]]
        x0, x1 = min(p[0] for p in ring), max(p[0] for p in ring)
        z0, z1 = min(p[1] for p in ring), max(p[1] for p in ring)
        entry = (ring, s["id"], x0, x1, z0, z1)
        for i in range(int((x0 - 8) // 32), int((x1 + 8) // 32) + 1):
            for j in range(int((z0 - 8) // 32), int((z1 + 8) // 32) + 1):
                rings[(i, j)].append(entry)
    out, gaps = [], []
    for lane in lanes:
        if moves_buildings(lane):
            out.append(lane)
            continue
        half = lane["width"] / 2 + 1
        keep, run = [], []
        for a, b in zip(lane["points"], lane["points"][1:]):
            n = int(math.dist(a, b) / 1.5) + 1
            hit = any(ring_gap(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n, e) < half for t in range(n + 1) for e in rings.get((int((a[0] + (b[0] - a[0]) * t / n) // 32), int((a[1] + (b[1] - a[1]) * t / n) // 32)), ()))
            if hit:
                if len(run) > 1:
                    keep.append(run)
                run = []
            else:
                if not run:
                    run = [a]
                run.append(b)
        if len(run) > 1:
            keep.append(run)
        for r in keep:
            out.append({**lane, "points": r})
        gaps += [(a[-1], b[0], lane) for a, b in zip(keep, keep[1:])]
    return out, gaps


def split_off(lanes, roads):
    """Which lanes are joined to the game's roads by shared vertices, and the pieces that aren't, as lists of indexes."""
    kept = {tuple(p) for e in roads["edges"] for p in e["points"]}
    at = defaultdict(set)
    for i, lane in enumerate(lanes):
        for p in lane["points"]:
            at[tuple(p)].add(i)
    seen = set()

    def spread(queue):
        out = []
        while queue:
            i = queue.pop()
            if i in seen:
                continue
            seen.add(i)
            out.append(i)
            for p in lanes[i]["points"]:
                queue.extend(at[tuple(p)] - seen)
        return out

    joined = spread([i for i, lane in enumerate(lanes) if any(tuple(p) in kept for p in lane["points"])])
    return joined, [spread([i]) for i in range(len(lanes)) if i not in seen]


def reconnected(lanes, roads, finder):
    """Where a building's taken a piece out of somebody's track, whatever that's cut off gets a generated way back to the rest, nearest first."""
    joined, pieces = split_off(lanes, roads)
    world, places = finder.world, Places()
    for width, line in world.roads:
        places.add_line(line, width / 2, "road")
    out = [lanes[i] for i in joined]
    for lane in out:
        places.add_line([world.point(*p) for p in lane["points"]], lane["width"] / 2, "lane")
    linked = lost = 0
    while pieces:
        options = []
        for piece in pieces:
            rows = sorted(((places.nearest_road(*world.point(*p), reach=LINK_REACH)[0], tuple(p)) for i in piece for p in lanes[i]["points"]), key=lambda r: r[0])
            options.append((rows[0][0], len(options), rows))
        _, which, rows = min(options)
        piece = pieces.pop(which)
        pts = None
        for d, p in rows[:6]:
            if d > LINK_REACH:
                break
            pts = finder.bypass(world.point(*p), places.nearest_road(*world.point(*p), reach=LINK_REACH)[1])
            if pts:
                pts = [[round(q[0] + world.bridge_x, 3), round(q[1] + world.bridge_z, 3)] for q in pts]
                pts[0] = list(p)
                break
        if not pts:
            lost += 1
            continue
        first = lanes[piece[0]]
        link = {"name": None, "mtfcc": first["mtfcc"], "linearId": first["linearId"], "width": first["width"], "surface": first["surface"], "generated": True, "points": pts}
        for lane in [*(lanes[i] for i in piece), link]:
            out.append(lane)
            places.add_line([world.point(*p) for p in lane["points"]], lane["width"] / 2, "lane")
        linked += 1
    print("pieces cut off: linked back", linked, "left out", lost)
    return out


def closed_ends(lanes, roads):
    """Where a road stops in the game and carries on in TIGER, at the end of a lane that nothing else joins. It gets a barricade, as the graph's own do."""
    uses = defaultdict(int)
    for lane in lanes:
        for p in lane["points"]:
            uses[tuple(p)] += 1
    for e in roads["edges"]:
        for p in e["points"]:
            uses[tuple(p)] += 1
    out = []
    for lane in lanes:
        for p in (lane["points"][0], lane["points"][-1]):
            if p in lane.get("carriesOn", ()) and uses[tuple(p)] == 1:
                out.append({"road": lane["id"], "x": p[0], "z": p[1]})
    return out


def crossings_of(lanes, roads, drives):
    """Where a lane crosses the river or the tracks, in the same form as reference.crossings in data/roads.json. TIGER gives a road and a railroad a shared vertex where they cross."""
    out = []
    side = lambda o, p, q: (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    uses = defaultdict(int)
    for lane in lanes:
        for p in lane["points"]:
            uses[tuple(p)] += 1
    for kind, lines in (("river", roads["reference"]["river"]["lines"]), ("railroad", roads["reference"]["railroad"]["lines"])):
        segs = [(a, b) for line in lines for a, b in zip(line["points"], line["points"][1:])]
        vertices = {tuple(p) for line in lines for p in line["points"]}
        seen = set()
        for lane in [*lanes, *drives]:
            pts = lane["points"]
            for i, p in enumerate(pts):
                # an end of a lane only crosses if another lane carries on from it
                if tuple(p) in vertices and tuple(p) not in seen and (0 < i < len(pts) - 1 or uses[tuple(p)] > 1):
                    seen.add(tuple(p))
                    out.append({"road": lane["id"], "with": kind, "x": round(p[0], 3), "z": round(p[1], 3)})
            for a, b in zip(pts, pts[1:]):
                for c, d in segs:
                    if max(a[0], b[0]) < min(c[0], d[0]) or min(a[0], b[0]) > max(c[0], d[0]) or max(a[1], b[1]) < min(c[1], d[1]) or min(a[1], b[1]) > max(c[1], d[1]):
                        continue
                    s1, s2, s3, s4 = side(a, b, c), side(a, b, d), side(c, d, a), side(c, d, b)
                    if s1 * s2 < 0 and s3 * s4 < 0:
                        t = s3 / (s3 - s4)
                        out.append({"road": lane["id"], "with": kind, "x": round(a[0] + (b[0] - a[0]) * t, 3), "z": round(a[1] + (b[1] - a[1]) * t, 3)})
    return out


# ---------------------------------------------------------------- the file


def source_files():
    out = []
    for rel in ROAD_FILES:
        body = (RAW_DIR / Path(rel).name).read_bytes()
        out.append({"path": rel, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()})
    return out


def render(lanes, drives, crossings, closed, config):
    head = {"version": 1, "units": "m", "source": {"vintage": VINTAGE, "baseUrl": BASE_URL, "files": source_files()}, "classes": config["classes"], "drive": config["drive"]}
    lines = ["{"]
    for k, v in head.items():
        lines.append("  %s: %s," % (json.dumps(k), json.dumps(v, ensure_ascii=False)))
    for key, rows in (("lanes", lanes), ("drives", drives), ("crossings", crossings), ("closed", closed)):
        lines.append('  "%s": [' % key)
        lines += ["    %s%s" % (json.dumps(r, separators=(",", ":"), ensure_ascii=False), "," if i < len(rows) - 1 else "") for i, r in enumerate(rows)]
        lines.append("  ]," if key != "closed" else "  ]")
    lines += ["}", ""]
    return "\n".join(lines)


def build():
    roads = json.loads(ROADS.read_text())
    config = json.loads(CONFIG.read_text())
    structures_file = json.loads(STRUCTURES.read_text())
    structures = structures_file["structures"] + structures_file["extras"]
    water = json.loads(WATER.read_text())
    tiger = build_tiger_lanes(roads, read_road_records(), config)
    lanes, gaps = clear_of_buildings(tiger + measured_lanes(roads, tiger, config), structures)
    # the way round a building where a track goes through one
    finder, bypasses = Drives(roads, [], structures, water, config), []
    for a, b, lane in gaps:
        w = finder.world
        pts = finder.bypass(w.point(*a), w.point(*b))
        if pts:
            pts = [[round(p[0] + w.bridge_x, 3), round(p[1] + w.bridge_z, 3)] for p in pts]
            pts[0], pts[-1] = a, b
            bypasses.append({"name": lane["name"], "mtfcc": lane["mtfcc"], "linearId": lane["linearId"], "width": lane["width"], "surface": lane["surface"], "generated": True, "points": pts})
    print("gaps", len(gaps), "ways round", len(bypasses))
    lanes = reconnected(lanes + bypasses, roads, finder)
    # after TIGER's, so that adding one doesn't renumber them
    lanes.sort(key=lambda lane: bool(lane.get("measured")))
    for i, lane in enumerate(lanes):
        lane["id"] = "lane_%d" % (i + 1)
        for k in ("id", "name", "mtfcc", "linearId", "width", "surface", "points"):
            lane[k] = lane.pop(k)
    drives = build_drives(roads, lanes, structures, water, config)
    crossings = crossings_of(lanes, roads, drives)
    closed = closed_ends(lanes, roads)
    for lane in lanes:
        lane.pop("carriesOn", None)
    print("lanes", len(lanes), "km", round(sum(math.dist(a, b) for l in lanes for a, b in zip(l["points"], l["points"][1:])) / 1000, 1), "crossings", [(c["road"], c["with"]) for c in crossings], "closed", len(closed))
    return render(lanes, drives, crossings, closed, config)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = build()
    if args.check:
        if not OUT.exists() or OUT.read_text() != text:
            raise SystemExit("data/lanes.json isn't what this builds")
        print("data/lanes.json is what this builds")
        return
    OUT.write_text(text)
    print("wrote", OUT, OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
