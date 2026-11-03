#!/usr/bin/env python3
"""Build data/water.json from USGS's National Hydrography Dataset and tools/water_extras.json.

    .venv/bin/python tools/build_water.py [--refresh] [--check]

TIGER's area water has 9 polygons around here and the nearest is 406 m from a road, which is why this uses NHD. The
download is cached in data/raw/water/, which is gitignored. --refresh fetches it again, and --check says whether
data/water.json matches what a fresh build would write. data/water.md has what comes out.
"""
import argparse
import datetime
import hashlib
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_roads import to_lonlat, to_xz  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "water"
ROADS = ROOT / "data" / "roads.json"
EXTRAS = Path(__file__).parent / "water_extras.json"
OUT = ROOT / "data" / "water.json"

SERVICE = "https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer/12/query"
ATTRIBUTION = "U.S. Geological Survey, National Hydrography Dataset"
USER_AGENT = "chunky-survival-build-water/1.0 (ponds for a game map)"
LAKE_POND = 390  # FTYPE. The other one here is 466, swamp or marsh, which mostly has no open water to swim in.
REACH = 500  # Metres from a road or the railroad, the same margin as the roads' reference area. Past MAP.inBounds it's only on the map.
BRIDGE_CLEAR = 400  # Nothing changes in the first scene's square around Stuckey's Bridge.


def lines_of(roads):
    """Every road and the railroad, as lists of true x, z."""
    edges = {e["id"]: e for e in roads["edges"]}
    return [edges[i]["points"] for r in roads["roads"] for i in r["edges"]] + [l["points"] for l in roads["reference"]["railroad"]["lines"]]


def bbox(lines):
    """Everything within REACH of them, as lon/lat."""
    xs = [p[0] for pts in lines for p in pts]
    zs = [p[1] for pts in lines for p in pts]
    lon0, lat1 = to_lonlat(min(xs) - REACH, min(zs) - REACH)
    lon1, lat0 = to_lonlat(max(xs) + REACH, max(zs) + REACH)
    return lon0, lat0, lon1, lat1


def fetch(box):
    query = urllib.parse.urlencode({
        "where": "1=1", "geometry": ",".join(f"{v:.6f}" for v in box), "geometryType": "esriGeometryEnvelope", "inSR": 4326,
        "spatialRel": "esriSpatialRelIntersects", "outFields": "*", "outSR": 4326, "f": "geojson",
    })
    request = urllib.request.Request(f"{SERVICE}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def load(box, refresh):
    RAW.mkdir(parents=True, exist_ok=True)
    cache, meta = RAW / "waterbody.geojson", RAW / "meta.json"
    if refresh or not cache.exists():
        print(f"fetch {SERVICE}")
        body = fetch(box)
        cache.write_bytes(body)
        meta.write_text(json.dumps({"fetched": datetime.date.today().isoformat()}))
    body = cache.read_bytes()
    data = json.loads(body)
    if data.get("exceededTransferLimit"):
        raise SystemExit("NHD has more waterbodies here than one page holds")
    return data, json.loads(meta.read_text())["fetched"], hashlib.sha256(body).hexdigest()


def seg_dist(x, z, s):
    ax, az, bx, bz = s
    dx, dz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz or 1e-9)))
    return math.hypot(x - ax - dx * t, z - az - dz * t)


class Near:
    """How far a point is from a road or the railroad, up to a limit, on a grid of cells."""

    def __init__(self, lines, limit):
        self.limit, self.cells, self.size = limit, {}, max(limit, 100)
        for pts in lines:
            for (ax, az), (bx, bz) in zip(pts, pts[1:]):
                n = max(1, int(math.hypot(bx - ax, bz - az) // self.size) + 1)
                keys = {(int((ax + (bx - ax) * k / n) // self.size), int((az + (bz - az) * k / n) // self.size)) for k in range(n + 1)}
                for key in keys:
                    self.cells.setdefault(key, set()).add((ax, az, bx, bz))

    def within(self, x, z):
        cx, cz = int(x // self.size), int(z // self.size)
        for i in (-1, 0, 1):
            for j in (-1, 0, 1):
                for s in self.cells.get((cx + i, cz + j), ()):
                    if seg_dist(x, z, s) <= self.limit:
                        return True
        return False


def area_of(ring):
    return abs(sum(x0 * z1 - x1 * z0 for (x0, z0), (x1, z1) in zip(ring, ring[1:] + ring[:1]))) / 2


def shore_of(points):
    """A ring of lon/lat as true metres to 0.1 m and as lon/lat, with no point the same as the one before it once it's rounded."""
    ring, lonlat = [], []
    for point in points:
        at = [round(v, 1) for v in to_xz(point)]
        if not ring or ring[-1] != at:
            ring.append(at)
            lonlat.append([round(point[0], 6), round(point[1], 6)])
    if len(ring) > 1 and ring[0] == ring[-1]:
        ring.pop()
        lonlat.pop()
    return ring, lonlat


def build(raw, fetched, sha, roads, extras):
    near = Near(lines_of(roads), REACH)
    bridge = next(c for c in roads["reference"]["crossings"] if c["road"] == roads["opening"]["road"] and c["with"] == "river")
    ponds, left = [], {"swamps": 0, "outOfReach": 0, "byTheBridge": 0}
    really_open = {e["id"] for e in extras["open"]}
    reached = {e["id"] for e in extras.get("reached", [])}
    looks = {e["id"]: e["look"] for e in extras.get("reached", []) if "look" in e}
    missing = (really_open | reached) - {f["properties"]["PERMANENT_IDENTIFIER"] for f in raw["features"]}
    if missing:
        raise SystemExit(f"tools/water_extras.json lists {sorted(missing)}, and NHD doesn't have them any more")
    for f in raw["features"]:
        props, geometry = f["properties"], f["geometry"]
        if props["FTYPE"] != LAKE_POND and props["PERMANENT_IDENTIFIER"] not in really_open:
            left["swamps"] += 1
            continue
        rings = geometry["coordinates"] if geometry["type"] == "Polygon" else [r for poly in geometry["coordinates"] for r in poly]
        ring, lonlat = shore_of(rings[0])
        if props["PERMANENT_IDENTIFIER"] not in reached and not any(near.within(x, z) for x, z in ring):
            left["outOfReach"] += 1
            continue
        if any(math.hypot(x - bridge["x"], z - bridge["z"]) < BRIDGE_CLEAR for x, z in ring):
            left["byTheBridge"] += 1
            continue
        pond = {"id": props["PERMANENT_IDENTIFIER"], "source": "nhd", "area": round(area_of(ring)), "ring": ring, "lonlat": lonlat}
        if len(rings) > 1:
            pond["islands"] = [shore_of(r)[0] for r in rings[1:]]
        if props["PERMANENT_IDENTIFIER"] in looks:
            pond["look"] = looks[props["PERMANENT_IDENTIFIER"]]
        if props.get("GNIS_NAME"):
            pond["name"] = props["GNIS_NAME"]
        ponds.append(pond)
    for e in extras["ponds"]:
        ponds.append({"id": e["id"], "source": "naip", "area": round(area_of(e["ring"])), "ring": e["ring"], "lonlat": [[round(v, 6) for v in to_lonlat(x, z)] for x, z in e["ring"]]})
    for e in extras.get("pools", []):
        ponds.append({"id": e["id"], "source": "naip", "pool": e["pool"], "area": round(area_of(e["ring"])), "ring": e["ring"], "lonlat": [[round(v, 6) for v in to_lonlat(x, z)] for x, z in e["ring"]]})
    ponds.sort(key=lambda p: p["id"])
    return {
        "version": 1,
        "units": "m",
        "origin": roads["origin"],
        "projection": roads["projection"],
        "source": {
            "ponds": {"name": "National Hydrography Dataset, Waterbody - Large Scale", "by": ATTRIBUTION, "license": "Public domain", "url": SERVICE, "fetched": fetched, "sha256": sha},
            "extras": {"name": "National Agriculture Imagery Program, by eye", "by": "U.S. Department of Agriculture", "license": "Public domain", "url": "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer"},
        },
        "left": left,
        "ponds": ponds,
    }


def render(out):
    head = {k: v for k, v in out.items() if k != "ponds"}
    text = json.dumps(head, indent=2)[:-2]
    rows = ",\n".join("    " + json.dumps(p, separators=(",", ":")) for p in out["ponds"])
    return f'{text},\n  "ponds": [\n{rows}\n  ]\n}}\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    roads = json.loads(ROADS.read_text())
    raw, fetched, sha = load(bbox(lines_of(roads)), args.refresh)
    out = build(raw, fetched, sha, roads, json.loads(EXTRAS.read_text()))
    text = render(out)
    print(f"{len(out['ponds'])} ponds, {sum(p['area'] for p in out['ponds'])} m2, {sum(len(p['ring']) for p in out['ponds'])} vertices. Left out: {out['left']}")
    if args.check:
        if OUT.read_text() != text:
            raise SystemExit("data/water.json doesn't match a fresh build")
        print("water.json matches a fresh build")
        return
    OUT.write_text(text)
    print(f"Wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
