const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../server/wiki/blocchi");
const { FintaWiki } = require("./finta-wiki");

const PAGINE = { "Timber Hearth": "timber-hearth", Gabbro: "gabbro", Interloper: "interloper" };
function ctx(titolo = "Prova") {
  const usate = [];
  return {
    titolo,
    id: PAGINE[titolo] || "prova",
    wiki: "https://outerwilds.fandom.com",
    usate,
    immagine: (n) => (usate.push(n), true),
    link(t, fr) {
      if (t === "Category:Planets") return { c: "planets" };
      const dest = t === "The Interloper" ? "Interloper" : t;
      const id = PAGINE[dest];
      if (!id) return null;
      if (id === this.id) return fr ? { a: fr } : null;
      return fr ? { p: id, a: fr } : { p: id };
    },
  };
}

const converti = (html, c = ctx()) => B.converti(html, c);

test("paragrafi, stili e collegamenti", () => {
  const { blocchi } = converti(`<div class="mw-parser-output"><p><b>Gabbro</b> on <a href="/wiki/Timber_Hearth#Village">TH</a>, <a href="/wiki/The_Interloper">comet</a>, <a href="/wiki/Category:Planets">planets</a>, <a href="https://example.org/a" class="external">ext</a>, <a href="/wiki/Nope">nope</a>, <a class="new" href="/index.php?title=X&amp;redlink=1">red</a>, <a href="javascript:alert(1)">js</a>.</p></div>`);
  assert.deepEqual(blocchi, [
    {
      t: "p",
      s: [
        { t: "Gabbro", b: 1 },
        " on ",
        { t: "TH", p: "timber-hearth", a: "Village" },
        ", ",
        { t: "comet", p: "interloper" },
        ", ",
        { t: "planets", c: "planets" },
        ", ",
        { t: "ext", e: "https://example.org/a" },
        ", nope, red, js.",
      ],
    },
  ]);
});

test("spazi: niente doppi, niente in fondo, gli a capo restano", () => {
  const { blocchi } = converti("<p>  uno   <i> due </i>  tre<br/>  quattro  </p>");
  assert.deepEqual(blocchi[0].s, ["uno ", { t: "due ", i: 1 }, "tre", { br: 1 }, "quattro"]);
});

test("titoli con traduzione e ancora", () => {
  const { blocchi } = converti('<h2><span class="mw-headline" id="Notes_&amp;_Trivia">Notes &amp; Trivia</span><span class="mw-editsection">[edit]</span></h2><h3><span class="mw-headline" id="Escape_Pod_3">Escape Pod 3</span></h3>');
  assert.deepEqual(blocchi, [
    { t: "h", l: 2, s: ["Notes & Trivia"], id: "Notes_&_Trivia", it: "Note e curiosità" },
    { t: "h", l: 3, s: ["Escape Pod 3"], id: "Escape_Pod_3" },
  ]);
});

test("pagina vera finta: spoiler, scheda, figura, note, elenchi, navigazione", () => {
  const w = new FintaWiki();
  const c = ctx("Timber Hearth");
  const r = converti(w.pagine["Timber Hearth"].html, c);
  assert.equal(r.spoiler, true);
  assert.equal(r.schede.length, 1);
  assert.deepEqual(r.schede[0], {
    titolo: ["Timber Hearth"],
    immagini: [{ f: "TH.png" }],
    righe: [
      { e: "Tipo", s: ["Planet"] },
      { e: "Abitanti", s: [{ t: "Gabbro", p: "gabbro" }, " (sometimes)"] },
    ],
  });
  const tipi = r.blocchi.map((b) => b.t);
  assert.deepEqual(tipi, ["p", "h", "img", "p", "h", "li", "li", "li", "nav", "note"]);
  // Il primo paragrafo: link alla stessa pagina diventa solo ancora
  assert.deepEqual(r.blocchi[0].s.find((x) => x.t === "the village"), { t: "the village", a: "Village" });
  assert.deepEqual(r.blocchi[2], { t: "img", f: "Village.png", d: ["The village"] });
  assert.deepEqual(r.blocchi[3].s.at(-1), { t: "[1]", sup: 1, a: "cite_note-1" });
  assert.deepEqual(r.blocchi.slice(5, 8), [
    { t: "li", s: ["First fact"], l: 1 },
    { t: "li", s: ["Nested fact"], l: 2 },
    { t: "li", s: ["Second fact"], l: 1 },
  ]);
  assert.deepEqual(r.blocchi[8], { t: "nav", righe: [{ s: [{ t: "Timber Hearth", b: 1 }, " • ", { t: "Interloper", p: "interloper" }] }], titolo: [{ t: "Planets", c: "planets" }] });
  assert.deepEqual(r.blocchi[9], { t: "note", voci: [{ s: ["From the game."], id: "cite_note-1" }] });
  assert.deepEqual(c.usate.sort(), ["TH.png", "Village.png"]);
});

test("dialoghi annidati, galleria, tabella chiusa, video", () => {
  const w = new FintaWiki();
  const r = converti(w.pagine.Gabbro.html, ctx("Gabbro"));
  const [p, h, d1, d2, gal, tab, video] = r.blocchi;
  assert.equal(p.t, "p");
  assert.equal(h.it, "Dialoghi");
  assert.deepEqual(d1, { t: "p", s: ['"Hey."'], l: 1 });
  assert.deepEqual(d2, { t: "p", s: ['"Hello."'], l: 2 });
  assert.deepEqual(gal, { t: "galleria", voci: [{ f: "Gabbro.jpg", d: ["Gabbro playing"] }, { f: "Missing.png" }] });
  assert.deepEqual(tab, { t: "tab", righe: [[{ s: ["Hidden title"], th: 1 }], [{ s: ["Hidden text"] }]], chiusa: 1 });
  assert.deepEqual(video, { t: "video", url: "https://www.youtube.com/watch?v=P54o23oLziE", titolo: "YouTube" });
});

test("tabelle: celle ricche, colspan, tabelle di sola impaginazione", () => {
  const { blocchi } = converti('<table class="wikitable"><tr><th colspan="2">A</th></tr><tr><td><ul><li>x</li></ul></td><td>y</td></tr></table><table><tr><td><p>solo</p></td></tr></table>');
  assert.deepEqual(blocchi, [
    { t: "tab", righe: [[{ s: ["A"], th: 1, cs: 2 }], [{ b: [{ t: "li", s: ["x"], l: 1 }] }, { s: ["y"] }]] },
    { t: "p", s: ["solo"] },
  ]);
});

test("avvisi, schede a linguette, codice, citazioni", () => {
  const { blocchi } = converti(
    '<table class="ambox"><tr><td class="ambox-image">img</td><td class="ambox-text">This article is a <b>stub</b>.</td></tr></table>' +
      '<div class="wds-tabber"><div class="wds-tabs__wrapper"><ul class="wds-tabs"><li class="wds-tabs__tab"><span>Uno</span></li><li class="wds-tabs__tab"><span>Due</span></li></ul></div><div class="wds-tab__content"><p>primo</p></div><div class="wds-tab__content"><p>secondo</p></div></div>' +
      "<pre>  a\n  b</pre><blockquote><p>detto</p></blockquote><hr>",
  );
  assert.deepEqual(blocchi, [
    { t: "avviso", s: ["This article is a ", { t: "stub", b: 1 }, "."] },
    { t: "schede", voci: [{ nome: "Uno", b: [{ t: "p", s: ["primo"] }] }, { nome: "Due", b: [{ t: "p", s: ["secondo"] }] }] },
    { t: "codice", testo: "  a\n  b" },
    { t: "citazione", b: [{ t: "p", s: ["detto"] }] },
    { t: "hr" },
  ]);
});

test("immagini nel testo (icone) e paragrafi di sole immagini", () => {
  const img = (n) => `<img data-image-name="${n}" width="64" height="64" src="x">`;
  const { blocchi } = converti(`<p>${img("A.png")} testo</p><p>${img("B.png")}</p>`);
  assert.deepEqual(blocchi, [
    { t: "p", s: [{ f: "A.png", w: 64, h: 64 }, " testo"] },
    { t: "img", f: "B.png" },
  ]);
});

test("testo semplice, riassunto e immagini usate", () => {
  const w = new FintaWiki();
  const r = converti(w.pagine["Timber Hearth"].html, ctx("Timber Hearth"));
  assert.match(B.riassunto(r.blocchi), /^Timber Hearth is the home planet/);
  assert.equal(B.riassunto([{ t: "p", s: ["parola ".repeat(80)] }], 50).length <= 51, true);
  assert.match(B.testoBlocchi(r.blocchi).join(" "), /Nested fact/);
  assert.match(B.testoScheda(r.schede[0]), /Abitanti Gabbro/);
  const viste = [];
  B.perImmagini(r.blocchi, (x) => viste.push(x.f));
  assert.deepEqual(viste, ["Village.png"]);
});
