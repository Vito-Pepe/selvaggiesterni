const test = require("node:test");
const assert = require("node:assert/strict");
const { scaricaTutto } = require("../server/wiki/sorgenti");
const { costruisci, controlla, immaginiUsate, motivoScarto } = require("../server/wiki/copia");
const { confronta } = require("../server/wiki/differenze");
const { indicizza, cerca } = require("../server/wiki/cerca");
const { FintaWiki } = require("./finta-wiki");

async function copiaDa(w, opz) {
  return costruisci(await scaricaTutto({ scarica: w.scarica }), opz);
}

test("pagine copiate e scartate (vuote, vandalizzate, da cancellare)", async () => {
  const c = await copiaDa(new FintaWiki());
  assert.deepEqual(Object.keys(c.pagine).sort(), ["gabbro", "interloper", "timber-hearth", "universe"]);
  assert.deepEqual(c.scartate, [
    { titolo: "Brenton Tarrant", motivo: "vandalismo: non è una pagina sul gioco" },
    { titolo: "Game Praise", motivo: "sulla wiki sta per essere cancellata" },
    { titolo: "Geyser pools", motivo: "vuota" },
  ]);
  assert.equal(motivoScarto({ titolo: "X", categorie: [], lunghezza: 24 }), "senza categorie e quasi vuota");
  assert.equal(motivoScarto({ titolo: "X", categorie: [], lunghezza: 8000 }), null);
  assert.equal(c.fonte.licenza, "CC BY-SA 3.0");
});

test("pagina: link risolti con i rimandi, categorie, spoiler, altri nomi", async () => {
  const c = await copiaDa(new FintaWiki());
  const th = c.pagine["timber-hearth"];
  assert.equal(th.titolo, "Timber Hearth");
  assert.equal(th.url, "https://outerwilds.fandom.com/wiki/Timber_Hearth");
  assert.equal(th.spoiler, true);
  assert.deepEqual(th.categorie.sort(), ["locations", "planets"]);
  assert.deepEqual(th.altri, ["Hearth"]);
  assert.equal(th.commento, "più dettagli");
  const primo = th.blocchi[0].s;
  assert.ok(primo.some((x) => x.p === "interloper" && x.t === "The Interloper"), "il rimando porta alla pagina vera");
  assert.ok(primo.some((x) => typeof x === "string" && x.includes("the Hearthians")), "le pagine che non ci sono restano testo");
  assert.deepEqual(c.pagine.gabbro.blocchi[0].s[2], { t: "Timber Hearth", p: "timber-hearth", a: "Village" });
  assert.equal(c.pagine.gabbro.spoiler, undefined);
});

test("categorie con sopra e sotto, home dalla pagina principale", async () => {
  const c = await copiaDa(new FintaWiki());
  const perId = Object.fromEntries(c.categorie.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(perId).sort(), ["characters", "locations", "planets", "travelers"]);
  assert.equal(perId.planets.it, "Pianeti");
  assert.deepEqual(perId.planets.pagine, ["interloper", "timber-hearth"]);
  assert.deepEqual(perId.planets.sopra, ["locations"]);
  assert.deepEqual(perId.locations.sotto, ["planets"]);
  assert.deepEqual(c.home, [
    { nome: "Astronomical objects", it: "Corpi celesti", voci: [{ p: "timber-hearth", f: "Timberhearth 1.png", t: "Timber Hearth" }, { p: "interloper", t: "The Interloper" }] },
    { nome: "Basics", it: "Per cominciare", voci: [{ c: "characters", t: "Characters" }] },
  ]);
  assert.deepEqual(immaginiUsate(c).sort(), ["Gabbro.jpg", "Missing.png", "TH.png", "Timberhearth 1.png", "Village.png"]);
});

test("controlli: troppe poche pagine o crollo rispetto a prima", async () => {
  const c = await copiaDa(new FintaWiki());
  assert.deepEqual(controlla(c, null, { minimo: 3 }), []);
  assert.deepEqual(controlla(c, null), ["solo 4 pagine"]);
  const grande = { pagine: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, {}])) };
  assert.deepEqual(controlla(c, grande, { minimo: 3 }), ["4 pagine invece di 10"]);
});

test("pagina svuotata (vandalismo): resta quella di prima per 7 giorni", async () => {
  const w = new FintaWiki();
  const lungo = `<div class="mw-parser-output">${"<p>Ghost matter is invisible and deadly. </p>".repeat(60)}</div>`;
  w.cambia("Interloper", lungo);
  const prima = await copiaDa(w, { adesso: new Date("2026-11-01T00:00:00Z") });
  // Accorciata a quasi niente
  w.cambia("Interloper", '<div class="mw-parser-output"><p>lol</p></div>');
  const dopo = await copiaDa(w, { precedente: prima, adesso: new Date("2026-11-02T00:00:00Z") });
  assert.match(dopo.pagine.interloper.blocchi[0].s[0], /Ghost matter/);
  assert.deepEqual(dopo.trattenute.map((t) => [t.titolo, t.motivo, t.dal]), [["Interloper", "molto più corta di prima sulla wiki", "2026-11-02T00:00:00.000Z"]]);
  // Il giorno dopo, stessa versione: sempre trattenuta, dalla stessa data
  const ancora = await copiaDa(w, { precedente: dopo, adesso: new Date("2026-11-05T00:00:00Z") });
  assert.equal(ancora.trattenute[0].dal, "2026-11-02T00:00:00.000Z");
  assert.match(ancora.pagine.interloper.blocchi[0].s[0], /Ghost matter/);
  // Dopo 7 giorni vale la wiki
  const fine = await copiaDa(w, { precedente: ancora, adesso: new Date("2026-11-09T01:00:00Z") });
  assert.deepEqual(fine.trattenute, []);
  assert.deepEqual(fine.pagine.interloper.blocchi[0].s, ["lol"]);

  // Svuotata del tutto (e senza categorie): non sparisce subito
  w.cambia("Interloper", lungo);
  const base = await copiaDa(w);
  w.cambia("Interloper", '<div class="mw-parser-output"></div>', { categorie: [], lunghezza: 0 });
  const vuota = await copiaDa(w, { precedente: base });
  assert.ok(vuota.pagine.interloper);
  assert.equal(vuota.trattenute[0].motivo, "svuotata sulla wiki");
  assert.ok(!vuota.scartate.some((s) => s.titolo === "Interloper"));
});

test("novità: aggiunte, tolte, cambiate, rinominate", async () => {
  const w = new FintaWiki();
  const prima = await copiaDa(w);
  w.cambia("Timber Hearth", w.pagine["Timber Hearth"].html.replace("museum", "big museum"), { commento: "museo" });
  w.cambia("Riebeck", '<div class="mw-parser-output"><p>Riebeck is an archaeologist.</p></div>');
  // Gabbro diventa "Gabbro (Traveler)": il vecchio titolo rimanda al nuovo
  w.pagine["Gabbro (Traveler)"] = { ...w.pagine.Gabbro, pageid: 50 };
  w.togli("Gabbro");
  w.rimandi.Gabbro = "Gabbro (Traveler)";
  w.togli("Universe");
  const dopo = await copiaDa(w, { precedente: prima });
  const d = confronta(prima, dopo);
  assert.deepEqual(d.aggiunte, [{ id: "riebeck", titolo: "Riebeck" }]);
  assert.deepEqual(d.tolte, [{ id: "universe", titolo: "Universe" }]);
  assert.deepEqual(d.rinominate, [{ da: "Gabbro", id: "gabbro-traveler", titolo: "Gabbro (Traveler)" }]);
  assert.deepEqual(d.cambiate, [{ id: "timber-hearth", titolo: "Timber Hearth", quando: "2026-11-01T10:00:00Z", commento: "museo" }]);
  assert.equal(d.totale, 4);
  assert.equal(confronta(dopo, dopo).vuoto, true);
});

test("ricerca: titoli prima, altri nomi, tutte le parole, estratto", async () => {
  const c = await copiaDa(new FintaWiki());
  const indice = indicizza(c);
  assert.equal(cerca(indice, "interloper").risultati[0].id, "interloper");
  assert.equal(cerca(indice, "HEARTH").risultati[0].id, "timber-hearth");
  assert.deepEqual(
    cerca(indice, "ghost matter").risultati.map((r) => r.id),
    ["interloper", "timber-hearth"],
  );
  assert.equal(cerca(indice, "ghost zebra").totale, 0);
  assert.equal(cerca(indice, "  ").totale, 0);
  assert.match(cerca(indice, "flute").risultati[0].estratto, /Plays the flute/);
});
