// Lettore HTML minimo per le pagine della wiki, già impaginate dal parser di MediaWiki (che
// scrive HTML pulito e ben chiuso). Dà un albero di nodi:
//   elemento: { tag, attr: { nome: valore }, figli: [...] }
//   testo: stringa (entità già tradotte)
// Commenti, <script>, <style> e <noscript> spariscono. Nessuna dipendenza esterna.

const VUOTI = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
// Contenuto da saltare del tutto (in <noscript> Fandom ripete le immagini caricate dopo)
const SALTATI = new Set(["script", "style", "noscript", "template"]);
// Un tag che si apre chiude da solo quelli di `chiude` rimasti aperti, ma non oltre i `confini`
// (un <li> dentro un elenco dentro un altro <li> non chiude quello di fuori)
const LISTA = { chiude: ["li"], confini: ["ul", "ol", "table"] };
const DEFINIZIONE = { chiude: ["dt", "dd"], confini: ["dl", "table"] };
const CELLA = { chiude: ["td", "th"], confini: ["tr", "table"] };
const CHIUDE = {
  li: LISTA,
  dt: DEFINIZIONE,
  dd: DEFINIZIONE,
  td: CELLA,
  th: CELLA,
  tr: { chiude: ["tr", "td", "th"], confini: ["table", "tbody", "thead", "tfoot"] },
  tbody: { chiude: ["thead", "tbody", "tfoot", "tr", "td", "th"], confini: ["table"] },
  option: { chiude: ["option"], confini: ["select"] },
};
// Blocchi che chiudono un <p> rimasto aperto
const BLOCCHI = new Set("address article aside blockquote center details div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr main nav ol p pre section table ul".split(" "));
// Dove si ferma la chiusura di un <p> rimasto aperto
const CONFINI_P = new Set(["table", "td", "th", "li", "dd", "dt", "div", "blockquote", "figure", "aside", "section"]);

const ENTITA = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  bull: "•", middot: "·", times: "×", divide: "÷", deg: "°", plusmn: "±", copy: "©", reg: "®", trade: "™",
  laquo: "«", raquo: "»", larr: "←", rarr: "→", uarr: "↑", darr: "↓", harr: "↔", hearts: "♥", star: "☆",
  frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³", micro: "µ", para: "¶", sect: "§", euro: "€",
  pound: "£", cent: "¢", yen: "¥", iexcl: "¡", iquest: "¿", shy: "­", zwj: "‍", zwnj: "‌",
  agrave: "à", aacute: "á", acirc: "â", atilde: "ã", auml: "ä", aring: "å", aelig: "æ", ccedil: "ç",
  egrave: "è", eacute: "é", ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ", ouml: "ö", oslash: "ø", ugrave: "ù",
  uacute: "ú", ucirc: "û", uuml: "ü", yacute: "ý", yuml: "ÿ", szlig: "ß", Agrave: "À", Aacute: "Á",
  Egrave: "È", Eacute: "É", Igrave: "Ì", Ograve: "Ò", Ugrave: "Ù", Ccedil: "Ç", Ntilde: "Ñ", Ouml: "Ö", Uuml: "Ü",
};

function decodifica(testo) {
  if (!testo.includes("&")) return testo;
  return testo.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,10});/gi, (tutto, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "�";
      return String.fromCodePoint(n);
    }
    return Object.hasOwn(ENTITA, e) ? ENTITA[e] : tutto;
  });
}

const RE_ATTR = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

function attributi(testo) {
  const attr = {};
  for (const m of testo.matchAll(RE_ATTR)) {
    const nome = m[1].toLowerCase();
    if (Object.hasOwn(attr, nome)) continue;
    attr[nome] = decodifica(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return attr;
}

const RE_TAG = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s=/>"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*(\/?)>/g;

function leggi(html) {
  const radice = { tag: "#radice", attr: {}, figli: [] };
  const pila = [radice];
  const cima = () => pila[pila.length - 1];
  let pos = 0;
  RE_TAG.lastIndex = 0;

  const testo = (t) => {
    if (!t) return;
    const figli = cima().figli;
    const d = decodifica(t);
    if (typeof figli[figli.length - 1] === "string") figli[figli.length - 1] += d;
    else figli.push(d);
  };

  // Chiude fino al tag `nome` compreso (se è aperto prima di un confine)
  const chiudiFino = (nome, confini = null) => {
    for (let i = pila.length - 1; i > 0; i--) {
      if (pila[i].tag === nome) {
        pila.length = i;
        return true;
      }
      if (confini && confini.has(pila[i].tag)) return false;
    }
    return false;
  };

  let m;
  while ((m = RE_TAG.exec(html))) {
    testo(html.slice(pos, m.index));
    pos = RE_TAG.lastIndex;
    if (!m[2]) continue; // commento
    const nome = m[2].toLowerCase();
    if (m[1]) {
      // Tag di chiusura
      if (nome === "p" && !pila.some((n) => n.tag === "p")) continue;
      chiudiFino(nome);
      continue;
    }
    if (SALTATI.has(nome)) {
      // Salta fino alla chiusura
      const fine = html.toLowerCase().indexOf(`</${nome}`, pos);
      pos = fine < 0 ? html.length : html.indexOf(">", fine) + 1 || html.length;
      RE_TAG.lastIndex = pos;
      continue;
    }
    if (BLOCCHI.has(nome)) chiudiFino("p", CONFINI_P);
    const regola = CHIUDE[nome];
    if (regola) {
      // Il più esterno da chiudere prima del confine (un <tr> chiude la cella e la riga)
      let taglio = -1;
      for (let i = pila.length - 1; i > 0; i--) {
        if (regola.confini.includes(pila[i].tag)) break;
        if (regola.chiude.includes(pila[i].tag)) taglio = i;
      }
      if (taglio > 0) pila.length = taglio;
    }
    const el = { tag: nome, attr: attributi(m[3] || ""), figli: [] };
    cima().figli.push(el);
    if (!VUOTI.has(nome) && !m[4]) pila.push(el);
  }
  testo(html.slice(pos));
  return radice;
}

// --- Aiuti per chi legge l'albero ---

const classi = (n) => (typeof n === "object" && n.attr.class ? n.attr.class.split(/\s+/) : []);
const haClasse = (n, c) => classi(n).includes(c);

// Testo di un nodo, tutto attaccato
function testoDi(n) {
  if (typeof n === "string") return n;
  if (n.tag === "br") return "\n";
  return n.figli.map(testoDi).join("");
}

// Primo discendente (in profondità) che soddisfa la condizione
function trova(n, cond) {
  if (typeof n !== "object") return null;
  for (const f of n.figli) {
    if (typeof f !== "object") continue;
    if (cond(f)) return f;
    const dentro = trova(f, cond);
    if (dentro) return dentro;
  }
  return null;
}

function trovaTutti(n, cond, out = []) {
  if (typeof n !== "object") return out;
  for (const f of n.figli) {
    if (typeof f !== "object") continue;
    if (cond(f)) out.push(f);
    else trovaTutti(f, cond, out);
  }
  return out;
}

module.exports = { leggi, decodifica, classi, haClasse, testoDi, trova, trovaTutti };
