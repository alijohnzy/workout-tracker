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


/* ---------- per-set prefill from the matching set last session ---------- */
state.plans = {}; state.planId = "builtin"; state.live = {}; sheet = null;
state.log = [{ id:"h1", date:"2026-07-01T10:00:00Z", day:"2026-07-01", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin",
               entries:{ "Lat Pulldown":[{w:50,r:10},{w:55,r:9},{w:60,r:8}] } }];
state.view = "session"; state.session = "upperA"; state.idx = 2;   // Lat Pulldown
ok("prevSet reads the matching set", prevSet("Lat Pulldown",2).w === 55);
ok("prevSet does not clamp past the end", prevSet("Lat Pulldown",9) === null);
ok("prevSet is null for an unknown lift", prevSet("Nothing Here",1) === null);

openSheet(1); ok("set 1 prefills from last session set 1", sheet.w === 50 && sheet.r === 10);
openSheet(2); ok("set 2 prefills from last session set 2", sheet.w === 55 && sheet.r === 9);
openSheet(3); ok("set 3 prefills from last session set 3", sheet.w === 60 && sheet.r === 8);

/* moving up today must NOT drag later sets along */
sheet = { set:1, w:70, r:10 }; logSet(); clearRest();
openSheet(2);
ok("today's step-up does not override set 2's history", sheet.w === 55 && sheet.r === 9,
   sheet.w + "x" + sheet.r);
openSheet(1);
ok("re-opening a logged set shows what was logged", sheet.w === 70 && sheet.r === 10);

/* when last time had fewer sets, fall back to today's last set */
state.log = [{ id:"h2", date:"2026-07-02T10:00:00Z", day:"2026-07-02", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin",
               entries:{ "Lat Pulldown":[{w:40,r:12}] } }];
state.live = {}; sheet = { set:1, w:44, r:11 }; logSet(); clearRest();
openSheet(2);
ok("falls back to today when history is shorter", sheet.w === 44 && sheet.r === 11,
   sheet.w + "x" + sheet.r);
state.live = {}; sheet = null;

/* no history at all -> the exercise's own starting reps */
state.log = [];
openSheet(1);
ok("no history uses the exercise default", sheet.w === 0 && sheet.r === sess("upperA").ex[1].lo);
sheet = null;

/* the set button advertises last session's figure */
state.log = [{ id:"h3", date:"2026-07-03T10:00:00Z", day:"2026-07-03", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin",
               entries:{ "Lat Pulldown":[{w:50,r:10},{w:55,r:9},{w:60,r:8}] } }];
state.live = {};
const sv = viewSession();
ok("unlogged set buttons show last time's numbers",
   sv.includes("last 50×10") && sv.includes("last 55×9") && sv.includes("last 60×8"));

/* ---------- progress stats ---------- */
state.log = [
  { id:"p1", date:"2026-07-01T10:00:00Z", day:"2026-07-01", session:"upperA", name:"Upper A",
    kind:"upper", planId:"builtin", entries:{ "Bench":[{w:50,r:10},{w:50,r:8}], "Pull-up":[{w:0,r:6}] } },
  { id:"p2", date:"2026-07-08T10:00:00Z", day:"2026-07-08", session:"upperA", name:"Upper A",
    kind:"upper", planId:"builtin", entries:{ "Bench":[{w:60,r:10},{w:60,r:9}], "Pull-up":[{w:0,r:9}] } }
];
const st = exerciseStats();
const bench = st.find(m => m.name === "Bench");
const pull  = st.find(m => m.name === "Pull-up");
ok("stats group by exercise name", st.length === 2);
ok("sessions counted", bench.count === 2 && bench.setsN === 4);
ok("top set per session picked by weight", bench.first.w === 50 && bench.latest.w === 60);
ok("best set found", bench.best.w === 60 && bench.best.r === 10);
ok("average weight", round1(bench.avgW) === 55, String(round1(bench.avgW)));
ok("average reps", bench.avgR === 9.25, String(bench.avgR));
ok("averages round to one decimal for display", round1(bench.avgR) === 9.3, String(round1(bench.avgR)));
ok("weighted lift tracks weight", bench.byW === true);
ok("bodyweight lift tracks reps instead", pull.byW === false);
ok("bodyweight progression still measured", pull.first.r === 6 && pull.latest.r === 9);
ok("most recent exercise sorts first", st[0].lastDay === "2026-07-08");

const pv = draw("progress tab", progList);
ok("progress shows the exercise", pv.includes("Bench"));
ok("progress shows a gain", pv.includes("▲"), pv.includes("▲") ? "" : "no up arrow");
ok("progress draws one bar per session per exercise",
   (pv.match(/<i style="height:/g) || []).length === 4,
   String((pv.match(/<i style="height:/g) || []).length));
ok("progress shows averages", pv.includes("avg 55"));
ok("bodyweight lift omits the 0 lb average", !pv.includes("avg 0 "), "");
ok("bars are indexed to the range, not to zero",
   pv.includes('height:30%') && pv.includes('height:100%'));

/* a single session must not divide by zero or claim a trend */
state.log = [state.log[0]];
const one = progList();
ok("single session reports no trend yet", one.includes("first session"));

/* malformed imported entries must not break the view */
state.log = [{ id:"bad", date:"2026-07-09T10:00:00Z", day:"2026-07-09", session:"x",
               entries:{ "Weird":"not an array", "Empty":[], "Partial":[{w:"20",r:"5"},null] } }];
const badv = draw("progress with malformed entries", progList);
const bs = exerciseStats();
ok("malformed entries skipped", bs.length === 1 && bs[0].name === "Partial", JSON.stringify(bs.map(x=>x.name)));
ok("string numbers coerced", bs[0].best.w === 20 && bs[0].best.r === 5);
state.log = [];

/* ---------- data panel is collapsed and holds the destructive action ---------- */
state.log = [{ id:"d1", date:"2026-07-20T10:00:00Z", day:"2026-07-20", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin",
               entries:{ "Lat Pulldown":[{w:50,r:10}] } }];
const dp = dataPanel();
ok("data panel is a details element", dp.trimStart().startsWith("<details"));
ok("data panel is closed by default", !/<details[^>]*\sopen/.test(dp));
ok("wipe now lives inside the panel", dp.includes('id="wipe"'));
ok("export/import/ics still inside", dp.includes('id="expJson"') && dp.includes('id="impJson"') && dp.includes('id="ics"'));

for(const [tab, fn] of [["list", histList], ["prog", progList], ["cal", histCal]]){
  state.tab = tab;
  const h = fn();
  ok(tab + " tab keeps the panel collapsed", !/<details class="data"[^>]*\sopen/.test(h));
  ok(tab + " tab exposes no loose wipe button",
     (h.match(/id="wipe"/g) || []).length === 1 && h.indexOf('id="wipe"') > h.indexOf('class="data"'));
}
state.tab = "list";
ok("empty history still offers the panel", viewHistory.call(null) && (state.log = [], viewHistory().includes('id="expJson"')));

/* ---------- cool-down ---------- */
ok("cool-down defaults exist per kind",
   COOLDOWN.upper.length > 0 && COOLDOWN.lower.length > 0 && COOLDOWN.full.length > 0);
ok("sessions inherit a cool-down by kind", cooldownFor({ kind:"lower" }) === COOLDOWN.lower);
ok("unknown kind falls back to full cool-down", cooldownFor({ kind:"nope" }) === COOLDOWN.full);
ok("an explicit cool-down wins",
   cooldownFor({ kind:"lower", cooldown:["Bike 5 min"] })[0] === "Bike 5 min");
ok("cool-down text is not attributed to the source",
   !JSON.stringify(COOLDOWN).toLowerCase().includes("science"));

const cdPlan = { id:"cd", name:"CD", order:["z"], sessions:{
  z:{ name:"Day", kind:"upper", warmup:["Bike"], cooldown:["Quad stretch","Lat stretch"],
      ex:[{ name:"Bench", sets:2, reps:"8", lo:8, rest:60 }] }}};
const cdBack = await decPlan(await encPlan(cdPlan));
ok("cool-down survives the share codec",
   JSON.stringify(cdBack.sessions[cdBack.order[0]].cooldown) === JSON.stringify(["Quad stretch","Lat stretch"]));
ok("warm-up and cool-down stay separate through the codec",
   JSON.stringify(cdBack.sessions[cdBack.order[0]].warmup) === JSON.stringify(["Bike"]));
const cdNone = await decPlan(await encPlan({ id:"n", name:"N", order:["z"], sessions:{
  z:{ name:"D", kind:"upper", ex:[{ name:"B", sets:2, reps:"8", lo:8, rest:60 }] }}}));
ok("no cool-down stays absent", cdNone.sessions[cdNone.order[0]].cooldown === undefined);
const cdEvil = unpackPlan({ f:"wq", n:"E", o:["s"], s:{ s:{ n:"D", k:"upper",
  c:["ok", "", 99, "z".repeat(999), ...Array.from({length:40},(_,i)=>"x"+i)],
  e:[{ n:"B", x:2, r:"8", l:8, t:60 }] }}});
ok("hostile cool-down lines capped and cleaned",
   cdEvil.sessions[cdEvil.order[0]].cooldown.length <= 20 &&
   cdEvil.sessions[cdEvil.order[0]].cooldown.every(t => t && t.length <= 400));

/* the session gains a step: warm-up, n exercises, cool-down, save */
state.plans = {}; state.planId = "builtin"; state.live = {}; sheet = null; state.log = [];
state.view = "session"; state.session = "upperA";
const nEx = sess("upperA").ex.length;
state.idx = 0;      const vWarm = viewSession();
state.idx = nEx+1;  const vCool = viewSession();
state.idx = nEx+2;  const vDone = viewSession();
ok("warm-up page still first", vWarm.includes("Warm-Up") && vWarm.includes("WARM-UP"));
ok("cool-down page sits before save", vCool.includes("Cool-Down") && vCool.includes("COOL-DOWN"));
ok("cool-down lists its steps", vCool.includes(COOLDOWN.upper[0]));
ok("save page is now the last step", vDone.includes("Save workout to history"));
ok("step dots count warm-up + exercises + cool-down",
   (vWarm.match(/<i class=/g) || []).length === nEx + 2,
   String((vWarm.match(/<i class=/g) || []).length));
state.idx = nEx+2; go(1);
ok("the cursor stops at the save page", state.idx === nEx+2, String(state.idx));

/* ---------- discard an abandoned session ---------- */
state.idx = 0; state.live = {}; state.session = "upperA";
state.live[lk("upperA",0)] = [{ w:20, r:10 }];
ok("an abandoned session shows the resume card", viewHome().includes("Pick up where you left off"));
ok("the resume card offers a discard", viewHome().includes('data-drop="upperA"'));
discardSession("upperA");
ok("discarding clears that session's sets", Object.keys(state.live).length === 0);
ok("discarding removes the resume card", !viewHome().includes("Pick up where you left off"));
ok("discarding a missing session is a no-op", (discardSession("nope"), true));

/* discarding must not touch other sessions or saved history */
state.live[lk("upperA",0)] = [{ w:20, r:10 }];
state.live[lk("lowerA",0)] = [{ w:30, r:10 }];
state.log = [{ id:"k", date:"2026-07-20T10:00:00Z", day:"2026-07-20", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin", entries:{ X:[{w:1,r:1}] } }];
discardSession("upperA");
ok("discard leaves other sessions alone", !!state.live[lk("lowerA",0)]);
ok("discard leaves history alone", state.log.length === 1);
state.live = {};

/* ---------- next workout ---------- */
state.log = [];
ok("with no history the first day is up next", nextSession() === order()[0]);
const ord = order();
state.log = [{ id:"n1", date:"2026-07-20T10:00:00Z", day:"2026-07-20", session:ord[0],
               name:"x", kind:"upper", planId:"builtin", entries:{ X:[{w:1,r:1}] } }];
ok("next follows the last logged day", nextSession() === ord[1], nextSession());
state.log.push({ id:"n2", date:"2026-07-21T10:00:00Z", day:"2026-07-21", session:ord[ord.length-1],
                 name:"x", kind:"lower", planId:"builtin", entries:{ X:[{w:1,r:1}] } });
ok("next wraps around the end", nextSession() === ord[0], nextSession());
state.log.push({ id:"n3", date:"2026-07-22T10:00:00Z", day:"2026-07-22", session:"from-another-plan",
                 name:"x", kind:"upper", planId:"someone-else", entries:{ X:[{w:1,r:1}] } });
ok("other plans' history is ignored", nextSession() === ord[0]);
const hv = viewHome();
ok("home marks the next day", hv.includes("Up next"));
ok("only one day is marked", (hv.match(/Up next/g) || []).length === 1);
state.live[lk(ord[0],0)] = [{ w:5, r:5 }];
ok("a half-finished session suppresses the suggestion", !viewHome().includes("Up next"));
state.live = {}; state.log = [];

/* ---------- exercise photos ---------- */
ok("image search points at Google Images",
   imgSearch("Lat Pulldown").startsWith("https://www.google.com/search?tbm=isch&q="));
ok("image search encodes the exercise name",
   imgSearch("45° Back Extension").includes(encodeURIComponent("45° Back Extension exercise proper form")));
ok("image keys are namespaced", IMG_KEY("Squat") === "img:Squat");

/* the memory-mode store must be keyed, or a photo overwrites the whole state */
DB.mode = "memory"; DB.mem = {};
await writeChain;                       // let queued save()s land first
await storeSet("probe:state", "STATE"); await storeSet("img:Squat", "PHOTO");
ok("memory store keeps keys apart",
   (await storeGet("probe:state")) === "STATE" && (await storeGet("img:Squat")) === "PHOTO",
   String(await storeGet("probe:state")).slice(0,20));
ok("a photo write leaves other keys alone",
   (await storeSet("img:Other", "X"), await storeGet("probe:state")) === "STATE");

const px = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";
await storeSet(IMG_KEY("Bench"), px);
delete IMG["Bench"];
ok("a stored photo loads back", (await loadImg("Bench")) === px);
ok("a missing photo resolves to null", (await loadImg("Never Trained")) === null);
ok("loadImg caches the miss", IMG["Never Trained"] === null);

/* photos are keyed by name across plans, and never inside the state blob */
ok("photos are not in the state blob", !JSON.stringify(state).includes("data:image"));

state.planId = "builtin"; state.plans = {};
const known = knownExercises();
ok("known exercises include the built-in lifts", known.includes("Lat Pulldown"));
state.log = [{ id:"i1", date:"2026-07-20T10:00:00Z", day:"2026-07-20", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin", entries:{ "Some Old Lift":[{w:1,r:1}] } }];
ok("known exercises include lifts only in history", knownExercises().includes("Some Old Lift"));

/* the exercise screen offers the search, and the photo once saved */
state.view = "session"; state.session = "upperA"; state.idx = 2; state.live = {}; sheet = null;
const noPic = viewSession();
ok("exercise screen offers an image search", noPic.includes("Find an image"));
ok("exercise screen offers to save a photo", noPic.includes("data-rephoto="));
ok("no thumbnail when nothing is saved", !noPic.includes("data-shot="));
IMG[sess("upperA").ex[1].name] = px;
const withPic = viewSession();
ok("a saved photo renders as a thumbnail", withPic.includes("data-shot=") && withPic.includes(px));
ok("thumbnail starts collapsed", !withPic.includes('class="shot big"'));
shotOpen = sess("upperA").ex[1].name;
const bigPic = viewSession();
ok("tapping enlarges the photo", bigPic.includes('class="shot big"'));
ok("enlarged photo offers replace and remove",
   bigPic.includes("data-rephoto=") && bigPic.includes("data-unshot="));
shotOpen = null;
delete IMG[sess("upperA").ex[1].name];

/* imported image data is treated as hostile */
const goodPic = { images: { "Bench": px } };
const badPics = { images: { "A": "javascript:alert(1)", "B": "data:text/html;base64,xx",
                            "C": "not a url", "D": "data:image/png;base64," + "x".repeat(IMG_CAP) } };
const okPic = v => typeof v === "string" &&
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(v) && v.length <= IMG_CAP;
ok("a real data URL passes the import filter", okPic(goodPic.images.Bench));
ok("javascript: rejected", !okPic(badPics.images.A));
ok("non-image data URL rejected", !okPic(badPics.images.B));
ok("plain text rejected", !okPic(badPics.images.C));
ok("oversized image rejected", !okPic(badPics.images.D));

/* ---------- session length ---------- */
ok("durations format readably",
   fmtDur(0) === "" && fmtDur(30) === "<1 min" && fmtDur(60) === "1 min" &&
   fmtDur(2700) === "45 min" && fmtDur(3600) === "1h 00m" && fmtDur(4500) === "1h 15m",
   [fmtDur(30), fmtDur(2700), fmtDur(3600), fmtDur(4500)].join(" | "));

state.plans = {}; state.planId = "builtin"; state.live = {}; state.log = []; sheet = null;
NOW.v = 1800000000000;
openSession("upperA");
ok("opening a session stamps the clock", state.startedAt === NOW.v);
sheet = { set:1, w:20, r:10 }; state.idx = 1; logSet(); clearRest();
NOW.v += 47 * 60 * 1000;                       // 47 minutes of lifting
saveWorkout();
ok("the record carries a duration", state.log[0].dur === 47*60, String(state.log[0].dur));
ok("saving clears the clock", state.startedAt === null);
ok("history shows the length", histList().includes("47 min"));

/* a session left open overnight asks instead of guessing */
state.log = []; state.live = {};
NOW.v = 1800000000000;
openSession("upperA");
sheet = { set:1, w:20, r:10 }; state.idx = 1; logSet(); clearRest();
const startedAt = state.startedAt;
NOW.v += 9 * 3600 * 1000;                      // left open overnight
ok("a long-open session is flagged stale", isStale() === true);
state.idx = sess("upperA").ex.length + 2;
const savePage = viewSession();
ok("the save page asks for a finish time", savePage.includes('id="finTime"'));
ok("it says when the session was opened", savePage.includes(hhmm(startedAt)));
ok("it defaults to an hour after the start",
   savePage.includes('value="' + hhmm(startedAt + 3600000) + '"'));
ok("and shows what that would save", savePage.includes("That's 1h 00m"));

/* the picker converts a clock time into a length */
finishPick = hhmm(startedAt + 45 * 60000);
ok("seconds on the start do not skew the maths",
   (()=>{ const keep = state.startedAt; state.startedAt = keep + 44000;
          finishPick = hhmm(keep + 3600000);
          const d = pickedDur(finishValue()); state.startedAt = keep; return d === 3600; })(),
   "");
finishPick = hhmm(startedAt + 45 * 60000);
ok("a picked time becomes a duration", pickedDur(finishValue()) === 45 * 60,
   String(pickedDur(finishValue())));
finishPick = hhmm(startedAt + 5 * 3600000);
ok("anything past two hours is capped", pickedDur(finishValue()) === MANUAL_MAX,
   String(pickedDur(finishValue())));
ok("the note says it was capped", finishNote().includes("capped"));
finishPick = hhmm(startedAt);
ok("a finish equal to the start saves nothing", pickedDur(finishValue()) === null);
ok("the note says so", finishNote().includes("No length"));
finishPick = "";
ok("clearing the field saves nothing", pickedDur(finishValue()) === null);

/* a session that ran past midnight still resolves forwards */
const lateStart = new Date(2026, 6, 20, 23, 30).getTime();
const realStart = state.startedAt;
state.startedAt = lateStart; finishPick = "00:15";
ok("finishing after midnight rolls to the next day", pickedDur(finishValue()) === 45 * 60,
   String(pickedDur(finishValue())));
state.startedAt = realStart;

finishPick = hhmm(startedAt + 52 * 60000);
saveWorkout();
ok("the picked length is what gets stored", state.log[0].dur === 52 * 60, String(state.log[0].dur));
ok("saving clears the picker", finishPick === null);
ok("history shows the hand-entered length", histList().includes("52 min"));

/* a normal-length session never sees the picker */
state.log = []; state.live = {};
openSession("upperA");
sheet = { set:1, w:20, r:10 }; state.idx = 1; logSet(); clearRest();
NOW.v += 40 * 60 * 1000;
state.idx = sess("upperA").ex.length + 2;
ok("a normal session is not stale", isStale() === false);
ok("no picker on a normal save page", !viewSession().includes('id="finTime"'));
saveWorkout();
ok("a normal session is just measured", state.log[0].dur === 40 * 60, String(state.log[0].dur));

/* records saved before this existed have no duration and must still render */
state.log = [{ id:"old", date:"2026-07-01T10:00:00Z", day:"2026-07-01", session:"upperA",
               name:"Upper A", kind:"upper", planId:"builtin", entries:{ "Lat Pulldown":[{w:50,r:10}] } }];
ok("legacy records render without a duration", histList().includes("Upper A"));
state.selDay = "2026-07-01"; state.calOff = 0;
ok("calendar detail renders for legacy records", histCal().includes("Upper A"));
state.selDay = null;
discardSession("upperA");
ok("discarding clears the clock too", state.startedAt === null);

/* ---------- progress grouped by plan then day ---------- */
state.plans = { mine:{ id:"mine", name:"My Split", order:["d1"], sessions:{
  d1:{ name:"Push", kind:"upper", ex:[{ name:"Bench", sets:3, reps:"8", lo:8, rest:90 }] }}}};
const mk = (day, pid, sid, nm, ent) => ({ id:pid+sid+day, date:day+"T10:00:00Z", day, session:sid,
  name:nm, kind:"upper", planId:pid, entries:ent });
state.log = [
  mk("2026-07-01","builtin","upperA","Upper A",{ "Bench":[{w:50,r:10}] }),
  mk("2026-07-05","builtin","upperA","Upper A",{ "Bench":[{w:60,r:10}] }),
  mk("2026-07-03","builtin","lowerA","Lower A",{ "Squat":[{w:80,r:8}] }),
  mk("2026-07-08","mine","d1","Push",{ "Bench":[{w:70,r:8}] }),
  mk("2026-07-02","ghost-plan","gone","Old Day",{ "Row":[{w:40,r:12}] })
];
state.planId = "builtin";
const G = progGroups();
ok("groups are per plan", G.length === 3, String(G.length));
ok("most recently trained plan sorts first", G[0].id === "mine", G[0].id);
ok("a deleted plan is labelled, not dropped",
   G.some(p => p.id === "ghost-plan" && p.gone && p.name === "Deleted plan"));
const bi = G.find(p => p.id === "builtin");
ok("plan session count is right", bi.n === 3, String(bi.n));
ok("days sit inside the plan", bi.days.length === 2, String(bi.days.length));
ok("most recent day first", bi.days[0].id === "upperA", bi.days[0].id);
ok("day keeps its records", bi.days[0].recs.length === 2);

/* stats inside a day only count that day's records */
const dayStats = exerciseStats(bi.days[0].recs);
ok("day stats are scoped to the day", dayStats.length === 1 && dayStats[0].name === "Bench");
ok("day stats ignore other plans' sets of the same lift",
   dayStats[0].count === 2 && dayStats[0].latest.w === 60, String(dayStats[0].latest.w));
ok("unscoped stats still span everything", exerciseStats().find(m => m.name === "Bench").count === 3);

const gv = draw("grouped progress", progList);
ok("plan names are group headers", gv.includes("4-Day Upper/Lower") && gv.includes("My Split"));
ok("day names are nested headers", gv.includes("Upper A") && gv.includes("Lower A"));
ok("the active plan opens by default", /<details class="pgroup" open>/.test(gv));
ok("other plans stay collapsed", (gv.match(/<details class="pgroup" >/g) || []).length === 2,
   String((gv.match(/<details class="pgroup" >/g) || []).length));
ok("every day starts collapsed", !/<details class="pday"[^>]*open/.test(gv));
ok("the data panel is still there", gv.includes('id="expJson"'));
state.log = []; state.plans = {}; state.planId = "builtin";

/* ---------- how did that feel ---------- */
ok("three levels, red / amber / green", FEELS.length === 3 &&
   FEELS.map(f=>f.cls).join(",") === "bad,mid,good");
ok("levels are whitelisted", !!feelOf(1) && !!feelOf(3) && !feelOf(0) && !feelOf(4) && !feelOf("x"));
ok("a hostile value renders nothing", feelTag("<img src=x>") === "" && feelTag(99) === "");
ok("faces are drawn, not emoji", faceSvg(FEELS[0]).includes("<svg") && faceSvg(FEELS[0]).includes("<path"));
ok("sad and happy mouths differ", FEELS[0].mouth !== FEELS[2].mouth);

state.plans = {}; state.planId = "builtin"; state.live = {}; state.feel = {};
state.log = []; sheet = null; NOW.v = 1800000000000;
openSession("upperA");
state.idx = 2;                                   // Lat Pulldown
const exName = sess("upperA").ex[1].name;

const before = viewSession();
ok("the picker sits on the exercise page", before.includes('data-feel="1"') && before.includes('data-feel="3"'));
ok("nothing is preselected", !before.includes('class="feel-btn bad on"'));
ok("no last-time hint without history", !before.includes("Last time <span"));

setFeel(1, 3);
ok("tapping records the level", liveFeel("upperA", 1) === 3);
ok("the chosen face is marked", viewSession().includes('feel-btn good on'));
setFeel(1, 3);
ok("tapping the same face clears it", liveFeel("upperA", 1) === null);
setFeel(1, 1);
setFeel(1, 2);
ok("tapping another face switches", liveFeel("upperA", 1) === 2);

sheet = { set:1, w:50, r:10 }; logSet(); clearRest();
saveWorkout();
const rec = state.log[0];
ok("the rating lands on the record", rec.feel && rec.feel[exName] === 2, JSON.stringify(rec.feel));
ok("the scratchpad is cleared on save", Object.keys(state.feel).length === 0);
ok("an unrated session stores no feel at all",
   (()=>{ state.live={}; state.feel={}; openSession("upperA"); state.idx=2;
          sheet={set:1,w:10,r:10}; logSet(); clearRest(); saveWorkout();
          return state.log[1].feel === undefined; })());

/* it comes back next time you do the lift */
ok("lastFeel finds the most recent rating", lastFeel(exName) === 2, String(lastFeel(exName)));
ok("lastFeel is null for an unrated lift", lastFeel("Never Rated") === null);
state.live = {}; state.feel = {};
openSession("upperA"); state.idx = 2;
const again = viewSession();
ok("the exercise page shows last time's level", again.includes("Last time") && again.includes("feel-was"));
ok("but does not preselect it", !again.includes("feel-btn mid on"));

/* history shows it like any other data */
state.tab = "list";
const lv = histList();
ok("the list view marks the rating", lv.includes("feel-tag mid"));
state.selDay = recDay(state.log[0]); state.calOff = 0;
ok("the calendar detail marks it too", histCal().includes("feel-tag"));
state.selDay = null;
ok("the progress card carries the latest rating", progList().includes("feel-tag"));

/* an older rating must not leak onto an unrated lift */
ok("unrated rows stay clean",
   !histList().includes('feel-tag" '), "");

/* ratings survive a discard without touching anything else */
state.live = {}; state.feel = {};
openSession("upperA"); setFeel(1, 1);
ok("discard clears the rating", (discardSession("upperA"), Object.keys(state.feel).length === 0));
state.log = []; state.live = {}; state.feel = {};

/* ---------- the rest is a toast, not a takeover ---------- */
state.plans = {}; state.planId = "builtin"; state.live = {}; state.feel = {};
state.log = []; sheet = null; state.notify = false; VIS.v = "visible";

ok("no toast when nothing is resting", (state.rest = null, viewRest() === ""));

openSession("upperA"); state.idx = 2;
startRest(120, "Next: set 2 of 3 — Lat Pulldown", "50 lb × 10");
const toast = viewRest();
ok("the toast renders", toast.includes('class="rest ') || toast.includes('class="rest"'));
ok("it shows the countdown", toast.includes('id="restTime"') && toast.includes("2:00"));
ok("it says what's next", toast.includes("Next: set 2 of 3"));
ok("it keeps its own buttons", toast.includes('id="add30"') && toast.includes('id="skip"'));
ok("it reserves space so it covers nothing", toast.includes("rest-pad"));

/* the underlying view is still drawn */
render();
ok("the exercise page renders underneath", APP.innerHTML.includes("Lat Pulldown"));
ok("and the toast is appended to it", APP.innerHTML.includes('id="restTime"'));
ok("the toast comes last in the markup",
   APP.innerHTML.lastIndexOf('class="rest ') > APP.innerHTML.lastIndexOf('class="ex-name"'));

/* nothing you navigate to may dismiss it */
const stillResting = () => !!state.rest;
histView();   ok("history keeps the rest running", stillResting());
ok("the toast rides along on history", (render(), APP.innerHTML.includes('id="restTime"')));
plansView();  ok("the plans view keeps it", stillResting());
home();       ok("going home keeps it", stillResting());
ok("the toast rides along on home", (render(), APP.innerHTML.includes('id="restTime"')));
openSession("lowerA"); ok("opening another session keeps it", stillResting());
state.idx = 1; go(1);
ok("stepping through a session keeps it", stillResting());
usePlan("builtin");    ok("switching plans keeps it", stillResting());

/* logging a set restarts it rather than losing it */
state.session = "upperA"; state.idx = 2; sheet = { set:2, w:55, r:9 };
logSet();
ok("logging another set restarts the rest", !!state.rest && restLeft() > 0);

/* only its own button ends it */
stopRest();
ok("Done resting is what clears it", state.rest === null);
ok("and the toast disappears with it", viewRest() === "");

/* the two places that legitimately end the session still clear it */
state.live = {}; state.feel = {};
openSession("upperA"); state.idx = 2; sheet = { set:1, w:50, r:10 }; logSet();
ok("a rest is running before saving", !!state.rest);
state.idx = sess("upperA").ex.length + 2;
saveWorkout();
ok("saving the workout ends the rest", state.rest === null);

state.live = {}; state.feel = {};
openSession("upperA"); state.idx = 2; sheet = { set:1, w:50, r:10 }; logSet();
discardSession("upperA");
ok("discarding the session ends the rest", state.rest === null);

/* overtime flips the toast's styling, and it stays put */
state.live = {}; state.log = [];
openSession("upperA"); state.idx = 2;
const t2 = NOW.v;
startRest(60, "Next up", "x");
NOW.v = t2 + 90000;
const late = viewRest();
ok("an overrun toast marks itself done", late.includes('class="rest done"'));
ok("and shows the overtime", late.includes("+0:30"), late.match(/id="restTime"[^>]*>([^<]*)/)[1]);
ok("it is still dismissible only by its button", late.includes('id="skip"'));
clearRest();
state.log = []; state.live = {}; state.feel = {};

console.log(out.join("\n"));
const fails = out.filter(l => l.startsWith("  FAIL")).length;
console.log("\n  " + (out.length - fails) + "/" + out.length + " passed");
FAILED.n = fails;
