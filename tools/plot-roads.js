// Draws data/roads.json as an SVG, to check by eye that the graph sits the right
// way round. It plots game coordinates at one scale on both axes, north up and
// east right, so x distances and bearings are true, apart from inside any shaded
// compression bands. There are none at the moment.
//
//   node tools/plot-roads.js [out.svg]
//
// The default output is under data/raw/, which is gitignored. Don't commit a
// rendered plot: CLAUDE.md bars image files.

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROADS_JSON = fileURLToPath(new URL('../data/roads.json', import.meta.url));
const DEFAULT_OUT = fileURLToPath(new URL('../data/raw/roads-debug.svg', import.meta.url));

// SVG pixels per metre. Written coordinates keep 4 decimals, which at this scale
// is the 1 mm the data is rounded to.
const SCALE = 0.1;
const BAND_LABEL_WIDTH = 420;
const BAND_LABEL_HEIGHT = 56;

const MARGIN = 40;
const HEADER = 120;
const FOOTER = 130;
const MIN_WIDTH = 1300;

const ARROW_PX = 56;
const SCALE_BAR_M = 1000;
const LEGEND_ROWS = 4;
const LEGEND_COLUMN_PX = 300;
const LEGEND_ROW_PX = 22;
// Real road widths would be under 1 px, so they're exaggerated in proportion.
const ROAD_STROKE_PER_M = 0.4;

const COLOURS = {
  background: '#120b14',
  text: '#f1e6cf',
  railroad: '#f1e6cf',
  river: '#6fd6c8',
  trestle: '#e3285c',
  band: '#a99bc0',
  origin: '#ffffff',
};
const ROAD_COLOURS = ['#ec803a', '#f2d14e', '#c58cff', '#8fd14f'];

// Where each label sits: a position along the line from 0 to 1, then an offset in
// pixels. This is layout only and never touches the geometry.
const ROAD_LABELS = {
  us_80: { along: 0.2, dx: 0, dy: 20, anchor: 'middle' },
  adams_st: { along: 0.65, dx: 8, dy: 4, anchor: 'start' },
  church_st: { along: 0.55, dx: 12, dy: 20, anchor: 'end' },
  meehan_savoy_rd: { along: 0.355, dx: 12, dy: 4, anchor: 'start' },
};
const DEFAULT_LABEL = { along: 0.5, dx: 8, dy: -8, anchor: 'start' };
const RAILROAD_LABEL = { along: 0.1, dx: 0, dy: 20, anchor: 'middle' };
const RIVER_LABEL = { along: 0.3, dx: 8, dy: -8, anchor: 'start' };
const TRESTLE_LABELS = {
  'trestle-east-near': { dx: 40, dy: 95, anchor: 'end' },
  'trestle-east-far': { dx: 43, dy: 26, anchor: 'start' },
  'trestle-west': { dx: 12, dy: -38, anchor: 'start' },
};
const DEFAULT_TRESTLE_LABEL = { dx: 10, dy: 24, anchor: 'start' };

// Game metres to SVG pixels. view is { scale, originX, originY }, the origin being
// where the town center lands. SVG's y already grows downward like game z, so -z
// (north) is up with no flip, and the single scale means x and z can't stretch apart.
export function toPlot(x, z, view) {
  return [view.originX + x * view.scale, view.originY + z * view.scale];
}

const number = (value) => String(Number(value.toFixed(4)));

const escapeXml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
  );

const group = (name, children) =>
  [`<g data-layer="${escapeXml(name)}">`, ...children, '</g>'].join('\n');

// Two copies, a wide dark one behind the letters, so a label stays readable where
// it crosses a line. Not every renderer honours paint-order, and those would paint
// a single element's outline over its own letters.
function text(x, y, content, anchor = 'start', extra = '') {
  const attributes = `x="${number(x)}" y="${number(y)}" text-anchor="${anchor}"${extra}`;
  const letters = escapeXml(content);
  const halo = `stroke="${COLOURS.background}" stroke-width="3" stroke-linejoin="round"`;
  return `<text ${attributes} ${halo}>${letters}</text>\n<text ${attributes}>${letters}</text>`;
}

const HEADING = ' font-size="16" font-weight="bold"';

function pathData(points, view) {
  return points
    .map(([x, z], i) => {
      const [plotX, plotY] = toPlot(x, z, view);
      return `${i === 0 ? 'M' : 'L'}${number(plotX)} ${number(plotY)}`;
    })
    .join(' ');
}

function labelOnLine(points, content, { along, dx, dy, anchor }, view) {
  const [x, z] = points[Math.round(along * (points.length - 1))];
  const [plotX, plotY] = toPlot(x, z, view);
  return text(plotX + dx, plotY + dy, content, anchor);
}

// A road's edges joined into one line. Each later edge repeats the vertex the
// previous one ended on, so that copy is dropped.
function roadPoints(road, graph) {
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));
  return road.edges.flatMap((id, i) => edgeById.get(id).points.slice(i === 0 ? 0 : 1));
}

const roadColour = (index) => ROAD_COLOURS[index % ROAD_COLOURS.length];
const roadStroke = (road) => road.width * ROAD_STROKE_PER_M;

const lineAttributes = ({ stroke, width, dash }) =>
  `fill="none" stroke="${stroke}" stroke-width="${number(width)}" stroke-linejoin="round"` +
  (dash ? ` stroke-dasharray="${dash}"` : '');

const RAILROAD_STYLE = { stroke: COLOURS.railroad, width: 1.5, dash: '9 6' };
const RIVER_STYLE = { stroke: COLOURS.river, width: 1.5 };

// Everything the map has to fit, in game metres. The origin is included so its
// marker can't fall off the edge.
function mapBounds(graph) {
  const { railroad, river, trestles } = graph.reference;
  const points = [
    [0, 0],
    ...graph.edges.flatMap((edge) => edge.points),
    ...railroad.lines.flatMap((line) => line.points),
    ...river.lines.flatMap((line) => line.points),
    ...graph.nodes.map(({ x, z }) => [x, z]),
    ...trestles.map(({ x, z }) => [x, z]),
  ];
  const xs = [
    ...points.map(([x]) => x),
    ...graph.compression.flatMap((band) => [band.gameFrom, band.gameTo]),
  ];
  const zs = points.map(([, z]) => z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

// Which row of labels above the map each band's label takes, so that bands close
// together don't print over each other.
function bandLabelRows(graph) {
  let row = 0;
  return graph.compression.map((band, i, bands) => {
    const gap = i && ((band.gameFrom + band.gameTo) - (bands[i - 1].gameFrom + bands[i - 1].gameTo)) / 2;
    row = i && gap * SCALE < BAND_LABEL_WIDTH ? row + 1 : 0;
    return row;
  });
}

function plotLayout(graph) {
  const bounds = mapBounds(graph);
  const view = {
    scale: SCALE,
    originX: Math.ceil(MARGIN - bounds.minX * SCALE),
    originY: Math.ceil(HEADER + Math.max(0, ...bandLabelRows(graph)) * BAND_LABEL_HEIGHT - bounds.minZ * SCALE),
  };
  const mapRight = toPlot(bounds.maxX, 0, view)[0];
  const mapBottom = toPlot(0, bounds.maxZ, view)[1];
  return {
    view,
    bounds,
    mapBottom,
    width: Math.max(Math.ceil(mapRight + MARGIN), MIN_WIDTH),
    height: Math.ceil(mapBottom + FOOTER),
  };
}

function titleLayer(graph) {
  return group('title', [
    text(MARGIN, 28, 'Chunky road graph, debug plot', 'start', HEADING),
    text(MARGIN, 48, `Source: ${graph.source.vintage}. Game coordinates in metres.`),
    text(MARGIN, 66, 'North is up, east is right, one scale on both axes.'),
    text(MARGIN, 84, 'Line widths are not to scale.'),
  ]);
}

function compressionLayer(graph, { view, bounds }) {
  const lines = (band) => [
    `Compression factor ${band.factor}`,
    'x scale and bearings are not true inside this band',
    `true x ${band.trueFrom} to ${band.trueTo} is game x ${band.gameFrom} to ${band.gameTo}`,
  ];
  const rows = bandLabelRows(graph);
  return group(
    'compression',
    graph.compression.flatMap((band, index) => {
      const [left, top] = toPlot(band.gameFrom, bounds.minZ, view);
      const [right, bottom] = toPlot(band.gameTo, bounds.maxZ, view);
      const middle = (left + right) / 2;
      return [
        `<rect x="${number(left)}" y="${number(top)}" ` +
          `width="${number(right - left)}" height="${number(bottom - top)}" ` +
          `fill="${COLOURS.band}" fill-opacity="0.22"/>`,
        ...lines(band).map((line, i) =>
          text(middle, top - 46 - rows[index] * BAND_LABEL_HEIGHT + i * 17, line, 'middle'),
        ),
      ];
    }),
  );
}

// Each line is its own path. The lines aren't one track or one channel, and
// joining them would draw across gaps that TIGER leaves open.
function referenceLayer(name, reference, style, label, view) {
  const longest = reference.lines.reduce((a, b) => (b.points.length > a.points.length ? b : a));
  return group(name, [
    ...reference.lines.map(
      (line) => `<path d="${pathData(line.points, view)}" ${lineAttributes(style)}/>`,
    ),
    labelOnLine(longest.points, reference.name, label, view),
  ]);
}

function roadLayers(graph, view) {
  return graph.roads.map((road, i) => {
    const points = roadPoints(road, graph);
    const style = { stroke: roadColour(i), width: roadStroke(road) };
    return group(`road-${road.id.replaceAll('_', '-')}`, [
      `<path d="${pathData(points, view)}" ${lineAttributes(style)}/>`,
      labelOnLine(points, road.name, ROAD_LABELS[road.id] ?? DEFAULT_LABEL, view),
    ]);
  });
}

const nodeMarker = (kind, x, y, attributes = '') =>
  `<circle${attributes} cx="${number(x)}" cy="${number(y)}" r="3.5" stroke="${COLOURS.text}" ` +
  `stroke-width="1.2" fill="${kind === 'junction' ? COLOURS.text : COLOURS.background}"/>`;

function nodeLayer(graph, view) {
  return group(
    'nodes',
    graph.nodes.flatMap((node) => {
      const [x, y] = toPlot(node.x, node.z, view);
      const label = node.connectsTo ? `${node.id} to ${node.connectsTo}` : node.id;
      return [
        nodeMarker(node.kind, x, y, ` data-node="${escapeXml(node.id)}"`),
        text(x + 6, y - 6, label),
      ];
    }),
  );
}

const trestleShape =
  `<path d="M0 -7 L7 0 L0 7 L-7 0 Z" fill="${COLOURS.trestle}" ` +
  `stroke="${COLOURS.text}" stroke-width="1.2"/>`;

function trestleLayer(graph, view) {
  return group(
    'trestles',
    graph.reference.trestles.map((trestle) => {
      const [x, y] = toPlot(trestle.x, trestle.z, view);
      const { dx, dy, anchor } = TRESTLE_LABELS[trestle.id] ?? DEFAULT_TRESTLE_LABEL;
      const name = trestle.label ? `${trestle.id} (${trestle.label})` : trestle.id;
      return [
        `<g id="${escapeXml(trestle.id)}" data-marker="trestle" ` +
          `transform="translate(${number(x)} ${number(y)})">`,
        `<path d="M0 0 L${dx} ${dy > 0 ? dy - 12 : dy + 3}" fill="none" ` +
          `stroke="${COLOURS.text}" stroke-width="0.8"/>`,
        trestleShape,
        text(dx, dy, `${name}, x ${Math.round(trestle.x)}`, anchor),
        '</g>',
      ].join('\n');
    }),
  );
}

const originShape = (x, y) =>
  `<path d="M${number(x - 9)} ${number(y)} L${number(x + 9)} ${number(y)} ` +
  `M${number(x)} ${number(y - 9)} L${number(x)} ${number(y + 9)}" ` +
  `fill="none" stroke="${COLOURS.origin}" stroke-width="1.5"/>` +
  `<circle cx="${number(x)}" cy="${number(y)}" r="5" fill="none" stroke="${COLOURS.origin}" stroke-width="1.5"/>`;

function originLayer(view) {
  const [x, y] = toPlot(0, 0, view);
  return group('origin', [
    originShape(x, y),
    `<path d="M${number(x)} ${number(y - 9)} L${number(x)} ${number(y - 38)}" fill="none" ` +
      `stroke="${COLOURS.origin}" stroke-width="0.8"/>`,
    text(x + 15, y - 41, 'Town center', 'middle'),
  ]);
}

// The arrow's direction is game north sent through toPlot, so it can't disagree
// with the map.
function northArrowLayer(x, baseY, view) {
  const [fromX, fromY] = toPlot(0, 0, view);
  const [toX, toY] = toPlot(0, -ARROW_PX / view.scale, view);
  const tipX = x + toX - fromX;
  const tipY = baseY + toY - fromY;
  return group('north-arrow', [
    `<path data-part="shaft" d="M${number(x)} ${number(baseY)} L${number(tipX)} ${number(tipY)}" ` +
      `fill="none" stroke="${COLOURS.text}" stroke-width="2"/>`,
    `<path data-part="head" d="M${number(tipX)} ${number(tipY)} L${number(tipX - 7)} ${number(tipY + 16)} ` +
      `L${number(tipX + 7)} ${number(tipY + 16)} Z" fill="${COLOURS.text}"/>`,
    text(tipX, tipY - 6, 'N', 'middle', HEADING),
  ]);
}

// The bar's length is measured through toPlot too.
function scaleBarLayer(x, y, view, bands) {
  const length = toPlot(SCALE_BAR_M, 0, view)[0] - toPlot(0, 0, view)[0];
  const right = x + length;
  return group('scale-bar', [
    `<path data-part="bar" d="M${number(x)} ${number(y)} L${number(right)} ${number(y)}" ` +
      `fill="none" stroke="${COLOURS.text}" stroke-width="2"/>`,
    `<path data-part="ticks" d="M${number(x)} ${number(y - 5)} L${number(x)} ${number(y + 5)} ` +
      `M${number(right)} ${number(y - 5)} L${number(right)} ${number(y + 5)}" ` +
      `fill="none" stroke="${COLOURS.text}" stroke-width="2"/>`,
    text(x, y - 12, `${SCALE_BAR_M / 1000} km`),
    ...(bands ? [text(x, y + 20, 'outside shaded bands')] : []),
  ]);
}

function legendLayer(graph, x, y) {
  const swatchLine = (style) => `<path d="M0 -4 L30 -4" ${lineAttributes(style)}/>`;
  const entries = [
    ...graph.roads.map((road, i) => [
      swatchLine({ stroke: roadColour(i), width: roadStroke(road) }),
      `${road.name}: ${road.width} m, ${road.surface}`,
    ]),
    [swatchLine(RAILROAD_STYLE), `${graph.reference.railroad.name}, each line drawn separately`],
    [swatchLine(RIVER_STYLE), `${graph.reference.river.name}, each line drawn separately`],
    [`<g transform="translate(15 -4)">${trestleShape}</g>`, 'Trestle'],
    [nodeMarker('junction', 15, -4), 'Junction node'],
    [nodeMarker('end', 15, -4), 'Clip or end node'],
    [originShape(15, -4), 'Town center, the origin'],
    ...(graph.compression.length === 0
      ? []
      : [
          [
            `<rect x="0" y="-11" width="30" height="14" fill="${COLOURS.band}" fill-opacity="0.22"/>`,
            'Compressed: x scale and bearings not true',
          ],
        ]),
  ];
  return group(
    'legend',
    entries.map(([swatch, label], i) => {
      const column = Math.floor(i / LEGEND_ROWS);
      const row = i % LEGEND_ROWS;
      return (
        `<g transform="translate(${x + column * LEGEND_COLUMN_PX} ${y + row * LEGEND_ROW_PX})">` +
        `${swatch}${text(38, 0, label)}</g>`
      );
    }),
  );
}

// Returns the whole document as a string. The root records the view, so anything
// reading the file can map its coordinates back to game metres through toPlot.
export function renderRoadPlot(graph) {
  const layout = plotLayout(graph);
  const { view, width, height, mapBottom } = layout;
  const { railroad, river } = graph.reference;
  const footerTop = mapBottom + 30;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ` +
      `data-scale="${view.scale}" data-origin-x="${view.originX}" data-origin-y="${view.originY}" ` +
      `font-family="sans-serif" font-size="12" fill="${COLOURS.text}">`,
    '<title>Chunky road graph, debug plot</title>',
    `<rect width="${width}" height="${height}" fill="${COLOURS.background}"/>`,
    compressionLayer(graph, layout),
    referenceLayer('river', river, RIVER_STYLE, RIVER_LABEL, view),
    referenceLayer('railroad', railroad, RAILROAD_STYLE, RAILROAD_LABEL, view),
    ...roadLayers(graph, view),
    nodeLayer(graph, view),
    trestleLayer(graph, view),
    originLayer(view),
    titleLayer(graph),
    northArrowLayer(MARGIN + 20, footerTop + 84, view),
    scaleBarLayer(MARGIN + 60, footerTop + 40, view, graph.compression.length > 0),
    legendLayer(graph, MARGIN + 240, footerTop + 14),
    '</svg>',
    '',
  ].join('\n');
}

function main([out = DEFAULT_OUT]) {
  const graph = JSON.parse(readFileSync(ROADS_JSON, 'utf8'));
  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderRoadPlot(graph));
  console.log(`Wrote ${outPath}`);
}

const scriptPath = process.argv[1];
if (scriptPath && existsSync(scriptPath) && realpathSync(scriptPath) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
