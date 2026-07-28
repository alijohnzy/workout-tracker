/* Assertions run inside index.html's own scope — see test.mjs.
   Kept to the things that would silently rot: the share codec, the hostile-input
   validators, migrate(), and the invariants the views depend on. */
const out = [];
const ok = (n, c, extra = "") => out.push((c ? "  PASS  " : "  FAIL  ") + n + (extra ? "   " + extra : ""));
const draw = (name, fn) => {
  try { const h = fn(); ok("renders " + name, typeof h === "string" && h.length > 40); return h; }
  catch (e) { ok("renders " + name, false, e.message); return ""; }
};

/* ---------- weight ladder: union of the 2s and the 2.5s ---------- */
const climb = (from, n) => { const o = []; let w = from; for (let i = 0; i < n; i++) { w = wStep(w, 1); o.push(w); } return o; };
const fall  = (from, n) => { const o = []; let w = from; for (let i = 0; i < n; i++) { w = wStep(w, -1); o.push(w); } return o; };

const up   = [0, ...climb(0, 16)];
const want = [0, 2, 2.5, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20];
ok("ladder matches the requested sequence", JSON.stringify(up) === JSON.stringify(want), JSON.stringify(up));
ok("every rung is a multiple of 2 or 2.5",
   up.every(v => Math.abs(v / 2 - Math.round(v / 2)) < 1e-9 || Math.abs(v / 2.5 - Math.round(v / 2.5)) < 1e-9));
ok("ladder is strictly increasing", up.every((v, i) => i === 0 || v > up[i - 1]));
ok("descending mirrors ascending",
   JSON.stringify(fall(20, 16)) === JSON.stringify([...want].slice(0, 16).reverse()));
ok("zero is the floor", wStep(0, -1) === 0 && wStep(2, -1) === 0);
ok("bodyweight steps up to 2", wStep(0, 1) === 2);
ok("off-ladder 13 goes up to 14", wStep(13, 1) === 14, String(wStep(13, 1)));
ok("off-ladder 13 goes down to 12.5", wStep(13, -1) === 12.5, String(wStep(13, -1)));
ok("57 -> 57.5 up, 56 down", wStep(57, 1) === 57.5 && wStep(57, -1) === 56);
ok("up-then-down returns to the same rung",
   [2, 2.5, 5, 7.5, 12.5, 17.5, 42.5, 60, 100, 127.5].every(v => wStep(wStep(v, 1), -1) === v));
ok("no float crumbs at heavy weights",
   climb(100, 12).every(v => Number.isFinite(v) && String(v).length <= 6), JSON.stringify(climb(100, 12)));
ok("ladder continues past the plate rack", climb(200, 3).join(",") === "202,202.5,204");
ok("garbage weight is treated as zero", wStep(NaN, 1) === 2 && wStep(undefined, 1) === 2);

/* ---------- share codec ---------- */
const src = { id:"p1", name:"Push Pull Legs", order:["a","b"], sessions:{
  a:{ name:"Push", kind:"upper", warmup:["Bike 3 min","Band pull-aparts"], ex:[
      { name:"Bench Press", sets:4, reps:"6-8", lo:6, rest:150, ok:"Blades pinned",
        no:"Butt lifts", cue:"Drive feet", warn:"Careful", alt:"Machine", vid:"jW4j7FoqudI" }]},
  b:{ name:"Legs", kind:"lower", ex:[{ name:"Squat", sets:3, reps:"8-10", lo:8, rest:180 }]}}};
const back = await decPlan(await encPlan(src));
const s0 = back.sessions[back.order[0]];
ok("round trip keeps name/sessions", back.name === src.name && back.order.length === 2);
ok("round trip keeps exercise fields",
   s0.ex[0].name === "Bench Press" && s0.ex[0].sets === 4 && s0.ex[0].vid === "jW4j7FoqudI");
ok("round trip keeps the warm-up", JSON.stringify(s0.warmup) === JSON.stringify(src.sessions.a.warmup));
ok("import mints new plan and session ids", back.id !== src.id && back.order[0] !== "a");
ok("share URL stays short", (await encPlan(src)).length < 700);
const uni = await decPlan(await encPlan({ id:"u", name:"Antrenman Planı 💪", order:["x"], sessions:{
  x:{ name:"Göğüs", kind:"upper", ex:[{ name:"Şınav", sets:3, reps:"10", lo:10, rest:60 }]}}}));
ok("unicode survives the codec", uni.name === "Antrenman Planı 💪");

/* ---------- hostile input ---------- */
ok("garbage link rejected", await decPlan("zzzz") === null);
ok("wrong format rejected", unpackPlan({ f:"nope", o:[], s:{} }) === null);
const evil = unpackPlan({ f:"wq", n:'<img src=x onerror=alert(1)>', o:['s"onclick="x'], s:{
  's"onclick="x': { n:'<script>x</'+'script>', k:"nonsense",
    u:["fine", "", "y".repeat(999), ...Array.from({length:40},(_,i)=>"l"+i)],
    e:[{ n:'5" curl <b>x</b>', x:9999, r:"z".repeat(99), l:-5, t:99999, v:"javascript:alert(1)" }]}}});
const ev = evil.sessions[evil.order[0]].ex[0];
ok("session id regenerated", !evil.order[0].includes('"'));
ok("bad kind falls back to full", evil.sessions[evil.order[0]].kind === "full");
ok("numbers clamped", ev.sets === 20 && ev.rest === 600 && ev.lo === 1);
ok("javascript: video id dropped", ev.vid === undefined);
ok("warm-up lines capped", evil.sessions[evil.order[0]].warmup.length <= 20);
ok("linkFor never emits javascript:", !linkFor("Squat", "javascript:alert(1)").url.startsWith("javascript"));
ok("escA neutralises quotes", escA('5" curl') === '5&quot; curl');

/* ---------- built-in programme ---------- */
const A = BUILTIN.sessions.lowerA, Bs = BUILTIN.sessions.lowerB, UA = BUILTIN.sessions.upperA;
ok("Upper A leads with the dumbbell press", UA.ex[0].name === "Low Incline Dumbbell Press");
ok("Lower A order", A.ex.slice(2).map(e => e.name).join("|") ===
   "Seated Leg Curl|Leg Extension|Leg Press|45° Back Extension");
ok("both lower days open with arms",
   A.ex[0].name === "Dumbbell Biceps Curl" && Bs.ex[1].name === "Cable Triceps Pushdown");
ok("arm work is one set", A.ex[0].sets === 1 && Bs.ex[0].sets === 1);
ok("Lower B warm-up ends with the 50% line", warmupFor(Bs).slice(-1)[0].includes("Leg curl"));
ok("Lower A has no 50% line", !warmupFor(A).some(t => t.toLowerCase().includes("leg curl")));
ok("upper inherits its kind default", warmupFor(UA) === WARMUP.upper);
ok("unknown kind falls back to full", warmupFor({ kind:"nope" }) === WARMUP.full);

/* ---------- migrate() ---------- */
state.v = undefined; state.plans = undefined; state.planId = undefined;
state.live = { "upperA:0":[{ w:60, r:8 }] };
state.log = [{ id:"x", date:"2026-07-01T10:00:00Z", day:"2026-07-01", session:"upperA",
               name:"Upper A", entries:{ "Lat Pulldown":[{ w:50, r:10 }] } }];
migrate();
ok("migration rekeys live sets", !!state.live["builtin:upperA:0"]);
ok("migration backfills kind/planId", state.log[0].kind === "upper" && state.log[0].planId === "builtin");
ok("migration is idempotent", (migrate(), Object.keys(state.live).length === 1));
ok("recKind reads off the record", recKind({ session:"gone", kind:"lower" }) === "lower");
ok("recKind falls back for unknown", recKind({ session:"gone" }) === "full");

/* ---------- live-set isolation ---------- */
state.plans = { A:{ id:"A", name:"A", order:["s"], sessions:{ s:{ name:"S", kind:"full",
                  ex:[{ name:"E", sets:3, reps:"8", lo:8, rest:60 }] }}},
                B:{ id:"B", name:"B", order:["s"], sessions:{ s:{ name:"S", kind:"full",
                  ex:[{ name:"E", sets:3, reps:"8", lo:8, rest:60 }] }}} };
state.planId = "A"; state.live[lk("s", 0)] = [{ w:50, r:10 }];
const aN = liveSets("s", 0).length; state.planId = "B";
ok("duplicated plans don't share live sets", aN === 1 && liveSets("s", 0).length === 0);

/* ---------- rest timer is a deadline ---------- */
state.planId = "builtin"; state.notify = false;
const t0 = NOW.v;
startRest(120, "Next: set 2", "60 x 8");
ok("rest stores a deadline", state.rest.endsAt === t0 + 120000);
NOW.v = t0 + 30000;
ok("counts down from the clock", restLeft() === 90);
VIS.v = "hidden"; NOW.v = t0 + 200000; VIS.v = "visible";
ok("survives a frozen gap", restLeft() === -80, String(restLeft()));
ok("overtime renders as +m:ss", fmtT(restLeft()) === "+1:20");
clearRest();

/* ---------- rest notifications ---------- */
state.notify = true; NOTES.shown.length = 0; VIS.v = "visible";
const t1 = NOW.v;
startRest(90, "Next: set 2 of 3", "60 lb x 8");
await new Promise(r => setTimeout(r, 0));
const startNote = NOTES.shown[0];
ok("rest start raises a notification", !!startNote);
ok("ongoing note is silent and mute", startNote.silent === true && startNote.vibrate === undefined);
ok("ongoing note names the target time", startNote.body.startsWith("Until ") && /[0-9]/.test(startNote.body));
NOTES.shown.length = 0; VIS.v = "hidden"; NOW.v = t1 + 91000;
await new Promise(r => setTimeout(r, 1100));
const done = NOTES.shown.find(n => n.title === "Rest done");
ok("finishing while hidden notifies", !!done);
ok("done note vibrates, not silent",
   !!done && JSON.stringify(done.vibrate) === "[200,100,200]" && done.silent === undefined);
ok("signalled only once", state.rest.buzzed === true);
clearRest(); VIS.v = "visible"; state.notify = false;

/* ---------- views render, and hostile text stays inert ---------- */
state.planId = "builtin"; state.view = "home"; state.session = "upperA"; state.idx = 0;
draw("home", viewHome);
draw("session warm-up", viewSession);
state.idx = 1; draw("session exercise", viewSession);
sheet = { set:1, w:12.5, r:8 };
const sh = draw("set sheet", viewSession);
ok("set sheet shows a ladder weight", sh.includes('value="12.5"'));
sheet = null; state.idx = 0;
state.log = [{ id:"a", date:"2026-07-20T10:00:00Z", day:"2026-07-20", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin", entries:{ "Lat Pulldown":[{ w:50, r:10 }] } }];
state.tab = "cal";  draw("history calendar", viewHistory);
state.tab = "list"; draw("history list", viewHistory);
draw("plans", viewPlans);

state.plans = { [evil.id]: evil }; state.planId = evil.id;
state.session = evil.order[0]; state.idx = 1;
const all = draw("home (hostile)", viewHome) + draw("plans (hostile)", viewPlans)
          + draw("session (hostile)", viewSession);
ok("no tag carries an onerror attribute", !/<[a-zA-Z][^>]*onerror=/.test(all));
ok("no raw <img or <script reaches the DOM", !all.includes("<img") && !all.includes("<script>"));
ok("hostile text present but escaped", all.includes("&lt;img src=x"));

startDraft(evil, evil.id);
const ed = draw("editor", viewEditor);
ok("editor has the warm-up box", ed.includes('data-fld="swarm"'));
ok("editor value attrs are well formed",
   [...ed.matchAll(/value="([^"]*)"/g)].every(m => !m[1].includes("<")));
state.draft.sessions[state.draft.tab].warmup =
  ["Row 500m", "", "  Hip circles  "].join(String.fromCharCode(10));
state.draft.name = "Edited";
saveDraft();
const wu = state.plans[evil.id].sessions[Object.keys(state.plans[evil.id].sessions)[0]].warmup;
ok("textarea lines become warm-up steps", JSON.stringify(wu) === JSON.stringify(["Row 500m", "Hip circles"]),
   JSON.stringify(wu));

/* history must survive its plan being deleted */
state.log.push({ id:"z", date:"2026-07-21T10:00:00Z", day:"2026-07-21", session:evil.order[0],
                 name:"Ghost", kind:"upper", planId:evil.id, entries:{ X:[{ w:1, r:1 }] } });
delete state.plans[evil.id]; state.planId = "builtin";
state.tab = "cal";  draw("calendar after plan deleted", viewHistory);
state.tab = "list"; draw("list after plan deleted", viewHistory);

/* ---------- mergeLog ---------- */
state.log = [];
const m1 = mergeLog([{ date:"2026-07-03T10:00:00Z", session:"someone-elses", entries:{ X:[{ w:1, r:1 }] } }]);
ok("keeps logs from unknown plans", m1.added === 1);
ok("still dedupes", mergeLog([{ date:"2026-07-03T10:00:00Z", session:"someone-elses", entries:{ X:[{ w:1, r:1 }] } }]).dupes === 1);
ok("rejects malformed records", mergeLog([{ date:"x" }, null, {}]).bad === 3);

console.log(out.join("\n"));
const fails = out.filter(l => l.startsWith("  FAIL")).length;
console.log("\n  " + (out.length - fails) + "/" + out.length + " passed");
FAILED.n = fails;
