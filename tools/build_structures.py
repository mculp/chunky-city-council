#!/usr/bin/env python3
"""Build data/structures.json from FEMA / ORNL USA Structures, USDA NAIP and tools/structure_notes.json.

    .venv/bin/python tools/build_structures.py [--refresh]

The downloads are cached in data/raw/structures/, which is gitignored. --refresh fetches them again.
data/structures.md says what comes out, and where it's from.
"""
import argparse
import hashlib
import json
import math
import statistics
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_roads import compress_x, to_lonlat, to_xz  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "structures"
ROADS = ROOT / "data" / "roads.json"
NOTES = Path(__file__).parent / "structure_notes.json"
LANE_CONFIG = Path(__file__).parent / "lane_config.json"
OUT = ROOT / "data" / "structures.json"

SERVICE = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query"
ITEM = "https://www.arcgis.com/home/item.html?id=0ec8512ad21e4bb987d7e848d14e7e24"
ATTRIBUTION = "Oak Ridge National Laboratory (ORNL); Federal Emergency Management Agency (FEMA) Geospatial Response Office"
LICENSE = "CC BY 4.0"
FIELDS = "OBJECTID,BUILD_ID,OCC_CLS,PRIM_OCC,SEC_OCC,HEIGHT,SQMETERS,LONGITUDE,LATITUDE,SOURCE,IMAGE_DATE"
PAGE = 1000
MARGIN_M = 400  # How far past the road graph to look. BOUND has the last word on what's kept.
BOUND = 280  # The same reach as MAP.inBounds in src/map.js: past this it's woods nobody walks.

NAIP = "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage"
NAIP_TILE_M = 1000  # At 1 m a pixel, which is plenty for one colour a roof.

OPENING_M = 150  # Nothing stands within this of the bridge, in world metres: the opening scene has to stay as it was.
CLEARANCE_M = 1.0  # Between two buildings a compressed stretch of road has pushed together.
ROAD_CLEAR_M = 1.5  # Past the road's edge.
ROAD_NUDGE_M = 8.0  # How far a real building gets moved off a road before it's given up on.
RAIL_CLEAR_M = 5.0  # Past the middle of the track.
RIVER_CLEAR_M = 22.0  # Past the middle of the river, where the bank has come up to the level of the land.

# What a building of each use looks like when nobody's looked at it: (walls, roof, roof material, floors)
WALL_COLORS = {"white": "#c9c1b4", "cream": "#c8b88e", "tan": "#a78f6c", "yellow": "#c7b35a", "grey": "#6d6a72", "red": "#7a3328", "brown": "#5f4632", "blue": "#55708a", "green": "#5b7a5a"}
WALL_DEFAULT = {"brick": "#8a4a38", "block": "#9a9488", "metal": "#8d8f8c", "mobile": "#b9b3a6", "plank": "#6f5a44", "siding": "#c9c1b4", "stucco": "#b5a78c"}
ROOF_DEFAULT = {"shingle": "#3d3a3c", "metal": "#7b7f80"}
USES = {
    "Single Family Dwelling": "house", "Manufactured Home": "mobile", "Unclassified": "shed", "Agriculture": "farm", "General Services": "public",
    "Retail Trade": "shop", "Professional/Technical Services": "office", "Religious": "church", "Temporary Lodging": "cabin", "Entertainment and Recreation": "hall", "Institutional Dormitory": "public", "Personal and Repair Services": "shop", "Light": "shop",
}


def bbox_of(roads):
    """West, south, east and north of the road graph, in degrees, with MARGIN_M to spare."""
    lons, lats = [], []
    for edge in roads["edges"]:
        for lon, lat in edge["lonlat"]:
            lons.append(lon)
            lats.append(lat)
    x0, z1 = to_xz((min(lons), min(lats)))
    x1, z0 = to_xz((max(lons), max(lats)))
    west, south = to_lonlat(x0 - MARGIN_M, z1 + MARGIN_M)
    east, north = to_lonlat(x1 + MARGIN_M, z0 - MARGIN_M)
    return round(west, 6), round(south, 6), round(east, 6), round(north, 6)


def download(bbox, refresh):
    """Every feature in the box, from the cache if it's there, with the hash of what was fetched."""
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / ("usa_structures_%s.json" % "_".join(str(v) for v in bbox))
    if cache.exists() and not refresh:
        text = cache.read_text()
    else:
        features, offset = [], 0
        while True:
            query = urllib.parse.urlencode({
                "where": "1=1", "geometry": ",".join(str(v) for v in bbox), "geometryType": "esriGeometryEnvelope",
                "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": FIELDS, "outSR": 4326, "f": "json",
                "resultOffset": offset, "resultRecordCount": PAGE, "orderByFields": "OBJECTID",
            })
            with urllib.request.urlopen(SERVICE + "?" + query, timeout=120) as response:
                page = json.load(response)
            if "error" in page:
                raise SystemExit("the service said: %s" % page["error"])
            features += page.get("features", [])
            offset += len(page.get("features", []))
            print("fetched", len(features))
            if not page.get("exceededTransferLimit") or not page.get("features"):
                break
            time.sleep(.5)
        text = json.dumps({"fetched": time.strftime("%Y-%m-%d"), "bbox": bbox, "features": features}, indent=0)
        cache.write_text(text)
    return json.loads(text), hashlib.sha256(text.encode()).hexdigest()


def everything(roads, refresh=False):
    """What's in the box round the road graph, and in any box a road taken further than that needs. It says what it fetched."""
    raw, sha = download(bbox_of(roads), refresh)
    seen, also = {f["attributes"]["OBJECTID"] for f in raw["features"]}, []
    for reach in json.loads(LANE_CONFIG.read_text()).get("reachOut", []):
        if "box" not in reach:   # what the road's own box has already fetched will do
            continue
        x0, z0, x1, z1 = reach["box"]
        west, south = to_lonlat(x0, z1)
        east, north = to_lonlat(x1, z0)
        box = (round(west, 5), round(south, 5), round(east, 5), round(north, 5))
        more, more_sha = download(box, refresh)
        new = [f for f in more["features"] if f["attributes"]["OBJECTID"] not in seen]
        seen |= {f["attributes"]["OBJECTID"] for f in new}
        raw["features"] += new
        also.append({"fetched": more["fetched"], "sha256": more_sha, "bbox": list(box), "features": len(more["features"])})
    return raw, sha, also


# ---------------------------------------------------------------- shapes


def signed_area(ring):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1])) / 2


def centroid(ring):
    a = signed_area(ring)
    if abs(a) < 1e-6:
        return sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
    cx = sum((p[0] + q[0]) * (p[0] * q[1] - q[0] * p[1]) for p, q in zip(ring, ring[1:] + ring[:1])) / (6 * a)
    cz = sum((p[1] + q[1]) * (p[0] * q[1] - q[0] * p[1]) for p, q in zip(ring, ring[1:] + ring[:1])) / (6 * a)
    return cx, cz


def simplify(ring):
    """The ring without repeated corners, or corners that are really a straight wall."""
    out = []
    for p in ring:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > .05:
            out.append(p)
    if len(out) > 1 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= .05:
        out.pop()
    changed = True
    while changed and len(out) > 3:
        changed = False
        for i in range(len(out)):
            a, b, c = out[i - 1], out[i], out[(i + 1) % len(out)]
            cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
            if abs(cross) < .1 * math.hypot(b[0] - a[0], b[1] - a[1]) * math.hypot(c[0] - b[0], c[1] - b[1]) * .17:
                out.pop(i)
                changed = True
                break
    return out


def footprint(feature):
    """The biggest ring of a feature, in true metres, wound the same way every time."""
    rings = [simplify([to_xz(p) for p in ring]) for ring in feature["geometry"]["rings"]]
    ring = max(rings, key=lambda r: abs(signed_area(r)))
    return ring if signed_area(ring) > 0 else ring[::-1]


def clip_ring(ring, axis, maximum):
    """The part of a ring on the near side of a line, for a footprint that took in something that isn't building."""
    i, out = ("xz".index(axis)), []
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if a[i] <= maximum:
            out.append(a)
        if (a[i] <= maximum) != (b[i] <= maximum):
            t = (maximum - a[i]) / (b[i] - a[i])
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return simplify(out)


def seg_dist(px, pz, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    l2 = dx * dx + dz * dz
    t = max(0, min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) if l2 else 0
    return math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t)


def inside(px, pz, ring):
    hit = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > pz) != (b[1] > pz) and px < a[0] + (b[0] - a[0]) * (pz - a[1]) / (b[1] - a[1]):
            hit = not hit
    return hit


def rings_touch(ring_a, ring_b, gap):
    """Whether two footprints overlap, or come within gap of each other."""
    if inside(ring_a[0][0], ring_a[0][1], ring_b) or inside(ring_b[0][0], ring_b[0][1], ring_a):
        return True
    edges_a, edges_b = list(zip(ring_a, ring_a[1:] + ring_a[:1])), list(zip(ring_b, ring_b[1:] + ring_b[:1]))
    side = lambda o, p, q: (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
    for a, b in edges_a:
        for c, d in edges_b:
            if side(a, b, c) * side(a, b, d) < 0 and side(c, d, a) * side(c, d, b) < 0:
                return True
            if gap and min(seg_dist(a[0], a[1], c, d), seg_dist(b[0], b[1], c, d), seg_dist(c[0], c[1], a, b), seg_dist(d[0], d[1], a, b)) < gap:
                return True
    return False


# ---------------------------------------------------------------- the world, as src/map.js has it


class World:
    """toWorld from src/map.js: the true map moved over so the bridge is the origin, with its one bent road."""

    def __init__(self, roads, lanes=()):
        self.bands = roads["compression"]
        edges = {e["id"]: e for e in roads["edges"]}
        opening = roads["opening"]
        crossing = next(c for c in roads["reference"]["crossings"] if c["road"] == opening["road"] and c["with"] == "river")
        self.bridge_x, self.bridge_z = crossing["x"], crossing["z"]
        self.roads = []
        for r in roads["roads"]:
            line = [self.point(*p) for p in self.walk(r, edges)]
            self.roads.append((r["width"], self.bend(line, opening) if r["id"] == opening["road"] else line))
        # the smaller roads: a building moves off a real road, but somebody's track gives way to the building (build_lanes.py)
        self.tracks = []
        for lane in lanes:
            line = [self.point(*p) for p in lane["points"]]
            if lane["name"] or lane["mtfcc"] == "S1200":
                self.roads.append((lane["width"], line))
            else:
                self.tracks.append((lane["width"], line))
        self.rail = [[self.point(*p) for p in l["points"]] for l in roads["reference"]["railroad"]["lines"]]
        self.river = [[self.point(*p) for p in l["points"]] for l in roads["reference"]["river"]["lines"]]

    @staticmethod
    def walk(road, edges):
        pts = []
        for i, eid in enumerate(road["edges"]):
            pts += edges[eid]["points"][1 if i else 0:]
        return pts

    @staticmethod
    def bend(pts, opening):
        """bendOpeningRoad from src/map.js, near enough to keep buildings off it: straight between its ends, and a chord to where it rejoins."""
        pts = pts if pts[0][0] < pts[-1][0] else pts[::-1]
        near = lambda q: min(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - q[0], pts[i][1] - q[1]))
        a, b = near(opening["joinWest"]), near(opening["joinEast"])
        return [*pts[: a + 1], (opening["west"], 0), (opening["east"], 0), *pts[b:]]

    def point(self, x, z):
        return x - self.bridge_x, z - self.bridge_z

    def from_true(self, x, z):
        return self.point(compress_x(x, self.bands), z)

    @staticmethod
    def nearest(px, pz, lines):
        return min((seg_dist(px, pz, a, b) for l in lines for a, b in zip(l, l[1:])), default=math.inf)

    def nearest_road(self, px, pz):
        best, width, on = math.inf, 0, None
        for w, l in [*self.roads, *self.tracks]:
            for a, b in zip(l, l[1:]):
                d = seg_dist(px, pz, a, b)
                if d < best:
                    best, width, on = d, w, (a, b)
        return best, width, on


# ---------------------------------------------------------------- what they look like


def pick(seed, options):
    return options[seed % len(options)]


def looks_of(use, sqm, seed):
    """What a building looks like when nobody has looked at it: from its use and size, chosen by its id."""
    if use == "mobile":
        return {"walls": "mobile", "roof": "gable", "roofMat": "metal", "floors": 1, "wallColor": pick(seed, ["white", "cream", "tan", "grey", "white", "blue"])}
    if use == "house":
        if sqm < 70:
            return {"walls": "siding", "roof": "gable", "roofMat": pick(seed, ["metal", "shingle"]), "floors": 1, "wallColor": pick(seed >> 2, ["white", "tan", "grey", "cream"])}
        brick = sqm > 130 and seed % 5 < 2
        return {"walls": "brick" if brick else "siding", "roof": pick(seed >> 1, ["hip", "gable"]) if brick else pick(seed >> 1, ["gable", "gable", "hip"]), "roofMat": pick(seed >> 3, ["shingle", "shingle", "shingle", "metal"]), "floors": 1,
                "porch": pick(seed >> 4, ["none", "front", "none"]), "carport": sqm > 170 and seed % 3 == 0, **({} if brick else {"wallColor": pick(seed >> 2, ["white", "white", "cream", "tan", "yellow", "grey", "blue"])})}
    if use == "cabin":
        return {"walls": "siding", "roof": "gable", "roofMat": "metal", "floors": 1, "wallColor": pick(seed, ["tan", "brown", "grey"])}
    if use == "farm":
        return {"walls": "metal", "roof": "gable", "roofMat": "metal", "floors": 1, "wallColor": pick(seed, ["grey", "white"]), "condition": "worn"}
    if use == "shed":
        return {"walls": pick(seed, ["metal", "metal", "plank", "siding"]), "roof": "gable", "roofMat": "metal", "floors": 1, "wallColor": pick(seed >> 2, ["grey", "white", "brown", "tan"])}
    if use == "church":
        return {"walls": "brick", "roof": "gable", "roofMat": "shingle", "floors": 1, "steep": True}
    if use in ("shop", "office", "public", "hall"):
        return {"walls": "block", "roof": "flat", "roofMat": "metal", "floors": 1, "wallColor": pick(seed, ["white", "cream", "tan"])}
    raise ValueError(use)


def tile_of(x, z):
    return math.floor(x / NAIP_TILE_M), math.floor(z / NAIP_TILE_M)


def read_png(body):
    """(width, height, RGB rows) of an 8-bit RGB PNG, with nothing but the standard library."""
    if body[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    at, width, height, idat = 8, 0, 0, []
    while at < len(body):
        length, kind = struct.unpack(">I4s", body[at:at + 8])
        chunk = body[at + 8:at + 8 + length]
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if (depth, colour, interlace) != (8, 2, 0):
                raise ValueError("expected 8-bit RGB without interlacing, got %s" % ((depth, colour, interlace),))
        elif kind == b"IDAT":
            idat.append(chunk)
        at += 12 + length
    raw, stride, rows = zlib.decompress(b"".join(idat)), width * 3, []
    previous = bytearray(stride)
    for y in range(height):
        start = y * (stride + 1)
        kind, line = raw[start], bytearray(raw[start + 1:start + 1 + stride])
        if kind == 1:
            for i in range(3, stride):
                line[i] = (line[i] + line[i - 3]) & 255
        elif kind == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 255
        elif kind == 3:
            for i in range(stride):
                line[i] = (line[i] + ((line[i - 3] if i >= 3 else 0) + previous[i]) // 2) & 255
        elif kind == 4:
            for i in range(stride):
                a, b, c = line[i - 3] if i >= 3 else 0, previous[i], previous[i - 3] if i >= 3 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                line[i] = (line[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line)
        previous = line
    return width, height, rows


def naip_tile(i, j, refresh):
    """A public-domain aerial of one tile, at a metre a pixel: its rows of RGB."""
    cache = RAW / ("naip_%d_%d.png" % (i, j))
    if cache.exists() and not refresh:
        return read_png(cache.read_bytes())[2]
    west, south = to_lonlat(i * NAIP_TILE_M, (j + 1) * NAIP_TILE_M)
    east, north = to_lonlat((i + 1) * NAIP_TILE_M, j * NAIP_TILE_M)
    query = urllib.parse.urlencode({"bbox": "%f,%f,%f,%f" % (west, south, east, north), "bboxSR": 4326, "size": "%d,%d" % (NAIP_TILE_M, NAIP_TILE_M), "format": "png24", "f": "image"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(NAIP + "?" + query, timeout=120) as response:
                body = response.read()
            break
        except (urllib.error.URLError, TimeoutError) as e:
            print("tile", i, j, e, "- trying again")
            if attempt == 5:
                raise
            time.sleep(5 * (attempt + 1))
    rows = read_png(body)[2]
    cache.write_bytes(body)
    time.sleep(.2)
    return rows


def roof_colour(ring, tiles, refresh):
    """The median colour of what the aerial shows on a roof, or None if it's mostly leaves."""
    cx, cz = centroid(ring)
    inner = [(cx + (p[0] - cx) * .8, cz + (p[1] - cz) * .8) for p in ring]
    x0, x1 = math.floor(min(p[0] for p in inner)), math.ceil(max(p[0] for p in inner))
    z0, z1 = math.floor(min(p[1] for p in inner)), math.ceil(max(p[1] for p in inner))
    picked, leaves = [], 0
    for x in range(x0, x1 + 1):
        for z in range(z0, z1 + 1):
            if not inside(x + .5, z + .5, inner):
                continue
            key = tile_of(x + .5, z + .5)
            if key not in tiles:
                tiles[key] = naip_tile(*key, refresh)
            row, col = tiles[key][int(z + .5 - key[1] * NAIP_TILE_M)], int(x + .5 - key[0] * NAIP_TILE_M) * 3
            r, g, b = row[col], row[col + 1], row[col + 2]
            if g > r * 1.03 and g > b * 1.06:
                leaves += 1
            else:
                picked.append((r, g, b))
    if len(picked) < 4 or leaves > 1.5 * len(picked):
        return None
    return "#%02x%02x%02x" % tuple(int(statistics.median(p[c] for p in picked)) for c in range(3))


# ---------------------------------------------------------------- what goes where


COMPASS = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0)}


def true_of(world, wx, wz, x, z):
    """The true position that lands on these world coordinates, from one nearby, because a compressed stretch of map doesn't keep distances."""
    for _ in range(60):
        ax, az = world.from_true(x, z)
        x += wx - ax
        z += wz - az
    return x, z


def on_a_road(ring_world, wx, wz, world):
    """Whether a footprint stands on a road or too close to its edge."""
    edges = list(zip(ring_world, ring_world[1:] + ring_world[:1]))
    for w, l in world.roads:
        if any(seg_dist(p[0], p[1], a, b) < w / 2 + ROAD_CLEAR_M or seg_dist(a[0], a[1], p, q) < w / 2 + ROAD_CLEAR_M for a, b in zip(l, l[1:]) if seg_dist(wx, wz, a, b) < 200 for p, q in edges):
            return True
    return False


def off_the_road(ring_world, wx, wz, world):
    """How far to slide a footprint so it clears the road, straight away from the nearest one, or None if it's more than ROAD_NUDGE_M.

    A TIGER line and a footprint are each a few metres out, so a real building beside a road can read as standing on it. It's better moved a little than lost.
    """
    dx, dz = 0.0, 0.0
    for _ in range(int(ROAD_NUDGE_M / 0.5)):
        _, _, ((ax, az), (bx, bz)) = world.nearest_road(wx + dx, wz + dz)
        ux, uz = bx - ax, bz - az
        t = max(0, min(1, ((wx + dx - ax) * ux + (wz + dz - az) * uz) / (ux * ux + uz * uz or 1)))
        ox, oz = wx + dx - (ax + ux * t), wz + dz - (az + uz * t)
        l = math.hypot(ox, oz) or 1
        dx += ox / l * 0.5
        dz += oz / l * 0.5
        if not on_a_road([(p[0] + dx, p[1] + dz) for p in ring_world], wx + dx, wz + dz, world):
            return dx, dz
    return None


def lean_of(ring, lean, world):
    """The wall a lean-to stands on and how far along it, from what the note says about it."""
    edge = door_edge(ring, world, lean["faces"])
    (ax, az), (bx, bz) = ring[edge], ring[(edge + 1) % len(ring)]
    wall = math.hypot(bx - ax, bz - az)
    out = {"edge": edge, "deep": lean["deep"], "t0": 0.0, "t1": round2(wall)}
    if "length" in lean:
        # from the end furthest towards `from`
        tx, tz = COMPASS[lean["from"]]
        if (bx - ax) * tx + (bz - az) * tz > 0:
            out["t0"] = round2(wall - lean["length"])
        else:
            out["t1"] = round2(lean["length"])
    for k in ("post", "slope"):
        if k in lean:
            out[k] = lean[k]
    return out


def door_edge(ring_world, world, faces=None, near=None):
    """Which wall the door goes in: the one nearest where it's put, or else the longest one that faces the way it's told, the nearest road or, far from any, the track."""
    if near:
        return min(range(len(ring_world)), key=lambda i: seg_dist(near[0], near[1], ring_world[i], ring_world[(i + 1) % len(ring_world)]))
    cx, cz = centroid(ring_world)
    if faces:
        tx, tz = COMPASS[faces]
    else:
        d, _, on = world.nearest_road(cx, cz)
        if d > BOUND:
            best, on = math.inf, None
            for l in world.rail:
                for a, b in zip(l, l[1:]):
                    dd = seg_dist(cx, cz, a, b)
                    if dd < best:
                        best, on = dd, (a, b)
        (ax, az), (bx, bz) = on
        dx, dz = bx - ax, bz - az
        l2 = dx * dx + dz * dz or 1
        t = max(0, min(1, ((cx - ax) * dx + (cz - az) * dz) / l2))
        tx, tz = ax + dx * t - cx, az + dz * t - cz
        tl = math.hypot(tx, tz) or 1
        tx, tz = tx / tl, tz / tl
    best, at = -math.inf, 0
    for i, (p, q) in enumerate(zip(ring_world, ring_world[1:] + ring_world[:1])):
        ex, ez = q[0] - p[0], q[1] - p[1]
        length = math.hypot(ex, ez)
        if length < .01:
            continue
        # the ring winds with positive area, so its outward side is to the right of the way it runs
        nx, nz = ez / length, -ex / length
        facing = nx * tx + nz * tz
        score = facing * 3 + min(length, 14) / 14 + (1 if facing > .6 else 0)
        if score > best:
            best, at = score, i
    return at


def round2(v):
    return round(v, 2)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="fetch the sources again")
    parser.add_argument("--no-aerial", action="store_true", help="skip the roof colours, which take a while the first time")
    args = parser.parse_args()

    roads = json.loads(ROADS.read_text())
    from build_lanes import CONFIG, build_tiger_lanes  # Here because it uses what's in this file.
    from build_roads import read_road_records
    world = World(roads, build_tiger_lanes(roads, read_road_records(), json.loads(CONFIG.read_text())))
    bbox = bbox_of(roads)
    raw, sha, also = everything(roads, args.refresh)
    notes = json.loads(NOTES.read_text()) if NOTES.exists() else {"structures": {}, "extras": []}
    print("box", bbox, "features", len(raw["features"]), "sha", sha[:12], "notes", len(notes["structures"]))

    # Everything within reach of a road or the track
    candidates, outside = [], 0
    for f in raw["features"]:
        a = f["attributes"]
        note = notes["structures"].get(str(a["OBJECTID"]), {})
        ring = footprint(f)
        if "clip" in note:
            ring = clip_ring(ring, note["clip"]["axis"], note["clip"]["max"])
        if note.get("seen") and "shape" in note:
            ox, oz = centroid(ring)
            ring = [(ox + dx, oz + dz) for dx, dz in note["shape"]]
        cx, cz = centroid(ring)
        wx, wz = world.from_true(cx, cz)
        far = min(world.nearest(wx, wz, [l for _, l in [*world.roads, *world.tracks]]), world.nearest(wx, wz, world.rail))
        if far > BOUND:
            outside += 1
            continue
        candidates.append({"id": a["OBJECTID"], "ring": ring, "cx": cx, "cz": cz, "wx": wx, "wz": wz, "sqm": a["SQMETERS"], "use": USES[a["PRIM_OCC"]], "note": note, "road": far})

    # What goes first if a compressed stretch of road hasn't room for everyone: what's been looked at, then what
    # isn't a house, then whatever's nearest the road
    candidates.sort(key=lambda s: (not s["note"].get("seen"), s["use"] in ("house", "mobile", "shed"), s["road"], s["id"]))
    placed, dropped, nudged = [], [], []
    cells = {}
    for s in candidates:
        if s["note"].get("seen") and "move" in s["note"]:
            mx, mz = s["note"]["move"]
            s["cx"] += mx
            s["cz"] += mz
            s["ring"] = [(p[0] + mx, p[1] + mz) for p in s["ring"]]
            s["wx"], s["wz"] = world.from_true(s["cx"], s["cz"])
        s["at"] = (s["cx"], s["cz"])
        ring_world = [(s["wx"] + p[0] - s["cx"], s["wz"] + p[1] - s["cz"]) for p in s["ring"]]
        reason = None
        if s["note"].get("condition") == "gone":
            reason = "gone"
        elif abs(s["wx"]) < OPENING_M and abs(s["wz"]) < OPENING_M:
            reason = "opening"
        else:
            if on_a_road(ring_world, s["wx"], s["wz"], world):
                moved = off_the_road(ring_world, s["wx"], s["wz"], world)
                if moved is None:
                    reason = "road"
                else:
                    s["wx"] += moved[0]
                    s["wz"] += moved[1]
                    s["at"] = true_of(world, s["wx"], s["wz"], s["cx"], s["cz"])
                    ring_world = [(p[0] + moved[0], p[1] + moved[1]) for p in ring_world]
                    nudged.append((s["id"], round(math.hypot(*moved), 1)))
            if not reason and any(seg_dist(p[0], p[1], a, b) < RAIL_CLEAR_M for l in world.rail for a, b in zip(l, l[1:]) if seg_dist(s["wx"], s["wz"], a, b) < 200 for p in ring_world):
                reason = "track"
            if not reason and any(seg_dist(p[0], p[1], a, b) < RIVER_CLEAR_M for l in world.river for a, b in zip(l, l[1:]) if seg_dist(s["wx"], s["wz"], a, b) < 200 for p in ring_world):
                reason = "river"
        if not reason:
            # where nothing's been compressed they stand as far apart as they really do, however close that is
            pushed = any(b["trueFrom"] <= s["cx"] < b["trueTo"] for b in world.bands)
            ci, cj = math.floor(s["wx"] / 64), math.floor(s["wz"] / 64)
            near = [(r, was) for i in range(ci - 2, ci + 3) for j in range(cj - 2, cj + 3) for r, was in cells.get((i, j), [])]
            if any(rings_touch(ring_world, r, CLEARANCE_M if pushed or was else 0) for r, was in near):
                reason = "crowded"
            else:
                cells.setdefault((ci, cj), []).append((ring_world, pushed))
        if reason:
            dropped.append({"id": s["id"], "x": round2(s["cx"]), "z": round2(s["cz"]), "why": reason})
        else:
            s["world_ring"] = ring_world
            placed.append(s)

    # What each looks like: notes over the aerial over what's usual for its use
    tiles = {}
    structures = []
    for s in sorted(placed, key=lambda s: s["id"]):
        seed = s["id"] * 2654435761 % (1 << 32) >> 7
        note = s["note"]
        look = looks_of(s["use"], s["sqm"], seed)
        if note.get("seen"):
            for k in ("walls", "roof", "roofMat", "floors", "porch", "carport", "open", "shutters", "condition", "steep", "doors", "bays", "lit", "trimColor", "doorColor", "eaves", "pitch", "gableColor", "band", "vent", "cross", "glass"):
                if k in note:
                    look[k] = note[k]
            look["wallColor"] = note.get("wallColor", look.get("wallColor") if look["walls"] == note.get("walls", look["walls"]) else None)
            if look["wallColor"] is None:
                del look["wallColor"]
        named = look.pop("wallColor", None)
        wall = named if named and named.startswith("#") else WALL_COLORS.get(named) or WALL_DEFAULT[look["walls"]]
        roof = note.get("roofColor") or (None if args.no_aerial else roof_colour(s["ring"], tiles, args.refresh)) or ROOF_DEFAULT[look["roofMat"]]
        near = (s["wx"] + note["doorNear"][0], s["wz"] + note["doorNear"][1]) if note.get("seen") and "doorNear" in note else None
        out = {"id": s["id"], "x": round2(s["at"][0]), "z": round2(s["at"][1]), "ring": [[round2(p[0] - s["cx"]), round2(p[1] - s["cz"])] for p in s["ring"]], "sqm": round(s["sqm"]), "use": note.get("use", s["use"]), **look, "wallColor": wall, "roofColor": roof, "door": door_edge(s["world_ring"], world, note.get("doorFaces"), near)}
        for k, default in (("porch", "none"), ("carport", False), ("shutters", False), ("condition", None), ("steep", False)):
            if out.get(k, default) == default:
                out.pop(k, None)
        if note.get("seen") and "lean" in note:
            out["lean"] = lean_of(s["ring"], note["lean"], world)
        if note.get("seen"):
            out["seen"] = True
        if note.get("what"):
            out["what"] = note["what"]
        structures.append(out)

    print("kept", len(structures), "by eye", sum(1 for s in structures if s.get("seen")), "outside the map", outside)
    print("dropped", Counter(d["why"] for d in dropped).most_common())
    print("moved off a road", nudged)
    print("uses", Counter(s["use"] for s in structures).most_common())
    print("roofs from the aerial", sum(1 for s in structures if s["roofColor"] not in ROOF_DEFAULT.values()), "tiles", len(tiles))

    source = {
        "footprints": {"name": "USA Structures", "by": ATTRIBUTION, "license": LICENSE, "url": ITEM, "fetched": raw["fetched"], "sha256": sha, "bbox": list(bbox), "features": len(raw["features"]), **({"also": also} if also else {})},
        "roofs": {"name": "National Agriculture Imagery Program", "by": "USDA Farm Production and Conservation", "license": "public domain", "url": NAIP},
        "byEye": "tools/structure_notes.json: what's written down from looking at Street View. Nothing is traced or copied from it.",
    }
    lines = ["{", '  "version": 1,', '  "units": "m",', '  "source": %s,' % json.dumps(source, ensure_ascii=False), '  "outsideTheMap": %d,' % outside, '  "structures": [']
    lines += ["    %s%s" % (json.dumps(s, separators=(",", ":")), "," if i < len(structures) - 1 else "") for i, s in enumerate(structures)]
    lines += ["  ],", '  "extras": [']
    extras = notes.get("extras", [])
    lines += ["    %s%s" % (json.dumps(e, separators=(",", ":")), "," if i < len(extras) - 1 else "") for i, e in enumerate(extras)]
    lines += ["  ],", '  "dropped": [']
    dropped.sort(key=lambda d: d["id"])
    lines += ["    %s%s" % (json.dumps(d, separators=(",", ":")), "," if i < len(dropped) - 1 else "") for i, d in enumerate(dropped)]
    lines += ["  ]", "}", ""]
    OUT.write_text("\n".join(lines))
    print("wrote", OUT, OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
