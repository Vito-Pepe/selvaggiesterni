// Immagini della wiki sul Pi: si scaricano ridotte (al massimo 800 px di larghezza; Fandom le
// manda in WebP: circa 65 MB in tutto) nella cartella del volume, con un registro
// (immagini.json) che tiene per ogni immagine della wiki il file, lo sha1 dell'originale (se non
// cambia non si riscarica) e l'indirizzo della copia ridotta su Fandom.
//
// Se Fandom (Cloudflare) blocca il Pi, ci si ferma alla prima risposta 403 o 429, senza insistere
// sulle altre: quelle che mancano restano nel registro senza file, solo con l'indirizzo, e il
// browser le carica da Fandom finché il Pi non riesce a scaricarle (riprova l'aggiornatore).
// I blocchi della copia passano dai nomi della wiki ai file sul Pi ({ f }) o agli indirizzi
// di Fandom ({ u }).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { scarica: scaricaRete } = require("./rete");
const { infoImmagini } = require("./sorgenti");
const N = require("./nomi");

const REGISTRO = "immagini.json";
const MASSIMO = 10 * 1024 * 1024;
const ACCETTA = "image/webp,image/png,image/jpeg,image/gif;q=0.9,image/svg+xml;q=0.5";
const RE_FILE = /^[a-z0-9-]{1,100}\.(webp|png|jpg|gif|svg)$/;
// Le sole immagini esterne che il browser può caricare (anche nella Content-Security-Policy)
const ORIGINE_FANDOM = "https://static.wikia.nocookie.net";
const RE_URL_FANDOM = /^https:\/\/static\.wikia\.nocookie\.net\/[^\s"'<>\\]{1,500}$/;

// Tipo dal contenuto, non da quello che dice il server
function tipoDa(dati) {
  if (dati.length >= 8 && dati.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (dati.length >= 3 && dati[0] === 0xff && dati[1] === 0xd8 && dati[2] === 0xff) return "jpg";
  if (dati.length >= 6 && /^GIF8[79]a$/.test(dati.subarray(0, 6).toString("latin1"))) return "gif";
  if (dati.length >= 12 && dati.subarray(0, 4).toString("latin1") === "RIFF" && dati.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  const inizio = dati.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(inizio)) return "svg";
  return null;
}

function nomeFile(nome, sha1, tipo) {
  const base = N.slug(String(nome).replace(/\.[a-z0-9]{2,5}$/i, "")).slice(0, 80);
  const impronta = String(sha1 || crypto.createHash("sha1").update(nome).digest("hex")).slice(0, 10);
  return `${base}-${impronta}.${tipo}`;
}

function leggiRegistro(cartella) {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(cartella, REGISTRO), "utf8"));
    return r && typeof r === "object" ? r : {};
  } catch {
    return {};
  }
}

function scriviAtomico(file, dati) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, dati);
  fs.renameSync(tmp, file);
}

const haFile = (voce, cartella) => Boolean(voce?.file && RE_FILE.test(voce.file) && fs.existsSync(path.join(cartella, voce.file)));

// Quante immagini del registro sono sul Pi e quante si caricano da Fandom
function conta(registro) {
  const voci = Object.values(registro || {});
  const sulPi = voci.filter((v) => v.file).length;
  return { sulPi, daFandom: voci.filter((v) => !v.file && v.url).length };
}

// Scarica quelle che mancano o sono cambiate. Torna { registro, avvisi, scaricate, bloccato }:
// bloccato è il motivo, se Fandom ha smesso di dare immagini al Pi.
// parziale(registro): chiamata ogni 25 immagini, per mostrarle mentre arrivano le altre
async function prepara(nomi, { cartella, scarica = scaricaRete, wiki, avanzamento = () => {}, parziale = null } = {}) {
  fs.mkdirSync(cartella, { recursive: true });
  const vecchio = leggiRegistro(cartella);
  const info = await infoImmagini(nomi, { scarica, ...(wiki ? { wiki } : {}) });
  const registro = {};
  const avvisi = [];
  let scaricate = 0;
  let errori = 0;
  let bloccato = null;
  const mancanti = nomi.filter((n) => !info[n]);
  for (const [i, nome] of nomi.entries()) {
    const ii = info[nome];
    const prima = vecchio[nome];
    const esiste = haFile(prima, cartella);
    if (!ii) {
      // Sparita dalla wiki (o la wiki non ha risposto per lei): si tiene quella che c'è
      if (esiste || prima?.url) registro[nome] = esiste ? prima : { ...prima, file: undefined };
      continue;
    }
    const voce = { sha1: ii.sha1 };
    if (ii.larghezza > 0 && ii.altezza > 0) Object.assign(voce, { w: ii.larghezza, h: ii.altezza });
    if (RE_URL_FANDOM.test(ii.url)) voce.url = ii.url;
    if (esiste && (prima.sha1 === ii.sha1 || bloccato)) {
      // Uguale a prima; o cambiata, ma Fandom ora non dà immagini: intanto resta quella di prima
      registro[nome] = { ...voce, file: prima.file, ...(prima.w ? { w: prima.w, h: prima.h } : {}) };
      continue;
    }
    if (bloccato) {
      registro[nome] = voce;
      continue;
    }
    try {
      const { dati } = await scarica(ii.url, { tipo: "byte", massimo: MASSIMO, accetta: ACCETTA });
      const tipo = tipoDa(dati);
      if (!tipo) throw new Error("formato sconosciuto");
      const file = nomeFile(nome, ii.sha1, tipo);
      scriviAtomico(path.join(cartella, file), dati);
      registro[nome] = { ...voce, file };
      scaricate++;
    } catch (e) {
      registro[nome] = esiste ? { ...voce, file: prima.file } : voce;
      if (e.sfida || e.stato === 403 || e.stato === 429) {
        // Bloccati: niente altre richieste di immagini fino al prossimo tentativo
        bloccato = e.message;
        avvisi.push(`Fandom non dà più immagini al Pi (${e.message}): quelle che mancano le carica il browser da Fandom, il Pi riprova più tardi`);
      } else {
        errori++;
        if (errori <= 5) avvisi.push(`immagine ${nome} non scaricata: ${e.message}`);
      }
    }
    if ((i + 1) % 25 === 0) {
      if ((i + 1) % 100 === 0) avanzamento(`immagini: ${i + 1} su ${nomi.length}`);
      // Il lavoro fatto resta anche se il container si ferma a metà (con le voci di prima
      // ancora da controllare)
      scriviAtomico(path.join(cartella, REGISTRO), JSON.stringify({ ...vecchio, ...registro }));
      if (parziale) parziale({ ...registro });
    }
  }
  if (errori > 5) avvisi.push(`e altre ${errori - 5} immagini non scaricate`);
  if (mancanti.length) avvisi.push(`${mancanti.length} immagini usate nelle pagine non ci sono sulla wiki`);
  scriviAtomico(path.join(cartella, REGISTRO), JSON.stringify(registro));
  return { registro, avvisi, scaricate, bloccato, ...conta(registro) };
}

function primaImmagine(blocchi) {
  for (const b of blocchi || []) {
    if (b.t === "img") return b;
    if (b.t === "galleria" && b.voci[0]) return b.voci[0];
    if (b.t === "schede" || b.t === "citazione") {
      const x = primaImmagine(b.b || b.voci.flatMap((v) => v.b));
      if (x) return x;
    }
  }
  return null;
}

// Nella copia, dai nomi della wiki ai file sul Pi ({ f }) o, se il Pi non li ha, agli indirizzi
// di Fandom ({ u }); le immagini senza né l'uno né l'altro spariscono.
// Cambia la copia che riceve: il server la applica a una copia di quella salvata, che tiene i
// nomi della wiki (servono al prossimo aggiornamento, anche per le pagine trattenute).
function applica(copia, registro) {
  const sorgente = (nome) => {
    const r = registro[nome];
    if (r?.file) return { f: r.file };
    if (r?.url && RE_URL_FANDOM.test(r.url)) return { u: r.url };
    return null;
  };
  const pezzi = (s) =>
    (s || []).flatMap((x) => {
      if (!x || !x.f) return [x];
      const { f, ...resto } = x;
      const src = sorgente(f);
      return src ? [{ ...resto, ...src }] : x.alt ? [x.alt] : [];
    });
  const grande = (x) => {
    const { f, ...resto } = x;
    const src = sorgente(f);
    const r = registro[f];
    return src ? { ...resto, ...src, ...(r.w ? { w: r.w, h: r.h } : {}) } : null;
  };
  const blocchi = (elenco) =>
    (elenco || []).flatMap((b) => {
      let n = { ...b };
      if (n.t === "img") {
        n = grande(n);
        if (!n) return [];
      }
      if (n.s) n.s = pezzi(n.s);
      if (n.d) n.d = pezzi(n.d);
      if (Array.isArray(n.titolo)) n.titolo = pezzi(n.titolo);
      if (n.b) n.b = blocchi(n.b);
      if (n.voci) {
        n.voci = n.voci
          .map((v) => {
            let w = { ...v };
            if (w.f) {
              w = grande(w);
              if (!w) return null;
            }
            if (w.s) w.s = pezzi(w.s);
            if (w.d) w.d = pezzi(w.d);
            if (w.b) w.b = blocchi(w.b);
            return w;
          })
          .filter(Boolean);
        if (n.t === "galleria" && !n.voci.length) return [];
      }
      if (n.righe) {
        n.righe = n.righe.map((r) =>
          Array.isArray(r) ? r.map((c) => ({ ...c, ...(c.s ? { s: pezzi(c.s) } : {}), ...(c.b ? { b: blocchi(c.b) } : {}) })) : { ...r, ...(r.nome ? { nome: pezzi(r.nome) } : {}), ...(r.s ? { s: pezzi(r.s) } : {}) },
        );
      }
      return [n];
    });

  for (const p of Object.values(copia.pagine)) {
    p.blocchi = blocchi(p.blocchi);
    p.schede = (p.schede || []).map((s) => ({
      ...s,
      titolo: s.titolo ? pezzi(s.titolo) : s.titolo,
      immagini: s.immagini.map((im) => {
        const g = grande(im);
        return g && { ...g, ...(g.d ? { d: pezzi(g.d) } : {}) };
      }).filter(Boolean),
      righe: s.righe.map((r) => ({ ...r, ...(r.s ? { s: pezzi(r.s) } : {}), ...(r.g ? { g: pezzi(r.g) } : {}) })),
    }));
    // Immagine principale: la prima della scheda, se no la prima della pagina (non le icone)
    const principale = p.schede.flatMap((s) => s.immagini)[0] || primaImmagine(p.blocchi);
    p.immagine = principale ? { ...(principale.f ? { f: principale.f } : { u: principale.u }), ...(principale.w ? { w: principale.w, h: principale.h } : {}) } : null;
  }
  for (const sez of copia.home || []) {
    sez.voci = sez.voci.map((v) => {
      if (!v.f) return v;
      const g = grande(v);
      if (g) return g;
      const { f, ...resto } = v;
      return resto;
    });
  }
  return copia;
}

// File nella cartella che il registro non usa più (dopo che la copia nuova è in uso)
function togliNonUsate(cartella, registro) {
  const usati = new Set(Object.values(registro).map((r) => r.file));
  let tolte = 0;
  for (const f of fs.readdirSync(cartella)) {
    if (f === REGISTRO || !RE_FILE.test(f) || usati.has(f)) continue;
    try {
      fs.unlinkSync(path.join(cartella, f));
      tolte++;
    } catch {
      // resta lì: si riprova al prossimo aggiornamento
    }
  }
  return tolte;
}

module.exports = { prepara, applica, togliNonUsate, tipoDa, nomeFile, leggiRegistro, conta, RE_FILE, RE_URL_FANDOM, ORIGINE_FANDOM };
