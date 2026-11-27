const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("../server/wiki/html");

test("albero, entità e attributi", () => {
  const r = H.leggi(`<p class="a b" title='x &amp; y'>uno &amp; due&nbsp;&#8226;&#x2014;&hellip;&bogus;</p>`);
  const p = r.figli[0];
  assert.equal(p.tag, "p");
  assert.equal(p.attr.class, "a b");
  assert.equal(p.attr.title, "x & y");
  assert.equal(p.figli[0], "uno & due •—…&bogus;");
  assert.ok(H.haClasse(p, "b"));
});

test("chiusure implicite e tag vuoti", () => {
  const r = H.leggi("<ul><li>uno<li>due<ul><li>x</ul></ul><p>a<div>b</div><img src=x><br>c");
  const ul = r.figli[0];
  assert.equal(ul.figli.length, 2);
  assert.equal(ul.figli[1].figli[1].tag, "ul");
  assert.equal(r.figli[1].tag, "p");
  assert.deepEqual(r.figli[1].figli, ["a"]);
  assert.equal(r.figli[2].tag, "div");
  assert.equal(r.figli[3].tag, "img");
  assert.equal(r.figli[4].tag, "br");
  assert.equal(r.figli[5], "c");
});

test("celle e righe senza chiusura, tabelle annidate", () => {
  const r = H.leggi("<table><tr><td>a<td>b<table><tr><td>x</table><tr><td>c</table>");
  const righe = H.trovaTutti(r.figli[0], (n) => n.tag === "tr");
  assert.equal(righe.length, 2);
  assert.equal(righe[0].figli.length, 2);
});

test("script, stili, commenti e noscript spariscono", () => {
  const r = H.leggi("a<!-- nascosto --><script>alert(1)</script><style>p{}</style><noscript><img src=x></noscript>b");
  assert.equal(H.testoDi(r), "ab");
});

test("testoDi, trova", () => {
  const r = H.leggi('<div><span class="x">ciao<br>mondo</span></div>');
  assert.equal(H.testoDi(r), "ciao\nmondo");
  assert.equal(H.trova(r, (n) => H.haClasse(n, "x")).tag, "span");
  assert.equal(H.trova(r, (n) => n.tag === "table"), null);
});
