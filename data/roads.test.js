// Checks data/roads.json by itself: no TIGER zips, Python or network. The last
// block also holds data/roads.md to it, so the docs can't drift from the data.
//
// Every vertex in the file keeps its TIGER lon/lat beside its game x/z, so most
// of this re-derives the game side from the lon/lat side. Comparing the file
// against raw TIGER is the job of tools/build_roads.py.
//
// "True" means before compression: metres from town center, straight from
// lon/lat. "Game" means the x/z written in the file. In both, +x is east and -z
// is north.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const data = JSON.parse(readFileSync(new URL('./roads.json', import.meta.url), 'utf8'));

// The projection from CLAUDE.md, hard-coded so the file can't vouch for itself.
const R = 6371000;
const LAT0 = 32.32583;
const LON0 = -88.92806;
const RADIANS = Math.PI / 180;

const trueX = (lon) => R * ((lon - LON0) * RADIANS) * Math.cos(LAT0 * RADIANS);
const trueZ = (lat) => -R * ((lat - LAT0) * RADIANS);

// Written coordinates are rounded to 1 mm.
const TOLERANCE_M = 0.002;
// How close to a band edge counts as exactly on it, the same as in the build.
const ON_BAND_EDGE_M = 0.001;
const MIN_TURN_DEGREES = 0.5;

const TICKET_ROADS = [
  { name: 'US 80', tigerNames: ['US Hwy 80'] },
  { name: 'Adams Street', tigerNames: ['Adams St'] },
  { name: 'Church St', tigerNames: ['Church St'] },
  { name: 'Meehan-Savoy Rd', tigerNames: ['Meehan Savoy Rd S', 'Meehan Savoy Rd W'] },
];

// The ticket's positions, as metres east of town center.
const TICKET_TRESTLES = [
  { id: 'trestle-east-near', side: 'east', eastM: 580 },
  { id: 'trestle-east-far', side: 'east', eastM: 1070 },
  { id: 'trestle-west', side: 'west', eastM: -4160, label: 'break down' },
];

// Regression sequences from the step 2 inspector, tools/inspect_tiger.py: its
// clip vertices, shared vertices and the first I-20 ramp on Adams Street's line,
// with the rounded true metres it printed.
const US_80_SEQUENCE = [
  { lon: -88.977682, lat: 32.32418, trueX: -4663, trueZ: 183, kind: 'clip', meets: [] },
  { lon: -88.931069, lat: 32.326036, trueX: -283, trueZ: -23, kind: 'junction', meets: ['adams_st'] },
  { lon: -88.86625, lat: 32.327776, trueX: 5808, trueZ: -216, kind: 'junction', meets: ['meehan_savoy_rd'] },
  { lon: -88.861459, lat: 32.330993, trueX: 6258, trueZ: -574, kind: 'clip', meets: [] },
];
const ADAMS_STREET_SEQUENCE = [
  { lon: -88.931069, lat: 32.326036, trueX: -283, trueZ: -23, kind: 'junction', meets: ['us_80'] },
  { lon: -88.931047, lat: 32.32762, trueX: -281, trueZ: -199, kind: 'junction', meets: ['church_st'] },
  { lon: -88.931164, lat: 32.340809, trueX: -292, trueZ: -1666, kind: 'clip', meets: [], connectsTo: 'I-20' },
];

const nodeById = new Map(data.nodes.map((node) => [node.id, node]));
const edgeById = new Map(data.edges.map((edge) => [edge.id, edge]));
const roadById = new Map(data.roads.map((road) => [road.id, road]));
const roadNamed = (name) => data.roads.find((road) => road.name === name);
const { railroad, river, trestles, crossings } = data.reference;

const referenceLines = [
  ...railroad.lines.map((line, i) => ({ ...line, label: `railroad line ${i + 1}` })),
  ...river.lines.map((line, i) => ({ ...line, label: `river line ${i + 1}` })),
];
const storedLines = [
  ...data.edges.map((edge) => ({ ...edge, label: `edge ${edge.id}` })),
  ...referenceLines,
];

// Every lon/lat in the file, beside the x/z written for it.
const allVertices = [
  ...storedLines.flatMap((line) =>
    line.lonlat.map(([lon, lat], i) => {
      const [x, z] = line.points[i] ?? [];
      return { label: `${line.label} vertex ${i}`, lon, lat, x, z };
    }),
  ),
  ...data.nodes.map((node) => ({ ...node, label: `node ${node.id}` })),
  ...trestles.map((trestle) => ({ ...trestle, label: `trestle ${trestle.id}` })),
  ...crossings.map((crossing, i) => ({ ...crossing, label: `crossing ${i + 1}` })),
];

// compression[] as a function of true x: scaled inside a band, shifted past it,
// unchanged at town center. Bands must run west to east, which the compression
// test checks.
function remapX(x) {
  let shift = data.compression.length ? data.compression[0].gameFrom - data.compression[0].trueFrom : 0;
  for (const band of data.compression) {
    if (x <= band.trueFrom) return x + shift;
    if (x < band.trueTo) return band.gameFrom + (x - band.trueFrom) * band.factor;
    shift = band.gameTo - band.trueTo;
  }
  return x + shift;
}

// A road's edges joined into one line. Each later edge repeats the vertex the
// previous one ended on, so that copy is dropped.
function walk(road) {
  const line = { label: `road ${road.id}`, points: [], lonlat: [], synthetic: [] };
  road.edges.forEach((edgeId, position) => {
    const edge = edgeById.get(edgeId);
    const skip = position === 0 ? 0 : 1;
    const base = line.points.length - skip;
    line.points.push(...edge.points.slice(skip));
    line.lonlat.push(...edge.lonlat.slice(skip));
    line.synthetic.push(...edge.synthetic.map((i) => i + base));
  });
  return line;
}

// The two spaces drawn the same way up, x east and y north, so a positive cross
// product means a left turn in both. Game z runs south, which would otherwise
// mirror every turn.
const trueNorthUp = ([lon, lat]) => [trueX(lon), -trueZ(lat)];
const gameNorthUp = ([x, z]) => [x, -z];

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function turnDegrees(a, b, c) {
  const along = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
  return Math.abs(Math.atan2(cross(a, b, c), along)) / RADIANS;
}

function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  return distance(p, [a[0] + clamped * dx, a[1] + clamped * dy]);
}

// Where two segments touch. A proper crossing gives its one point. Any other
// contact includes an endpoint of one of them, so segments overlapping along a
// line list every endpoint inside the overlap, not only one they happen to share.
function contacts(a1, a2, b1, b2) {
  const a1Side = cross(b1, b2, a1);
  const a2Side = cross(b1, b2, a2);
  if (a1Side * a2Side < 0 && cross(a1, a2, b1) * cross(a1, a2, b2) < 0) {
    const t = a1Side / (a1Side - a2Side);
    return [[a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])]];
  }
  return [
    ...[a1, a2].filter((p) => distanceToSegment(p, b1, b2) <= TOLERANCE_M),
    ...[b1, b2].filter((p) => distanceToSegment(p, a1, a2) <= TOLERANCE_M),
  ];
}

// Distance along a line at each of its vertices.
function chainage(points) {
  const along = [0];
  for (let i = 1; i < points.length; i += 1) {
    along.push(along[i - 1] + distance(points[i - 1], points[i]));
  }
  return along;
}

function nearestToCenter(road) {
  const points = walk(road).lonlat.map(trueNorthUp);
  let nearest = Infinity;
  for (let i = 1; i < points.length; i += 1) {
    nearest = Math.min(nearest, distanceToSegment([0, 0], points[i - 1], points[i]));
  }
  return nearest;
}

function assertNear(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= TOLERANCE_M,
    `${label}: ${actual} is not within ${TOLERANCE_M} m of ${expected}`,
  );
}

const sameVertex = (a, b) => a[0] === b[0] && a[1] === b[1];

function isOnLines(lines, { lon, lat }) {
  return lines.some((line) => line.lonlat.some((vertex) => sameVertex(vertex, [lon, lat])));
}

function assertSequence(road, expected) {
  const actual = road.nodes.map((id) => {
    const node = nodeById.get(id);
    return {
      lon: node.lon,
      lat: node.lat,
      trueX: Math.round(trueX(node.lon)),
      trueZ: Math.round(trueZ(node.lat)),
      kind: node.kind,
      meets: node.roads.filter((roadId) => roadId !== road.id),
      ...(node.connectsTo === undefined ? {} : { connectsTo: node.connectsTo }),
    };
  });
  assert.deepEqual(actual, expected);
}

describe('the road graph loads and contains the ticket roads', () => {
  test('the file parses with its sections, CLAUDE.md origin and axes', () => {
    for (const section of ['nodes', 'roads', 'edges', 'compression']) {
      assert.ok(Array.isArray(data[section]), `${section} should be an array`);
    }
    assert.equal(data.units, 'm');
    assert.deepEqual(data.origin, { lat: LAT0, lon: LON0 });
    assert.equal(data.projection.radiusM, R);
    assert.equal(data.axes['+x'], 'east');
    assert.equal(data.axes['-z'], 'north');
  });

  test('every line has matching points and lonlat', () => {
    for (const line of storedLines) {
      assert.ok(line.points.length >= 2, `${line.label} has under two vertices`);
      assert.equal(line.lonlat.length, line.points.length, `${line.label} points and lonlat differ`);
      for (const vertex of [...line.points, ...line.lonlat]) {
        assert.ok(
          vertex.length === 2 && vertex.every(Number.isFinite),
          `${line.label} has a bad vertex: ${JSON.stringify(vertex)}`,
        );
      }
    }
  });

  test('every node and edge reference resolves', () => {
    assert.equal(nodeById.size, data.nodes.length, 'node ids should be unique');
    assert.equal(edgeById.size, data.edges.length, 'edge ids should be unique');
    assert.equal(roadById.size, data.roads.length, 'road ids should be unique');

    for (const road of data.roads) {
      for (const id of road.nodes) assert.ok(nodeById.has(id), `${road.id}: no node ${id}`);
      for (const id of road.edges) assert.ok(edgeById.has(id), `${road.id}: no edge ${id}`);
    }
    for (const edge of data.edges) {
      assert.ok(roadById.has(edge.road), `${edge.id}: no road ${edge.road}`);
      assert.ok(roadById.get(edge.road).edges.includes(edge.id), `${edge.road} doesn't list ${edge.id}`);
      assert.ok(nodeById.has(edge.from), `${edge.id}: no node ${edge.from}`);
      assert.ok(nodeById.has(edge.to), `${edge.id}: no node ${edge.to}`);
    }
    for (const node of data.nodes) {
      assert.ok(node.roads.length >= 1, `${node.id} lists no road`);
      for (const id of node.roads) {
        assert.ok(roadById.has(id), `${node.id}: no road ${id}`);
        assert.ok(roadById.get(id).nodes.includes(node.id), `${id} doesn't list ${node.id}`);
      }
    }
    for (const road of data.roads) {
      for (const id of road.nodes) {
        assert.ok(nodeById.get(id).roads.includes(road.id), `${id} doesn't list ${road.id}`);
      }
    }
    for (const crossing of crossings) {
      assert.ok(roadById.has(crossing.road), `crossing: no road ${crossing.road}`);
    }
  });

  test('each road chains its edges through its nodes', () => {
    for (const road of data.roads) {
      assert.equal(road.nodes.length, road.edges.length + 1, `${road.id} nodes and edges don't chain`);
      road.edges.forEach((id, i) => {
        const edge = edgeById.get(id);
        const from = nodeById.get(road.nodes[i]);
        const to = nodeById.get(road.nodes[i + 1]);
        assert.equal(edge.road, road.id, `${id} belongs to ${edge.road}`);
        assert.equal(edge.from, from.id, `${id} should start at ${from.id}`);
        assert.equal(edge.to, to.id, `${id} should end at ${to.id}`);
        assert.deepEqual(edge.lonlat[0], [from.lon, from.lat], `${id} lonlat start`);
        assert.deepEqual(edge.lonlat.at(-1), [to.lon, to.lat], `${id} lonlat end`);
        assert.deepEqual(edge.points[0], [from.x, from.z], `${id} points start`);
        assert.deepEqual(edge.points.at(-1), [to.x, to.z], `${id} points end`);
      });
    }
  });

  for (const { name, tigerNames } of TICKET_ROADS) {
    test(`${name} has a width, surface, edges and its TIGER names`, () => {
      const road = roadNamed(name);
      assert.ok(road, `no road named ${name}`);
      assert.equal(typeof road.surface, 'string', `${name} surface`);
      assert.ok(road.surface.trim().length > 0, `${name} has an empty surface`);
      assert.equal(typeof road.width, 'number', `${name} width`);
      assert.ok(road.width > 0, `${name} has width ${road.width}`);
      assert.ok(road.edges.length >= 1, `${name} has no edges`);
      for (const tigerName of tigerNames) {
        assert.ok(road.tigerNames.includes(tigerName), `${name} is missing TIGER name ${tigerName}`);
      }
    });
  }

  test('width and surface come from the road class unless overridden', () => {
    for (const road of data.roads) {
      assert.ok(['class', 'override'].includes(road.specSource), `${road.id}: ${road.specSource}`);
      if (road.specSource === 'override') continue;
      const roadClass = data.roadClasses[road.mtfcc];
      assert.ok(roadClass, `${road.id}: no road class ${road.mtfcc}`);
      assert.equal(road.width, roadClass.width, `${road.id} width`);
      assert.equal(road.surface, roadClass.surface, `${road.id} surface`);
    }
  });

  test('Church St comes within 500 m of town center', () => {
    const nearest = nearestToCenter(roadNamed('Church St'));
    assert.ok(nearest <= 500, `nearest point is ${nearest} m away`);
  });

  test("Meehan-Savoy Rd's nearest point is 5.6 km from town center, within 300 m", () => {
    const nearest = nearestToCenter(roadNamed('Meehan-Savoy Rd'));
    assert.ok(Math.abs(nearest - 5600) <= 300, `nearest point is ${nearest} m away`);
  });

  // TIGER agrees with the ticket here: US 80 and Adams St share a vertex at Adams
  // St's south end.
  test('Adams Street has a junction with US 80', () => {
    const adams = roadNamed('Adams Street');
    const us80 = roadNamed('US 80');
    const junction = data.nodes.find(
      (node) => node.kind === 'junction' && node.roads.includes(adams.id) && node.roads.includes(us80.id),
    );
    assert.ok(junction, 'no junction node lists both roads');
  });

  // TIGER's Adams St stops 870 m north of US 80 and carries on with no gap under
  // three other names, so the step 2 inspection recorded a name change and not a
  // gap. The graph follows those names to the first ramp of the I-20 interchange,
  // and marks where it stops with connectsTo.
  test('Adams Street reaches its connectsTo I-20 node under its later names', () => {
    const adams = roadNamed('Adams Street');
    assert.equal(nodeById.get(adams.nodes.at(-1)).connectsTo, 'I-20');
    for (const tigerName of ['Chunkey Duffee Rd', 'Chunky Duffee Rd', 'State Hwy 889']) {
      assert.ok(adams.tigerNames.includes(tigerName), `missing TIGER name ${tigerName}`);
    }
  });
});

describe('intersections and turns keep their TIGER order', () => {
  test('x re-derives from each lon/lat through the projection and compression[]', () => {
    for (const { label, lon, x } of allVertices) {
      assertNear(x, remapX(trueX(lon)), `${label} x`);
    }
  });

  test('z is the unremapped projection everywhere, so north is never altered', () => {
    for (const { label, lat, z } of allVertices) {
      assertNear(z, trueZ(lat), `${label} z`);
    }
  });

  // The next test skips synthetic vertices, so this one stops the list hiding a
  // real turn: they have to be the splits at band edges and nothing else.
  test('synthetic vertices are exactly the splits where a line crosses a band edge', () => {
    const bandEdges = data.compression.flatMap((band) => [band.trueFrom, band.trueTo]);
    for (const line of storedLines) {
      const xs = line.lonlat.map(([lon]) => trueX(lon));
      const northUp = line.lonlat.map(trueNorthUp);
      const synthetic = new Set(line.synthetic);
      assert.equal(synthetic.size, line.synthetic.length, `${line.label} repeats a synthetic index`);
      for (const i of line.synthetic) {
        assert.ok(i > 0 && i < xs.length - 1, `${line.label} synthetic ${i} isn't interior`);
      }

      xs.forEach((x, i) => {
        const onBandEdge = bandEdges.some((bandEdge) => Math.abs(x - bandEdge) <= ON_BAND_EDGE_M);
        assert.equal(synthetic.has(i), onBandEdge, `${line.label} vertex ${i} at true x ${x}`);
        if (i === 0) return;
        for (const bandEdge of bandEdges) {
          const crosses =
            Math.min(xs[i - 1], x) < bandEdge - ON_BAND_EDGE_M &&
            Math.max(xs[i - 1], x) > bandEdge + ON_BAND_EDGE_M;
          assert.ok(!crosses, `${line.label} segment to vertex ${i} crosses ${bandEdge} unsplit`);
        }
      });

      // Each sits on the straight TIGER segment it split.
      for (const i of line.synthetic) {
        let before = i - 1;
        let after = i + 1;
        while (synthetic.has(before)) before -= 1;
        while (synthetic.has(after)) after += 1;
        const off = distanceToSegment(northUp[i], northUp[before], northUp[after]);
        assert.ok(off <= TOLERANCE_M, `${line.label} synthetic ${i} is ${off} m off its segment`);
      }
    }
  });

  test('every true turn of at least 0.5 degrees turns the same way in game space', () => {
    let checked = 0;
    for (const line of [...data.roads.map(walk), ...referenceLines]) {
      const synthetic = new Set(line.synthetic);
      const truePoints = line.lonlat.map(trueNorthUp);
      const gamePoints = line.points.map(gameNorthUp);
      for (let i = 1; i < line.points.length - 1; i += 1) {
        if (synthetic.has(i)) continue;
        if (turnDegrees(truePoints[i - 1], truePoints[i], truePoints[i + 1]) < MIN_TURN_DEGREES) continue;
        checked += 1;
        assert.equal(
          Math.sign(cross(gamePoints[i - 1], gamePoints[i], gamePoints[i + 1])),
          Math.sign(cross(line.lonlat[i - 1], line.lonlat[i], line.lonlat[i + 1])),
          `${line.label} vertex ${i} at ${line.lonlat[i]} turns the other way in game space`,
        );
      }
    }
    assert.ok(checked > 1000, `only ${checked} turns checked`);
  });

  test("each road's nodes are at strictly increasing positions, true and game", () => {
    for (const road of data.roads) {
      const line = walk(road);
      const indices = road.nodes.map((id) => {
        const node = nodeById.get(id);
        const matches = line.lonlat.flatMap((vertex, i) =>
          sameVertex(vertex, [node.lon, node.lat]) ? [i] : [],
        );
        assert.equal(matches.length, 1, `${road.id} should pass through ${id} once`);
        return matches[0];
      });
      const trueAlong = chainage(line.lonlat.map(trueNorthUp));
      const gameAlong = chainage(line.points);
      for (let k = 1; k < indices.length; k += 1) {
        const [before, after] = [indices[k - 1], indices[k]];
        const nodes = `${road.nodes[k - 1]} then ${road.nodes[k]}`;
        assert.ok(trueAlong[after] > trueAlong[before], `${road.id} true order: ${nodes}`);
        assert.ok(gameAlong[after] > gameAlong[before], `${road.id} game order: ${nodes}`);
      }
    }
  });

  test('every vertex two roads share is a node listing both', () => {
    const roadsAt = new Map();
    for (const edge of data.edges) {
      for (const [lon, lat] of edge.lonlat) {
        const key = `${lon},${lat}`;
        if (!roadsAt.has(key)) roadsAt.set(key, new Set());
        roadsAt.get(key).add(edge.road);
      }
    }
    const nodeAt = new Map(data.nodes.map((node) => [`${node.lon},${node.lat}`, node]));

    let shared = 0;
    for (const [key, roads] of roadsAt) {
      if (roads.size < 2) continue;
      shared += 1;
      const node = nodeAt.get(key);
      assert.ok(node, `${[...roads]} share ${key}, which isn't a node`);
      for (const road of roads) {
        assert.ok(node.roads.includes(road), `${node.id} at ${key} doesn't list ${road}`);
      }
    }
    assert.equal(shared, 3, 'US 80 with Adams Street and Meehan-Savoy Rd, Adams Street with Church St');
  });

  test('no two edges touch in game space except at a node they share', () => {
    data.edges.forEach((edgeA, index) => {
      for (const edgeB of data.edges.slice(index + 1)) {
        const pair = `${edgeA.id} and ${edgeB.id}`;
        const shared = [edgeA.from, edgeA.to]
          .filter((id) => id === edgeB.from || id === edgeB.to)
          .map((id) => nodeById.get(id));
        const reached = new Set();
        const [a, b] = [edgeA.points, edgeB.points];
        for (let i = 1; i < a.length; i += 1) {
          for (let j = 1; j < b.length; j += 1) {
            for (const point of contacts(a[i - 1], a[i], b[j - 1], b[j])) {
              const node = shared.find(({ x, z }) => distance([x, z], point) <= TOLERANCE_M);
              assert.ok(node, `${pair} touch at x ${point[0]}, z ${point[1]}, not at a shared node`);
              reached.add(node.id);
            }
          }
        }
        // The contact check has to find the junctions that are really there.
        assert.equal(reached.size, shared.length, `${pair} should meet at ${shared.map(({ id }) => id)}`);
      }
    });
  });

  test("US 80's west-to-east node sequence matches the inspection", () => {
    const us80 = roadNamed('US 80');
    assertSequence(us80, US_80_SEQUENCE);

    // The inspection also found US 80 strictly west to east at every vertex.
    const line = walk(us80);
    for (let i = 1; i < line.points.length; i += 1) {
      assert.ok(line.points[i][0] > line.points[i - 1][0], `game x falls at US 80 vertex ${i}`);
      assert.ok(line.lonlat[i][0] > line.lonlat[i - 1][0], `longitude falls at US 80 vertex ${i}`);
    }
  });

  test("Adams Street's node sequence from US 80 towards I-20 matches the inspection", () => {
    assertSequence(roadNamed('Adams Street'), ADAMS_STREET_SEQUENCE);
  });
});

describe('reference data and compression', () => {
  test('there are exactly three trestles, each on the railroad and the river', () => {
    assert.equal(trestles.length, 3);
    for (const trestle of trestles) {
      assert.ok(isOnLines(railroad.lines, trestle), `${trestle.id} isn't a railroad vertex`);
      assert.ok(isOnLines(river.lines, trestle), `${trestle.id} isn't a river vertex`);
    }
  });

  // The ticket's "km east" or "km west" could mean the east-west offset or the
  // straight-line distance. They differ by 64 m on the west trestle, so both have
  // to be within 100 m.
  test('trestle positions match the ticket within 100 m, in true metres', () => {
    for (const { id, side, eastM, label } of TICKET_TRESTLES) {
      const trestle = trestles.find((candidate) => candidate.id === id);
      assert.ok(trestle, `no trestle ${id}`);
      assert.equal(trestle.side, side, `${id} side`);
      assert.equal(trestle.label, label, `${id} label`);
      const x = trueX(trestle.lon);
      const straightLine = Math.hypot(x, trueZ(trestle.lat));
      assert.ok(Math.abs(x - eastM) <= 100, `${id} is ${x} m east, ticket ${eastM}`);
      assert.ok(Math.abs(straightLine - Math.abs(eastM)) <= 100, `${id} is ${straightLine} m from center`);
    }
  });

  test('the railroad has the generic name', () => {
    assert.equal(railroad.name, 'Railroad');
  });

  // Slope 1 outside the bands, a positive factor inside and no jump at any edge
  // make the map strictly increasing for every x.
  test('compression[] is continuous and strictly increasing', () => {
    let shift = data.compression.length ? data.compression[0].gameFrom - data.compression[0].trueFrom : 0;
    let previousTrueTo = -Infinity;
    for (const band of data.compression) {
      assert.equal(band.axis, 'x');
      assert.ok(band.trueFrom >= previousTrueTo, 'bands should run west to east without overlapping');
      assert.ok(band.trueTo > band.trueFrom, 'a band should run west to east');
      assert.ok(band.factor > 0 && band.factor < 1, `factor ${band.factor}`);
      assertNear(band.gameFrom, band.trueFrom + shift, 'gameFrom');
      assertNear(band.gameTo, band.gameFrom + (band.trueTo - band.trueFrom) * band.factor, 'gameTo');
      shift = band.gameTo - band.trueTo;
      previousTrueTo = band.trueTo;
    }
  });

  test('town center stays where it is', () => {
    for (const band of data.compression) {
      assert.ok(band.trueFrom >= 0 || band.trueTo <= 0, `band at ${band.trueFrom} holds town center`);
    }
    assert.equal(remapX(0), 0);
  });

  test('game x strictly increases with true x across every vertex in the file', () => {
    const vertices = allVertices
      .map(({ label, lon, x }) => ({ label, x, xTrue: trueX(lon) }))
      .sort((a, b) => a.xTrue - b.xTrue);
    for (let i = 1; i < vertices.length; i += 1) {
      const [a, b] = [vertices[i - 1], vertices[i]];
      const order = `${a.label} (true ${a.xTrue}, game ${a.x}), ${b.label} (true ${b.xTrue}, game ${b.x})`;
      if (b.xTrue - a.xTrue > TOLERANCE_M) {
        assert.ok(b.x > a.x, `out of order: ${order}`);
      } else {
        assertNear(b.x, a.x, `same true x, different game x: ${order}`);
      }
    }
  });

  test('no node or trestle sits inside a band', () => {
    for (const { label, lon, x } of [
      ...data.nodes.map((node) => ({ ...node, label: `node ${node.id}` })),
      ...trestles.map((trestle) => ({ ...trestle, label: `trestle ${trestle.id}` })),
    ]) {
      for (const band of data.compression) {
        const xTrue = trueX(lon);
        assert.ok(xTrue < band.trueFrom || xTrue > band.trueTo, `${label} is at true x ${xTrue}, inside a band`);
        assert.ok(x < band.gameFrom || x > band.gameTo, `${label} is at game x ${x}, inside a band`);
      }
    }
  });
});

// Everything data/roads.md copies from the JSON is compared by table row, so a
// value can't pass by appearing somewhere else on the page. Each comparison runs
// both ways, so a row left behind after the data changes fails too.
describe('data/roads.md matches the data', () => {
  const docs = readFileSync(new URL('./roads.md', import.meta.url), 'utf8');

  // The text under a heading, up to the next heading of the same or a higher level.
  function docsSection(title) {
    const lines = docs.split('\n');
    const level = (line) => /^(#+) /.exec(line)?.[1].length ?? Infinity;
    const start = lines.findIndex((line) => level(line) !== Infinity && line.replace(/^#+ /, '') === title);
    assert.notEqual(start, -1, `data/roads.md has no "${title}" heading`);
    const end = lines.findIndex((line, i) => i > start && level(line) <= level(lines[start]));
    return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
  }

  // Each table row under a heading, as an object keyed by its column headings,
  // with the backticks taken off its cells.
  function tableRows(title) {
    const cells = (line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replaceAll('`', ''));
    const rows = [];
    let headings = null;
    for (const line of docsSection(title).split('\n').map((text) => text.trim())) {
      if (!line.startsWith('|')) {
        headings = null;
      } else if (!headings) {
        headings = cells(line);
      } else if (!/^[|\s:-]+$/.test(line)) {
        const values = cells(line);
        rows.push(Object.fromEntries(headings.map((heading, i) => [heading, values[i]])));
      }
    }
    return rows;
  }

  const sorted = (values) => [...values].sort();
  const commaList = (values) => values.join(', ');

  // A number standing alone, so 223 can't pass by appearing inside 1223.
  function mentionsNumber(text, value) {
    const escaped = String(value).replaceAll('.', '\\.');
    return new RegExp(`(?<![\\d.])${escaped}(?!\\d)`).test(text);
  }

  // Every field path in the file, with [] for an array of objects. roadClasses is
  // keyed by code, so its codes collapse to <code>.
  function fieldPaths(value, path = '') {
    const isObject = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);
    if (Array.isArray(value) && value.some(isObject)) {
      return value.flatMap((item) => fieldPaths(item, `${path}[]`));
    }
    if (!isObject(value)) return [path];
    return Object.entries(value).flatMap(([key, item]) =>
      fieldPaths(item, path === 'roadClasses' ? `${path}.<code>` : path ? `${path}.${key}` : key),
    );
  }

  test('it gives the vintage and base URL, and no other vintage', () => {
    const sourcing = docsSection('Sourcing');
    assert.ok(sourcing.includes(data.source.vintage), `no ${data.source.vintage} under Sourcing`);
    assert.ok(sourcing.includes(data.source.baseUrl), `no ${data.source.baseUrl} under Sourcing`);
    assert.deepEqual([...new Set(docs.match(/TIGER\/Line \d{4}/g))], [data.source.vintage]);
  });

  test('it lists every source file with its sha256, and no other', () => {
    const rows = tableRows('Sourcing');
    assert.deepEqual(sorted(rows.map((row) => row.File)), sorted(data.source.files.map((file) => file.path)));
    for (const { path, sha256 } of data.source.files) {
      assert.equal(rows.find((row) => row.File === path).sha256, sha256, `${path} sha256`);
    }
    assert.deepEqual(
      sorted(new Set(docs.match(/\b[0-9a-f]{64}\b/g))),
      sorted(data.source.files.map((file) => file.sha256)),
      'every hash on the page should be a source file hash',
    );
  });

  test('it lists every field in the file under Schema, and no other', () => {
    assert.deepEqual(
      sorted(new Set(tableRows('Schema').map((row) => row.Field))),
      sorted(new Set(fieldPaths(data))),
    );
  });

  test('it maps every road to its id, TIGER names and LINEARIDs', () => {
    const rows = tableRows('Road names').filter((row) => 'Display name' in row);
    assert.deepEqual(sorted(rows.map((row) => row['Display name'])), sorted(data.roads.map((road) => road.name)));
    for (const road of data.roads) {
      const row = rows.find((candidate) => candidate['Display name'] === road.name);
      assert.equal(row['Road id'], road.id, `${road.name} id`);
      assert.equal(row['TIGER names'], commaList(road.tigerNames), `${road.name} TIGER names`);
      assert.equal(row.LINEARIDs, commaList(road.linearIds), `${road.name} LINEARIDs`);
    }
  });

  test('it lists every roadClasses code with its width and surface, and no other', () => {
    const rows = tableRows('By road class');
    assert.deepEqual(sorted(rows.map((row) => row.MTFCC)), sorted(Object.keys(data.roadClasses)));
    for (const [code, { label, width, surface }] of Object.entries(data.roadClasses)) {
      const row = rows.find((candidate) => candidate.MTFCC === code);
      assert.equal(row.Class, label, `${code} label`);
      assert.equal(Number(row['Width (m)']), width, `${code} width`);
      assert.equal(row.Surface, surface, `${code} surface`);
    }
  });

  test('it gives every road its class, width, surface and source', () => {
    const rows = tableRows('By road');
    assert.deepEqual(sorted(rows.map((row) => row.Road)), sorted(data.roads.map((road) => road.name)));
    for (const road of data.roads) {
      const row = rows.find((candidate) => candidate.Road === road.name);
      assert.equal(row.MTFCC, road.mtfcc, `${road.name} class`);
      assert.equal(Number(row['Width (m)']), road.width, `${road.name} width`);
      assert.equal(row.Surface, road.surface, `${road.name} surface`);
      assert.equal(row.Source, road.specSource, `${road.name} source`);
    }
  });

  test('it lists every override with a reason, or says there are none', () => {
    const overridden = data.roads.filter((road) => road.specSource === 'override');
    const rows = tableRows('Overrides');
    assert.deepEqual(sorted(rows.map((row) => row.Road)), sorted(overridden.map((road) => road.name)));
    for (const road of overridden) {
      const row = rows.find((candidate) => candidate.Road === road.name);
      assert.equal(Number(row['Width (m)']), road.width, `${road.name} override width`);
      assert.equal(row.Surface, road.surface, `${road.name} override surface`);
      assert.ok(row.Reason, `${road.name} override has no reason`);
    }
    assert.equal(
      /\bno overrides\b/i.test(docsSection('Overrides')),
      overridden.length === 0,
      'the page should say "No overrides" exactly when there are none',
    );
  });

  test('it lists every compression band with its ranges, factor and reason, and no other', () => {
    const rows = tableRows('Compressed stretches').map((row) => ({
      trueFrom: Number(row['True x from']),
      trueTo: Number(row['True x to']),
      gameFrom: Number(row['Game x from']),
      gameTo: Number(row['Game x to']),
      factor: Number(row.Factor),
    }));
    assert.deepEqual(
      rows,
      data.compression.map(({ trueFrom, trueTo, gameFrom, gameTo, factor }) => ({
        trueFrom,
        trueTo,
        gameFrom,
        gameTo,
        factor,
      })),
    );
    for (const band of data.compression) {
      assert.ok(docsSection('Compressed stretches').includes(band.reason), `no reason for band at ${band.trueFrom}`);
    }
  });

  test('its conversion gives the projection constants and every band', () => {
    const conversion = docsSection('Lat/long to game coordinates');
    const constants = [data.projection.radiusM, data.origin.lat, data.origin.lon];
    const bandValues = data.compression.flatMap((band) => [
      band.trueFrom,
      band.trueTo,
      band.gameFrom,
      band.gameTo,
      band.factor,
      Number(Math.abs(band.gameTo - band.trueTo).toFixed(6)),
    ]);
    for (const value of [...constants, ...bandValues]) {
      assert.ok(mentionsNumber(conversion, value), `the conversion doesn't mention ${value}`);
    }
  });
});
