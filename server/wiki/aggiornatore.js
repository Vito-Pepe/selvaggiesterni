// Aggiornamento automatico della copia della wiki: una volta al giorno (e a richiesta) scarica
// le pagine, ricostruisce la copia, scarica le immagini nuove o cambiate, controlla che sia
// completa e, se va bene, la mette al posto di quella in uso. Le Novità (pagine nuove, tolte,
// modificate) restano in novita.json. Se qualcosa va storto si tiene la copia di prima: l'app
// funziona anche quando la wiki non risponde.
//
// Immagini: se Fandom (Cloudflare) blocca il Pi, quelle che mancano le carica il browser da Fandom
// e il Pi riprova da solo: dopo un'ora, poi a intervalli che raddoppiano fino a 12 ore. Ogni
// tentativo comincia con una richiesta sola: se è ancora bloccato si ferma lì.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zlib = require("node:zlib");
const { scaricaTutto } = require("./sorgenti");
const { costruisci, controlla, immaginiUsate, VERSIONE } = require("./copia");
const { prepara, applica, togliNonUsate, leggiRegistro, conta } = require("./immagini");
const { scarica: scaricaRete } = require("./rete");
const { confronta } = require("./differenze");
const { indicizza } = require("./cerca");

const ORE = 3600 * 1000;
const OGNI = 24 * ORE;
// Nuovi tentativi per le immagini bloccate: 1 ora, poi il doppio ogni volta, al massimo 12 ore
const PRIMA_ATTESA_IMMAGINI = ORE;
const MASSIMA_ATTESA_IMMAGINI = 12 * ORE;
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
    this.timerImmagini = null;
    this.prossimoImmagini = null;
    this.attesaImmagini = PRIMA_ATTESA_IMMAGINI;
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
      immagini: conta(leggiRegistro(this.cartellaImmagini)).sulPi,
      immaginiDaFandom: conta(leggiRegistro(this.cartellaImmagini)).daFandom,
      prossimoTentativoImmagini: this.prossimoImmagini,
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
      const { registro, avvisi, scaricate, bloccato, sulPi, daFandom } = await prepara(nomi, { cartella: this.cartellaImmagini, avanzamento, parziale, ...opz });
      nuova.avvisi = [...nuova.avvisi, ...avvisi];
      for (const a of avvisi) this.log(`wiki: ${a}`);

      const diff = confronta(precedente, nuova);
      scriviAtomico(this.file, JSON.stringify(nuova));
      if (primaVolta) this.aggiungiNovita({ data: inizio, prima: true, pagine: Object.keys(nuova.pagine).length, immagini: sulPi });
      else if (!diff.vuoto) {
        const { vuoto, ...voce } = diff;
        this.aggiungiNovita({ data: inizio, ...voce });
      }
      this.usa(nuova, registro);
      // Solo dopo che la copia nuova è in uso: le immagini che non usa più
      const tolte = togliNonUsate(this.cartellaImmagini, registro);
      Object.assign(stato, { ultimoSuccesso: new Date().toISOString(), esito: "ok", errore: null, avvisi: nuova.avvisi, cambiamenti: diff.totale, immaginiScaricate: scaricate, immaginiTolte: tolte, bloccoImmagini: bloccato });
      this.log(`wiki: fatto, ${Object.keys(nuova.pagine).length} pagine, ${diff.totale} cambiamenti, ${scaricate} immagini scaricate, ${tolte} tolte${daFandom ? `, ${daFandom} ancora da Fandom` : ""}`);
      this.dopoImmagini(daFandom, bloccato);
    } catch (e) {
      Object.assign(stato, { esito: "errore", errore: e.message });
      this.log(`wiki: aggiornamento non riuscito: ${e.message}`);
    }
    scriviAtomico(this.fileStato, JSON.stringify(stato));
    return { ...this.stato(), inCorso: false };
  }

  // Dopo un giro sulle immagini: se ne mancano, nuovo tentativo più tardi
  dopoImmagini(daFandom, bloccato) {
    if (!daFandom) {
      this.attesaImmagini = PRIMA_ATTESA_IMMAGINI;
      this.pianificaImmagini(null);
      return;
    }
    this.pianificaImmagini(this.attesaImmagini);
    if (bloccato) this.attesaImmagini = Math.min(this.attesaImmagini * 2, MASSIMA_ATTESA_IMMAGINI);
  }

  pianificaImmagini(attesa) {
    clearTimeout(this.timerImmagini);
    this.timerImmagini = null;
    this.prossimoImmagini = null;
    if (attesa == null) return;
    this.prossimoImmagini = new Date(Date.now() + attesa).toISOString();
    this.timerImmagini = setTimeout(() => this.aggiornaImmagini(), attesa);
    this.timerImmagini.unref?.();
  }

  // Solo le immagini che mancano sul Pi, senza riscaricare le pagine
  aggiornaImmagini(motivo = "nuovo tentativo") {
    if (!this.inCorso) {
      this.inCorso = this.eseguiImmagini(motivo).finally(() => {
        this.inCorso = null;
        this.fase = null;
      });
    }
    return this.inCorso;
  }

  async eseguiImmagini(motivo) {
    if (!this.grezza) return this.stato();
    const scarica = this.scarica || scaricaRete;
    const nomi = immaginiUsate(this.grezza);
    const prima = leggiRegistro(this.cartellaImmagini);
    const mancanti = nomi.filter((n) => !prima[n]?.file);
    if (!mancanti.length) {
      this.dopoImmagini(0, null);
      return this.stato();
    }
    const stato = leggiJson(this.fileStato, {});
    try {
      // Una richiesta sola, prima di tutto: se Fandom blocca ancora, ci si ferma qui
      const prova = mancanti.map((n) => prima[n]?.url).find(Boolean);
      if (prova) {
        try {
          await scarica(prova, { tipo: "byte", tentativi: 1, massimo: 10 * 1024 * 1024 });
        } catch (e) {
          if (e.sfida || e.stato === 403 || e.stato === 429) {
            this.log(`wiki: immagini ancora bloccate da Fandom (${e.message}), ${mancanti.length} restano da Fandom`);
            Object.assign(stato, { bloccoImmagini: e.message, ultimoTentativoImmagini: new Date().toISOString() });
            scriviAtomico(this.fileStato, JSON.stringify(stato));
            this.dopoImmagini(mancanti.length, e.message);
            return this.stato();
          }
        }
      }
      this.fase = `immagini: ${mancanti.length} da scaricare (${motivo})`;
      this.log(`wiki: ${this.fase}`);
      const r = await prepara(nomi, { cartella: this.cartellaImmagini, scarica, avanzamento: (m) => this.log(`wiki: ${m}`) });
      for (const a of r.avvisi) this.log(`wiki: ${a}`);
      this.usa(this.grezza, r.registro);
      togliNonUsate(this.cartellaImmagini, r.registro);
      Object.assign(stato, { bloccoImmagini: r.bloccato, ultimoTentativoImmagini: new Date().toISOString() });
      this.log(`wiki: immagini, ${r.scaricate} scaricate${r.daFandom ? `, ${r.daFandom} ancora da Fandom` : ", tutte sul Pi"}`);
      this.dopoImmagini(r.daFandom, r.bloccato);
    } catch (e) {
      this.log(`wiki: immagini non aggiornate: ${e.message}`);
      this.dopoImmagini(mancanti.length, e.message);
    }
    scriviAtomico(this.fileStato, JSON.stringify(stato));
    return this.stato();
  }

  // Senza copia si parte subito; poi ogni 24 ore dall'ultimo tentativo (almeno 2 minuti dopo
  // l'avvio, per non scaricare tutto a ogni riavvio del container). Se mancano immagini, il
  // primo tentativo per loro dopo qualche minuto.
  pianifica() {
    if (this.grezza) {
      const registro = leggiRegistro(this.cartellaImmagini);
      if (immaginiUsate(this.grezza).some((n) => !registro[n]?.file)) this.pianificaImmagini(3 * 60 * 1000);
    }
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
    clearTimeout(this.timerImmagini);
  }
}

module.exports = { Aggiornatore };
