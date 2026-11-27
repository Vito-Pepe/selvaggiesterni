// Immagini della wiki sul Pi: si scaricano ridotte (al massimo 800 px di larghezza; Fandom le
// manda in WebP: circa 65 MB in tutto) nella cartella del volume, con un registro
// (immagini.json) che tiene per ogni immagine della wiki il file e lo sha1 dell'originale: se lo
// sha1 non cambia non si riscarica. I blocchi della copia passano dai nomi della wiki ai file.
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

// Scarica quelle che mancano o sono cambiate. Torna { registro, avvisi, scaricate }.
// parziale(registro): chiamata ogni 25 immagini, per mostrarle mentre arrivano le altre
async function prepara(nomi, { cartella, scarica = scaricaRete, wiki, avanzamento = () => {}, parziale = null } = {}) {
  fs.mkdirSync(cartella, { recursive: true });
  const vecchio = leggiRegistro(cartella);
  const info = await infoImmagini(nomi, { scarica, ...(wiki ? { wiki } : {}) });
  const registro = {};
  const avvisi = [];
  let scaricate = 0;
  let errori = 0;
  const mancanti = nomi.filter((n) => !info[n]);
  for (const [i, nome] of nomi.entries()) {
    const ii = info[nome];
    const prima = vecchio[nome];
    const esiste = prima && RE_FILE.test(prima.file) && fs.existsSync(path.join(cartella, prima.file));
    if (!ii) {
      // Sparita dalla wiki (o la wiki non ha risposto per lei): si tiene quella che c'è
      if (esiste) registro[nome] = prima;
      continue;
    }
    if (esiste && prima.sha1 === ii.sha1) {
      registro[nome] = prima;
      continue;
    }
    try {
      const { dati } = await scarica(ii.url, { tipo: "byte", massimo: MASSIMO, accetta: ACCETTA });
      const tipo = tipoDa(dati);
      if (!tipo) throw new Error("formato sconosciuto");
      const file = nomeFile(nome, ii.sha1, tipo);
      scriviAtomico(path.join(cartella, file), dati);
      const voce = { file, sha1: ii.sha1 };
      if (ii.larghezza > 0 && ii.altezza > 0) Object.assign(voce, { w: ii.larghezza, h: ii.altezza });
      registro[nome] = voce;
      scaricate++;
    } catch (e) {
      errori++;
      if (esiste) registro[nome] = prima;
      if (errori <= 5) avvisi.push(`immagine ${nome} non scaricata: ${e.message}`);
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
  return { registro, avvisi, scaricate };
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

// Nella copia, dai nomi della wiki ai file sul Pi: le immagini senza file spariscono.
// Cambia la copia che riceve: il server la applica a una copia di quella salvata, che tiene i
// nomi della wiki (servono al prossimo aggiornamento, anche per le pagine trattenute).
function applica(copia, registro) {
  const file = (nome) => registro[nome]?.file || null;
  const pezzi = (s) =>
    (s || []).flatMap((x) => {
      if (!x || !x.f) return [x];
      const f = file(x.f);
      return f ? [{ ...x, f }] : x.alt ? [x.alt] : [];
    });
  const grande = (x) => {
    const r = registro[x.f];
    return r ? { ...x, f: r.file, ...(r.w ? { w: r.w, h: r.h } : {}) } : null;
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
    p.immagine = principale ? { f: principale.f, ...(principale.w ? { w: principale.w, h: principale.h } : {}) } : null;
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

module.exports = { prepara, applica, togliNonUsate, tipoDa, nomeFile, leggiRegistro, RE_FILE };
