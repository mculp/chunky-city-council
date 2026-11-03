#!/usr/bin/env python3
"""Build data/hills.json from USGS's 3D Elevation Program.

    .venv/bin/python tools/build_hills.py [--refresh] [--check]

It holds how far the land stands over the floodplain, everywhere on the map. The game walks and drives on a flat
world, and this is only what it's drawn on. The download is cached in data/raw/hills/, which is gitignored. --refresh
fetches it again, and --check says whether data/hills.json matches what a fresh build would write. data/hills.md has
what comes out and why.
"""
import argparse
import array
import base64
import datetime
import hashlib
import json
import math
import struct
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_roads import to_lonlat, to_xz  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hills"
ROADS = ROOT / "data" / "roads.json"
LANES = ROOT / "data" / "lanes.json"
WATER = ROOT / "data" / "water.json"
STRUCTURES = ROOT / "data" / "structures.json"
OUT = ROOT / "data" / "hills.json"

SERVICE = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
ATTRIBUTION = "U.S. Geological Survey, 3D Elevation Program"
USER_AGENT = "chunky-survival-build-hills/1.0 (hills for a game map)"

# True metres the grid covers: every road and lane, with room for MAP.inBounds and for seeing past it.
BOX = (-5400, 16100, -8400, 9700)
DEGREES = 2.698e-4       # a pixel, about 25 m east-west and 30 m north-south. Square in degrees, or the server moves the edges.
BOUND = 280              # how far from a road he can go, in MAP.inBounds

TOWN_Y = 6.15            # how far the game's flat land stands over the river, which is the same as town does here
SOFT = 2.0               # how gently the land comes up off the floodplain, in metres
QUANTUM = 10             # the file's steps to a metre
REACH = 420              # metres from a road or the tracks that can be seen up close, which is as far as he can go and as far as the fog lets him see
NEAR_OFF = 1             # how many steps off a height can be. Flat is always exact.
STRIDE = 6               # pixels between the heights that are all there are further off than that

RIVER_STEP = 150         # metres between the river's levels
RIVER_WINDOW = 3         # how many of them either side to take the lowest of, since a 30 m pixel on the water still has some bank in it
LEVEL_GRID = 300         # metres between the points the river's level is worked out for

RIVER_CLEAR = 60         # metres from the river that's flat, since the banks are the game's. A lookup reaches two pixels, so that's flat right to the water.
OPENING_CLEAR = 380      # the same for the first scene's square, which is flat to 300 and a bit
BLUFF = .35              # how steeply the land can come up from those
BLUFF_LEVELLED = (20, 1.2)  # and where a building's on a bluff over it: how near the river it can start, and how steeply. That lifts the river a little there.
BLUFF_ROAD = .13         # and where there's a paved road going up it
BUILDING_LEAN = .03      # how much a building's left leaning, on a slope steeper than this
BUILDING_LEAN_ROAD = .05  # and next to a paved road, which has a slope of its own to keep
BUILDING_PAD = (45, 110)  # metres from a building: this level out to here, and the land's own from here
BY_THE_POOL = 40         # metres from a swimming pool that a building's on the same level as it
POND_CLEAR = (45, 110)   # the same for a pond: all at one height to here, so that its water's level
RAIL_GRADE = (300, 15, 60)   # metres of track to average over either way, and how far either side it's cut and filled to that, to none
HIGHWAYS = ("us_80",)        # built to long, even grades. A street goes over a hill the way the land does.
ROAD_GRADE = (90, 25, 90)    # the same for a highway
ROAD_FINISH = (45, 10, 40)   # and again once the buildings are level, since they take some of the road with them
STREET_GRADE = (15, 18, 60)  # and for any other paved road or lane, which only has a pixel's roughness taken out of it
STREET_FINISH = (15, 8, 20)  # and again, back to the land as it was before anything was levelled, since a building's ground isn't the street's
# Where the land really is lower than the floodplain and it's in plain sight, the floor comes down to meet it: as far as `depth` within `core`
# metres of here, and back up by `edge`. A pond in it goes down with it, and its flat ground only reaches as far as `pond` says.
DIPS = (
    # the foot of Chestnut St, where it comes up off Griffis Fountain Rd and out of the river bottoms, with a pond beside it
    {"at": (-282.0, 327.9), "core": 60, "edge": 105, "depth": 2.6, "pond": (22, 75)},
)


def sstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def fetch():
    lon0, lat1 = to_lonlat(BOX[0], BOX[2])
    lon1, _ = to_lonlat(BOX[1], BOX[2])
    _, lat0 = to_lonlat(BOX[0], BOX[3])
    cols = round((lon1 - lon0) / DEGREES)
    rows = round((lat1 - lat0) / DEGREES)
    east, south = lon0 + cols * DEGREES, lat1 - rows * DEGREES
    query = {
        "bbox": f"{lon0:.6f},{south:.6f},{east:.6f},{lat1:.6f}", "bboxSR": 4326, "imageSR": 4326, "size": f"{cols},{rows}",
        "format": "tiff", "pixelType": "F32", "interpolation": "RSP_BilinearInterpolation", "f": "image",
    }
    request = urllib.request.Request(f"{SERVICE}?{urllib.parse.urlencode(query)}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as r:
        body = r.read()
    if body[:2] != b"II":
        raise SystemExit(f"3DEP sent something other than a TIFF: {body[:200]!r}")
    return body


def load(refresh):
    RAW.mkdir(parents=True, exist_ok=True)
    cache, meta = RAW / "dem.tif", RAW / "meta.json"
    if refresh or not cache.exists():
        print(f"fetch {SERVICE}")
        cache.write_bytes(fetch())
        meta.write_text(json.dumps({"fetched": datetime.date.today().isoformat()}))
    body = cache.read_bytes()
    return body, json.loads(meta.read_text())["fetched"], hashlib.sha256(body).hexdigest()


class Grid:
    """Values at the middle of each pixel. x0, z0 is the outer corner of the first one, in true metres."""

    def __init__(self, cols, rows, x0, z0, dx, dz, v=None):
        self.cols, self.rows, self.x0, self.z0, self.dx, self.dz = cols, rows, x0, z0, dx, dz
        self.v = v if v is not None else [0.0] * (cols * rows)

    def like(self, v=None):
        return Grid(self.cols, self.rows, self.x0, self.z0, self.dx, self.dz, v)

    def x(self, i):
        return self.x0 + (i + .5) * self.dx

    def z(self, j):
        return self.z0 + (j + .5) * self.dz

    def at(self, x, z):
        fx, fz = (x - self.x0) / self.dx - .5, (z - self.z0) / self.dz - .5
        i, j = max(0, min(self.cols - 2, math.floor(fx))), max(0, min(self.rows - 2, math.floor(fz)))
        a, c = max(0.0, min(1.0, fx - i)), max(0.0, min(1.0, fz - j))
        k, v = j * self.cols + i, self.v
        return (v[k] * (1 - a) + v[k + 1] * a) * (1 - c) + (v[k + self.cols] * (1 - a) + v[k + self.cols + 1] * a) * c


def read_tiff(body):
    """The tiled, uncompressed, 32-bit float GeoTIFF that the server sends."""
    tags = {}
    first = struct.unpack_from("<I", body, 4)[0]
    for n in range(struct.unpack_from("<H", body, first)[0]):
        tag, kind, count = struct.unpack_from("<HHI", body, first + 2 + n * 12)
        size, code = {3: (2, "H"), 4: (4, "I"), 12: (8, "d")}.get(kind, (0, ""))
        if not size:
            continue
        where = first + 2 + n * 12 + 8
        if size * count > 4:
            where = struct.unpack_from("<I", body, where)[0]
        tags[tag] = struct.unpack_from(f"<{count}{code}", body, where)
    if tags[259][0] != 1 or tags[339][0] != 3 or 322 not in tags:
        raise SystemExit("not the kind of TIFF this reads")
    cols, rows, tw, th = tags[256][0], tags[257][0], tags[322][0], tags[323][0]
    across = math.ceil(cols / tw)
    v = [0.0] * (cols * rows)
    for t, start in enumerate(tags[324]):
        tile = array.array("f")
        tile.frombytes(body[start:start + tw * th * 4])
        ti, tj = t % across, t // across
        for y in range(min(th, rows - tj * th)):
            row = (tj * th + y) * cols + ti * tw
            n = min(tw, cols - ti * tw)
            v[row:row + n] = tile[y * tw:y * tw + n]
    sx, sy = tags[33550][:2]
    lon, lat = tags[33922][3:5]
    x0, z0 = to_xz((lon, lat))
    x1, z1 = to_xz((lon + sx, lat - sy))
    return Grid(cols, rows, x0, z0, x1 - x0, z1 - z0, v)


def along(points, step):
    """Points every `step` metres along a line, with how far along each one is."""
    out, s = [], 0.0
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        length = math.hypot(bx - ax, bz - az)
        n = max(1, math.ceil(length / step))
        for k in range(n):
            out.append((ax + (bx - ax) * k / n, az + (bz - az) * k / n, s + length * k / n))
        s += length
    out.append((points[-1][0], points[-1][1], s))
    return out


def nearest_seed(grid, seeds):
    """For each pixel, how far it is to the nearest of the seeds, (x, z), and which seed that is. Two sweeps that pass each
    pixel's nearest seed along to its neighbours, which is near enough to exact for this."""
    cols, rows = grid.cols, grid.rows
    who = [-1] * (cols * rows)
    d2 = [math.inf] * (cols * rows)
    xs = [grid.x(i) for i in range(cols)]
    zs = [grid.z(j) for j in range(rows)]
    for s, (x, z) in enumerate(seeds):
        i, j = int((x - grid.x0) / grid.dx), int((z - grid.z0) / grid.dz)
        if 0 <= i < cols and 0 <= j < rows:
            k = j * cols + i
            d = (xs[i] - x) ** 2 + (zs[j] - z) ** 2
            if d < d2[k]:
                d2[k], who[k] = d, s
    sweeps = (((-1, -1), (0, -1), (1, -1), (-1, 0)), ((1, 1), (0, 1), (-1, 1), (1, 0)))
    for forward, around in zip((True, False), sweeps):
        js = range(rows) if forward else range(rows - 1, -1, -1)
        for j in js:
            z = zs[j]
            for i in (range(cols) if forward else range(cols - 1, -1, -1)):
                k = j * cols + i
                best, by, x = d2[k], who[k], xs[i]
                for a, b in around:
                    ni, nj = i + a, j + b
                    if 0 <= ni < cols and 0 <= nj < rows:
                        s = who[nj * cols + ni]
                        if s >= 0 and s != by:
                            sx, sz = seeds[s]
                            d = (x - sx) ** 2 + (z - sz) ** 2
                            if d < best:
                                best, by = d, s
                d2[k], who[k] = best, by
    return [math.sqrt(d) for d in d2], who


def river_levels(dem, lines):
    """How high the water is along the river. It's hard to read off a 30 m pixel, so it's the lowest for a little way up and down."""
    out = []
    for line in lines:
        samples = along(line, RIVER_STEP)
        raw = [dem.at(x, z) for x, z, _ in samples]
        for n, (x, z, _) in enumerate(samples):
            out.append((x, z, min(raw[max(0, n - RIVER_WINDOW):n + RIVER_WINDOW + 1])))
    return out


def level_grid(dem, levels):
    """The river's level, spread over the map, so that a hill's height is over the river it runs down to. It falls about 17 m across here."""
    cols, rows = int(dem.cols * dem.dx / LEVEL_GRID) + 2, int(dem.rows * dem.dz / LEVEL_GRID) + 2
    grid = Grid(cols, rows, dem.x0 - LEVEL_GRID / 2, dem.z0 - LEVEL_GRID / 2, LEVEL_GRID, LEVEL_GRID)
    for j in range(rows):
        for i in range(cols):
            x, z, sum_w, sum_h = grid.x(i), grid.z(j), 0.0, 0.0
            for lx, lz, h in levels:
                w = 1 / ((x - lx) ** 2 + (z - lz) ** 2 + 90000) ** 2
                sum_w += w
                sum_h += w * h
            grid.v[j * cols + i] = sum_h / sum_w
    return grid


def soft(v):
    """Nothing's below the floor, and the land comes up off it without a crease."""
    return 0.0 if v <= -SOFT else v if v >= SOFT else (v + SOFT) ** 2 / (4 * SOFT)


def floor(x, z):
    """How far below the floodplain the land can go here, which is nowhere but in a dip."""
    f = 0.0
    for dip in DIPS:
        f = min(f, -dip["depth"] * (1 - sstep(dip["core"], dip["edge"], math.hypot(x - dip["at"][0], z - dip["at"][1]))))
    return f


def dip_of(pond):
    """The dip a pond's in, if it's in one."""
    xs, zs = [r[0] for r in pond["ring"]], [r[1] for r in pond["ring"]]
    x, z = sum(xs) / len(xs), sum(zs) / len(zs)
    return next((dip for dip in DIPS if math.hypot(x - dip["at"][0], z - dip["at"][1]) < dip["core"]), None)


def grade(grid, H, lines, spec, land=None):
    """A road or the tracks don't follow every rise, so they run on an average of the land they cross, and the land's cut and filled to it.
    That's the land as it is now, or as `land` has it."""
    reach, flat, out = spec
    seeds, heights = [], []
    for line in lines:
        samples = along(line, 15)
        raw = [(land or H).at(x, z) for x, z, _ in samples]
        window = int(reach / 15)
        total = [0.0]
        for h in raw:
            total.append(total[-1] + h)
        for n, (x, z, _) in enumerate(samples):
            a, b = max(0, n - window), min(len(raw), n + window + 1)
            seeds.append((x, z))
            heights.append((total[b] - total[a]) / (b - a))
    dist, who = nearest_seed(grid, seeds)
    v = H.v
    for k, s in enumerate(who):
        if s >= 0 and dist[k] < out:
            w = 1 - sstep(flat, out, dist[k])
            v[k] += (heights[s] - v[k]) * w
    return dist


def level_buildings(grid, H, buildings, road, keep=None):
    """Most of these stand on ground somebody levelled, so a building on a slope doesn't lean as far as the slope does. It takes a good
    piece of land to do it, since a pixel's 30 m. Some have to be properly level, and it's near enough to say so."""
    weight, sum_w, sum_h = [0.0] * len(H.v), [0.0] * len(H.v), [0.0] * len(H.v)
    lo, hi = BUILDING_PAD
    shared = {}
    for x, z, _, group in buildings:
        if group is not None:
            shared.setdefault(group, []).append(H.at(x, z))
    for x, z, r, group in buildings:
        level = group is not None
        e = max(r, 8)
        slope = math.hypot(H.at(x + e, z) - H.at(x - e, z), H.at(x, z + e) - H.at(x, z - e)) / (2 * e)
        i, j = max(0, min(grid.cols - 1, int((x - grid.x0) / grid.dx))), max(0, min(grid.rows - 1, int((z - grid.z0) / grid.dz)))
        lean = BUILDING_LEAN_ROAD if road[j * grid.cols + i] < 45 else BUILDING_LEAN
        if slope <= lean and not level:
            continue
        most, height, far = 1 if level else 1 - lean / slope, sum(shared[group]) / len(shared[group]) if level else H.at(x, z), r + hi
        for j in range(max(0, int((z - far - grid.z0) / grid.dz)), min(grid.rows, int((z + far - grid.z0) / grid.dz) + 2)):
            for i in range(max(0, int((x - far - grid.x0) / grid.dx)), min(grid.cols, int((x + far - grid.x0) / grid.dx) + 2)):
                d = math.hypot(grid.x(i) - x, grid.z(j) - z)
                w = most * (1 - sstep(r + lo, far, d))
                if w > 0:
                    # a pixel between two of them goes mostly with the nearer
                    k, near = j * grid.cols + i, w / (d + 5) ** 2
                    weight[k] = max(weight[k], w)
                    sum_w[k] += near
                    sum_h[k] += near * height
    v = H.v
    for k, w in enumerate(weight):
        if w > 0:
            v[k] += (sum_h[k] / sum_w[k] - v[k]) * w * (1 - keep[k] if keep else 1)
    return weight


def inside(ring, x, z):
    c = False
    for (ax, az), (bx, bz) in zip(ring, ring[1:] + ring[:1]):
        if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
            c = not c
    return c


def level_ponds(grid, H, ponds, survey):
    """A pond's water is flat, so the land's all one height around it, and comes back to its own height further off. One in a dip is down at
    the foot of it, as low as the survey has the land there."""
    weight, target = [0.0] * len(H.v), [0.0] * len(H.v)
    dips = [dip_of(p) for p in ponds]
    clears = [dip["pond"] if dip else POND_CLEAR for dip in dips]
    # what's near enough to run together has to be at one height, since a pixel can only be one
    group = list(range(len(ponds)))

    def find(a):
        while group[a] != a:
            group[a] = group[group[a]]
            a = group[a]
        return a

    boxes = [(min(r[0] for r in p["ring"]), max(r[0] for r in p["ring"]), min(r[1] for r in p["ring"]), max(r[1] for r in p["ring"])) for p in ponds]
    for a, A in enumerate(boxes):
        for b, B in enumerate(boxes[:a]):
            near = clears[a][0] + clears[b][0]
            if A[0] - near < B[1] and B[0] - near < A[1] and A[2] - near < B[3] and B[2] - near < A[3]:
                if any(math.hypot(u[0] - v[0], u[1] - v[1]) < near for u in ponds[a]["ring"] for v in ponds[b]["ring"]):
                    group[find(a)] = find(b)
    samples, feet = {}, {}
    for n, p in enumerate(ponds):
        samples.setdefault(find(n), []).extend(H.at(x, z) for x, z in p["ring"])
        if dips[n]:
            feet[find(n)] = survey(*dips[n]["at"])
    for n, p in enumerate(ponds):
        ring = p["ring"]
        x0, x1, z0, z1 = boxes[n]
        lo, hi = clears[n]
        height = feet[find(n)] if find(n) in feet else sum(samples[find(n)]) / len(samples[find(n)])
        for j in range(max(0, int((z0 - hi - grid.z0) / grid.dz)), min(grid.rows, int((z1 + hi - grid.z0) / grid.dz) + 2)):
            z = grid.z(j)
            for i in range(max(0, int((x0 - hi - grid.x0) / grid.dx)), min(grid.cols, int((x1 + hi - grid.x0) / grid.dx) + 2)):
                x = grid.x(i)
                d = 0.0 if inside(ring, x, z) else min(seg_dist(x, z, a, b) for a, b in zip(ring, ring[1:] + ring[:1]))
                if d < hi:
                    w = 1 - sstep(lo, hi, d)
                    k = j * grid.cols + i
                    if w > weight[k]:
                        weight[k], target[k] = w, height
    v = H.v
    for k, w in enumerate(weight):
        if w > 0:
            v[k] += (target[k] - v[k]) * w
    return weight


def seg_dist(x, z, a, b):
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz or 1e-9)))
    return math.hypot(x - a[0] - dx * t, z - a[1] - dz * t)


def clear(grid, H, river, crossing, road, levelled=None):
    """The river's banks and the first scene are flat, as they've always been, and the land comes up from them no more steeply than this."""
    dist, _ = nearest_seed(grid, river)
    v = H.v
    for j in range(grid.rows):
        wz = abs(grid.z(j) - crossing[1])
        for i in range(grid.cols):
            k = j * grid.cols + i
            slope = BLUFF_ROAD + (BLUFF - BLUFF_ROAD) * sstep(40, 120, road[k])
            limit = slope * max(0.0, dist[k] - RIVER_CLEAR)
            if levelled and levelled[k] > .2:
                limit = max(limit, BLUFF_LEVELLED[1] * max(0.0, dist[k] - BLUFF_LEVELLED[0]))
            v[k] = min(v[k], limit, BLUFF_ROAD * max(0.0, max(abs(grid.x(i) - crossing[0]), wz) - OPENING_CLEAR))


def pack(values, cols, off=None):
    """Whole numbers, each less what its neighbours suggest it'd be, which is nearly always a byte. A run of no change is a zero byte and
    how long it is. A number can be up to off[k] out, if that saves saying anything. src/hills.js undoes it."""
    out = bytearray()
    q = [0] * len(values)
    run = 0

    def number(n):
        while n >= 128:
            out.append(n & 127 | 128)
            n >>= 7
        out.append(n)

    for k, h in enumerate(values):
        left = q[k - 1] if k % cols else 0
        up = q[k - cols] if k >= cols else 0
        corner = q[k - cols - 1] if k >= cols and k % cols else 0
        guess = left + up - corner
        r = h - guess
        if off and abs(r) <= off[k]:
            r = 0
        q[k] = guess + r
        if r == 0:
            run += 1
            continue
        if run:
            out.append(0)
            number(run)
            run = 0
        number(r << 1 if r > 0 else (-r << 1) - 1)
    if run:
        out.append(0)
        number(run)
    return base64.b64encode(bytes(out)).decode()


def encode(H, reach, exact):
    """The land every six pixels, which is all that's seen of it from any way off, and the difference from that wherever it can be seen up close.
    Water's got to be level, so what's around it is all kept, and to the step, however far it is from a road."""
    cols, rows = H.cols, H.rows
    ccols, crows = (cols - 1) // STRIDE + 2, (rows - 1) // STRIDE + 2
    want = [round(h * QUANTUM) for h in H.v]
    coarse = [0] * (ccols * crows)
    half = STRIDE // 2
    for b in range(crows):
        for a in range(ccols):
            total, n = 0, 0
            for j in range(max(0, b * STRIDE - half), min(rows, b * STRIDE + half + 1)):
                for i in range(max(0, a * STRIDE - half), min(cols, a * STRIDE + half + 1)):
                    total += want[j * cols + i]
                    n += 1
            coarse[b * ccols + a] = round(total / n) if n else 0
    fine, off = [0] * len(want), [0] * len(want)
    area = STRIDE * STRIDE
    for j in range(rows):
        b, y = j // STRIDE, j % STRIDE
        for i in range(cols):
            k = j * cols + i
            if reach[k] < REACH or exact[k]:
                a, x = i // STRIDE, i % STRIDE
                c = b * ccols + a
                base = (coarse[c] * (STRIDE - x) * (STRIDE - y) + coarse[c + 1] * x * (STRIDE - y) + coarse[c + ccols] * (STRIDE - x) * y + coarse[c + ccols + 1] * x * y + area // 2) // area
                fine[k] = want[k] - base
                off[k] = NEAR_OFF if want[k] and not exact[k] else 0
    return {"stride": STRIDE, "cols": ccols, "rows": crows, "data": pack(coarse, ccols)}, pack(fine, cols, off)


def footprints(structures, ponds):
    """Where each building is and how far it reaches from there. A swimming pool has to be level, and so does what's right by it, all at one height."""
    pools = []
    for p in ponds:
        if p.get("pool"):
            xs, zs = [r[0] for r in p["ring"]], [r[1] for r in p["ring"]]
            x, z = sum(xs) / len(xs), sum(zs) / len(zs)
            pools.append((x, z, max(math.hypot(a - x, b - z) for a, b in p["ring"]), len(pools)))
    out = list(pools)
    for b in structures["structures"] + structures["extras"]:
        group = next((pool[3] for pool in pools if math.hypot(b["x"] - pool[0], b["z"] - pool[1]) < BY_THE_POOL), None)
        out.append((b["x"], b["z"], max(math.hypot(x, z) for x, z in b["ring"]), group))
    return out


def build(body, fetched, sha, roads, lanes, water, structures):
    dem = read_tiff(body)
    every = [e["points"] for e in roads["edges"]] + [l["points"] for l in lanes["lanes"] + lanes["drives"]]
    for pts in every:
        for x, z in pts:
            if not (BOX[0] + BOUND < x < BOX[1] - BOUND and BOX[2] + BOUND < z < BOX[3] - BOUND):
                raise SystemExit(f"a road at {x}, {z} is too near the edge of the box")
    edges = {e["id"]: e["points"] for e in roads["edges"]}
    river = [l["points"] for l in roads["reference"]["river"]["lines"]]
    rail = [l["points"] for l in roads["reference"]["railroad"]["lines"]]
    highway = [edges[e] for r in roads["roads"] if r["id"] in HIGHWAYS for e in r["edges"]]
    streets = [edges[e] for r in roads["roads"] if r["surface"] == "asphalt" and r["id"] not in HIGHWAYS for e in r["edges"]] + [l["points"] for l in lanes["lanes"] if l["surface"] == "asphalt"]
    bridge = next(c for c in roads["reference"]["crossings"] if c["road"] == roads["opening"]["road"] and c["with"] == "river")

    levels = level_grid(dem, river_levels(dem, river))

    def survey(x, z):
        return dem.at(x, z) - levels.at(x, z) - TOWN_Y
    H = dem.like([0.0] * len(dem.v))
    for j in range(dem.rows):
        z = dem.z(j)
        for i in range(dem.cols):
            k = j * dem.cols + i
            f = floor(dem.x(i), z)
            H.v[k] = f + soft(dem.v[k] - levels.at(dem.x(i), z) - TOWN_Y - f)
    natural = H.like(list(H.v))
    grade(dem, H, rail, RAIL_GRADE)
    land = H.like(list(H.v))
    road = [min(a, b) for a, b in zip(grade(dem, H, highway, ROAD_GRADE), grade(dem, H, streets, STREET_GRADE))]
    banks = [(x, z) for line in river for x, z, _ in along(line, 15)]
    buildings = footprints(structures, water["ponds"])
    clear(dem, H, banks, (bridge["x"], bridge["z"]), road, level_buildings(dem, H.like(list(H.v)), buildings, road))
    for _ in range(3):
        levelled = level_buildings(dem, H, buildings, road)
    grade(dem, H, highway, ROAD_FINISH)
    grade(dem, H, streets, STREET_FINISH, land)
    ponds = level_ponds(dem, H, [p for p in water["ponds"] if not p.get("pool")], survey)
    level_buildings(dem, H, buildings, road, ponds)
    level_buildings(dem, H, [b for b in buildings if b[3] is not None], road)
    clear(dem, H, banks, (bridge["x"], bridge["z"]), road, levelled)

    reach, _ = nearest_seed(dem, [(x, z) for pts in every + rail for x, z, _ in along(pts, 30)])
    near_pond, _ = nearest_seed(dem, [(x, z) for p in water["ponds"] for x, z, _ in along(p["ring"] + p["ring"][:1], 30)])
    coarse, data = encode(H, reach, [d < POND_CLEAR[0] for d in near_pond])
    high = max(natural.v)
    return {
        "version": 1,
        "units": "metres",
        "axes": "+x east, +z south, in true metres from town center",
        "source": {"name": ATTRIBUTION, "service": SERVICE, "fetched": fetched, "sha256": sha, "licence": "Public domain"},
        "elevation": {"lowest": round(min(dem.v), 1), "highest": round(max(dem.v), 1), "highestOverFloodplain": round(high, 1)},
        "dips": [{"x": d["at"][0], "z": d["at"][1], "core": d["core"], "edge": d["edge"], "depth": d["depth"]} for d in DIPS],
        "x0": round(H.x0, 3), "z0": round(H.z0, 3), "dx": round(H.dx, 4), "dz": round(H.dz, 4), "cols": H.cols, "rows": H.rows,
        "quantum": QUANTUM,
        "coarse": coarse,
        "data": data,
    }


def render(out):
    return json.dumps(out, indent=1) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    body, fetched, sha = load(args.refresh)
    out = build(body, fetched, sha, json.loads(ROADS.read_text()), json.loads(LANES.read_text()), json.loads(WATER.read_text()), json.loads(STRUCTURES.read_text()))
    text = render(out)
    print(f"{out['cols']} x {out['rows']}, {len(out['data']) // 1024} KB, {out['elevation']}")
    if args.check:
        if OUT.read_text() != text:
            raise SystemExit("data/hills.json doesn't match a fresh build")
        print("hills.json matches a fresh build")
        return
    OUT.write_text(text)
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
