// Scarica dalla wiki di Outer Wilds (outerwilds.fandom.com, testi CC BY-SA 3.0) tutto quello che
// serve alla copia: informazioni sul sito, elenco delle pagine con l'ultima modifica, rimandi
// (redirect), categorie delle categorie e ogni pagina già impaginata dal parser della wiki.
const { scarica: scaricaRete } = require("./rete");

const WIKI = process.env.WIKI_URL || "https://outerwilds.fandom.com";

function api(parametri, scarica = scaricaRete, wiki = WIKI) {
  const q = new URLSearchParams({ format: "json", formatversion: "2", ...parametri });
  return scarica(`${wiki}/api.php?${q}`);
}

// Una richiesta query con tutte le continuazioni: le pagine con lo stesso pageid si uniscono
async function query(parametri, { scarica = scaricaRete, wiki = WIKI } = {}) {
  const pagine = new Map();
  const rimandi = [];
  let seguito = {};
  for (let giro = 0; giro < 50; giro++) {
    const r = await api({ action: "query", ...parametri, ...seguito }, scarica, wiki);
    if (r.error) throw new Error(`la wiki ha risposto: ${r.error.info || r.error.code}`);
    for (const p of r.query?.pages || []) {
      const prima = pagine.get(p.pageid ?? p.title);
      if (!prima) pagine.set(p.pageid ?? p.title, p);
      else {
        for (const [k, v] of Object.entries(p)) {
          if (Array.isArray(v) && Array.isArray(prima[k])) prima[k].push(...v);
          else if (prima[k] === undefined) prima[k] = v;
        }
      }
    }
    rimandi.push(...(r.query?.redirects || []));
    if (!r.continue) break;
    seguito = r.continue;
  }
  return { pagine: [...pagine.values()], rimandi };
}

async function sito(opz) {
  const r = await api({ action: "query", meta: "siteinfo", siprop: "general|rightsinfo|statistics" }, opz.scarica, opz.wiki);
  const g = r.query?.general || {};
  return {
    nome: g.sitename || "Outer Wilds Wiki",
    principale: g.mainpage || "Outer Wilds Wiki",
    url: g.server || WIKI,
    percorso: g.articlepath || "/wiki/$1",
    licenza: r.query?.rightsinfo?.text || "CC BY-SA 3.0",
    licenzaUrl: r.query?.rightsinfo?.url || "https://www.fandom.com/licensing",
    articoli: r.query?.statistics?.articles ?? null,
  };
}

// Pagine dei contenuti (non i rimandi), con lunghezza e ultima modifica
async function elencoPagine(opz) {
  const { pagine } = await query(
    { generator: "allpages", gapnamespace: "0", gapfilterredir: "nonredirects", gaplimit: "500", prop: "info|revisions", rvprop: "ids|timestamp|comment" },
    opz,
  );
  return pagine
    .filter((p) => !p.missing && !p.invalid)
    .map((p) => ({
      pageid: p.pageid,
      titolo: p.title,
      lunghezza: p.length ?? 0,
      rev: p.lastrevid ?? p.revisions?.[0]?.revid ?? null,
      toccata: p.revisions?.[0]?.timestamp || p.touched || null,
      commento: p.revisions?.[0]?.comment || "",
    }));
}

// Rimandi: titolo → { a: titolo di arrivo, frammento }. Si chiedono alle pagine di arrivo
// (prop=redirects): ognuna dice quali titoli rimandano a lei
async function elencoRimandi(opz) {
  const { pagine } = await query({ generator: "allpages", gapnamespace: "0", gapfilterredir: "nonredirects", gaplimit: "500", prop: "redirects", rdprop: "title|fragment", rdlimit: "max" }, opz);
  const out = {};
  for (const p of pagine) {
    for (const r of p.redirects || []) out[r.title] = r.fragment ? { a: p.title, frammento: r.fragment } : { a: p.title };
  }
  return out;
}

// Categorie delle categorie (per sapere quali stanno dentro quali)
async function genitoriCategorie(opz) {
  const { pagine } = await query({ generator: "allpages", gapnamespace: "14", gaplimit: "500", prop: "categories", clshow: "!hidden", cllimit: "max" }, opz);
  const out = {};
  for (const p of pagine) out[p.title] = (p.categories || []).map((c) => c.title);
  return out;
}

async function pagina(pageid, opz) {
  const r = await api(
    { action: "parse", pageid: String(pageid), prop: "text|categories|revid|displaytitle", disableeditsection: "1", disabletoc: "1", disablelimitreport: "1" },
    opz.scarica,
    opz.wiki,
  );
  if (r.error) throw new Error(`pagina ${pageid}: ${r.error.info || r.error.code}`);
  const p = r.parse;
  return {
    pageid: p.pageid,
    titolo: p.title,
    rev: p.revid,
    html: p.text,
    categorie: (p.categories || []).filter((c) => c.hidden === undefined || c.hidden === false).map((c) => `Category:${c.category.replace(/_/g, " ")}`),
  };
}

// Tutto il materiale grezzo per costruire la copia
async function scaricaTutto({ avanzamento = () => {}, scarica = scaricaRete, wiki = WIKI } = {}) {
  const opz = { scarica, wiki };
  const info = await sito(opz);
  const elenco = await elencoPagine(opz);
  const rimandi = await elencoRimandi(opz);
  const genitori = await genitoriCategorie(opz);
  avanzamento(`${elenco.length} pagine sulla wiki, ${Object.keys(rimandi).length} rimandi`);
  const pagine = [];
  const errori = [];
  for (const [i, p] of elenco.entries()) {
    try {
      pagine.push({ ...p, ...(await pagina(p.pageid, opz)) });
    } catch (e) {
      errori.push(`${p.titolo}: ${e.message}`);
    }
    if ((i + 1) % 50 === 0) avanzamento(`lette ${i + 1} pagine su ${elenco.length}`);
  }
  return { sito: info, elenco, pagine, rimandi, genitori, errori };
}

// Informazioni sulle immagini: nome → { url, sha1, larghezza, altezza, mime } (50 alla volta).
// Con `larghezza` la wiki dà anche una copia ridotta (thumburl).
async function infoImmagini(nomi, { larghezza = 800, scarica = scaricaRete, wiki = WIKI } = {}) {
  const out = {};
  const elenco = [...new Set(nomi)];
  for (let i = 0; i < elenco.length; i += 50) {
    const gruppo = elenco.slice(i, i + 50);
    const r = await api({ action: "query", titles: gruppo.map((n) => `File:${n}`).join("|"), prop: "imageinfo", iiprop: "url|sha1|size|mime", iiurlwidth: String(larghezza) }, scarica, wiki);
    // La wiki può scrivere i titoli in un altro modo (normalized): si torna al nome chiesto
    const daNorm = new Map((r.query?.normalized || []).map((n) => [n.to, n.from]));
    for (const p of r.query?.pages || []) {
      const ii = p.imageinfo?.[0];
      if (!ii) continue;
      const titolo = daNorm.get(p.title) || p.title;
      const nome = titolo.replace(/^File:/, "");
      // Sempre la copia ridotta quando c'è: Fandom la manda in WebP (anche le GIF animate),
      // molto più leggera dell'originale, e non la ingrandisce se l'originale è più piccolo
      const w = ii.thumbwidth && ii.width ? Math.min(ii.thumbwidth, ii.width) : ii.thumbwidth || ii.width || 0;
      out[nome] = {
        url: ii.thumburl || ii.url,
        sha1: ii.sha1,
        larghezza: w,
        altezza: w && ii.width && ii.height ? Math.round((w * ii.height) / ii.width) : ii.thumbheight || ii.height || 0,
        mime: ii.mime,
      };
    }
  }
  return out;
}

module.exports = { scaricaTutto, infoImmagini, query, WIKI };
