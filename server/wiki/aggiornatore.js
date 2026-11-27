// Aggiornamento automatico della copia della wiki: una volta al giorno (e a richiesta) scarica
// le pagine, ricostruisce la copia, scarica le immagini nuove o cambiate, controlla che sia
// completa e, se va bene, la mette al posto di quella in uso. Le Novità (pagine nuove, tolte,
// modificate) restano in novita.json. Se qualcosa va storto si tiene la copia di prima: l'app
// funziona anche quando la wiki non risponde.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { scaricaTutto } = require("./sorgenti");
const { costruisci, controlla, immaginiUsate, VERSIONE } = require("./copia");
const { prepara, applica, togliNonUsate, leggiRegistro } = require("./immagini");
const { confronta } = require("./differenze");
const { indicizza } = require("./cerca");

const ORE = 3600 * 1000;
const OGNI = 24 * ORE;
const MAX_NOVITA = 60;

function scriviAtomico(file, testo) {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, testo);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function leggiJson(file, riserva) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return riserva;
  }
}

// Una risposta pronta: testo, versione compressa ed etag
function risposta(oggetto) {
  const testo = JSON.stringify(oggetto);
  return {
    testo,
    gzip: testo.length > 1024 ? zlib.gzipSync(testo) : null,
    etag: `"${crypto.createHash("sha1").update(testo).digest("hex").slice(0, 16)}"`,
  };
}

class Aggiornatore {
  // scarica e minimoPagine servono alle prove (una wiki finta con poche pagine)
  constructor({ cartellaDati, log = console.log, scarica, minimoPagine = 50 }) {
    this.cartella = path.join(cartellaDati, "copia");
    this.cartellaImmagini = path.join(this.cartella, "immagini");
    this.file = path.join(this.cartella, "wiki.json");
    this.fileStato = path.join(this.cartella, "stato.json");
    this.fileNovita = path.join(this.cartella, "novita.json");
    this.log = log;
    this.scarica = scarica;
    this.minimoPagine = minimoPagine;
    this.inCorso = null;
    this.timer = null;
    fs.mkdirSync(this.cartellaImmagini, { recursive: true });
    this.carica();
  }

  carica() {
    const c = leggiJson(this.file, null);
    const valida = c && c.versione === VERSIONE && c.pagine && Object.keys(c.pagine).length > 0;
    this.usa(valida ? c : null, leggiRegistro(this.cartellaImmagini));
  }

  // grezza: la copia come è salvata (immagini con i nomi della wiki)
  usa(grezza, registro) {
    this.grezza = grezza;
    if (!grezza) {
      this.copia = null;
      this.indice = risposta({ vuota: true, pagine: [], categorie: [], home: [] });
      this.ricerca = [];
      this.pagine = new Map();
      return;
    }
    const copia = applica(structuredClone(grezza), registro);
    this.copia = copia;
    const elenco = Object.values(copia.pagine)
      .sort((a, b) => a.titolo.localeCompare(b.titolo, "en"))
      .map((p) => {
        const v = { id: p.id, titolo: p.titolo, categorie: p.categorie };
        if (p.immagine) v.immagine = p.immagine;
        if (p.riassunto) v.riassunto = p.riassunto;
        if (p.toccata) v.toccata = p.toccata;
        return v;
      });
    this.indice = risposta({
      versione: copia.versione,
      generato: copia.generato,
      fonte: copia.fonte,
      home: copia.home,
      categorie: copia.categorie,
      pagine: elenco,
    });
    this.ricerca = indicizza(copia);
    // Le pagine pronte da mandare: si preparano la prima volta che qualcuno le chiede
    this.pagine = new Map();
  }

  pagina(id) {
    if (!this.copia || !Object.hasOwn(this.copia.pagine, id)) return null;
    if (!this.pagine.has(id)) {
      const { riassunto, commento, ...p } = this.copia.pagine[id];
      this.pagine.set(id, risposta(p));
    }
    return this.pagine.get(id);
  }

  aggiungiNovita(voce) {
    const elenco = this.novita();
    elenco.unshift(voce);
    scriviAtomico(this.fileNovita, JSON.stringify(elenco.slice(0, MAX_NOVITA)));
  }

  novita() {
    return leggiJson(this.fileNovita, []);
  }

  stato() {
    const s = leggiJson(this.fileStato, {});
    return {
      ...s,
      inCorso: Boolean(this.inCorso),
      fase: this.fase || null,
      generato: this.copia?.generato || null,
      pagine: this.copia ? Object.keys(this.copia.pagine).length : 0,
      immagini: Object.keys(leggiRegistro(this.cartellaImmagini)).length,
      scartate: this.copia?.scartate || [],
      trattenute: this.copia?.trattenute || [],
      avvisiCopia: this.copia?.avvisi || [],
    };
  }

  // Un aggiornamento alla volta: chi chiede mentre ne gira uno aspetta lo stesso
  aggiorna(motivo = "pianificato") {
    if (!this.inCorso) {
      this.inCorso = this.esegui(motivo).finally(() => {
        this.inCorso = null;
        this.fase = null;
      });
    }
    return this.inCorso;
  }

  async esegui(motivo) {
    const inizio = new Date().toISOString();
    const stato = { ...leggiJson(this.fileStato, {}), ultimoTentativo: inizio, motivo };
    scriviAtomico(this.fileStato, JSON.stringify(stato));
    const avanzamento = (m) => {
      this.fase = m;
      this.log(`wiki: ${m}`);
    };
    const opz = this.scarica ? { scarica: this.scarica } : {};
    try {
      avanzamento(`aggiornamento dalla wiki (${motivo})`);
      const precedente = this.grezza;
      const materiale = await scaricaTutto({ avanzamento, ...opz });
      const nuova = costruisci(materiale, { precedente });
      const problemi = controlla(nuova, precedente, { minimo: this.minimoPagine });
      if (problemi.length) throw new Error(`dati della wiki incompleti: ${problemi.join("; ")}`);

      const nomi = immaginiUsate(nuova);
      avanzamento(`${Object.keys(nuova.pagine).length} pagine pronte, controllo ${nomi.length} immagini`);
      // La prima volta le immagini sono tante (e Fandom le prepara al momento): intanto si
      // leggono i testi, con le immagini che ci sono già
      const primaVolta = !precedente;
      if (primaVolta) this.usa(nuova, leggiRegistro(this.cartellaImmagini));
      const parziale = primaVolta ? (r) => this.usa(nuova, r) : null;
      const { registro, avvisi, scaricate } = await prepara(nomi, { cartella: this.cartellaImmagini, avanzamento, parziale, ...opz });
      nuova.avvisi = [...nuova.avvisi, ...avvisi];

      const diff = confronta(precedente, nuova);
      scriviAtomico(this.file, JSON.stringify(nuova));
      if (primaVolta) this.aggiungiNovita({ data: inizio, prima: true, pagine: Object.keys(nuova.pagine).length, immagini: Object.keys(registro).length });
      else if (!diff.vuoto) {
        const { vuoto, ...voce } = diff;
        this.aggiungiNovita({ data: inizio, ...voce });
      }
      this.usa(nuova, registro);
      // Solo dopo che la copia nuova è in uso: le immagini che non usa più
      const tolte = togliNonUsate(this.cartellaImmagini, registro);
      Object.assign(stato, { ultimoSuccesso: new Date().toISOString(), esito: "ok", errore: null, avvisi: nuova.avvisi, cambiamenti: diff.totale, immaginiScaricate: scaricate, immaginiTolte: tolte });
      this.log(`wiki: fatto, ${Object.keys(nuova.pagine).length} pagine, ${diff.totale} cambiamenti, ${scaricate} immagini scaricate, ${tolte} tolte`);
    } catch (e) {
      Object.assign(stato, { esito: "errore", errore: e.message });
      this.log(`wiki: aggiornamento non riuscito: ${e.message}`);
    }
    scriviAtomico(this.fileStato, JSON.stringify(stato));
    return { ...this.stato(), inCorso: false };
  }

  // Senza copia si parte subito; poi ogni 24 ore dall'ultimo tentativo (almeno 2 minuti dopo
  // l'avvio, per non scaricare tutto a ogni riavvio del container)
  pianifica() {
    const s = leggiJson(this.fileStato, {});
    const ultimo = Date.parse(s.ultimoTentativo || 0) || 0;
    const attesa = this.copia ? Math.max(2 * 60 * 1000, ultimo + OGNI - Date.now()) : 5000;
    this.timer = setTimeout(() => {
      this.aggiorna();
      this.timer = setInterval(() => this.aggiorna(), OGNI);
      this.timer.unref();
    }, attesa);
    this.timer.unref();
  }

  ferma() {
    clearTimeout(this.timer);
    clearInterval(this.timer);
  }
}

module.exports = { Aggiornatore };
