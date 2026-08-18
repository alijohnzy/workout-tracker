/* Lifts the script out of index.html and runs it in a stubbed DOM.
   No dependencies — `node test.mjs`. Top-level const/let bindings are only
   visible if the tests are appended to the SAME script, hence the concat. */
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));

const el = () => ({ innerHTML:"", value:"", textContent:"", dataset:{},
                    classList:{ toggle(){}, add(){} }, onclick:null, oninput:null,
                    appendChild(){}, remove(){}, click(){} });
const app = el();
const NOW = { v: 1800000000000 };
const VIS = { v: "visible" };
const NOTES = { shown: [], closed: 0, permission: "granted" };
const live = [];
const FAILED = { n: 0 };

const g = {
  console, setTimeout, clearTimeout, setInterval, clearInterval,
  TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Response,
  btoa, atob, JSON, Math, Object, Array, String, Number, Set, Map, RegExp,
  Error, URL, Blob, Intl, isNaN, parseInt, parseFloat, encodeURIComponent,
  decodeURIComponent, Promise, NOW, VIS, NOTES, FAILED, APP: app,
  document: { addEventListener(){}, getElementById: id => id === "app" ? app : el(),
              querySelectorAll: () => [], createElement: () => el(),
              body: { appendChild(){} } },
  window: { addEventListener(){}, storage: undefined, scrollTo(){},
            history: { replaceState(){} } },
  navigator: {
    vibrate(){},
    serviceWorker: { getRegistration: async () => ({
      showNotification: async (title, opt) => {
        NOTES.shown.push({ title, ...opt });
        const n = { tag: opt.tag, close(){ NOTES.closed++; } };
        const i = live.findIndex(x => x.tag === opt.tag);
        if(i >= 0) live[i] = n; else live.push(n);
      },
      getNotifications: async ({ tag }) => live.filter(n => n.tag === tag)
    }) }
  },
  location: { protocol:"file:", hostname:"", origin:"https://x.test",
              pathname:"/wt/index.html", hash:"", search:"" },
  history: { replaceState(){} },
  alert(){}, confirm: () => true, prompt: () => null,
  indexedDB: undefined
};
g.globalThis = g; g.self = g;
Object.defineProperty(g.document, "visibilityState", { get: () => VIS.v });
g.Date = new Proxy(Date, { construct: (t, a) => a.length ? new t(...a) : new t(NOW.v) });
g.Date.now = () => NOW.v;
g.Notification = function(){};
Object.defineProperty(g.Notification, "permission", { get: () => NOTES.permission });
g.Notification.requestPermission = async () => NOTES.permission;

const tests = fs.readFileSync(new URL("./test.cases.js", import.meta.url), "utf8");
vm.runInContext(js + "\n;(async()=>{\n" + tests + "\n})();", vm.createContext(g),
                { filename: "index.html" });

await new Promise(r => setTimeout(r, 9000));
process.exit(FAILED.n ? 1 : 0);
