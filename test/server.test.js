// Il server con una copia vera (dalla wiki finta) e l'aggiornatore con la wiki finta.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { Aggiornatore } = require("../server/wiki/aggiornatore");
const { FintaWiki } = require("./finta-wiki");

const muto = () => {};

test("aggiornatore: prima copia, novità, wiki che non risponde", async () => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), "se-dati-"));
  const w = new FintaWiki();
  const a = new Aggiornatore({ cartellaDati: dati, scarica: w.scarica, minimoPagine: 3, log: muto });
  assert.equal(a.copia, null);
  assert.match(a.indice.testo, /"vuota":true/);

  const s1 = await a.aggiorna("prova");
  assert.equal(s1.esito, "ok");
  assert.equal(s1.pagine, 4);
  assert.equal(s1.immagini, 4);
  assert.deepEqual(a.novita().map((n) => [n.prima, n.pagine]), [[true, 4]]);
  const indice = JSON.parse(a.indice.testo);
  assert.deepEqual(indice.pagine.map((p) => p.id), ["gabbro", "interloper", "timber-hearth", "universe"]);
  assert.equal(indice.pagine[2].spoiler, 1);
  assert.ok(!("blocchi" in indice.pagine[0]));
  const p = JSON.parse(a.pagina("timber-hearth").testo);
  assert.equal(p.titolo, "Timber Hearth");
  assert.ok(Array.isArray(p.blocchi));
  assert.equal(a.pagina("nessuna"), null);

  // Un'altra istanza (riavvio del container) legge la copia salvata
  const b = new Aggiornatore({ cartellaDati: dati, scarica: w.scarica, minimoPagine: 3, log: muto });
  assert.equal(b.indice.etag, a.indice.etag);

  // Cambia una pagina: novità
  w.cambia("Interloper", '<div class="mw-parser-output"><p>The Interloper is a comet of ice.</p></div>', { commento: "ghiaccio" });
  await a.aggiorna("prova");
  assert.deepEqual(a.novita()[0].cambiate, [{ id: "interloper", titolo: "Interloper", quando: "2026-11-01T10:00:00Z", commento: "ghiaccio" }]);
  const etag = a.indice.etag;

  // La wiki non risponde: si tiene la copia di prima
  const giu = new Aggiornatore({ cartellaDati: dati, scarica: async () => Promise.reject(new Error("rete giù")), minimoPagine: 3, log: muto });
  const s3 = await giu.aggiorna("prova");
  assert.equal(s3.esito, "errore");
  assert.match(s3.errore, /rete giù/);
  assert.equal(giu.indice.etag, etag);
  assert.equal(giu.stato().pagine, 4);
});

test("server: API, intestazioni, immagini", async (t) => {
  const dati = fs.mkdtempSync(path.join(os.tmpdir(), "se-server-"));
  const w = new FintaWiki();
  await new Aggiornatore({ cartellaDati: dati, scarica: w.scarica, minimoPagine: 3, log: muto }).aggiorna("prova");
  process.env.DATA_DIR = dati;
  process.env.AGGIORNA_WIKI = "0";
  const { server, wiki } = require("../server/server");
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, h = {}) => fetch(base + p, { headers: h });

  let r = await get("/api/salute");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");

  r = await get("/api/indice");
  const etag = r.headers.get("etag");
  const indice = await r.json();
  assert.equal(indice.pagine.length, 4);
  assert.equal((await get("/api/indice", { "If-None-Match": etag })).status, 304);

  r = await get("/api/pagina/gabbro");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).titolo, "Gabbro");
  assert.equal((await get("/api/pagina/nessuna")).status, 404);
  assert.equal((await get("/api/pagina/..%2Fx")).status, 400);

  r = await get("/api/cerca?q=ghost%20matter");
  assert.deepEqual((await r.json()).risultati.map((x) => x.id), ["interloper", "timber-hearth"]);
  r = await get("/api/novita");
  assert.equal((await r.json()).length, 1);

  // Immagini: solo nomi validi, cache lunga, SVG isolati
  const file = wiki.copia.pagine["timber-hearth"].immagine.f;
  r = await get(`/immagini/${file}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.match(r.headers.get("cache-control"), /immutable/);
  assert.equal((await get("/immagini/..%2F..%2Fcopia%2Fwiki.json")).status, 404);
  assert.equal((await get("/immagini/immagini.json")).status, 404);
  fs.writeFileSync(path.join(wiki.cartellaImmagini, "x-1.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  r = await get("/immagini/x-1.svg");
  assert.match(r.headers.get("content-security-policy"), /sandbox/);

  // App: pagina e file
  r = await get("/");
  assert.match(await r.text(), /Selvaggi Esterni/);
  assert.equal((await get("/categoria/qualcosa")).status, 200);
  assert.equal((await get("/se-base.js")).status, 200);
  assert.equal((await get("/../server/server.js")).status, 404);
  assert.equal((await get("/%2e%2e/server/server.js")).status, 404);

  // Aggiornamento a mano: solo JSON dalla stessa origine, al massimo ogni 10 minuti
  const post = (h, corpo = "{}") => fetch(`${base}/api/aggiornamento`, { method: "POST", headers: h, body: corpo });
  assert.equal((await post({ "Content-Type": "text/plain" })).status, 415);
  assert.equal((await post({ "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" })).status, 403);
  r = await post({ "Content-Type": "application/json" });
  assert.equal(r.status, 429, "l'aggiornamento di prova è appena stato fatto");
  r = await get("/api/aggiornamento");
  const stato = await r.json();
  assert.equal(stato.esito, "ok");
  assert.deepEqual(stato.scartate.map((s) => s.titolo), ["Brenton Tarrant", "Game Praise", "Geyser pools"]);

  // Risposte compresse
  r = await fetch(`${base}/api/pagina/timber-hearth`, { headers: { "Accept-Encoding": "gzip" } });
  assert.equal(r.status, 200);
  const grezzo = await new Promise((ok, ko) =>
    require("node:http").get(`${base}/api/pagina/timber-hearth`, { headers: { "Accept-Encoding": "gzip" } }, (res) => {
      const pezzi = [];
      res.on("data", (p) => pezzi.push(p));
      res.on("end", () => ok({ h: res.headers, b: Buffer.concat(pezzi) }));
      res.on("error", ko);
    }),
  );
  assert.equal(grezzo.h["content-encoding"], "gzip");
  assert.equal(JSON.parse(zlib.gunzipSync(grezzo.b)).id, "timber-hearth");
});
