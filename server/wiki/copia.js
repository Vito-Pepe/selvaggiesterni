// Dal materiale scaricato alla copia della wiki che l'app mostra: pagine in blocchi, categorie,
// sezioni della pagina principale, rimandi. Qui si decide anche cosa non copiare (pagine vuote
// o vandalizzate) e si difende la copia dalle pagine svuotate all'improvviso.
const B = require("./blocchi");
const H = require("./html");
const N = require("./nomi");

const VERSIONE = 1;

// Pagine da non copiare mai, con il motivo. Le pagine vandalizzate di solito si riconoscono da
// sole (sono senza categorie e quasi vuote): qui quelle da scartare comunque.
const ESCLUSE = {
  "Brenton Tarrant": "vandalismo: non è una pagina sul gioco",
};
// Categorie che dicono che la pagina sta per essere cancellata dalla wiki
const DA_CANCELLARE = new Set(["Category:Candidates for deletion", "Category:Candidates for speedy deletion"]);
// Sotto questa lunghezza (wikitesto), una pagina senza categorie non è un articolo
const MINIMO_SENZA_CATEGORIE = 1000;

// Difesa dai vandalismi che svuotano una pagina: se il testo scende sotto il 30% di prima (e
// prima era una pagina vera), si tiene la versione di prima per al massimo 7 giorni
const MINIMO_TRATTENUTA = 1500;
const QUOTA_TRATTENUTA = 0.3;
const GIORNI_TRATTENUTA = 7;

// Titoli delle sezioni della pagina principale
const SEZIONI_HOME = {
  "astronomical objects": "Corpi celesti",
  travelers: "Viaggiatori",
  basics: "Per cominciare",
  about: "Il gioco",
};

function motivoScarto(p) {
  if (Object.hasOwn(ESCLUSE, p.titolo)) return ESCLUSE[p.titolo];
  if (p.categorie.some((c) => DA_CANCELLARE.has(c))) return "sulla wiki sta per essere cancellata";
  if (!p.categorie.length && (p.lunghezza ?? 0) < MINIMO_SENZA_CATEGORIE) return p.lunghezza ? "senza categorie e quasi vuota" : "vuota";
  return null;
}

// Rimandi risolti fino in fondo (al massimo 5 salti)
function arrivo(titolo, rimandi) {
  let t = titolo;
  let frammento = null;
  for (let i = 0; i < 5 && Object.hasOwn(rimandi, t); i++) {
    frammento = frammento || rimandi[t].frammento || null;
    t = rimandi[t].a;
  }
  return { titolo: t, frammento };
}

const lunghezzaTesto = (pagina) => B.testoBlocchi(pagina.blocchi).join(" ").length;

// Sezioni della pagina principale (Corpi celesti, Viaggiatori, Per cominciare): titolo e
// collegamenti alle pagine o categorie copiate, con l'icona se c'è
function home(html, ctx) {
  if (!html) return [];
  const albero = H.leggi(html);
  const sezioni = [];
  for (const box of H.trovaTutti(albero, (n) => H.haClasse(n, "rfpbox"))) {
    const testa = H.trova(box, (n) => H.haClasse(n, "heading"));
    const nome = testa ? H.testoDi(testa).replace(/\s+/g, " ").trim() : "";
    const voci = new Map();
    for (const a of H.trovaTutti(box, (n) => n.tag === "a")) {
      const dest = B.destinazione(a.attr.href, ctx);
      if (!dest || !(dest.p || dest.c)) continue;
      const chiave = dest.p ? `p:${dest.p}` : `c:${dest.c}`;
      const v = voci.get(chiave) || { ...(dest.p ? { p: dest.p } : { c: dest.c }) };
      const img = H.trova(a, (n) => n.tag === "img");
      if (img && !v.f) {
        const nomeImg = img.attr["data-image-name"];
        if (nomeImg && ctx.immagine(N.titolo(nomeImg))) v.f = N.titolo(nomeImg);
      }
      const testo = H.testoDi(a).replace(/\s+/g, " ").trim();
      if (testo && !v.t) v.t = testo;
      voci.set(chiave, v);
    }
    const elenco = [...voci.values()].filter((v) => v.t || v.f);
    if (nome && elenco.length) sezioni.push({ nome, it: SEZIONI_HOME[nome.toLowerCase()] || nome, voci: elenco });
  }
  return sezioni;
}

// materiale: da scaricaTutto (sorgenti.js). precedente: la copia in uso, per le trattenute.
// Torna la copia senza immagini scaricate: i nomi delle immagini sono quelli della wiki
// (immagini.js li sostituisce con i file sul Pi).
function costruisci(materiale, { precedente = null, adesso = new Date() } = {}) {
  const { sito, pagine: grezze, rimandi = {}, genitori = {} } = materiale;
  const avvisi = [...(materiale.errori || []).map((e) => `pagina non letta: ${e}`)];
  const principale = grezze.find((p) => p.titolo === sito.principale);
  const elencoPerTitolo = new Map((materiale.elenco || []).map((p) => [p.titolo, p]));

  // Quali pagine copiare
  const scartate = [];
  const tenute = [];
  for (const g of grezze) {
    if (g === principale) continue;
    const info = { ...elencoPerTitolo.get(g.titolo), ...g };
    const motivo = motivoScarto(info);
    if (motivo) scartate.push({ titolo: g.titolo, motivo });
    else tenute.push(info);
  }

  // Identificativi dai titoli: restano gli stessi da un aggiornamento all'altro
  const idPagine = N.assegnaId(tenute.map((p) => p.titolo));

  // Categorie: quelle che hanno almeno una pagina copiata
  const nomiCategorie = new Set(tenute.flatMap((p) => p.categorie));
  const idCategorie = N.assegnaId([...nomiCategorie].map((c) => c.replace(/^Category:/, "")));
  const catId = (nome) => idCategorie.get(String(nome).replace(/^Category:/, "")) || null;

  const ctxBase = {
    wiki: sito.url,
    immagine: () => true,
    link(titolo, frammento) {
      if (/^Category:/i.test(titolo)) {
        const c = catId(N.titolo(titolo.replace(/^Category:/i, "")));
        return c ? { c } : null;
      }
      const dest = arrivo(titolo, rimandi);
      const id = idPagine.get(dest.titolo);
      if (!id) return null;
      const a = frammento || dest.frammento;
      if (id === this.id) return a ? { a } : null;
      return a ? { p: id, a } : { p: id };
    },
  };

  const pagine = {};
  const trattenute = [];
  for (const g of tenute) {
    const id = idPagine.get(g.titolo);
    const ctx = { ...ctxBase, id, titolo: g.titolo };
    ctx.link = ctxBase.link.bind(ctx);
    const { blocchi, schede, spoiler } = B.converti(g.html || "", ctx);
    const p = {
      id,
      titolo: g.titolo,
      url: `${sito.url}${(sito.percorso || "/wiki/$1").replace("$1", encodeURIComponent(g.titolo.replace(/ /g, "_")).replace(/%2F/g, "/").replace(/%3A/g, ":"))}`,
      rev: g.rev ?? null,
      toccata: g.toccata || null,
      categorie: [...new Set(g.categorie.map(catId).filter(Boolean))],
      spoiler: spoiler || undefined,
      schede,
      blocchi,
      riassunto: B.riassunto(blocchi),
    };
    if (g.commento) p.commento = g.commento.slice(0, 300);
    pagine[id] = p;
  }

  // Pagine svuotate di colpo o sparite perché diventate quasi vuote: si tiene quella di prima
  for (const vecchia of Object.values(precedente?.pagine || {})) {
    const nuova = Object.values(pagine).find((p) => p.titolo === vecchia.titolo);
    const scartata = scartate.find((s) => s.titolo === vecchia.titolo);
    const svuotata = scartata && /quasi vuota|^vuota$/.test(scartata.motivo);
    const ridotta = nuova && lunghezzaTesto(vecchia) >= MINIMO_TRATTENUTA && lunghezzaTesto(nuova) < QUOTA_TRATTENUTA * lunghezzaTesto(vecchia);
    if (!svuotata && !ridotta) continue;
    const rev = nuova?.rev ?? grezze.find((g) => g.titolo === vecchia.titolo)?.rev ?? null;
    const prima = precedente.trattenute?.find((t) => t.titolo === vecchia.titolo && t.rev === rev);
    const dal = prima?.dal || adesso.toISOString();
    if (Date.parse(dal) + GIORNI_TRATTENUTA * 86400000 <= adesso.getTime()) continue; // dopo 7 giorni vale la wiki
    const id = nuova?.id || vecchia.id;
    if (!nuova && pagine[id]) continue; // il suo identificativo ora è di un'altra pagina
    pagine[id] = { ...vecchia, id };
    if (svuotata) scartate.splice(scartate.indexOf(scartata), 1);
    trattenute.push({ id, titolo: vecchia.titolo, rev, dal, motivo: svuotata ? "svuotata sulla wiki" : "molto più corta di prima sulla wiki" });
  }

  // Categorie con le loro pagine, quelle sopra e quelle sotto
  const categorie = [];
  for (const [nome, id] of idCategorie) {
    const dentro = Object.values(pagine)
      .filter((p) => p.categorie.includes(id))
      .sort((a, b) => a.titolo.localeCompare(b.titolo, "en"))
      .map((p) => p.id);
    const sopra = (genitori[`Category:${nome}`] || []).map(catId).filter((c) => c && c !== id);
    categorie.push({ id, nome, it: N.categoria(nome), pagine: dentro, sopra: [...new Set(sopra)] });
  }
  for (const c of categorie) c.sotto = categorie.filter((x) => x.sopra.includes(c.id)).map((x) => x.id);
  categorie.sort((a, b) => a.it.localeCompare(b.it, "it"));

  // Altri nomi delle pagine (i rimandi che arrivano lì), per la ricerca
  for (const da of Object.keys(rimandi)) {
    const dest = arrivo(da, rimandi);
    const id = idPagine.get(dest.titolo);
    if (id && pagine[id]) (pagine[id].altri ||= []).push(da);
  }

  const ctxHome = { ...ctxBase, id: null, titolo: sito.principale };
  ctxHome.link = ctxBase.link.bind(ctxHome);

  return {
    versione: VERSIONE,
    generato: adesso.toISOString(),
    fonte: { sito: sito.nome, url: sito.url, principale: principale ? `${sito.url}/wiki/${encodeURIComponent(sito.principale.replace(/ /g, "_"))}` : sito.url, licenza: sito.licenza, licenzaUrl: sito.licenzaUrl },
    home: home(principale?.html, ctxHome),
    categorie,
    pagine,
    scartate: scartate.sort((a, b) => a.titolo.localeCompare(b.titolo, "en")),
    trattenute,
    avvisi,
  };
}

// Controlli prima di mettere in uso una copia nuova: se la wiki risponde a metà (o qualcuno la
// svuota) si tiene quella di prima
function controlla(nuova, vecchia, { minimo = 50 } = {}) {
  const problemi = [];
  const n = Object.keys(nuova.pagine).length;
  if (n < minimo) problemi.push(`solo ${n} pagine`);
  const prima = vecchia ? Object.keys(vecchia.pagine || {}).length : 0;
  if (prima && n < prima * 0.7) problemi.push(`${n} pagine invece di ${prima}`);
  return problemi;
}

// Nomi delle immagini usate (pagine, schede, pagina principale)
function immaginiUsate(copia) {
  const nomi = new Set();
  const aggiungi = (x) => x.f && nomi.add(x.f);
  for (const p of Object.values(copia.pagine)) {
    B.perImmagini(p.blocchi, aggiungi);
    for (const s of p.schede || []) {
      s.immagini.forEach(aggiungi);
      B.perImmagini([{ s: s.titolo }, ...s.righe.map((r) => ({ s: r.s || r.g }))], aggiungi);
    }
  }
  for (const sez of copia.home || []) sez.voci.forEach(aggiungi);
  return [...nomi];
}

module.exports = { costruisci, controlla, immaginiUsate, motivoScarto, VERSIONE, ESCLUSE };
