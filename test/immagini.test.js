const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { prepara, applica, togliNonUsate, tipoDa, nomeFile } = require("../server/wiki/immagini");
const { scaricaTutto } = require("../server/wiki/sorgenti");
const { costruisci, immaginiUsate } = require("../server/wiki/copia");
const { FintaWiki, PNG, WEBP } = require("./finta-wiki");

const CDN = "https://static.wikia.nocookie.net/outerwilds_gamepedia/images/a/ab";
const ridotta = (chiave) => `${CDN}/${chiave}/revision/latest/scale-to-width-down/800`;

const cartellaProva = () => fs.mkdtempSync(path.join(os.tmpdir(), "se-immagini-"));

test("tipo dal contenuto", () => {
  assert.equal(tipoDa(PNG), "png");
  assert.equal(tipoDa(WEBP), "webp");
  assert.equal(tipoDa(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpg");
  assert.equal(tipoDa(Buffer.from("GIF89a....")), "gif");
  assert.equal(tipoDa(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>')), "svg");
  assert.equal(tipoDa(Buffer.from("<html><script>x</script></html>")), null);
  assert.equal(nomeFile("Hollow's lantern.png", "abcdef0123456789", "webp"), "hollows-lantern-abcdef0123.webp");
});

test("scarica solo quelle nuove o cambiate, poi toglie quelle non usate", async () => {
  const w = new FintaWiki();
  const cartella = cartellaProva();
  const nomi = ["TH.png", "Gabbro.jpg", "Missing.png"];
  const r1 = await prepara(nomi, { cartella, scarica: w.scarica });
  assert.equal(r1.scaricate, 2);
  assert.deepEqual(Object.keys(r1.registro).sort(), ["Gabbro.jpg", "TH.png"]);
  assert.deepEqual(r1.registro["TH.png"], { file: "th-s2.png", sha1: "s2", w: 800, h: 400, url: ridotta("TH.png") });
  assert.equal(r1.sulPi, 2);
  assert.equal(r1.daFandom, 0);
  assert.equal(r1.bloccato, null);
  assert.equal(r1.registro["Gabbro.jpg"].file, "gabbro-s4.webp");
  assert.match(r1.avvisi.join(), /1 immagini usate nelle pagine non ci sono sulla wiki/);

  // Stesso sha1: niente da scaricare. Sha1 nuovo: si riscarica con un nome nuovo
  w.immagini["TH.png"] = "s9";
  const prima = w.richieste.length;
  const r2 = await prepara(nomi, { cartella, scarica: w.scarica });
  assert.equal(r2.scaricate, 1);
  assert.equal(r2.registro["TH.png"].file, "th-s9.png");
  assert.equal(w.richieste.slice(prima).filter((u) => u.includes("static.wikia")).length, 1);
  assert.equal(togliNonUsate(cartella, r2.registro), 1);
  assert.deepEqual(fs.readdirSync(cartella).sort(), ["gabbro-s4.webp", "immagini.json", "th-s9.png"]);

  // Se il download non riesce si tiene il file di prima
  w.immagini["TH.png"] = "s10";
  const rotta = { scarica: async (url, o) => (url.includes("static.wikia") ? Promise.reject(new Error("rete giù")) : w.scarica(url, o)) };
  const r3 = await prepara(nomi, { cartella, ...rotta });
  assert.equal(r3.registro["TH.png"].file, "th-s9.png");
  assert.match(r3.avvisi.join(), /TH.png non scaricata: rete giù/);
});

test("applica: dai nomi della wiki ai file, via quelle che mancano, immagine principale", async () => {
  const w = new FintaWiki();
  const copia = costruisci(await scaricaTutto({ scarica: w.scarica }));
  const cartella = cartellaProva();
  const { registro } = await prepara(immaginiUsate(copia), { cartella, scarica: w.scarica });
  const grezza = JSON.stringify(copia);
  const servita = applica(structuredClone(copia), registro);
  assert.equal(JSON.stringify(copia), grezza, "la copia salvata tiene i nomi della wiki");
  const th = servita.pagine["timber-hearth"];
  assert.deepEqual(th.schede[0].immagini, [{ f: "th-s2.png", w: 800, h: 400 }]);
  assert.deepEqual(th.immagine, { f: "th-s2.png", w: 800, h: 400 });
  assert.deepEqual(th.blocchi.find((b) => b.t === "img"), { t: "img", f: "village-s3.png", d: ["The village"], w: 800, h: 400 });
  // Missing.png non c'è: sparisce dalla galleria
  assert.deepEqual(servita.pagine.gabbro.blocchi.find((b) => b.t === "galleria").voci, [{ f: "gabbro-s4.webp", d: ["Gabbro playing"], w: 800, h: 400 }]);
  assert.deepEqual(servita.pagine.gabbro.immagine, { f: "gabbro-s4.webp", w: 800, h: 400 });
  assert.equal(servita.pagine.interloper.immagine, null);
  assert.equal(servita.home[0].voci[0].f, "timberhearth-1-s1.png");
});

test("Cloudflare blocca il Pi: ci si ferma alla prima, le altre si caricano da Fandom", async () => {
  const w = new FintaWiki();
  w.bloccoDopo = 1;
  const cartella = cartellaProva();
  const nomi = ["Gabbro.jpg", "TH.png", "Timberhearth 1.png", "Village.png"];
  const r = await prepara(nomi, { cartella, scarica: w.scarica });
  const alCDN = w.richieste.filter((u) => u.includes("static.wikia"));
  assert.equal(alCDN.length, 2, "una scaricata, una bloccata, poi niente più richieste");
  assert.equal(r.scaricate, 1);
  assert.match(r.bloccato, /verifica da browser di Cloudflare/);
  assert.deepEqual([r.sulPi, r.daFandom], [1, 3]);
  assert.deepEqual(r.registro["Village.png"], { sha1: "s3", w: 800, h: 400, url: ridotta("Village.png") });
  assert.equal(r.avvisi.length, 1);
  assert.match(r.avvisi[0], /le carica il browser da Fandom/);

  // Nella copia: dal Pi quella scaricata, da Fandom le altre
  const copia = costruisci(await scaricaTutto({ scarica: new FintaWiki().scarica }));
  const servita = applica(structuredClone(copia), r.registro);
  assert.deepEqual(servita.pagine["timber-hearth"].schede[0].immagini, [{ u: ridotta("TH.png"), w: 800, h: 400 }]);
  assert.deepEqual(servita.pagine["timber-hearth"].immagine, { u: ridotta("TH.png"), w: 800, h: 400 });
  assert.equal(servita.pagine.gabbro.immagine.f, "gabbro-s4.webp");
  assert.equal(servita.home[0].voci[0].u, ridotta("Timberhearth_1.png"));

  // Sbloccato: al giro dopo arrivano le altre, la prima non si riscarica
  w.bloccoDopo = null;
  const r2 = await prepara(nomi, { cartella, scarica: w.scarica });
  assert.equal(r2.scaricate, 3);
  assert.deepEqual([r2.sulPi, r2.daFandom, r2.bloccato], [4, 0, null]);
});

test("applica: indirizzi non di Fandom non passano", () => {
  const copia = { pagine: { x: { blocchi: [{ t: "img", f: "A.png" }, { t: "p", s: [{ f: "B.png" }, "testo"] }], schede: [] } }, home: [] };
  const servita = applica(copia, { "A.png": { sha1: "1", url: "https://example.org/a.png" }, "B.png": { sha1: "2", url: "javascript:alert(1)" } });
  assert.deepEqual(servita.pagine.x.blocchi, [{ t: "p", s: ["testo"] }]);
});
