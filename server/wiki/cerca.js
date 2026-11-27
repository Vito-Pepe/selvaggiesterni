// Ricerca nella copia: tutte le parole cercate devono esserci (nel titolo, negli altri nomi o
// nel testo); prima i titoli che corrispondono meglio, poi le pagine dove le parole compaiono
// di più. Niente accenti né maiuscole.
const B = require("./blocchi");
const { normalizza } = require("./nomi");

function indicizza(copia) {
  return Object.values(copia.pagine).map((p) => {
    const testo = [...(p.schede || []).map(B.testoScheda), ...B.testoBlocchi(p.blocchi)].join(" ").replace(/\s+/g, " ");
    return {
      id: p.id,
      titolo: p.titolo,
      nt: normalizza(p.titolo),
      na: (p.altri || []).map(normalizza),
      testo,
      nx: ` ${normalizza(testo)} `,
    };
  });
}

function conta(testo, parola) {
  let n = 0;
  for (let i = testo.indexOf(parola); i >= 0 && n < 50; i = testo.indexOf(parola, i + parola.length)) n++;
  return n;
}

// Pezzo di testo attorno alla prima parola trovata
function estratto(testo, parole, lunghezza = 160) {
  const basso = testo.toLowerCase();
  let pos = -1;
  for (const w of parole) {
    pos = basso.indexOf(w);
    if (pos >= 0) break;
  }
  if (pos < 0) return testo.slice(0, lunghezza).trim() + (testo.length > lunghezza ? "…" : "");
  const inizio = Math.max(0, pos - 50);
  const pezzo = testo.slice(inizio, inizio + lunghezza).trim();
  return `${inizio > 0 ? "…" : ""}${pezzo}${inizio + lunghezza < testo.length ? "…" : ""}`;
}

function cerca(indice, domanda, max = 50) {
  const q = normalizza(domanda);
  if (!q) return { risultati: [], totale: 0 };
  const parole = [...new Set(q.split(" "))].slice(0, 8);
  const trovate = [];
  for (const v of indice) {
    let punti = 0;
    let tutte = true;
    for (const w of parole) {
      const nelTitolo = v.nt.includes(w) || v.na.some((a) => a.includes(w));
      const nelTesto = conta(v.nx, w);
      if (!nelTitolo && !nelTesto) {
        tutte = false;
        break;
      }
      if (nelTitolo) punti += 20;
      punti += Math.min(nelTesto, 20);
    }
    if (!tutte) continue;
    if (v.nt === q || v.na.includes(q)) punti += 200;
    else if (v.nt.startsWith(q)) punti += 80;
    else if (v.nt.includes(q)) punti += 40;
    trovate.push({ v, punti });
  }
  trovate.sort((a, b) => b.punti - a.punti || a.v.titolo.localeCompare(b.v.titolo, "en"));
  const grezze = q.split(" ");
  return {
    totale: trovate.length,
    risultati: trovate.slice(0, max).map(({ v }) => ({ id: v.id, titolo: v.titolo, estratto: estratto(v.testo, grezze) })),
  };
}

module.exports = { indicizza, cerca };
