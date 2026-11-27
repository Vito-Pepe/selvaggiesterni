// Cosa è cambiato tra due copie della wiki, per le Novità: pagine nuove, tolte, modificate
// sulla wiki (con il commento di chi le ha cambiate) e rinominate.
//
// Una pagina rinominata si riconosce solo quando, nello stesso aggiornamento, il titolo vecchio
// sparisce, quello nuovo compare e sulla wiki il titolo vecchio ora rimanda proprio lì; se no
// restano una pagina nuova e una tolta (meglio due voci che un abbinamento sbagliato).

function confronta(vecchia, nuova) {
  const prima = new Map(Object.values(vecchia?.pagine || {}).map((p) => [p.titolo, p]));
  const dopo = new Map(Object.values(nuova.pagine).map((p) => [p.titolo, p]));
  let aggiunte = [];
  let tolte = [];
  const cambiate = [];
  for (const [t, p] of dopo) {
    const v = prima.get(t);
    if (!v) aggiunte.push({ id: p.id, titolo: t });
    else if (v.rev !== p.rev) {
      const c = { id: p.id, titolo: t };
      if (p.toccata) c.quando = p.toccata;
      if (p.commento) c.commento = p.commento;
      cambiate.push(c);
    }
  }
  for (const [t, p] of prima) if (!dopo.has(t)) tolte.push({ id: p.id, titolo: t });

  // Rinominate: il titolo vecchio ora è tra gli altri nomi (rimandi) di una pagina nuova
  const rinominate = [];
  for (const a of [...aggiunte]) {
    const nuovaPagina = nuova.pagine[a.id];
    const candidate = tolte.filter((x) => (nuovaPagina.altri || []).includes(x.titolo));
    if (candidate.length !== 1) continue;
    const verso = aggiunte.filter((y) => (nuova.pagine[y.id].altri || []).includes(candidate[0].titolo));
    if (verso.length !== 1) continue;
    rinominate.push({ da: candidate[0].titolo, id: a.id, titolo: a.titolo });
    tolte = tolte.filter((x) => x !== candidate[0]);
    aggiunte = aggiunte.filter((x) => x !== a);
  }

  const vecchieScartate = new Set((vecchia?.scartate || []).map((s) => s.titolo));
  const scartate = (nuova.scartate || []).filter((s) => !vecchieScartate.has(s.titolo));
  const vecchieTrattenute = new Set((vecchia?.trattenute || []).map((s) => `${s.titolo}|${s.rev}`));
  const trattenute = (nuova.trattenute || []).filter((s) => !vecchieTrattenute.has(`${s.titolo}|${s.rev}`));

  const ordina = (x) => x.sort((a, b) => a.titolo.localeCompare(b.titolo, "en"));
  const diff = { aggiunte: ordina(aggiunte), tolte: ordina(tolte), cambiate: ordina(cambiate), rinominate: ordina(rinominate), scartate, trattenute };
  diff.totale = aggiunte.length + tolte.length + cambiate.length + rinominate.length + scartate.length + trattenute.length;
  diff.vuoto = diff.totale === 0;
  return diff;
}

module.exports = { confronta };
