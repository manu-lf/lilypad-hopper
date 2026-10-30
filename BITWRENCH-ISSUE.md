# bitwrench 2.1.11: SVG nodes created after mount land in the HTML namespace; `bwcli attach /tree` prints `?`; `bw.mount` rejects bare ids

Found while building **Lilypad Hopper** (`~/leapfrog/hopper`), a Frogger-style SVG game whose board is updated every frame with `bw.patch` + `bw.syncChildren`. Three separate findings, in severity order. Each has a minimal repro, the root cause with file and line, and a suggested fix.

**Environment**

| | |
|---|---|
| bitwrench | 2.1.11 (vendored UMD and `npm pack bitwrench@latest` on 2026-10-29 — same version) |
| Browser | Google Chrome (macOS 26, headless `--headless=new` and headed) |
| Node | 22.5.1 · jsdom 24 · puppeteer-core 23.11.1 (used only to drive Chrome) |
| Files cited | `dist/bitwrench.umd.js` (unminified) and `src/**` of the 2.1.11 package |

---

## 1. SVG elements created after the initial mount are HTML elements (high)

### Symptom

Inside a mounted `<svg>`, anything created later through `bw.syncChildren`, `bw.append`, `bw.patch(ref, taco)`, `bw.patch(ref, [tacos])`, `bw.replace`, `bw.el(ref, taco)` or an `o.render` that patches is created with `document.createElement` instead of `createElementNS`. The node *exists* (it's in the DOM, `/tree` and jsdom see it, `querySelector` finds it) but it is an `HTMLUnknownElement` in the XHTML namespace, so the browser draws nothing. No warning, no error.

In the game: the frog (part of the mounted tree) rendered; every lily pad, bank, fly and ripple (all synced per frame) was invisible. Only a screenshot in real Chrome showed it — the jsdom tests passed.

### Minimal repro

`bitwrench-issue/svg-namespace-repro.html` in the Hopper folder (also inline below). Expected: four green circles. Actual: one.

```html
<!doctype html>
<meta charset="utf-8">
<script src="bitwrench.umd.min.js"></script>
<div id="app"></div><pre id="out"></pre>
<script>
  var SVG = 'http://www.w3.org/2000/svg';
  bw.mount('#app', { t: 'svg', a: { viewBox: '0 0 400 100', width: 400, height: 100, style: 'background:#eef' }, c: [
    { t: 'circle', a: { id: 'c_mounted', cx: 50, cy: 50, r: 30, fill: '#038E43' } },   // 1: part of the mounted tree -> renders
    { t: 'g', a: { id: 'g_sync' } }, { t: 'g', a: { id: 'g_append' } }, { t: 'g', a: { id: 'g_patch' } }
  ]});
  bw.syncChildren(bw.el('g_sync'), [1], { key: function (x) { return x; },
    create: function () { return { t: 'circle', a: { id: 'c_sync', cx: 150, cy: 50, r: 30, fill: '#038E43' } }; } }); // 2
  bw.append(bw.el('g_append'), { t: 'circle', a: { id: 'c_append', cx: 250, cy: 50, r: 30, fill: '#038E43' } });     // 3
  bw.patch('g_patch', { t: 'circle', a: { id: 'c_patch', cx: 350, cy: 50, r: 30, fill: '#038E43' } });              // 4
  var lines = ['bitwrench ' + bw.version];
  ['c_mounted', 'c_sync', 'c_append', 'c_patch'].forEach(function (id) {
    var c = bw.el(id);
    lines.push(id + ': <' + c.tagName + '> ' + c.namespaceURI + '  bbox.width=' + (c.getBBox ? c.getBBox().width : 'n/a (not an SVGElement)') + (c.namespaceURI === SVG ? '  ok' : '  WRONG'));
  });
  bw.el('out', lines.join('\n'));
</script>
```

**Run it with bwcli** (from the Hopper folder):

```bash
npx bwcli serve . --port 9940          # bwserve static dir = the folder
open http://localhost:9940/bitwrench-issue/svg-namespace-repro.html
# to poke at it from the REPL: npx bwcli attach   then reload the page with ?attach
```

**Observed (Chrome, `--dump-dom`)**

```
bitwrench 2.1.11
c_mounted: <circle> http://www.w3.org/2000/svg  bbox.width=60  ok
c_sync:    <CIRCLE> http://www.w3.org/1999/xhtml  bbox.width=n/a (not an SVGElement)  WRONG
c_append:  <CIRCLE> http://www.w3.org/1999/xhtml  bbox.width=n/a (not an SVGElement)  WRONG
c_patch:   <CIRCLE> http://www.w3.org/1999/xhtml  bbox.width=n/a (not an SVGElement)  WRONG
```

Screenshot: `bitwrench-issue/svg-namespace-repro.png` (one circle, three blanks). Note the upper-case `CIRCLE` tagName — the HTML-namespace giveaway.

### Which entry points are affected (jsdom, `namespaceURI` of the created node)

| Call | Parent is `<svg>`/`<g>` | Result |
|---|---|---|
| `bw.mount(host, {t:'svg', c:[…]})` | — | **SVG** (correct: `tag === 'svg'` seeds the context and it threads to children) |
| `bw.create({t:'g'})` / `bw.create({t:'circle'})` (detached) | — | HTML |
| `bw.syncChildren(gEl, items, {create})` | yes | HTML |
| `bw.append(gEl, taco)` | yes | HTML |
| `bw.patch('g', taco)` | yes | HTML |
| `bw.patch('g', [taco, taco])` | yes | HTML |
| `bw.replace(circleEl, taco)` | yes | HTML |
| `o.render` that calls `bw.patch(el, [tacos])` on an SVG `<g>` component | yes | HTML |
| `bw.el('g', taco)` (find-and-apply) | yes | HTML |
| `<foreignObject>` children | — | HTML (correct) |

### Root cause

`_createNode` decides the namespace only from the TACO itself (`dist/bitwrench.umd.js:9044-9045`):

```js
var svgCtx = options._svgCtx || (tag === 'svg');
var el = svgCtx ? document.createElementNS(_SVG_NS, tag) : document.createElement(tag);
```

and threads it to children (`9076-9078`). That's right for a whole tree rooted at `<svg>`. But every in-place verb calls `bw.create(taco)` with no options and never looks at the parent it is about to insert into:

- `bw.syncChildren` — `var neo = bw.create(taco);` (`10317`)
- `bw.append` — `var child = bw.create(content);` (`10025`)
- `bw.replace` — `var neo = bw.create(taco);` (`10056`)
- `bw.patch` — `el.appendChild(bw.create(content[i]))` (`10201`) and `el.appendChild(bw.create(content))` (`10208`)
- `bw.refresh` → user's render → one of the above

So "SVG is ordinary TACO … `bw.syncChildren(svgEl, data, {key, create, update})` … `bw.patch`" in `docs/svg.md` (the table at lines 199-205 and the series example at 223-236) only holds for the first mount.

jsdom does not catch it: `createElement('circle')` succeeds and nothing in the suite asserts `namespaceURI`.

### Suggested fix

Derive the context from the insertion parent in every verb that creates into an existing node:

```js
function _svgCtxFor(parent) {
  return !!parent && parent.namespaceURI === _SVG_NS && parent.localName !== 'foreignObject';
}
// syncChildren:  var neo = bw.create(taco, { _svgCtx: _svgCtxFor(parentEl) || undefined });
// append:        var child = bw.create(content, { _svgCtx: _svgCtxFor(container) || undefined });
// replace:       var neo = bw.create(taco, { _svgCtx: _svgCtxFor(parent) || undefined });
// patch (both branches): bw.create(x, { _svgCtx: _svgCtxFor(el) || undefined })
```

Also worth doing:

- Make the option public (`bw.create(taco, { svg: true })`) for callers that build detached SVG nodes on purpose; `_svgCtx` is currently private and undocumented.
- Regression tests: for each verb above, create into an `<svg>`/`<g>` parent and assert `namespaceURI === 'http://www.w3.org/2000/svg'`. One assertion per row of the table would have caught all of this.
- Optional: a known-SVG-tag fallback for detached `bw.create` (`circle`, `path`, `g`, `rect`, …) — but note the ambiguous tags (`a`, `title`, `script`, `style`, `text`) make parent-derived context the correct primary fix.

### Workaround (what Hopper does)

Root each synced item in a nested `<svg overflow="visible">` positioned by `x`/`y`, with scale/rotate on an inner `<g>` (`public/js/game.js`, `svgItem()`). Nested `<svg>` is plain SVG 1.1 and works everywhere, at the cost of one extra element per item and `x`/`y` instead of `transform` for position.

---

## 2. `bwcli attach`: `/tree` (and `/inspect`) prints `?` for every selector (medium)

### Repro

```bash
npx bwcli attach                      # 7902
# open any bitwrench page with the drop-in <script src="http://localhost:7902/bw/attach.js">
bw> [connected] client att_7rbol74g
bw> /tree
?
bw> /tree #app 2
?
bw> /tree body 1
?
```

Reproduced on the Hopper page (`http://localhost:9933/?attach`) and on the 30-line repro page above, for HTML-only, mixed and SVG-only subtrees. `/clients`, `/patch`, `/listen` work in the same session.

### Root cause (two mismatches on the same path)

1. The browser answers with an envelope `{ requestId, route, result, error }` (`src/bwserve/bwclient.js:40-47`, `respond()`), and the server resolves the pending promise with that **whole body**: `record.client._resolvePending(data.requestId, data)` (`src/bwserve/index.js:477`, inside `_handleReturn`). `screenshot()` knows this and unwraps `r.result` (`src/bwserve/client.js:197`). The `/tree` handler does not: `treePend.promise.then(function(result) { … printTree(result, 0) })` (`src/cli/attach.js:317-322`). `printTree` reads `node.tag || '?'` (`attach.js:483`) on the envelope → `?`, and `node.children` is undefined so the recursion stops there.
2. Even after unwrapping, classes would never print: `printTree` reads `node.cls` (`attach.js:485`) while `bw.inspect()` returns `classes` (`docs/bitwrench_api.md` §`bw.inspect`, confirmed in jsdom). The `_bw_tree` builtin prefers `bw.inspect` whenever `bw.inspect.length === 2` (`src/bwserve/bwclient.js`, `_bw_tree`), which is always true in 2.1.11; only its hand-rolled `walk()` fallback uses `cls`.

The MCP tree path has the same envelope issue in a milder form: `src/mcp/live.js:218-227` JSON-stringifies the whole `{requestId, route, result, error}` object instead of `result`.

### Suggested fix

In `src/cli/attach.js` `/tree`:

```js
treePend.promise.then(function (r) {
  if (r && r.error) { console.error('[error] ' + r.error); rl.prompt(); return; }
  var tree = r && r.result;
  if (!tree) console.log('(no element found for "' + treeSel + '")'); else printTree(tree, 0);
  rl.prompt();
})
```

and in `printTree`: `var cls = node.cls || node.classes;`. Alternatively make `_resolvePending` resolve with `data.result` and reject on `data.error` for every route, then drop the unwrap in `screenshot()` and `live.js` — one convention for all callers. A test that attaches a jsdom client, runs `/tree`, and asserts the printed first line is `body` (not `?`) would cover it.

---

## 3. `bw.mount` / `bw.append` reject a bare id that `bw.el` / `bw.patch` accept (low)

```js
bw.el('hop_board')               // element
bw.patch('hop_board', 'hi')      // works
bw.mount('hop_board', taco)      // console.warn "bw.mount: target not found", returns null
bw.mount('#hop_board', taco)     // works
```

`bw.mount` and `bw.append` resolve string targets with `bw.$(target)[0]` only (`dist/bitwrench.umd.js:9960` and `10023`), i.e. CSS selectors. `bw.el` (`8229`), `bw.patch`, `bw.refresh` and `bw.inspect` (`11587-11588`: `bw.el(target)` then `bw.$(target)[0]` fallback) accept id, selector, `bw_uuid_*` or element. `docs/core-api.md` describes `bw.mount(target, taco)` next to `bw.el(ref)` without flagging the difference, so it's an easy trip. Suggest the `bw.inspect` resolution (`bw.el(target) || bw.$(target)[0]`) in `mount`/`append`, or a sentence in the docs.

---

## Observations (not bugs, maybe worth a note)

- `/listen <selector> <event>` splits on whitespace, so a descendant selector (`.hop_dpad button`) can't be expressed; `/listen .hop_dpad button click` registers event `button`. Quoting support or "last token is the event" would fix it.
- `bwcli serve <dir>` works as a plain static host for the game (`index.html`, relative `vendor/`, `js/`, `assets/` all 200) — nice. The Hopper `package.json` has `npm run serve:bw` and `npm run debug` for it, and the page self-attaches when opened with `?attach` (or `?attach=<port>`).

## How Hopper reproduces all three

```bash
cd ~/leapfrog/hopper
npm run serve:bw            # bwcli serve public --port 9933
npm run debug               # bwcli attach --allow-screenshot (7902)
open "http://localhost:9933/?attach"
#   bw> /tree #hop_pads 2    → "?"  (issue 2)
#   in devtools: bw.el('hop_pads').firstChild.firstChild.namespaceURI  → the nested-<svg> workaround for issue 1;
#   remove svgItem() in game.js and the pads vanish
#   bw.mount('hop_board', {t:'p'}) → null + warning (issue 3)
```
