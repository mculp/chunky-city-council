// The cast: how each person feels about you, what ties them together, and what they say. There's no three.js or
// page in here, so node tests load it too. data/cast.md has the schema.

const COMPARE = { '>=': (a, b) => a >= b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '<': (a, b) => a < b, '==': (a, b) => a === b };

// Reads one condition: "flag", "!flag", "has:item", "!has:item", "coop.trust >= 1" or "beans >= 3"
export function parseCondition(text) {
  const cmp = text.match(/^([a-zA-Z]+)(?:\.([a-zA-Z]+))? (>=|<=|>|<|==) (-?[\d.]+)$/);
  if (cmp) return cmp[2] ? { who: cmp[1], meter: cmp[2], op: cmp[3], value: +cmp[4] } : { what: cmp[1], op: cmp[3], value: +cmp[4] };
  const has = text.match(/^(!?)has:([a-zA-Z]+)$/);
  if (has) return { item: has[2], not: !!has[1] };
  const flag = text.match(/^(!?)([a-zA-Z]+)$/);
  if (flag) return { flag: flag[2], not: !!flag[1] };
  throw new Error(`Can't read the condition "${text}"`);
}

export function createPeople(data, { store = null } = {}) {
  const KEY = `chunky.people.v${data.version}`, byId = new Map(data.cast.map((c) => [c.id, c]));
  const blank = () => Object.fromEntries(data.cast.map((c) => [c.id, Object.fromEntries(Object.keys(data.meters).map((m) => [m, 0]))]));
  const bound = (meter, v) => Math.max(data.meters[meter].min, Math.min(data.meters[meter].max, v));
  let meters = blank(), met = new Set(), kept = {};
  const people = { data };

  // A save that can't be read counts as no save, and a browser that won't store anything just doesn't remember.
  // One from before someone was renamed is read under the name they have now.
  function load() {
    try {
      const saved = JSON.parse(store.getItem(KEY)), now = (name) => data.renamed?.[name] ?? name;
      for (const [id, theirs] of Object.entries(saved.meters || {})) {
        const c = byId.get(now(id));
        if (c) for (const m of Object.keys(data.meters)) { const v = theirs?.[m]; if (Number.isFinite(v)) meters[c.id][m] = bound(m, v); }
      }
      for (const [f, on] of Object.entries(saved.flags || {})) if (on && data.remember.includes(now(f))) kept[now(f)] = true;
      for (const id of saved.met || []) if (byId.has(now(id))) met.add(now(id));
    } catch { /* nothing saved */ }
  }
  function save() { try { store.setItem(KEY, JSON.stringify({ meters, flags: kept, met: [...met] })); } catch { /* not stored */ } }

  people.hasSave = () => { try { return !!store.getItem(KEY); } catch { return false; } };
  people.forget = () => { meters = blank(); met = new Set(); kept = {}; try { store.removeItem(KEY); } catch { /* nothing to remove */ } };
  people.flags = () => ({ ...kept });
  people.get = (id, meter) => meters[id][meter];
  people.snapshot = () => JSON.parse(JSON.stringify(meters));
  people.person = (id) => byId.get(id);
  // Who the panel shows: anyone the story introduces up front, and anyone you've met since
  people.known = () => data.cast.filter((c) => c.known || met.has(c.id));
  people.meet = (id) => { if (!met.has(id)) { met.add(id); save(); } };

  // A tie only fires on a gain: helping one person costs you with another, but falling out with them doesn't earn it back
  people.change = (id, meter, by) => {
    meters[id][meter] = bound(meter, meters[id][meter] + by);
    if (by > 0) for (const t of data.ties) if (t.when === id && t.meter === meter) meters[t.then][meter] = bound(meter, meters[t.then][meter] + by * t.factor);
    save();
  };

  // ctx is what the game's holding: { flags, items, beans, addBeans(n), pantry, fromPantry() }
  people.check = (when, ctx) => (when || []).every((text) => {
    const c = parseCondition(text);
    if (c.flag) return !!ctx.flags[c.flag] !== c.not;
    if (c.item) return (ctx.items[c.item] > 0) !== c.not;
    return COMPARE[c.op](c.meter ? meters[c.who][c.meter] : ctx[c.what], c.value);
  });
  people.apply = (effects, ctx) => {
    for (const e of effects || []) {
      if (!people.check(e.when, ctx)) continue;
      if (e.set) { ctx.flags[e.set] = true; if (data.remember.includes(e.set)) { kept[e.set] = true; save(); } }
      else if (e.unset) ctx.flags[e.unset] = false;
      else if (e.meter) { const [id, meter] = e.meter.split('.'); people.change(id, meter, e.by); }
      else if (e.item) ctx.items[e.item] = (ctx.items[e.item] || 0) + e.by;
      else if (e.beans) ctx.addBeans(e.beans);
      else if (e.pantry) ctx.fromPantry();
    }
  };
  // The first line of a node whose conditions hold, with the options that are open right now
  people.line = (id, ctx) => {
    const node = data.dialogue[id], line = node.lines.find((l) => people.check(l.when, ctx));
    if (!line) throw new Error(`Nothing for ${id} to say`);
    return { who: byId.get(node.who).name, whoId: node.who, say: line.say, do: line.do, opts: (line.opts || node.opts).filter((o) => people.check(o.when, ctx)) };
  };

  load();
  return people;
}

// Everything in a cast file that would only go wrong in play, as a list of problems
export function checkCast(data) {
  const problems = [], ids = new Set(data.cast.map((c) => c.id)), meters = new Set(Object.keys(data.meters));
  const condition = (text, where) => {
    try {
      const c = parseCondition(text);
      if (c.meter && !(ids.has(c.who) && meters.has(c.meter))) problems.push(`${where}: no meter ${text}`);
    } catch (e) { problems.push(`${where}: ${e.message}`); }
  };
  const effects = (list, where) => {
    for (const e of list || []) {
      for (const text of e.when || []) condition(text, where);
      if (e.meter) { const [id, m] = e.meter.split('.'); if (!ids.has(id) || !meters.has(m)) problems.push(`${where}: no meter ${e.meter}`); if (!Number.isFinite(e.by)) problems.push(`${where}: ${e.meter} has no "by"`); }
      else if (e.item) { if (!Number.isFinite(e.by)) problems.push(`${where}: item ${e.item} has no "by"`); }
      else if (!e.set && !e.unset && !e.beans && !e.pantry) problems.push(`${where}: an effect that does nothing: ${JSON.stringify(e)}`);
    }
  };
  for (const t of data.ties) if (!ids.has(t.when) || !ids.has(t.then) || !meters.has(t.meter)) problems.push(`tie ${JSON.stringify(t)}: unknown person or meter`);
  // a rename points at someone, or at a flag that's remembered, and the old name's not in use any more
  for (const [was, now] of Object.entries(data.renamed || {})) {
    if (!ids.has(now) && !data.remember.includes(now)) problems.push(`renamed ${was}: nobody and nothing remembered is called ${now}`);
    if (ids.has(was) || data.remember.includes(was)) problems.push(`renamed ${was}: that name's still in use`);
  }
  for (const [name, list] of Object.entries(data.events || {})) effects(list, `event ${name}`);
  for (const [id, node] of Object.entries(data.dialogue)) {
    if (!ids.has(node.who)) problems.push(`${id}: no cast member ${node.who}`);
    if (!node.lines?.length) problems.push(`${id}: has no lines`);
    else if (node.lines.at(-1).when) problems.push(`${id}: the last line has conditions, so it can run out of things to say`);
    for (const line of node.lines || []) {
      if (!line.say) problems.push(`${id}: a line with nothing to say`);
      for (const text of line.when || []) condition(text, id);
      effects(line.do, id);
      const opts = line.opts || node.opts;
      if (!opts?.length) { problems.push(`${id}: a line with no options, so it can't be closed`); continue; }
      if (opts.every((o) => o.when)) problems.push(`${id}: every option has conditions, so it can run out of ways to answer`);
      for (const o of opts) {
        if (!o.say) problems.push(`${id}: an option with no words`);
        if (o.to && !data.dialogue[o.to]) problems.push(`${id}: option "${o.say}" goes nowhere: ${o.to}`);
        for (const text of o.when || []) condition(text, id);
      }
    }
  }
  return problems;
}
