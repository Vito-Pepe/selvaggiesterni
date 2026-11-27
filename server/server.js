// Server di Selvaggi Esterni: la copia sul Pi della wiki di Outer Wilds. Pagine dell'app, indice
// e pagine della wiki (aggiornate ogni giorno), ricerca, immagini scaricate.
// Nessuna dipendenza esterna.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Aggiornatore } = require("./wiki/aggiornatore");
const { cerca } = require("./wiki/cerca");
const { RE_FILE } = require("./wiki/immagini");

const PORTA = Number(process.env.PORT) || 3000;
const CARTELLA_DATI = process.env.DATA_DIR || "/data";
const CARTELLA_APP = path.resolve(process.env.APP_DIR || path.join(__dirname, "..", "app"));
// Un aggiornamento a mano al massimo ogni 10 minuti
const PAUSA_AGGIORNAMENTO = 10 * 60 * 1000;

const TIPI = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

const INTESTAZIONI = {
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
// Le immagini SVG vengono dalla wiki: se aperte da sole non possono eseguire niente
const INTESTAZIONI_SVG = { ...INTESTAZIONI, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };

fs.mkdirSync(CARTELLA_DATI, { recursive: true });
const wiki = new Aggiornatore({ cartellaDati: CARTELLA_DATI });
if (process.env.AGGIORNA_WIKI !== "0") wiki.pianifica();

function rispondi(res, stato, corpo, extra = {}) {
  const testo = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  res.writeHead(stato, { ...INTESTAZIONI, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra });
  res.end(testo);
}

function errore(res, stato, messaggio) {
  rispondi(res, stato, { errore: messaggio });
}

// Una risposta preparata dall'aggiornatore (testo, gzip, etag)
function inviaPronta(req, res, pronta) {
  const intestazioni = { ...INTESTAZIONI, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", ETag: pronta.etag, Vary: "Accept-Encoding" };
  if (req.headers["if-none-match"] === pronta.etag) {
    res.writeHead(304, intestazioni);
    return res.end();
  }
  if (pronta.gzip && /\bgzip\b/.test(req.headers["accept-encoding"] || "")) {
    res.writeHead(200, { ...intestazioni, "Content-Encoding": "gzip", "Content-Length": pronta.gzip.length });
    return res.end(req.method === "HEAD" ? undefined : pronta.gzip);
  }
  res.writeHead(200, { ...intestazioni, "Content-Length": Buffer.byteLength(pronta.testo) });
  res.end(req.method === "HEAD" ? undefined : pronta.testo);
}

function leggiCorpo(req, limite = 4096) {
  return new Promise((ok, ko) => {
    let dimensione = 0;
    const pezzi = [];
    req.on("data", (p) => {
      dimensione += p.length;
      if (dimensione > limite) {
        ko(Object.assign(new Error("Dati troppo grandi"), { stato: 413 }));
        req.destroy();
        return;
      }
      pezzi.push(p);
    });
    req.on("end", () => {
      try {
        ok(JSON.parse(Buffer.concat(pezzi).toString("utf8") || "null"));
      } catch {
        ko(Object.assign(new Error("JSON non valido"), { stato: 400 }));
      }
    });
    req.on("error", ko);
  });
}

async function api(req, res, url) {
  const parti = url.pathname.split("/").filter(Boolean).slice(1);
  const metodo = req.method;

  // L'unica scrittura (aggiornamento a mano) arriva solo dalla pagina stessa: JSON, niente
  // richieste da altri siti
  if (metodo !== "GET" && metodo !== "HEAD") {
    if (!String(req.headers["content-type"] || "").startsWith("application/json")) return errore(res, 415, "Serve Content-Type: application/json");
    if (req.headers["sec-fetch-site"] === "cross-site") return errore(res, 403, "Richiesta da un altro sito");
  }
  const lettura = metodo === "GET" || metodo === "HEAD";

  if (lettura && parti[0] === "salute" && parti.length === 1) return rispondi(res, 200, { ok: true });
  if (lettura && parti[0] === "indice" && parti.length === 1) return inviaPronta(req, res, wiki.indice);
  if (lettura && parti[0] === "pagina" && parti.length === 2) {
    if (!/^[a-z0-9-]{1,80}$/.test(parti[1])) return errore(res, 400, "Identificativo non valido");
    const p = wiki.pagina(parti[1]);
    if (!p) return errore(res, 404, wiki.copia ? "Pagina non trovata" : "La copia della wiki non è ancora pronta");
    return inviaPronta(req, res, p);
  }
  if (lettura && parti[0] === "cerca" && parti.length === 1) {
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    return rispondi(res, 200, cerca(wiki.ricerca, q));
  }
  if (lettura && parti[0] === "novita" && parti.length === 1) return rispondi(res, 200, wiki.novita());

  if (parti[0] === "aggiornamento" && parti.length === 1) {
    if (lettura) return rispondi(res, 200, wiki.stato());
    if (metodo === "POST") {
      await leggiCorpo(req);
      const s = wiki.stato();
      const ultimo = Date.parse(s.ultimoTentativo || 0) || 0;
      if (!s.inCorso && Date.now() - ultimo < PAUSA_AGGIORNAMENTO) return errore(res, 429, "Aggiornamento appena fatto: riprova tra qualche minuto");
      wiki.aggiorna("a mano");
      return rispondi(res, 202, wiki.stato());
    }
  }

  return errore(res, 404, "Non trovato");
}

// --- File dell'app e immagini ---

function inviaFile(req, res, file, intestazioniBase, cache) {
  fs.stat(file, (err, info) => {
    if (err || !info.isFile()) {
      res.writeHead(404, { ...INTESTAZIONI, "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Non trovato");
    }
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const intestazioni = { ...intestazioniBase, "Content-Type": TIPI[path.extname(file)] || "application/octet-stream", "Cache-Control": cache, ETag: etag };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, intestazioni);
      return res.end();
    }
    res.writeHead(200, { ...intestazioni, "Content-Length": info.size });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// Il nome del file contiene lo sha1 dell'immagine: se cambia, cambia il nome. Si può tenere a lungo.
function immagine(req, res, nome) {
  if (!RE_FILE.test(nome)) return errore(res, 404, "Immagine non trovata");
  inviaFile(req, res, path.join(wiki.cartellaImmagini, nome), nome.endsWith(".svg") ? INTESTAZIONI_SVG : INTESTAZIONI, "public, max-age=2592000, immutable");
}

function statico(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return errore(res, 405, "Metodo non permesso");
  let percorso;
  try {
    percorso = decodeURIComponent(url.pathname);
  } catch {
    return errore(res, 400, "Indirizzo non valido");
  }
  if (percorso.startsWith("/immagini/")) return immagine(req, res, percorso.slice("/immagini/".length));
  if (percorso === "/" || !path.extname(percorso)) percorso = "/index.html";
  const file = path.resolve(CARTELLA_APP, `.${percorso}`);
  if (!file.startsWith(CARTELLA_APP + path.sep)) return errore(res, 404, "Non trovato");
  // Sempre la versione più recente dopo un aggiornamento dal Pi (il browser chiede se è cambiata)
  inviaFile(req, res, file, INTESTAZIONI, "no-cache");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    api(req, res, url).catch((e) => {
      if (e.stato === 413) res.setHeader("Connection", "close");
      if (!res.headersSent) errore(res, e.stato || 500, e.stato ? e.message : "Errore del server");
      if (!e.stato) console.error(e);
    });
  } else {
    statico(req, res, url);
  }
});

if (require.main === module) {
  server.listen(PORTA, () => console.log(`Selvaggi Esterni in ascolto sulla porta ${PORTA}, dati in ${CARTELLA_DATI}`));
}

// Allo spegnimento del container si esce subito: i file si scrivono interi o per niente
// (file temporaneo e poi rinomina), quindi un aggiornamento interrotto lascia la copia di prima
function chiudi() {
  wiki.ferma();
  server.close();
  process.exit(0);
}
process.on("SIGTERM", chiudi);
process.on("SIGINT", chiudi);

module.exports = { server, wiki };
