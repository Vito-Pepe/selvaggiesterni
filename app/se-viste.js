// Viste dell'app: inizio, categorie, indice A-Z, ricerca, novità e informazioni.
(function () {
  "use strict";
  const { h, stato, chiama, carica, voce, categoria, vista, vai, avviso, data, numero, link, sorgente, scriviLocale } = window.SE;

  // Scheda di una pagina negli elenchi: immagine, titolo, riassunto
  function carta(p, { riassunto = true } = {}) {
    return h(
      "a",
      { class: "carta", href: link.pagina(p.id) },
      sorgente(p.immagine) ? h("img", { src: sorgente(p.immagine), alt: "", loading: "lazy", width: p.immagine.w || null, height: p.immagine.h || null }) : h("span", { class: "senza-immagine", "aria-hidden": "true" }, p.titolo.slice(0, 1)),
      h("span", { class: "testo-carta" }, h("b", null, p.titolo), riassunto && p.riassunto ? h("span", { class: "riassunto" }, p.riassunto) : null),
    );
  }

  function fonte() {
    const f = stato.indice.fonte || {};
    return h(
      "p",
      { class: "tenue piccolo fonte" },
      "Copia sul Pi della ",
      h("a", { href: f.principale || f.url || "https://outerwilds.fandom.com", class: "esterno", target: "_blank", rel: "noopener noreferrer" }, f.sito || "Outer Wilds Wiki"),
      ` (testi ${f.licenza || "CC BY-SA 3.0"}), aggiornata ogni giorno`,
      stato.indice.generato ? `: ultima copia ${data(stato.indice.generato, true)}.` : ".",
      " I testi sono in inglese, come sulla wiki.",
    );
  }

  // Finché la prima copia non è pronta: avanzamento, e si ricarica da sola
  function inAttesa(main) {
    const riquadro = h("div", { class: "vuoto" }, h("p", null, "Sto scaricando la wiki per la prima volta: i testi sono pronti in qualche minuto, le immagini arrivano dopo."), h("p", { class: "tenue piccolo fase" }, ""));
    main.append(riquadro);
    const giro = async () => {
      try {
        const s = await chiama("GET", "aggiornamento");
        riquadro.querySelector(".fase").textContent = s.inCorso ? s.fase || "In corso…" : s.esito === "errore" ? `Non riuscito: ${s.errore}. Riprovo tra poco.` : "In attesa…";
        if (s.pagine > 0) {
          await carica();
          vai("/");
        }
      } catch {
        // il Pi non risponde: si riprova
      }
    };
    giro();
    const t = setInterval(giro, 5000);
    return () => clearInterval(t);
  }

  // --- Inizio ---

  vista("", (main) => {
    if (!stato.indice.pagine.length) return inAttesa(main);
    const sezioni = (stato.indice.home || []).map((sez) => {
      const conImmagini = sez.voci.filter((v) => sorgente(v)).length >= 2;
      const voci = sez.voci.map((v) => {
        const href = v.p ? link.pagina(v.p) : v.c ? link.categoria(v.c) : null;
        const nome = v.t || (v.p ? voce(v.p)?.titolo : categoria(v.c)?.it) || "";
        const nomeIt = v.c ? categoria(v.c)?.it || nome : nome;
        if (conImmagini) return h("a", { class: "icona-home", href }, sorgente(v) ? h("img", { src: sorgente(v), alt: "", loading: "lazy" }) : h("span", { class: "senza-immagine" }, nome.slice(0, 1)), h("span", null, nomeIt));
        return h("a", { class: "chip", href }, nomeIt);
      });
      return h("section", { class: "sezione-home" }, h("h2", null, sez.it), h("div", { class: conImmagini ? "griglia-icone" : "chips" }, voci));
    });
    const recenti = [...stato.indice.pagine]
      .filter((p) => p.toccata)
      .sort((a, b) => b.toccata.localeCompare(a.toccata))
      .slice(0, 6);
    main.append(
      h(
        "div",
        { class: "inizio" },
        h("form", { class: "cerca-grande", role: "search", onsubmit: (e) => (e.preventDefault(), vai(`/cerca/${encodeURIComponent(e.target.q.value.trim())}`)) }, h("input", { name: "q", type: "search", placeholder: `Cerca in ${numero(stato.indice.pagine.length)} pagine…`, "aria-label": "Cerca nella wiki", autocomplete: "off", enterkeyhint: "search" }), h("button", { class: "pulsante", type: "submit" }, "Cerca")),
        sezioni,
        recenti.length
          ? h("section", { class: "sezione-home" }, h("h2", null, "Modificate di recente sulla wiki"), h("div", { class: "elenco-carte" }, recenti.map((p) => carta(p))))
          : null,
        h("section", { class: "sezione-home" }, h("h2", null, "Esplora"), h("div", { class: "chips" }, h("a", { class: "chip", href: "#/categorie" }, "Tutte le categorie"), h("a", { class: "chip", href: "#/indice" }, "Tutte le pagine dalla A alla Z"), h("a", { class: "chip", href: "#/caso" }, "Una pagina a caso"))),
        fonte(),
      ),
    );
  });

  vista("caso", () => {
    const elenco = stato.indice.pagine;
    if (!elenco.length) return vai("/");
    location.replace(link.pagina(elenco[Math.floor(Math.random() * elenco.length)].id));
  });

  // --- Categorie ---

  vista("categorie", (main) => {
    const cat = stato.indice.categorie;
    const radici = cat.filter((c) => !c.sopra.some((s) => categoria(s)));
    const visti = new Set();
    const ramo = (c, livello) => {
      if (visti.has(c.id) || livello > 4) return null;
      visti.add(c.id);
      const figli = c.sotto.map(categoria).filter(Boolean).sort((a, b) => a.it.localeCompare(b.it, "it"));
      return h(
        "li",
        null,
        h("a", { href: link.categoria(c.id) }, c.it),
        h("span", { class: "tenue piccolo" }, ` ${c.pagine.length}`),
        figli.length ? h("ul", null, figli.map((f) => ramo(f, livello + 1))) : null,
      );
    };
    main.append(h("h1", { class: "titolo-vista" }, "Categorie"), h("ul", { class: "albero" }, radici.map((c) => ramo(c, 0))), fonte());
  });

  vista("categoria", (main, id) => {
    const c = categoria(id);
    if (!c) return main.append(h("div", { class: "vuoto" }, h("p", null, "Categoria non trovata."), h("p", null, h("a", { href: "#/categorie" }, "Tutte le categorie"))));
    const sopra = c.sopra.map(categoria).filter(Boolean);
    const sotto = c.sotto.map(categoria).filter(Boolean);
    main.append(
      h("h1", { class: "titolo-vista" }, c.it),
      c.it !== c.nome ? h("p", { class: "tenue piccolo" }, `Sulla wiki: ${c.nome}`) : null,
      sopra.length ? h("div", { class: "chips" }, h("span", { class: "tenue piccolo" }, "Dentro:"), sopra.map((x) => h("a", { class: "chip", href: link.categoria(x.id) }, x.it))) : null,
      sotto.length ? h("div", { class: "chips" }, h("span", { class: "tenue piccolo" }, "Comprende:"), sotto.map((x) => h("a", { class: "chip", href: link.categoria(x.id) }, x.it))) : null,
      h("div", { class: "elenco-carte" }, c.pagine.map(voce).filter(Boolean).map((p) => carta(p))),
    );
  });

  // --- Indice A-Z ---

  vista("indice", (main) => {
    const filtro = h("input", { type: "search", placeholder: "Filtra per titolo…", "aria-label": "Filtra per titolo", autocomplete: "off" });
    const zona = h("div");
    const disegna = () => {
      const q = filtro.value.trim().toLowerCase();
      const gruppi = new Map();
      for (const p of stato.indice.pagine) {
        if (q && !p.titolo.toLowerCase().includes(q)) continue;
        const lettera = /^[a-z]/i.test(p.titolo) ? p.titolo[0].toUpperCase() : "#";
        if (!gruppi.has(lettera)) gruppi.set(lettera, []);
        gruppi.get(lettera).push(p);
      }
      zona.replaceChildren(
        ...[...gruppi].map(([lettera, pagine]) => h("section", { class: "lettera" }, h("h2", null, lettera), h("ul", { class: "colonne" }, pagine.map((p) => h("li", null, h("a", { href: link.pagina(p.id) }, p.titolo)))))),
      );
      if (!gruppi.size) zona.append(h("p", { class: "tenue" }, "Nessuna pagina con questo titolo."));
    };
    filtro.addEventListener("input", disegna);
    main.append(h("h1", { class: "titolo-vista" }, `Tutte le pagine (${numero(stato.indice.pagine.length)})`), h("div", { class: "filtro" }, filtro), zona);
    disegna();
  });

  // --- Ricerca ---

  vista("cerca", (main, domanda = "") => {
    const campo = h("input", { name: "q", type: "search", value: domanda, placeholder: "Cerca nella wiki…", "aria-label": "Cerca nella wiki", autocomplete: "off", enterkeyhint: "search" });
    const risultati = h("div", { class: "risultati" });
    let numeroRichiesta = 0;
    const esegui = async (q) => {
      const mio = ++numeroRichiesta;
      if (!q.trim()) return risultati.replaceChildren(h("p", { class: "tenue" }, "Scrivi una o più parole: anche nomi di personaggi, luoghi, oggetti."));
      try {
        const r = await chiama("GET", `cerca?q=${encodeURIComponent(q)}`);
        if (mio !== numeroRichiesta) return;
        if (!r.risultati.length) return risultati.replaceChildren(h("p", { class: "tenue" }, `Nessuna pagina con “${q}”. I testi sono in inglese: prova con le parole inglesi.`));
        risultati.replaceChildren(
          h("p", { class: "tenue piccolo" }, r.totale > r.risultati.length ? `${numero(r.totale)} pagine, le prime ${r.risultati.length}:` : `${numero(r.totale)} ${r.totale === 1 ? "pagina" : "pagine"}`),
          ...r.risultati.map((x) => {
            const p = voce(x.id);
            return h(
              "a",
              { class: "risultato", href: link.pagina(x.id) },
              sorgente(p?.immagine) ? h("img", { src: sorgente(p.immagine), alt: "", loading: "lazy" }) : h("span", { class: "senza-immagine" }, x.titolo.slice(0, 1)),
              h("span", null, h("b", null, x.titolo), h("span", { class: "estratto" }, x.estratto)),
            );
          }),
        );
      } catch (e) {
        if (mio === numeroRichiesta) risultati.replaceChildren(h("p", { class: "errore" }, `Ricerca non riuscita: ${e.message}`));
      }
    };
    let timer = null;
    campo.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        history.replaceState(null, "", link.cerca(campo.value));
        esegui(campo.value);
      }, 250);
    });
    main.append(h("h1", { class: "titolo-vista" }, "Cerca"), h("form", { class: "cerca-grande", role: "search", onsubmit: (e) => (e.preventDefault(), esegui(campo.value)) }, campo), risultati);
    esegui(domanda);
    requestAnimationFrame(() => campo.focus());
    return () => clearTimeout(timer);
  });

  // --- Novità ---

  function elencoPagine(titolo, voci, extra) {
    if (!voci?.length) return null;
    return h(
      "div",
      { class: "gruppo-novita" },
      h("h3", null, `${titolo} (${voci.length})`),
      h(
        "ul",
        null,
        voci.map((v) => h("li", null, voce(v.id) ? h("a", { href: link.pagina(v.id) }, v.titolo) : v.titolo, extra ? extra(v) : null)),
      ),
    );
  }

  vista("novita", (main) => {
    main.append(h("h1", { class: "titolo-vista" }, "Novità"), h("p", { class: "tenue piccolo" }, "Cosa è cambiato sulla wiki a ogni aggiornamento della copia (una volta al giorno)."));
    const zona = h("div", null, h("div", { class: "caricamento" }, "Caricamento…"));
    main.append(zona);
    chiama("GET", "novita")
      .then((elenco) => {
        scriviLocale("se-novita-viste", elenco[0]?.data || new Date().toISOString());
        window.App?.pallino();
        if (!elenco.length) return zona.replaceChildren(h("p", { class: "tenue" }, "Ancora niente: le novità compaiono dal secondo aggiornamento."));
        zona.replaceChildren(
          ...elenco.map((n) =>
            h(
              "section",
              { class: "novita" },
              h("h2", null, data(n.data, true)),
              n.prima ? h("p", null, `Prima copia della wiki: ${numero(n.pagine)} pagine e ${numero(n.immagini)} immagini.`) : null,
              elencoPagine("Pagine nuove", n.aggiunte),
              elencoPagine("Rinominate", n.rinominate, (v) => h("span", { class: "tenue" }, ` (prima: ${v.da})`)),
              elencoPagine("Modificate", n.cambiate, (v) => [v.commento ? h("span", { class: "tenue" }, ` — “${v.commento}”`) : null, v.quando ? h("span", { class: "tenue piccolo" }, ` ${data(v.quando)}`) : null]),
              n.tolte?.length ? h("div", { class: "gruppo-novita" }, h("h3", null, `Tolte dalla wiki (${n.tolte.length})`), h("ul", null, n.tolte.map((v) => h("li", null, v.titolo)))) : null,
              n.scartate?.length ? h("div", { class: "gruppo-novita" }, h("h3", null, `Non copiate (${n.scartate.length})`), h("ul", null, n.scartate.map((v) => h("li", null, v.titolo, h("span", { class: "tenue" }, ` — ${v.motivo}`))))) : null,
              n.trattenute?.length
                ? h("div", { class: "gruppo-novita" }, h("h3", null, `Tenute com'erano (${n.trattenute.length})`), h("ul", null, n.trattenute.map((v) => h("li", null, voce(v.id) ? h("a", { href: link.pagina(v.id) }, v.titolo) : v.titolo, h("span", { class: "tenue" }, ` — ${v.motivo}: per 7 giorni resta la versione di prima`)))))
                : null,
            ),
          ),
        );
      })
      .catch((e) => zona.replaceChildren(h("p", { class: "errore" }, `Novità non disponibili: ${e.message}`)));
  });

  // --- Informazioni e aggiornamento ---

  vista("info", (main) => {
    const f = stato.indice.fonte || {};
    const zonaStato = h("div", null, h("div", { class: "caricamento" }, "Caricamento…"));
    let timer = null;
    const pulsante = h("button", { class: "pulsante", type: "button" }, "Aggiorna adesso dalla wiki");
    const leggiStato = async () => {
      clearTimeout(timer);
      try {
        const s = await chiama("GET", "aggiornamento");
        pulsante.disabled = s.inCorso;
        // Senza i null: replaceChildren li scriverebbe come testo
        zonaStato.replaceChildren(
          ...[
          h(
            "dl",
            { class: "dati" },
            h("dt", null, "Copia in uso"),
            h("dd", null, s.generato ? `${data(s.generato, true)}: ${numero(s.pagine)} pagine` : "non ancora pronta"),
            h("dt", null, "Immagini"),
            h(
              "dd",
              null,
              `${numero(s.immagini)} sul Pi`,
              s.immaginiDaFandom ? `, ${numero(s.immaginiDaFandom)} caricate da Fandom` : "",
              s.immaginiDaFandom && s.bloccoImmagini ? h("div", { class: "tenue piccolo" }, "Fandom (Cloudflare) per ora non dà le immagini al Pi: quelle che mancano le carica il tuo browser direttamente da Fandom.", s.prossimoTentativoImmagini ? ` Il Pi riprova ${data(s.prossimoTentativoImmagini, true)}.` : "") : null,
            ),
            h("dt", null, "Ultimo tentativo"),
            h("dd", null, s.ultimoTentativo ? `${data(s.ultimoTentativo, true)} (${s.motivo || ""}): ${s.inCorso ? "in corso" : s.esito === "ok" ? "riuscito" : s.esito === "errore" ? `non riuscito, ${s.errore}` : "–"}` : "mai"),
            s.inCorso ? [h("dt", null, "Adesso"), h("dd", null, s.fase || "in corso…")] : null,
          ),
          s.avvisi?.length ? h("details", null, h("summary", null, `Avvisi dell'ultimo aggiornamento (${s.avvisi.length})`), h("ul", { class: "piccolo" }, s.avvisi.map((a) => h("li", null, a)))) : null,
          s.scartate?.length
            ? h("details", null, h("summary", null, `Pagine della wiki non copiate (${s.scartate.length})`), h("ul", { class: "piccolo" }, s.scartate.map((x) => h("li", null, x.titolo, h("span", { class: "tenue" }, ` — ${x.motivo}`)))))
            : null,
          s.trattenute?.length
            ? h("details", { open: true }, h("summary", null, `Pagine tenute com'erano (${s.trattenute.length})`), h("p", { class: "tenue piccolo" }, "Sulla wiki sono state svuotate o accorciate di molto (succede con i vandalismi): per 7 giorni qui resta la versione di prima, poi vale quella della wiki."), h("ul", { class: "piccolo" }, s.trattenute.map((x) => h("li", null, x.titolo, h("span", { class: "tenue" }, ` — ${x.motivo}, dal ${data(x.dal)}`)))))
            : null,
          ].filter(Boolean),
        );
        if (s.inCorso) timer = setTimeout(leggiStato, 4000);
        else if (s.pagine && !stato.indice.pagine.length) carica().catch(() => {});
      } catch (e) {
        zonaStato.replaceChildren(h("p", { class: "errore" }, `Stato non disponibile: ${e.message}`));
      }
    };
    pulsante.addEventListener("click", async () => {
      pulsante.disabled = true;
      try {
        await chiama("POST", "aggiornamento", {});
        avviso("Aggiornamento partito: ci vuole qualche minuto");
      } catch (e) {
        avviso(e.message, "errore");
      }
      leggiStato();
    });
    main.append(
      h("h1", { class: "titolo-vista" }, "Informazioni"),
      h(
        "div",
        { class: "testo-info" },
        h("p", null, "Selvaggi Esterni è una copia privata, sul Raspberry Pi, della ", h("a", { href: f.principale || "https://outerwilds.fandom.com", class: "esterno", target: "_blank", rel: "noopener noreferrer" }, f.sito || "Outer Wilds Wiki"), ": si consulta senza passare dal sito, anche quando il sito non risponde. Una volta al giorno il Pi scarica le pagine cambiate e le immagini nuove."),
        h("p", null, "È pensata per chi ha già finito il gioco: racconta tutto di Outer Wilds e di Echoes of the Eye, finali compresi, senza nascondere niente."),
        h("p", null, `I testi sono dei volontari che scrivono la wiki, con licenza ${f.licenza || "CC BY-SA 3.0"}`, f.licenzaUrl ? [" (", h("a", { href: f.licenzaUrl, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, "condizioni"), ")"] : null, ": in fondo a ogni pagina ci sono il link alla pagina originale e alla sua cronologia, con gli autori. Le immagini vengono dalla wiki e sono in gran parte schermate del gioco, di Mobius Digital e Annapurna Interactive: per questo l'app resta privata: in casa, nella tailnet e per chi riceve da Tailscale il suo indirizzo condiviso, mai su Internet."),
        h("p", null, "Le pagine vuote, quelle che la wiki sta per cancellare e quelle vandalizzate non si copiano; se una pagina viene svuotata all'improvviso, per una settimana resta la versione di prima."),
      ),
      h("h2", null, "Aggiornamento"),
      zonaStato,
      h("div", { class: "pulsanti" }, pulsante),
    );
    leggiStato();
    return () => clearTimeout(timer);
  });

  window.SE.carta = carta;
})();
