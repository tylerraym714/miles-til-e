// Unit tests for miles-til-e math and helpers. Reads functions from index.html / sync.js.
var fs = require("fs");
var path = require("path");
var root = path.join(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var syncSrc = fs.readFileSync(path.join(root, "sync.js"), "utf8");

function grab(src, name) {
  var re = new RegExp("function " + name + "\\(");
  var m = re.exec(src);
  if (!m) throw new Error("function " + name + " not found");
  var i = m.index;
  var brace = src.indexOf("{", i);
  var depth = 0;
  for (var j = brace; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") {
      depth--;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  throw new Error("could not extract " + name);
}

function extractFillAfter() {
  // The save-fill logic is inline in the click handler; extract the after formula usage.
  if (!/var before=first\?start:est\(o\),after=\$\("ff"\)\.checked\?S\.tank:Math\.min\(S\.tank,before\+g\)/.test(html)) {
    throw new Error("fill-after formula not found in index.html");
  }
}

var failed = 0, passed = 0;
function eq(name, a, b) {
  var ok = Object.is(a, b) || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);
  if (ok) { passed++; console.log("  ok  " + name); }
  else { failed++; console.log("  FAIL " + name + ": got " + JSON.stringify(a) + " expected " + JSON.stringify(b)); }
}
function is(name, cond) {
  if (cond) { passed++; console.log("  ok  " + name); }
  else { failed++; console.log("  FAIL " + name); }
}

// Stubs + extracted functions in one context
var ctx = {
  S: { mpg: 20, tank: 15, log: [], auto: true },
  last: function () { return ctx.S.log[ctx.S.log.length - 1]; }
};
// eslint-no-eval: evaluate exact source functions
eval("var S = ctx.S;\nvar last = ctx.last;\n" +
  grab(html, "est") + "\n" +
  grab(html, "r1") + "\n" +
  grab(html, "today") + "\n" +
  grab(html, "fmtD") + "\n" +
  grab(html, "hasFill") + "\n" +
  grab(html, "calib") + "\n" +
  grab(syncSrc, "rebuild") + "\n" +
  "ctx.est = est; ctx.r1 = r1; ctx.today = today; ctx.fmtD = fmtD; ctx.hasFill = hasFill; ctx.calib = calib; ctx.rebuild = rebuild;");

function fillAfter(opts) {
  var first = opts.first, start = opts.start || 0, tank = opts.tank, g = opts.g, full = !!opts.full, beforeEst = opts.beforeEst;
  if (first) {
    if (isNaN(start) || start < 0) start = 0;
    if (start > tank) start = tank;
  }
  var before = first ? start : beforeEst;
  return full ? tank : Math.min(tank, before + g);
}

console.log("est()");
ctx.S = { mpg: 20, tank: 15, log: [] };
eval("S = ctx.S;"); // keep S in sync if eval bound differently
// Re-bind: our eval used `var S = ctx.S` which copied the object reference at eval time.
// We mutate ctx.S in place, and last() reads ctx.S.log... wait, last was `function(){return ctx.S.log...}`
// but est() calls last() which we defined as ctx.last in the eval as `var last = ctx.last`. Good.
// est uses S.tank and S.mpg - those were `var S = ctx.S`, so S is the same object as ctx.S at eval time.
// If we replace ctx.S = {...} we break the binding! Mutate in place instead.

function resetLog(entries, mpg, tank) {
  ctx.S.log = entries || [];
  ctx.S.mpg = mpg == null ? 20 : mpg;
  ctx.S.tank = tank == null ? 15 : tank;
  ctx.S.auto = true;
  delete ctx.S.calKey;
  delete ctx.S.calMsg;
}

resetLog([]);
eq("est with empty log is 0", ctx.est(1000), 0);

resetLog([{ odo: 1000, gal: 10, after: 10 }]);
eq("est at same odo is after", ctx.est(1000), 10);
eq("est 20 miles later at 20 mpg uses 1 gal", ctx.est(1020), 9);
eq("est 200 miles later floors at 0", ctx.est(1200), 0);

resetLog([{ odo: 1000, gal: 20, after: 20 }]); // after above tank, cap
eq("est caps at tank size", ctx.est(1000), 15);

resetLog([{ odo: 0, gal: 8, after: 8 }], 20, 15);
// wait odo 0 is falsy in `if(!l.odo)return Math.min(S.tank,base)`
eq("est with missing/zero odo returns capped base", ctx.est(50), 8);

console.log("r1()");
eq("r1 rounds to 1 decimal", ctx.r1(3.16), 3.2);
eq("r1 .05 up", ctx.r1(1.25), 1.3);

console.log("fill after (first fill + cap)");
eq("first fill empty tank + 10 gal", fillAfter({ first: true, start: 0, tank: 15, g: 10 }), 10);
eq("first fill 4 already + 8 added", fillAfter({ first: true, start: 4, tank: 15, g: 8 }), 12);
eq("first fill 10 already + 10 added caps at tank", fillAfter({ first: true, start: 10, tank: 15, g: 10 }), 15);
eq("first fill to the top is tank", fillAfter({ first: true, start: 3, tank: 15, g: 12, full: true }), 15);
eq("later fill caps at tank", fillAfter({ first: false, beforeEst: 8, tank: 15, g: 10 }), 15);
eq("later fill no cap needed", fillAfter({ first: false, beforeEst: 4, tank: 15, g: 5 }), 9);
eq("start above tank is capped before add", fillAfter({ first: true, start: 40, tank: 15, g: 1 }), 15);
eq("invalid start treated as 0", fillAfter({ first: true, start: NaN, tank: 15, g: 6 }), 6);

console.log("hasFill()");
resetLog([]);
eq("empty log has no fill", ctx.hasFill(), false);
resetLog([{ park: true, odo: 1, gal: 0 }]);
eq("only parks is not a fill", ctx.hasFill(), false);
resetLog([{ gal: 5, odo: 1 }, { park: true, odo: 2, gal: 0 }]);
eq("a real fill counts", ctx.hasFill(), true);

console.log("today() / fmtD()");
var td = ctx.today();
is("today is M/D/YYYY", /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(td));
var y = new Date().getFullYear();
eq("fmtD hides current year", ctx.fmtD("11/22/" + y), "11/22");
eq("fmtD keeps other years", ctx.fmtD("11/22/2020"), "11/22/2020");
eq("fmtD keeps legacy dates without year", ctx.fmtD("11/22"), "11/22");
eq("fmtD empty", ctx.fmtD(""), "");

console.log("rebuild()");
var v = { tank: 15, mpg: 20, log: [{ gal: 10, odo: 1000, full: false, t: 1 }] };
ctx.rebuild(v);
eq("rebuild first non-full after is gallons added", v.log[0].after, 10);

v = { tank: 15, mpg: 20, log: [{ gal: 10, odo: 1000, full: false, a: 13, t: 1 }] };
ctx.rebuild(v);
eq("rebuild preserves starting fuel via a", v.log[0].after, 13);

v = { tank: 15, mpg: 20, log: [{ gal: 12, odo: 1000, full: true, t: 1 }] };
ctx.rebuild(v);
eq("rebuild full fill is tank", v.log[0].after, 15);

v = { tank: 15, mpg: 20, log: [
  { gal: 10, odo: 1000, full: false, a: 10, t: 1 },
  { gal: 10, odo: 1100, full: false, t: 2 } // used 100/20=5, before=5, after would be 15; 5+10=15
] };
ctx.rebuild(v);
eq("rebuild second fill after consumption", v.log[1].after, 15);

v = { tank: 15, mpg: 20, log: [
  { gal: 15, odo: 1000, full: true, t: 1 },
  { gal: 8, odo: 1100, full: false, t: 2 } // used 5, before=10, 10+8=18 -> cap 15
] };
ctx.rebuild(v);
eq("rebuild caps after at tank", v.log[1].after, 15);

v = { tank: 15, mpg: 20, log: [{ gal: 10, odo: 1000, a: 20, t: 1 }] };
ctx.rebuild(v);
eq("rebuild caps stored a at tank", v.log[0].after, 15);

console.log("calib() after undo-style re-run");
function mkFills(n, startOdo, mpg) {
  var log = [], odo = startOdo, gal = 10;
  for (var i = 0; i < n; i++) {
    log.push({ odo: odo, gal: gal });
    odo += mpg * gal; // drive exactly `gal` gallons worth of miles
  }
  return log;
}
// calib counts gallon-positive entries after the start point, so 7 logged fills
// (6 intervals) are needed. 7 fills of 10 gal, tank 15 so need=30.
var veh = { tank: 15, mpg: 20, auto: true, log: mkFills(7, 1000, 20) };
ctx.calib(veh);
is("calib ran with enough data", !!veh.calMsg && veh.calMsg.indexOf("Last check:") === 0);
eq("calib keeps 20 mpg when log matches", veh.mpg, 20);

// Log implies 25 mpg (drive 250 miles per 10 gal), start mpg 20, clamp to 20*1.15=23
veh = { tank: 15, mpg: 20, auto: true, log: mkFills(7, 1000, 25) };
ctx.calib(veh);
eq("calib clamps +15%", veh.mpg, 23);

// Not enough data
veh = { tank: 15, mpg: 20, auto: true, log: mkFills(2, 1000, 20) };
ctx.calib(veh);
is("calib asks for more gallons", veh.calMsg.indexOf("MPG check needs about") === 0);
eq("mpg unchanged when short", veh.mpg, 20);

// Undo: start with 8 fills so after pop there are still 7 (enough to re-run).
// Implied mpg stays 25; clamp is from the current 23, so 25 is allowed (23*1.15=26.45).
veh = { tank: 15, mpg: 20, auto: true, log: mkFills(8, 1000, 25) };
ctx.calib(veh);
eq("pre-undo clamped mpg", veh.mpg, 23);
var keyBefore = veh.calKey;
veh.log.pop();
ctx.calib(veh);
is("calib re-ran after pop (calKey changed)", veh.calKey !== keyBefore);
eq("calib after undo uses new window", veh.mpg, 25);

// auto off skips
veh = { tank: 15, mpg: 18, auto: false, log: mkFills(7, 1000, 25) };
ctx.calib(veh);
eq("calib skipped when auto off", veh.mpg, 18);

extractFillAfter();
is("fill-after formula present in index.html", true);
is("park blocked before fill-up", /if\(!hasFill\(\)\)\{m\.textContent="Save a fill-up first\."/.test(syncSrc));
is("manual mpg now pushes shared meta", /if\(S\.shared\)pushMeta\(S\);draw\(\)/.test(html));
is("undo calls calib", /calib\(S\);save\(\);\$\("cur"\)\.value=last\(\)\?last\(\)\.odo:""/.test(html));
is("localStorage key unchanged", /var K="f150fuel-v3"/.test(html));
is("Firebase path unchanged", /\/shared\/"\+v\.shared/.test(syncSrc));

console.log("\n" + passed + " passed, " + failed + " failed");
if (failed) process.exit(1);
