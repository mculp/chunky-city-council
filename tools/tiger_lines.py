"""Print TIGER's own lines and intersections for what data/roads.json is built from, as JSON.

Run from the repo root, using the project venv, after tools/fetch_tiger.py:

    .venv/bin/python tools/tiger_lines.py

tools/map-overlay.mjs compares the game with this output. It comes from the zips rather than
the lon/lat in data/roads.json, so the comparison doesn't lean on what the build wrote. The
JSON only says which LINEARIDs to read.

Rail features are identified by LINEARID only. TIGER's rail names can be real operator brands,
so that field isn't even read.
"""

import json
import sys
from collections import defaultdict

from build_roads import (
    OUTPUT_PATH,
    read_rail_records,
    read_river_records,
    read_road_records,
    reference_area,
)


def lines_of(records):
    return [[list(point) for point in record.points] for record in records]


def main():
    data = json.loads(OUTPUT_PATH.read_text())
    by_id = defaultdict(list)
    for record in read_road_records():
        by_id[record.linear_id].append(record)
    roads = {road["id"]: [r for i in road["linearIds"] for r in by_id[i]] for road in data["roads"]}

    # TIGER is one planar topology, so roads that meet share a vertex, compared exactly
    on_vertex = defaultdict(set)
    for id_, records in roads.items():
        for r in records:
            for point in r.points:
                on_vertex[point].add(id_)
    intersections = [
        {"roads": sorted(ids), "lon": lon, "lat": lat}
        for (lon, lat), ids in sorted(on_vertex.items())
        if len(ids) > 1
    ]

    rail_ids = set(data["reference"]["railroad"]["linearIds"])
    rail = [r for r in read_rail_records(reference_area(data)) if r.linear_id in rail_ids]
    json.dump(
        {
            "area": reference_area(data),
            "roads": {id_: lines_of(records) for id_, records in roads.items()},
            "railroad": lines_of(rail),
            "river": lines_of(read_river_records()),
            "intersections": intersections,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
