// Checks the debug plot against data/roads.json: no TIGER zips, Python or network.
// The script is only run with an output path under the system temp directory, so
// no rendered plot lands in the repo.
//
// Node has no XML parser, so these read the SVG with small regular expressions.
// That works because tools/plot-roads.js escapes every attribute and label.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { renderRoadPlot, toPlot } from './plot-roads.js';

const SCRIPT = fileURLToPath(new URL('./plot-roads.js', import.meta.url));
const graph = JSON.parse(readFileSync(new URL('../data/roads.json', import.meta.url), 'utf8'));
const { railroad, river, trestles } = graph.reference;
const svg = renderRoadPlot(graph);

// Written coordinates keep 4 decimals, with a little room for float noise.
const WRITTEN_PX = 0.000051;

const LAYERS = [
  'road-us-80',
  'road-adams-st',
  'road-church-st',
  'road-meehan-savoy-rd',
  'railroad',
  'river',
  'trestles',
  'nodes',
  'origin',
  'north-arrow',
  'scale-bar',
  'legend',
  'compression',
];

const attributesOf = (tag) =>
  Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));

const tagsIn = (source, name) =>
  [...source.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map(([tag]) => attributesOf(tag));

const textsIn = (source) => [...source.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(([, text]) => text);

// The source of one data-layer group, including any groups nested inside it.
function layerIn(source, name) {
  const start = source.indexOf(`<g data-layer="${name}"`);
  assert.notEqual(start, -1, `no ${name} layer`);
  let depth = 0;
  for (const { 0: tag, index } of source.slice(start).matchAll(/<g\b|<\/g>/g)) {
    depth += tag === '</g>' ? -1 : 1;
    if (depth === 0) return source.slice(start, start + index + tag.length);
  }
  return assert.fail(`the ${name} layer never closes`);
}

const layer = (name) => layerIn(svg, name);

// The vertices of one unbroken path: an M, then Ls, then maybe a Z.
function vertices(d) {
  return d
    .replace(/\s*Z$/, '')
    .split(/\s*(?=[ML])/)
    .map((command, i) => {
      const match = command.match(/^([ML])(-?[\d.]+) (-?[\d.]+)$/);
      assert.ok(match, `bad path command: ${command}`);
      assert.equal(match[1], i === 0 ? 'M' : 'L', 'a line should be one unbroken run');
      return [Number(match[2]), Number(match[3])];
    });
}

function viewOf(source) {
  const [root] = tagsIn(source, 'svg');
  return {
    scale: Number(root['data-scale']),
    originX: Number(root['data-origin-x']),
    originY: Number(root['data-origin-y']),
  };
}

const view = viewOf(svg);

function assertAt(actual, [x, z], label) {
  const [plotX, plotY] = toPlot(x, z, view);
  assert.ok(
    Math.abs(actual[0] - plotX) <= WRITTEN_PX && Math.abs(actual[1] - plotY) <= WRITTEN_PX,
    `${label}: drawn at ${actual}, toPlot gives ${[plotX, plotY]}`,
  );
}

function assertPathIs(d, points, label) {
  const drawn = vertices(d);
  assert.equal(drawn.length, points.length, `${label} vertex count`);
  drawn.forEach((vertex, i) => assertAt(vertex, points[i], `${label} vertex ${i}`));
}

// A road's edges joined into one line, without the vertex each later edge repeats.
const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
const walk = (road, field) =>
  road.edges.flatMap((id, i) => edgeById.get(id)[field].slice(i === 0 ? 0 : 1));
const roadPoints = (road) => walk(road, 'points');
const roadLonlat = (road) => walk(road, 'lonlat');

const roadNamed = (name) => graph.roads.find((road) => road.name === name);
const roadPath = (name) => tagsIn(layer(name), 'path')[0].d;

describe('toPlot', () => {
  const views = [
    { scale: 0.5, originX: 100, originY: 200 },
    { scale: 0.1, originX: -40, originY: 7 },
    { scale: 3, originX: 0, originY: 0 },
  ];

  test('a point further north has a smaller SVG y and the same SVG x', () => {
    for (const testView of views) {
      const [southX, southY] = toPlot(250, 40, testView);
      const [northX, northY] = toPlot(250, -40, testView);
      assert.ok(northY < southY, `north ${northY} should be above south ${southY}`);
      assert.equal(northX, southX);
    }
  });

  test('a point further east has a larger SVG x and the same SVG y', () => {
    for (const testView of views) {
      const [westX, westY] = toPlot(-250, 40, testView);
      const [eastX, eastY] = toPlot(250, 40, testView);
      assert.ok(eastX > westX, `east ${eastX} should be right of west ${westX}`);
      assert.equal(eastY, westY);
    }
  });

  test('a metre is the same length on both axes', () => {
    for (const testView of views) {
      const [startX, startY] = toPlot(10, 20, testView);
      const across = toPlot(1010, 20, testView)[0] - startX;
      const down = toPlot(10, 1020, testView)[1] - startY;
      assert.ok(Math.abs(across - down) < 1e-9, `${across} across, ${down} down`);
      assert.ok(Math.abs(across - 1000 * testView.scale) < 1e-9, `1 km is ${across} px`);
    }
  });

  test('the town center lands on the view origin', () => {
    assert.deepEqual(toPlot(0, 0, { scale: 0.5, originX: 100, originY: 200 }), [100, 200]);
  });
});

describe('the north arrow', () => {
  const arrow = layer('north-arrow');
  const part = (name) =>
    vertices(tagsIn(arrow, 'path').find((path) => path['data-part'] === name).d);

  test('its tip is straight above its base', () => {
    const [base, tip] = part('shaft');
    assert.ok(tip[1] < base[1], `tip y ${tip[1]} should be above base y ${base[1]}`);
    assert.equal(tip[0], base[0]);
  });

  test('its head points up from the tip', () => {
    const [, shaftTip] = part('shaft');
    const [headTip, ...headBack] = part('head');
    assert.deepEqual(headTip, shaftTip);
    for (const corner of headBack) {
      assert.ok(corner[1] > headTip[1], `head corner y ${corner[1]} should be below the tip`);
    }
  });

  test('it has an N above the tip', () => {
    const [, tip] = part('shaft');
    const [label] = tagsIn(arrow, 'text');
    assert.ok(textsIn(arrow).includes('N'));
    assert.ok(Number(label.y) < tip[1], 'the N should be above the tip');
  });
});

describe('the plot of the real graph', () => {
  test('every layer is there, once', () => {
    for (const name of LAYERS) {
      const count = svg.split(`data-layer="${name}"`).length - 1;
      assert.equal(count, 1, `${name} layer count`);
    }
  });

  test('every road has a layer, with its name as a label', () => {
    assert.equal(graph.roads.length, 4);
    for (const road of graph.roads) {
      const name = `road-${road.id.replaceAll('_', '-')}`;
      assert.ok(LAYERS.includes(name), `${name} isn't an expected layer`);
      assert.ok(textsIn(layer(name)).includes(road.name), `${name} has no ${road.name} label`);
    }
  });

  test("the US 80 path's coordinates are its points through toPlot", () => {
    assertPathIs(roadPath('road-us-80'), roadPoints(roadNamed('US 80')), 'US 80');
  });

  test("every other road's path is its points through toPlot", () => {
    assertPathIs(roadPath('road-adams-st'), roadPoints(roadNamed('Adams Street')), 'Adams Street');
    assertPathIs(roadPath('road-church-st'), roadPoints(roadNamed('Church St')), 'Church St');
    assertPathIs(
      roadPath('road-meehan-savoy-rd'),
      roadPoints(roadNamed('Meehan-Savoy Rd')),
      'Meehan-Savoy Rd',
    );
  });

  // lines[] isn't one track or one channel, so joining them would draw across a
  // gap. vertices() rejects a second M, so each path has to be one line.
  for (const [name, reference] of [
    ['railroad', railroad],
    ['river', river],
  ]) {
    test(`each ${name} line is its own path, through toPlot`, () => {
      const paths = tagsIn(layer(name), 'path');
      assert.equal(paths.length, reference.lines.length);
      paths.forEach((path, i) => assertPathIs(path.d, reference.lines[i].points, `${name} line ${i + 1}`));
    });
  }

  test('the railroad is dashed and the river is not', () => {
    for (const path of tagsIn(layer('railroad'), 'path')) {
      assert.ok(path['stroke-dasharray'], 'a railroad path has no dash');
    }
    for (const path of tagsIn(layer('river'), 'path')) {
      assert.equal(path['stroke-dasharray'], undefined, 'a river path is dashed');
    }
  });

  test('there are three trestle markers, with their ids, at their points', () => {
    const source = layer('trestles');
    const markers = tagsIn(source, 'g').filter((tag) => tag['data-marker'] === 'trestle');
    assert.equal(markers.length, 3);
    assert.equal(trestles.length, 3);

    for (const trestle of trestles) {
      const marker = markers.find((candidate) => candidate.id === trestle.id);
      assert.ok(marker, `no marker for ${trestle.id}`);
      const [, x, y] = marker.transform.match(/^translate\((-?[\d.]+) (-?[\d.]+)\)$/);
      assertAt([Number(x), Number(y)], [trestle.x, trestle.z], trestle.id);
      assert.ok(
        textsIn(source).some((label) => label.includes(trestle.id)),
        `${trestle.id} has no visible label`,
      );
    }
    assert.ok(textsIn(source).some((label) => label.includes('break down')));
  });

  test('every node has a marker at its point and a label', () => {
    const source = layer('nodes');
    const circles = tagsIn(source, 'circle');
    assert.equal(circles.length, graph.nodes.length);
    for (const node of graph.nodes) {
      const circle = circles.find((candidate) => candidate['data-node'] === node.id);
      assert.ok(circle, `no marker for ${node.id}`);
      assertAt([Number(circle.cx), Number(circle.cy)], [node.x, node.z], node.id);
      assert.ok(textsIn(source).some((label) => label.startsWith(node.id)), `${node.id} has no label`);
    }
    // I-20 isn't a road in the graph, so this label is all that marks where it is.
    assert.ok(textsIn(source).some((label) => label.includes('I-20')));
  });

  test('the origin marker is on the town center, and labelled', () => {
    const source = layer('origin');
    const [circle] = tagsIn(source, 'circle');
    assertAt([Number(circle.cx), Number(circle.cy)], [0, 0], 'origin');
    assert.ok(textsIn(source).includes('Town center'));
  });

  test('the scale bar is 1 km at the map scale, and says where that holds', () => {
    const source = layer('scale-bar');
    const bar = tagsIn(source, 'path').find((path) => path['data-part'] === 'bar');
    const [start, end] = vertices(bar.d);
    assert.equal(start[1], end[1], 'the bar should be level');
    assert.ok(Math.abs(end[0] - start[0] - 1000 * view.scale) <= 2 * WRITTEN_PX, 'bar length');
    assert.ok(textsIn(source).includes('1 km'));
    assert.ok(textsIn(source).some((label) => label.includes('outside shaded bands')));
  });

  test('the legend names everything drawn', () => {
    const labels = textsIn(layer('legend'));
    const names = [
      ...graph.roads.map((road) => road.name),
      railroad.name,
      river.name,
      'Trestle',
      'node',
      'Town center',
      'bearings not true',
    ];
    for (const name of names) {
      assert.ok(labels.some((label) => label.includes(name)), `the legend doesn't mention ${name}`);
    }
  });

  test('each compression band is shaded across its game x, with its factor and warning', () => {
    assert.ok(graph.compression.length > 0);
    const source = layer('compression');
    const rects = tagsIn(source, 'rect');
    assert.equal(rects.length, graph.compression.length);

    graph.compression.forEach((band, i) => {
      const [left] = toPlot(band.gameFrom, 0, view);
      const [right] = toPlot(band.gameTo, 0, view);
      assert.ok(Math.abs(Number(rects[i].x) - left) <= WRITTEN_PX, 'band left edge');
      assert.ok(Math.abs(Number(rects[i].width) - (right - left)) <= 2 * WRITTEN_PX, 'band width');
      assert.ok(Number(rects[i]['fill-opacity']) < 1, "the band shouldn't hide the lines under it");
      assert.ok(textsIn(source).some((label) => label.includes(String(band.factor))), 'no factor');
    });
    assert.ok(
      textsIn(source).some((label) => label.includes('x scale and bearings are not true')),
      'no warning',
    );
  });

  test('the band runs the height of everything drawn', () => {
    const [rect] = tagsIn(layer('compression'), 'rect');
    const ys = [...tagsIn(layer('river'), 'path'), ...tagsIn(layer('road-meehan-savoy-rd'), 'path')]
      .flatMap((path) => vertices(path.d))
      .map(([, y]) => y);
    assert.ok(Number(rect.y) <= Math.min(...ys) + WRITTEN_PX, 'the band should reach the top');
    assert.ok(
      Number(rect.y) + Number(rect.height) >= Math.max(...ys) - 2 * WRITTEN_PX,
      'the band should reach the bottom',
    );
  });

  // Against TIGER's own lon/lat rather than the x/z the path was drawn from, so
  // this holds the plot to the real world.
  test('US 80, the tracks and the river keep north up and east right against lon/lat', () => {
    const lines = [
      { label: 'US 80', d: roadPath('road-us-80'), lonlat: roadLonlat(roadNamed('US 80')) },
      ...tagsIn(layer('railroad'), 'path').map((path, i) => ({
        label: `railroad line ${i + 1}`,
        d: path.d,
        lonlat: railroad.lines[i].lonlat,
      })),
      ...tagsIn(layer('river'), 'path').map((path, i) => ({
        label: `river line ${i + 1}`,
        d: path.d,
        lonlat: river.lines[i].lonlat,
      })),
    ];
    let checked = 0;
    for (const { label, d, lonlat } of lines) {
      const drawn = vertices(d);
      for (let i = 1; i < drawn.length; i += 1) {
        const [dLon, dLat] = [lonlat[i][0] - lonlat[i - 1][0], lonlat[i][1] - lonlat[i - 1][1]];
        const [dx, dy] = [drawn[i][0] - drawn[i - 1][0], drawn[i][1] - drawn[i - 1][1]];
        if (dLon !== 0) assert.equal(Math.sign(dx), Math.sign(dLon), `${label} vertex ${i} east-west`);
        if (dLat !== 0) assert.equal(Math.sign(dy), -Math.sign(dLat), `${label} vertex ${i} north-south`);
        checked += 1;
      }
    }
    assert.ok(checked > 2000, `only ${checked} segments checked`);
  });

  test("the west trestle is left of the origin, and Adams Street's north end is above US 80", () => {
    const originX = Number(tagsIn(layer('origin'), 'circle')[0].cx);
    const markerX = (id) =>
      Number(tagsIn(layer('trestles'), 'g').find((tag) => tag.id === id).transform.match(/-?[\d.]+/)[0]);
    assert.ok(markerX('trestle-west') < originX);
    assert.ok(markerX('trestle-east-near') > originX);
    assert.ok(markerX('trestle-east-far') > markerX('trestle-east-near'));

    const adams = vertices(roadPath('road-adams-st'));
    assert.ok(adams.at(-1)[1] < adams[0][1], 'Adams Street runs north from US 80');
  });

  test('the drawing is not stretched: width and height match the viewBox', () => {
    const [root] = tagsIn(svg, 'svg');
    assert.equal(root.viewBox, `0 0 ${root.width} ${root.height}`);
    assert.equal(root.preserveAspectRatio, undefined);
    assert.doesNotMatch(svg, /scale\(|rotate\(|matrix\(/);
    assert.ok(view.scale > 0);
  });

  test('tags are balanced and nothing is embedded or fetched', () => {
    const open = [];
    for (const [tag, closing, name] of svg.matchAll(/<(\/?)([a-zA-Z]+)\b[^>]*>/g)) {
      if (closing) assert.equal(open.pop(), name, `${tag} closes the wrong tag`);
      else if (!tag.endsWith('/>')) open.push(name);
    }
    assert.deepEqual(open, []);
    assert.doesNotMatch(svg, /<image\b|href=|url\(/);
  });
});

describe('renderRoadPlot on other input', () => {
  test('every band gets its own shading and label', () => {
    const second = {
      axis: 'x',
      trueFrom: 8000,
      trueTo: 9000,
      gameFrom: 5120,
      gameTo: 5620,
      factor: 0.5,
      reason: 'test',
    };
    const plot = renderRoadPlot({ ...graph, compression: [...graph.compression, second] });
    const source = layerIn(plot, 'compression');
    assert.equal(tagsIn(source, 'rect').length, graph.compression.length + 1);
    assert.ok(textsIn(source).some((label) => label.includes('0.5')));
  });

  test('with no bands nothing is shaded or warned about', () => {
    const plot = renderRoadPlot({ ...graph, compression: [] });
    assert.deepEqual(tagsIn(layerIn(plot, 'compression'), 'rect'), []);
    assert.deepEqual(textsIn(layerIn(plot, 'compression')), []);
    assert.ok(!textsIn(layerIn(plot, 'legend')).some((label) => label.includes('bearings')));
  });

  test('the map is framed around the data, not fixed to this graph', () => {
    for (const [eastM, southM] of [
      [-3000, -5000],
      [3000, 5000],
    ]) {
      const move = (line) => ({
        ...line,
        points: line.points.map(([x, z]) => [x + eastM, z + southM]),
      });
      const moved = renderRoadPlot({
        ...graph,
        edges: graph.edges.map(move),
        reference: {
          ...graph.reference,
          railroad: { ...railroad, lines: railroad.lines.map(move) },
          river: { ...river, lines: river.lines.map(move) },
        },
      });
      const [root] = tagsIn(moved, 'svg');
      for (const path of tagsIn(layerIn(moved, 'river'), 'path')) {
        for (const [x, y] of vertices(path.d)) {
          assert.ok(x >= 0 && x <= Number(root.width), `x ${x} is off the page`);
          assert.ok(y >= 0 && y <= Number(root.height), `y ${y} is off the page`);
        }
      }
    }
  });

  test('names from the data are escaped', () => {
    const road = { ...graph.roads[0], name: 'A & B <C> "D"' };
    const plot = renderRoadPlot({ ...graph, roads: [road, ...graph.roads.slice(1)] });
    assert.ok(textsIn(plot).includes('A &amp; B &lt;C&gt; &quot;D&quot;'));
    assert.doesNotMatch(plot, /A & B/);
  });
});

describe('the script', () => {
  test('writes the plot to a given path, creating the directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plot-roads-'));
    try {
      const out = join(dir, 'not', 'there', 'yet', 'plot.svg');
      const result = spawnSync(process.execPath, [SCRIPT, out], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(out), result.stdout);
      assert.equal(readFileSync(out, 'utf8'), svg);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('importing the module writes nothing', () => {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(SCRIPT)}); console.log('imported');`],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'imported');
  });
});
