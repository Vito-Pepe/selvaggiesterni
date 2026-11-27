// Scarica la wiki in una cartella, come fa il server una volta al giorno: per provare l'app
// fuori dal Pi.
//   node strumenti/scarica-wiki.js /percorso/dati
//   DATA_DIR=/percorso/dati node server/server.js
// Da una sessione cloud di Claude serve NODE_USE_ENV_PROXY=1 (e il certificato del proxy).
const path = require("node:path");
const { Aggiornatore } = require("../server/wiki/aggiornatore");

const cartella = path.resolve(process.argv[2] || "dati-prova");

(async () => {
  const a = new Aggiornatore({ cartellaDati: cartella });
  const s = await a.aggiorna("dalla riga di comando");
  console.log(JSON.stringify({ esito: s.esito, errore: s.errore, pagine: s.pagine, immagini: s.immagini, scartate: s.scartate, trattenute: s.trattenute, avvisi: s.avvisi }, null, 2));
  process.exit(s.esito === "ok" ? 0 : 1);
})();
