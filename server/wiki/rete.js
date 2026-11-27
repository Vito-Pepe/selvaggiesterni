// Richieste verso la wiki di Outer Wilds (outerwilds.fandom.com) e verso il server delle sue
// immagini (static.wikia.nocookie.net). Una richiesta alla volta per sito, con una pausa tra
// l'una e l'altra: un aggiornamento al giorno non ha fretta. Nessuna dipendenza esterna.

// Presentazione mandata a ogni sito: chi scarica in automatico dice chi è e come contattarlo
const AGENTE = "selvaggiesterni/1.0 (copia privata e non commerciale della wiki; https://github.com/Vito-Pepe)";

// Pausa tra due richieste allo stesso sito. Per le immagini è più lunga: dal Pi passano da
// Cloudflare, che a una raffica di richieste (anche già pronte in cache) risponde chiedendo una
// verifica da browser
const PAUSA_MS = Number(process.env.WIKI_PAUSA_MS ?? 800);
const PAUSA_IMMAGINI_MS = Number(process.env.WIKI_PAUSA_IMMAGINI_MS ?? 2000);
// Attesa prima di riprovare dopo un errore (cresce a ogni tentativo)
const RIPROVA_MS = Number(process.env.WIKI_RIPROVA_MS ?? 3000);
const TIMEOUT_MS = 60000;

const aspetta = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Una fila per sito: mai due richieste insieme, almeno `pausa` ms tra una e l'altra
const file = new Map();
function inFila(sito, pausa, lavoro) {
  const f = file.get(sito) || { coda: Promise.resolve(), ultima: 0 };
  file.set(sito, f);
  const turno = f.coda.then(async () => {
    const attesa = f.ultima + pausa - Date.now();
    if (attesa > 0) await aspetta(attesa);
    try {
      return await lavoro();
    } finally {
      f.ultima = Date.now();
    }
  });
  f.coda = turno.catch(() => {});
  return turno;
}

// tipo: "json", "testo" o "byte" (per "byte" torna { dati, tipo } con il Content-Type).
// Riprova sugli errori di rete e sui 429/5xx.
async function scarica(url, { tipo = "json", tentativi = 3, massimo = 20 * 1024 * 1024, accetta } = {}) {
  const sito = new URL(url).host;
  const pausa = tipo === "byte" ? PAUSA_IMMAGINI_MS : PAUSA_MS;
  let errore;
  for (let i = 0; i < tentativi; i++) {
    try {
      return await inFila(sito, pausa, async () => {
        const r = await fetch(url, {
          headers: { "User-Agent": AGENTE, ...(accetta ? { Accept: accetta } : {}) },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: "follow",
        });
        if (!r.ok) {
          // "Just a moment...": Cloudflare vuole un browser. Non si aggira: chi chiama smette
          const sfida = r.headers.get("cf-mitigated") === "challenge" || (/cloudflare/i.test(r.headers.get("server") || "") && (r.status === 403 || r.status === 503));
          throw Object.assign(new Error(`${sito} ha risposto ${r.status}${sfida ? " (verifica da browser di Cloudflare)" : ""}`), { stato: r.status, sfida });
        }
        const dati = Buffer.from(await r.arrayBuffer());
        if (dati.length > massimo) throw Object.assign(new Error(`Risposta troppo grande da ${sito}`), { stato: 413 });
        if (tipo === "byte") return { dati, tipo: r.headers.get("content-type") || "" };
        const testo = dati.toString("utf8");
        return tipo === "json" ? JSON.parse(testo) : testo;
      });
    } catch (e) {
      errore = e;
      const definitivo = e.sfida || (e.stato && e.stato < 500 && e.stato !== 429);
      if (definitivo) break;
      if (i < tentativi - 1) await aspetta(RIPROVA_MS * (i + 1));
    }
  }
  throw errore;
}

module.exports = { scarica, AGENTE };
