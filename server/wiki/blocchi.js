// Pagine della wiki → blocchi semplici che l'app disegna come testo (niente HTML dalla wiki
// arriva al browser: link, immagini e stili passano solo se li riconosciamo qui).
//
// Blocchi:
//   { t: "h", l: 2..5, s, id, it }    titolo di sezione (it = titolo in italiano, se lo conosciamo)
//   { t: "p", s, l }                  paragrafo (l = rientro, per i dialoghi annidati)
//   { t: "li", s, l, o }              voce di elenco di livello l (o = numero, negli elenchi numerati)
//   { t: "dt", s, l }                 termine di un elenco di definizioni
//   { t: "img", f, d }                immagine f con didascalia d
//   { t: "galleria", voci: [{ f, d }] }
//   { t: "tab", righe: [[cella]], titolo, chiusa }   tabella (chiusa: si apre toccandola)
//        cella: { s } oppure { b: [blocchi] }, con th (intestazione), cs e rs (colspan, rowspan)
//   { t: "schede", voci: [{ nome, b }] }            contenuti a schede
//   { t: "nav", titolo, righe: [{ nome, s }] }      riquadro di navigazione in fondo
//   { t: "avviso", s }                avviso della wiki (pagina da completare, versione alpha...)
//   { t: "video", url, titolo }       video esterno (YouTube): solo il link
//   { t: "codice", testo }            testo preformattato
//   { t: "citazione", b }
//   { t: "note", voci: [{ id, s }] }  note a piè di pagina
//   { t: "hr" }
// Pezzi (s): stringhe, oppure oggetti
//   { t, b, i, u, x (barrato), k (codice), sup, sub, small, p (pagina), a (punto della pagina),
//     c (categoria), e (indirizzo esterno) }
//   { br: 1 }                         a capo
//   { f, w, h, alt, p, c, e }         immagine nel testo (icone), con il suo eventuale link
// Scheda (infobox): { titolo, immagini: [{ f, d }], righe: [{ e, s } | { g }] }
const H = require("./html");
const N = require("./nomi");

const SALTATI_TAG = new Set(["svg", "input", "form", "button", "select", "textarea", "iframe", "video", "audio", "object", "embed", "map"]);
const SALTATE_CLASSI = ["mw-editsection", "noprint", "navbar", "mw-cite-backlink", "info-icon", "toc", "catlinks", "printfooter", "mw-jump-link", "wds-tabs__wrapper", "mw-empty-elt", "error"];
const STILI = { b: "b", strong: "b", i: "i", em: "i", cite: "i", var: "i", dfn: "i", u: "u", ins: "u", s: "x", del: "x", strike: "x", code: "k", kbd: "k", tt: "k", samp: "k", sup: "sup", sub: "sub", small: "small" };
const BLOCCO_IN_LINEA = new Set(["p", "div", "li", "dd", "dt", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "figcaption", "table", "ul", "ol", "dl", "blockquote", "pre", "figure", "section", "center", "aside", "caption"]);
const CAMPI_LINK = ["p", "a", "c", "e"];
const SPOILER = /This (?:article|page|section) contains spoilers/i;

function salta(el) {
  if (SALTATI_TAG.has(el.tag)) return true;
  if (el.attr.id === "toc") return true;
  const c = H.classi(el);
  return SALTATE_CLASSI.some((x) => c.includes(x));
}

// --- Righe di pezzi ---

class Riga {
  constructor() {
    this.pezzi = [];
  }

  testo(t, stile) {
    if (!t) return;
    // Spazi e a capo dell'HTML valgono uno spazio; gli spazi non separabili restano
    t = t.replace(/[­​]/g, "").replace(/[ \t\n\r\f\v]+/g, " ");
    if (!t) return;
    const ultimo = this.pezzi[this.pezzi.length - 1];
    // Niente spazi doppi tra un pezzo e l'altro, né spazi dopo un a capo o all'inizio
    const prima = ultimo == null ? " " : ultimo.br ? " " : ultimo.f ? "" : typeof ultimo === "string" ? ultimo.slice(-1) : ultimo.t.slice(-1);
    if (prima === " " && t.startsWith(" ")) t = t.slice(1);
    if (!t) return;
    const chiave = chiaveStile(stile);
    if (ultimo != null && !ultimo.br && !ultimo.f && chiaveStile(typeof ultimo === "string" ? {} : ultimo) === chiave) {
      if (typeof ultimo === "string") this.pezzi[this.pezzi.length - 1] = ultimo + t;
      else ultimo.t += t;
      return;
    }
    this.pezzi.push(chiave ? { t, ...stilePulito(stile) } : t);
  }

  br() {
    this.togliSpazioFinale();
    if (this.pezzi.length && !this.pezzi[this.pezzi.length - 1].br) this.pezzi.push({ br: 1 });
  }

  img(im) {
    this.pezzi.push(im);
  }

  togliSpazioFinale() {
    const u = this.pezzi[this.pezzi.length - 1];
    if (typeof u === "string") {
      const t = u.replace(/ +$/, "");
      if (t) this.pezzi[this.pezzi.length - 1] = t;
      else this.pezzi.pop();
    } else if (u && u.t != null) {
      u.t = u.t.replace(/ +$/, "");
      if (!u.t) this.pezzi.pop();
    }
  }

  // Pezzi finiti: senza spazi e a capo in fondo
  fine() {
    for (;;) {
      this.togliSpazioFinale();
      const u = this.pezzi[this.pezzi.length - 1];
      if (u && u.br) this.pezzi.pop();
      else break;
    }
    const p = this.pezzi;
    this.pezzi = [];
    return p;
  }
}

function stilePulito(stile) {
  const o = {};
  for (const [k, v] of Object.entries(stile || {})) if (v != null && v !== false) o[k] = v;
  return o;
}

function chiaveStile(stile) {
  const o = stilePulito(stile);
  delete o.t;
  const k = Object.keys(o).sort();
  return k.length ? JSON.stringify(k.map((x) => [x, o[x]])) : "";
}

const vuota = (pezzi) => !pezzi.some((x) => (typeof x === "string" ? x.trim() : x.f || (x.t && x.t.trim())));
const soloImmagini = (pezzi) => pezzi.length > 0 && pezzi.every((x) => x.f || x.br || (typeof x === "string" && !x.trim()));

// --- Collegamenti e immagini ---

function frammento(f) {
  try {
    return decodeURIComponent(f).replace(/ /g, "_");
  } catch {
    return f;
  }
}

function destinazione(href, ctx) {
  if (!href) return null;
  if (href.startsWith("#")) return { a: frammento(href.slice(1)) };
  let url;
  try {
    url = new URL(href, `${ctx.wiki}/`);
  } catch {
    return null;
  }
  const wiki = new URL(ctx.wiki);
  if (url.host === wiki.host) {
    if (!url.pathname.startsWith("/wiki/") || /[?&](action|oldid|diff|redlink)=/.test(url.search)) return null;
    let t;
    try {
      t = decodeURIComponent(url.pathname.slice("/wiki/".length));
    } catch {
      return null;
    }
    return ctx.link(N.titolo(t), url.hash ? frammento(url.hash.slice(1)) : null) || null;
  }
  // Collegamenti ai file delle immagini: l'immagine è già qui
  if (/(^|\.)wikia\.nocookie\.net$|(^|\.)wikia\.com$/.test(url.host)) return null;
  if (url.protocol === "https:" || url.protocol === "http:") return { e: url.href };
  return null;
}

// Nome del file di un'immagine, come lo scrive la wiki ("Hollow's lantern.png")
function nomeImmagine(img) {
  let nome = img.attr["data-image-name"];
  if (!nome && img.attr["data-image-key"]) {
    try {
      nome = decodeURIComponent(img.attr["data-image-key"]);
    } catch {
      nome = img.attr["data-image-key"];
    }
  }
  if (!nome) {
    const m = /\/images\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)/.exec(img.attr["data-src"] || img.attr.src || "");
    if (m) {
      try {
        nome = decodeURIComponent(m[1]);
      } catch {
        nome = m[1];
      }
    }
  }
  return nome ? N.titolo(nome) : null;
}

function immagineDa(img, ctx, stile = {}) {
  const nome = nomeImmagine(img);
  if (!nome || !ctx.immagine(nome)) return null;
  const im = { f: nome };
  const w = Number(img.attr.width);
  const h = Number(img.attr.height);
  if (w > 0 && h > 0) Object.assign(im, { w, h });
  if (img.attr.alt && img.attr.alt !== nome) im.alt = img.attr.alt;
  for (const k of CAMPI_LINK) if (stile[k]) im[k] = stile[k];
  return im;
}

// --- Testo in linea ---

function inline(nodo, stile, riga, ctx) {
  for (const f of nodo.figli) {
    if (typeof f === "string") riga.testo(f, stile);
    else inlineEl(f, stile, riga, ctx);
  }
}

function inlineEl(el, stile, riga, ctx) {
  if (salta(el)) return;
  if (el.tag === "br") return riga.br();
  if (el.tag === "img") {
    const im = immagineDa(el, ctx, stile);
    if (im) riga.img(im);
    return;
  }
  if (el.tag === "a") {
    const senza = { ...stile };
    for (const k of CAMPI_LINK) delete senza[k];
    const dest = destinazione(el.attr.href, ctx);
    return inline(el, { ...senza, ...(dest || {}) }, riga, ctx);
  }
  if (el.tag === "strong" && H.haClasse(el, "selflink")) return inline(el, { ...stile, b: 1 }, riga, ctx);
  if (STILI[el.tag]) return inline(el, { ...stile, [STILI[el.tag]]: 1 }, riga, ctx);
  if (el.tag === "td" || el.tag === "th") {
    riga.testo(" ", stile);
    inline(el, stile, riga, ctx);
    return riga.testo(" ", stile);
  }
  if (BLOCCO_IN_LINEA.has(el.tag)) {
    riga.br();
    inline(el, stile, riga, ctx);
    return riga.br();
  }
  inline(el, stile, riga, ctx);
}

function pezziDi(nodo, ctx, stile = {}) {
  const r = new Riga();
  inline(nodo, stile, r, ctx);
  return r.fine();
}

// --- Blocchi ---

const TITOLI = { h1: 2, h2: 2, h3: 3, h4: 4, h5: 5, h6: 5 };

function titoloSezione(el, ctx) {
  const testa = H.trova(el, (n) => H.haClasse(n, "mw-headline"));
  const s = pezziDi(testa || el, ctx);
  if (vuota(s)) return null;
  const b = { t: "h", l: TITOLI[el.tag], s };
  const id = testa?.attr.id || el.attr.id;
  if (id) b.id = id;
  const it = N.sezione(H.testoDi(testa || el));
  if (it) b.it = it;
  return b;
}

function didascalia(el, ctx) {
  const d = el && pezziDi(el, ctx);
  return d && !vuota(d) ? d : null;
}

function figura(el, ctx) {
  const img = H.trova(el, (n) => n.tag === "img");
  const im = img && immagineDa(img, ctx);
  if (!im) return null;
  const b = { t: "img", f: im.f };
  const testo = H.trova(el, (n) => n.tag === "figcaption" || H.haClasse(n, "thumbcaption") || H.haClasse(n, "lightbox-caption"));
  const d = didascalia(testo, ctx);
  if (d) b.d = d;
  return b;
}

function galleria(el, ctx) {
  const voci = [];
  for (const box of H.trovaTutti(el, (n) => n.tag === "li" || H.haClasse(n, "wikia-gallery-item"))) {
    const img = H.trova(box, (n) => n.tag === "img");
    const im = img && immagineDa(img, ctx);
    if (!im) continue;
    const v = { f: im.f };
    const d = didascalia(H.trova(box, (n) => H.haClasse(n, "gallerytext") || H.haClasse(n, "lightbox-caption")), ctx);
    if (d) v.d = d;
    voci.push(v);
  }
  return voci.length ? { t: "galleria", voci } : null;
}

// Indirizzo da aprire per un video incorporato (YouTube, Vimeo)
function video(el) {
  const fr = el.tag === "iframe" ? el : H.trova(el, (n) => n.tag === "iframe");
  if (!fr?.attr.src) return null;
  let url;
  try {
    url = new URL(fr.attr.src, "https://www.youtube.com/");
  } catch {
    return null;
  }
  const yt = /(?:^|\.)youtube(?:-nocookie)?\.com$/.test(url.host) && /^\/embed\/([\w-]{6,20})/.exec(url.pathname);
  if (yt) return { t: "video", url: `https://www.youtube.com/watch?v=${yt[1]}`, titolo: "YouTube" };
  const vimeo = /(?:^|\.)vimeo\.com$/.test(url.host) && /\/video\/(\d+)/.exec(url.pathname);
  if (vimeo) return { t: "video", url: `https://vimeo.com/${vimeo[1]}`, titolo: "Vimeo" };
  return null;
}

// Righe dirette di una tabella (non quelle delle tabelle dentro)
function righe(tabella) {
  const out = [];
  for (const f of tabella.figli) {
    if (typeof f !== "object") continue;
    if (f.tag === "tr") out.push(f);
    else if (["tbody", "thead", "tfoot"].includes(f.tag)) out.push(...f.figli.filter((x) => typeof x === "object" && x.tag === "tr"));
  }
  return out;
}

function tabella(el, ctx) {
  const tr = righe(el);
  const out = [];
  for (const r of tr) {
    const celle = [];
    for (const c of r.figli) {
      if (typeof c !== "object" || (c.tag !== "td" && c.tag !== "th")) continue;
      const b = blocchiDi(c, ctx);
      const cella = b.length === 1 && b[0].t === "p" && !b[0].l ? { s: b[0].s } : b.length ? { b } : { s: [] };
      if (c.tag === "th") cella.th = 1;
      const cs = Number(c.attr.colspan);
      const rs = Number(c.attr.rowspan);
      if (cs > 1) cella.cs = Math.min(cs, 20);
      if (rs > 1) cella.rs = Math.min(rs, 50);
      celle.push(cella);
    }
    if (celle.length && celle.some((c) => (c.s && !vuota(c.s)) || c.b?.length)) out.push(celle);
  }
  if (!out.length) return [];
  // Tabelle usate solo per impaginare (una cella sola): via la tabella, resta il contenuto
  if (out.length === 1 && out[0].length === 1 && !H.haClasse(el, "mw-collapsible")) {
    const c = out[0][0];
    return c.b || [{ t: "p", s: c.s }];
  }
  const b = { t: "tab", righe: out };
  const cap = el.figli.find((x) => typeof x === "object" && x.tag === "caption");
  const titolo = cap && didascalia(cap, ctx);
  if (titolo) b.titolo = titolo;
  if (H.haClasse(el, "mw-collapsed")) b.chiusa = 1;
  return [b];
}

// Riquadro di navigazione: una riga per elenco (td.navbox-list), con il nome del gruppo
// (th.navbox-group della stessa riga) se c'è; i sottogruppi diventano righe anche loro
function navigazione(el, ctx) {
  const testa = H.trova(el, (n) => H.haClasse(n, "navbox-title"));
  const righeNav = [];
  const visita = (n) => {
    for (const f of n.figli) {
      if (typeof f !== "object" || salta(f)) continue;
      if (f.tag === "tr") {
        const celle = f.figli.filter((x) => typeof x === "object");
        const lista = celle.find((x) => H.haClasse(x, "navbox-list"));
        if (lista) {
          if (H.trova(lista, (x) => x.tag === "table")) {
            visita(lista);
            continue;
          }
          const s = pezziDi(lista, ctx);
          if (vuota(s)) continue;
          const nome = celle.find((x) => H.haClasse(x, "navbox-group"));
          const ns = nome && pezziDi(nome, ctx);
          righeNav.push(ns && !vuota(ns) ? { nome: ns, s } : { s });
          continue;
        }
      }
      visita(f);
    }
  };
  visita(el);
  if (!righeNav.length) return null;
  const b = { t: "nav", righe: righeNav };
  const titolo = testa && didascalia(testa, ctx);
  if (titolo) b.titolo = titolo;
  return b;
}

function note(el, ctx) {
  const voci = [];
  for (const li of H.trovaTutti(el, (n) => n.tag === "li")) {
    const testo = H.trova(li, (n) => H.haClasse(n, "reference-text")) || li;
    const s = pezziDi(testo, ctx);
    if (vuota(s)) continue;
    const v = { s };
    if (li.attr.id) v.id = li.attr.id;
    voci.push(v);
  }
  return voci.length ? { t: "note", voci } : null;
}

function schede(el, ctx) {
  const nomi = H.trovaTutti(el, (n) => H.haClasse(n, "wds-tabs__tab")).map((li) => H.testoDi(li).replace(/\s+/g, " ").trim());
  const contenuti = H.trovaTutti(el, (n) => H.haClasse(n, "wds-tab__content"));
  const voci = contenuti.map((c, i) => ({ nome: nomi[i] || `${i + 1}`, b: blocchiDi(c, ctx) })).filter((v) => v.b.length);
  return voci.length ? { t: "schede", voci } : null;
}

// Elenco puntato o numerato: una voce per riga, con il livello
function elenco(el, ctx, livello, out) {
  let numero = Number(el.attr.start) || 1;
  for (const li of el.figli) {
    if (typeof li !== "object" || li.tag !== "li") continue;
    if (salta(li)) continue;
    const riga = new Riga();
    let prima = true;
    const chiudi = () => {
      const s = riga.fine();
      if (vuota(s)) return;
      if (prima) {
        const b = { t: "li", s, l: livello };
        if (el.tag === "ol") b.o = numero;
        out.push(b);
        prima = false;
      } else {
        out.push({ t: "p", s, l: livello });
      }
    };
    for (const f of li.figli) {
      if (typeof f === "string") riga.testo(f, {});
      else if (f.tag === "ul" || f.tag === "ol") {
        chiudi();
        elenco(f, ctx, livello + 1, out);
      } else if (f.tag === "dl") {
        chiudi();
        definizioni(f, ctx, livello, out);
      } else if (["table", "figure", "blockquote", "pre"].includes(f.tag) || H.haClasse(f, "thumb") || H.haClasse(f, "gallery") || H.haClasse(f, "notice")) {
        chiudi();
        out.push(...blocchiDi({ tag: "div", attr: {}, figli: [f] }, ctx, livello));
      } else inlineEl(f, {}, riga, ctx);
    }
    if (prima) {
      // Voce senza testo (solo un elenco dentro): niente pallino vuoto
      const s = riga.fine();
      if (!vuota(s)) {
        const b = { t: "li", s, l: livello };
        if (el.tag === "ol") b.o = numero;
        out.push(b);
      }
    } else chiudi();
    numero++;
  }
}

function definizioni(el, ctx, livello, out) {
  for (const f of el.figli) {
    if (typeof f !== "object") continue;
    if (f.tag === "dt") {
      const s = pezziDi(f, ctx);
      if (!vuota(s)) out.push(livello ? { t: "dt", s, l: livello } : { t: "dt", s });
    } else if (f.tag === "dd") {
      out.push(...blocchiDi(f, ctx, livello + 1));
    }
  }
}

function scheda(el, ctx) {
  const box = { titolo: null, immagini: [], righe: [] };
  const visita = (n) => {
    for (const f of n.figli) {
      if (typeof f !== "object" || salta(f)) continue;
      const c = H.classi(f);
      if (c.includes("pi-header") || c.includes("pi-title")) {
        const s = pezziDi(f, ctx);
        if (vuota(s)) continue;
        if (!box.titolo && !box.righe.length && !box.immagini.length) box.titolo = s;
        else box.righe.push({ g: s });
      } else if (c.includes("pi-image-collection")) {
        const nomi = H.trovaTutti(f, (x) => H.haClasse(x, "wds-tabs__tab")).map((li) => H.testoDi(li).replace(/\s+/g, " ").trim());
        H.trovaTutti(f, (x) => x.tag === "figure").forEach((fig, i) => {
          const img = H.trova(fig, (x) => x.tag === "img");
          const im = img && immagineDa(img, ctx);
          if (!im) return;
          const cap = didascalia(H.trova(fig, (x) => x.tag === "figcaption"), ctx);
          box.immagini.push(cap ? { f: im.f, d: cap } : nomi[i] ? { f: im.f, d: [nomi[i]] } : { f: im.f });
        });
      } else if (f.tag === "figure" || c.includes("pi-image")) {
        const img = H.trova(f, (x) => x.tag === "img");
        const im = img && immagineDa(img, ctx);
        if (!im) continue;
        const cap = didascalia(H.trova(f, (x) => x.tag === "figcaption"), ctx);
        box.immagini.push(cap ? { f: im.f, d: cap } : { f: im.f });
      } else if (c.includes("pi-data")) {
        const nome = H.trova(f, (x) => H.haClasse(x, "pi-data-label"));
        const valore = H.trova(f, (x) => H.haClasse(x, "pi-data-value"));
        const s = valore ? pezziDi(valore, ctx) : [];
        if (vuota(s)) continue;
        box.righe.push(nome ? { e: N.etichetta(H.testoDi(nome)), s } : { s });
      } else if (c.includes("pi-caption")) {
        const s = pezziDi(f, ctx);
        const ultima = box.immagini[box.immagini.length - 1];
        if (ultima && !ultima.d && !vuota(s)) ultima.d = s;
      } else if (c.includes("pi-navigation")) {
        const s = pezziDi(f, ctx);
        if (!vuota(s)) box.righe.push({ s });
      } else {
        visita(f); // gruppi (section.pi-group), contenitori
      }
    }
  };
  visita(el);
  return box.titolo || box.immagini.length || box.righe.length ? box : null;
}

// Blocchi di un contenitore. livello = rientro (dialoghi annidati in <dl><dd>)
function blocchiDi(nodo, ctx, livello = 0) {
  const out = [];
  let riga = new Riga();
  const chiudi = () => {
    const s = riga.fine();
    if (vuota(s)) return;
    if (soloImmagini(s)) {
      for (const x of s) if (x.f) out.push({ t: "img", f: x.f });
      return;
    }
    out.push(livello ? { t: "p", s, l: livello } : { t: "p", s });
  };

  for (const f of nodo.figli) {
    if (typeof f === "string") {
      riga.testo(f, {});
      continue;
    }
    if (salta(f)) continue;
    const c = H.classi(f);
    const tag = f.tag;

    // Il riquadro "This article contains spoilers!": la pagina diventa "con spoiler"
    if ((tag === "div" || tag === "table") && SPOILER.test(H.testoDi(f)) && H.testoDi(f).length < 600) {
      chiudi();
      ctx.spoiler = true;
      continue;
    }

    if (TITOLI[tag]) {
      chiudi();
      const b = titoloSezione(f, ctx);
      if (b) out.push(b);
    } else if (tag === "p") {
      chiudi();
      riga = new Riga();
      inline(f, {}, riga, ctx);
      chiudi();
    } else if (tag === "ul" && (c.includes("gallery") || c.includes("mw-gallery-traditional"))) {
      chiudi();
      const g = galleria(f, ctx);
      if (g) out.push(g);
    } else if (tag === "ul" || tag === "ol") {
      chiudi();
      elenco(f, ctx, livello + 1, out);
    } else if (tag === "dl") {
      chiudi();
      definizioni(f, ctx, livello, out);
    } else if (tag === "aside" && c.includes("portable-infobox")) {
      chiudi();
      const box = scheda(f, ctx);
      if (box) ctx.schede.push(box);
    } else if (tag === "iframe" || c.includes("embedvideo") || c.includes("embedvideowrap")) {
      chiudi();
      const v = video(f);
      if (v) out.push(v);
    } else if (tag === "figure" || (tag === "div" && (c.includes("thumb") || c.includes("floatright") || c.includes("floatleft")))) {
      chiudi();
      const b = figura(f, ctx);
      if (b) out.push(b);
    } else if (c.includes("wikia-gallery") || (tag === "div" && c.includes("gallery"))) {
      chiudi();
      const g = galleria(f, ctx);
      if (g) out.push(g);
    } else if (tag === "table" && c.includes("navbox")) {
      chiudi();
      const n = navigazione(f, ctx);
      if (n) out.push(n);
    } else if ((tag === "table" || tag === "div") && (c.includes("ambox") || c.includes("notice") || c.includes("unofficial-content-notice"))) {
      chiudi();
      const testo = H.trova(f, (n) => H.haClasse(n, "ambox-text")) || f;
      const s = pezziDi(testo, ctx);
      if (!vuota(s)) out.push(livello ? { t: "avviso", s, l: livello } : { t: "avviso", s });
    } else if (tag === "table") {
      chiudi();
      out.push(...tabella(f, ctx));
    } else if (c.includes("wds-tabber")) {
      chiudi();
      const sc = schede(f, ctx);
      if (sc) out.push(sc);
    } else if (c.includes("mw-references-wrap") || (tag === "ol" && c.includes("references"))) {
      chiudi();
      const n = note(f, ctx);
      if (n) out.push(n);
    } else if (tag === "pre") {
      chiudi();
      const testo = H.testoDi(f).replace(/^\n/, "").replace(/\s+$/, "");
      if (testo) out.push({ t: "codice", testo });
    } else if (tag === "blockquote") {
      chiudi();
      const b = blocchiDi(f, ctx);
      if (b.length) out.push({ t: "citazione", b });
    } else if (tag === "hr") {
      chiudi();
      out.push({ t: "hr" });
    } else if (["div", "center", "section", "article", "main", "header", "footer", "nav", "details", "summary"].includes(tag)) {
      chiudi();
      out.push(...blocchiDi(f, ctx, livello));
    } else {
      inlineEl(f, {}, riga, ctx);
    }
  }
  chiudi();
  return out;
}

// --- Pagina intera ---

// ctx: { titolo, wiki, link(titolo, frammento) → { p, a } | { c } | null, immagine(nome) → bool }
function converti(html, ctx) {
  const c = { ...ctx, spoiler: false, schede: [] };
  const albero = H.leggi(html);
  const radice = H.trova(albero, (n) => H.haClasse(n, "mw-parser-output")) || albero;
  const blocchi = blocchiDi(radice, c);
  return { blocchi, schede: c.schede, spoiler: c.spoiler };
}

// --- Testo semplice (riassunti e ricerca) ---

function testoPezzi(pezzi) {
  return (pezzi || [])
    .map((x) => (typeof x === "string" ? x : x.br ? " " : x.t || ""))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function testoBlocchi(blocchi, out = []) {
  for (const b of blocchi || []) {
    if (b.s) out.push(testoPezzi(b.s));
    if (b.it) out.push(b.it);
    if (b.d) out.push(testoPezzi(b.d));
    if (b.titolo && Array.isArray(b.titolo)) out.push(testoPezzi(b.titolo));
    if (b.testo) out.push(b.testo);
    if (b.b) testoBlocchi(b.b, out);
    if (b.voci) for (const v of b.voci) {
      if (v.s) out.push(testoPezzi(v.s));
      if (v.d) out.push(testoPezzi(v.d));
      if (v.b) testoBlocchi(v.b, out);
    }
    if (b.righe) for (const r of b.righe) {
      if (Array.isArray(r)) for (const cella of r) {
        if (cella.s) out.push(testoPezzi(cella.s));
        if (cella.b) testoBlocchi(cella.b, out);
      } else {
        if (r.nome) out.push(testoPezzi(r.nome));
        if (r.s) out.push(testoPezzi(r.s));
      }
    }
  }
  return out;
}

function testoScheda(box) {
  const out = [];
  if (box.titolo) out.push(testoPezzi(box.titolo));
  for (const im of box.immagini) if (im.d) out.push(testoPezzi(im.d));
  for (const r of box.righe) {
    if (r.g) out.push(testoPezzi(r.g));
    if (r.e) out.push(r.e);
    if (r.s) out.push(testoPezzi(r.s));
  }
  return out.join(" ");
}

// Primo paragrafo, accorciato
function riassunto(blocchi, max = 240) {
  const p = blocchi.find((b) => b.t === "p" && !b.l);
  const t = p ? testoPezzi(p.s) : "";
  if (t.length <= max) return t;
  const corto = t.slice(0, max);
  return `${corto.slice(0, Math.max(corto.lastIndexOf(" "), max - 30)).replace(/[\s,;:.]+$/, "")}…`;
}

// Ogni pezzo e blocco che usa un'immagine: fn(oggetto con f)
function perImmagini(blocchi, fn) {
  const pezzi = (s) => (s || []).forEach((x) => x && x.f && fn(x));
  for (const b of blocchi || []) {
    if (b.f) fn(b);
    pezzi(b.s);
    pezzi(b.d);
    if (Array.isArray(b.titolo)) pezzi(b.titolo);
    if (b.b) perImmagini(b.b, fn);
    if (b.voci) for (const v of b.voci) {
      if (v.f) fn(v);
      pezzi(v.s);
      pezzi(v.d);
      if (v.b) perImmagini(v.b, fn);
    }
    if (b.righe) for (const r of b.righe) {
      if (Array.isArray(r)) for (const c of r) {
        pezzi(c.s);
        if (c.b) perImmagini(c.b, fn);
      } else {
        pezzi(r.nome);
        pezzi(r.s);
      }
    }
  }
}

module.exports = { converti, blocchiDi, pezziDi, testoPezzi, testoBlocchi, testoScheda, riassunto, perImmagini, destinazione, Riga };
