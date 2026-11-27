// Pagina della wiki: scheda, indice della pagina e blocchi (formato in server/wiki/blocchi.js).
(function () {
  "use strict";
  const { h, stato, pagina, voce, categoria, vista, finestra, data, link, sorgente } = window.SE;

  // --- Pezzi di testo ---

  const STILI = [
    ["k", "code"],
    ["sub", "sub"],
    ["sup", "sup"],
    ["small", "small"],
    ["x", "s"],
    ["u", "u"],
    ["i", "i"],
    ["b", "b"],
  ];

  function collegamento(x, contenuto, ctx) {
    if (x.p && voce(x.p)) return h("a", { href: link.pagina(x.p, x.a) }, contenuto);
    if (x.c && categoria(x.c)) return h("a", { href: link.categoria(x.c) }, contenuto);
    if (x.a && !x.p && ctx?.id) return h("a", { href: link.pagina(ctx.id, x.a) }, contenuto);
    if (x.e && /^https?:\/\//.test(x.e)) return h("a", { href: x.e, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, contenuto);
    return contenuto;
  }

  function immagineInTesto(x, ctx) {
    const lato = x.w && x.h ? Math.min(1, 72 / Math.max(x.w, x.h)) : 1;
    const img = h("img", { src: sorgente(x), alt: x.alt || "", loading: "lazy", class: "icona-testo", width: x.w ? Math.round(x.w * lato) : null, height: x.h ? Math.round(x.h * lato) : null });
    return collegamento(x, img, ctx);
  }

  function pezzi(s, ctx) {
    return (s || []).flatMap((x) => {
      if (typeof x === "string") return document.createTextNode(x);
      if (x.br) return h("br");
      if (x.f || x.u) return sorgente(x) ? [immagineInTesto(x, ctx)] : [];
      let el = document.createTextNode(x.t || "");
      for (const [k, tag] of STILI) if (x[k]) el = h(tag, null, el);
      return collegamento(x, el, ctx);
    });
  }

  const testo = (s) => (s || []).map((x) => (typeof x === "string" ? x : x.br ? " " : x.t || "")).join("").replace(/\s+/g, " ").trim();

  // --- Immagini ---

  function ingrandisci(x, d, ctx) {
    finestra({
      titolo: d ? testo(d) || "Immagine" : "Immagine",
      classe: "finestra-immagine",
      contenuto: h("figure", { class: "grande" }, h("img", { src: sorgente(x), alt: d ? testo(d) : "" }), d ? h("figcaption", null, pezzi(d, ctx)) : null),
    });
  }

  function figura(x, ctx, classe = "figura") {
    return h(
      "figure",
      { class: classe },
      h("button", { type: "button", class: "apri-immagine", "aria-label": "Ingrandisci l'immagine", onclick: () => ingrandisci(x, x.d, ctx) }, h("img", { src: sorgente(x), alt: x.d ? testo(x.d) : "", loading: "lazy", width: x.w || null, height: x.h || null })),
      x.d ? h("figcaption", null, pezzi(x.d, ctx)) : null,
    );
  }

  // --- Blocchi ---

  function rientro(el, l) {
    if (l) el.style.setProperty("--l", Math.min(l, 12));
    return el;
  }

  function cella(c, ctx) {
    const el = h(c.th ? "th" : "td", { colspan: c.cs || null, rowspan: c.rs || null });
    if (c.b) el.append(...blocchi(c.b, ctx));
    else el.append(...pezzi(c.s, ctx));
    return el;
  }

  function tabella(b, ctx) {
    const riga = (r) => h("tr", null, r.map((c) => cella(c, ctx)));
    if (b.chiusa) {
      // Tabella chiusa: la prima riga fa da titolo, le altre si aprono toccandola
      const [prima, ...resto] = b.righe;
      const titolo = b.titolo ? pezzi(b.titolo, ctx) : prima.map((c) => (c.b ? blocchi(c.b, ctx) : pezzi(c.s, ctx)));
      return h(
        "details",
        { class: "tabella-chiusa" },
        h("summary", null, h("span", { class: "titolo-chiusa" }, titolo)),
        h("div", { class: "tabella" }, h("table", null, h("tbody", null, (b.titolo ? b.righe : resto).map(riga)))),
      );
    }
    return h("div", { class: "tabella" }, h("table", null, b.titolo ? h("caption", null, pezzi(b.titolo, ctx)) : null, h("tbody", null, b.righe.map(riga))));
  }

  function schede(b, ctx) {
    const pannelli = b.voci.map((v, i) => h("div", { class: "pannello-scheda", role: "tabpanel", hidden: i > 0 }, blocchi(v.b, ctx)));
    const pulsanti = b.voci.map((v, i) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          class: i === 0 ? "attiva" : "",
          "aria-selected": i === 0 ? "true" : "false",
          onclick: () => {
            pulsanti.forEach((p, k) => {
              p.classList.toggle("attiva", k === i);
              p.setAttribute("aria-selected", k === i ? "true" : "false");
            });
            pannelli.forEach((p, k) => (p.hidden = k !== i));
          },
        },
        v.nome,
      ),
    );
    return h("div", { class: "schede" }, h("div", { class: "linguette", role: "tablist" }, pulsanti), pannelli);
  }

  function blocco(b, ctx) {
    switch (b.t) {
      case "h": {
        const tag = `h${Math.min(Math.max(b.l || 2, 2), 5)}`;
        return h(tag, { class: "sezione", id: b.id ? `a-${b.id}` : null, title: b.it ? testo(b.s) : null }, b.it || pezzi(b.s, ctx));
      }
      case "p":
        return rientro(h("p", { class: b.l ? "rientro" : null }, pezzi(b.s, ctx)), b.l);
      case "dt":
        return rientro(h("p", { class: `termine${b.l ? " rientro" : ""}` }, pezzi(b.s, ctx)), b.l);
      case "li":
        return rientro(h("div", { class: `voce${b.o ? " numerata" : ""}`, dataset: b.o ? { n: `${b.o}.` } : null }, pezzi(b.s, ctx)), b.l || 1);
      case "img":
        return figura(b, ctx);
      case "galleria":
        return h("div", { class: "galleria" }, b.voci.map((v) => figura(v, ctx, "figura piccola")));
      case "tab":
        return tabella(b, ctx);
      case "schede":
        return schede(b, ctx);
      case "nav":
        return h(
          "nav",
          { class: "navigazione", "aria-label": b.titolo ? testo(b.titolo) : "Navigazione" },
          b.titolo ? h("div", { class: "titolo-nav" }, pezzi(b.titolo, ctx)) : null,
          b.righe.map((r) => h("div", { class: "riga-nav" }, r.nome ? h("span", { class: "gruppo-nav" }, pezzi(r.nome, ctx)) : null, h("span", null, pezzi(r.s, ctx)))),
        );
      case "avviso":
        return rientro(h("div", { class: `avviso-wiki${b.l ? " rientro" : ""}`, role: "note" }, pezzi(b.s, ctx)), b.l);
      case "video":
        return h("p", { class: "video" }, h("a", { href: b.url, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, `▶ Guarda il video su ${b.titolo || "YouTube"}`));
      case "codice":
        return h("pre", { class: "codice" }, b.testo);
      case "citazione":
        return h("blockquote", null, blocchi(b.b, ctx));
      case "note":
        return h("ol", { class: "note" }, b.voci.map((v) => h("li", { id: v.id ? `a-${v.id}` : null }, pezzi(v.s, ctx))));
      case "hr":
        return h("hr");
      default:
        return null;
    }
  }

  function blocchi(elenco, ctx) {
    return (elenco || []).map((b) => blocco(b, ctx)).filter(Boolean);
  }

  // --- Scheda (infobox) ---

  function scheda(box, ctx) {
    let immagini = null;
    if (box.immagini.length === 1) immagini = figura(box.immagini[0], ctx, "figura scheda-immagine");
    else if (box.immagini.length > 1) {
      immagini = schede({ voci: box.immagini.map((im, i) => ({ nome: im.d ? testo(im.d) : `${i + 1}`, b: [] })) }, ctx);
      // Le linguette mostrano l'immagine giusta (le didascalie diventano i nomi delle linguette)
      immagini.querySelectorAll(".pannello-scheda").forEach((p, i) => p.append(figura({ ...box.immagini[i], d: null }, ctx, "figura scheda-immagine")));
    }
    return h(
      "aside",
      { class: "scheda" },
      box.titolo ? h("div", { class: "titolo-scheda" }, pezzi(box.titolo, ctx)) : null,
      immagini,
      box.righe.length
        ? h(
            "dl",
            null,
            box.righe.map((r) => (r.g ? h("dt", { class: "gruppo" }, pezzi(r.g, ctx)) : [r.e ? h("dt", null, r.e) : null, h("dd", { class: r.e ? null : "intera" }, pezzi(r.s, ctx))])),
          )
        : null,
    );
  }

  // --- Vista ---

  function scorri(ancora) {
    if (!ancora) return window.scrollTo(0, 0);
    const el = document.getElementById(`a-${ancora}`);
    if (!el) return;
    // Se l'ancora è dentro una tabella chiusa o una linguetta nascosta, prima si apre
    el.closest("details")?.setAttribute("open", "");
    el.scrollIntoView({ block: "start" });
    el.classList.add("evidenziato");
    setTimeout(() => el.classList.remove("evidenziato"), 1600);
  }

  function indicePagina(p) {
    const titoli = p.blocchi.filter((b) => b.t === "h" && b.l === 2 && b.id);
    if (titoli.length < 3) return null;
    return h(
      "details",
      { class: "indice-pagina" },
      h("summary", null, "In questa pagina"),
      h("ol", null, titoli.map((b) => h("li", null, h("a", { href: link.pagina(p.id, b.id) }, b.it || testo(b.s))))),
    );
  }

  const ETICHETTE = { "echoes-of-the-eye": "Echoes of the Eye", alpha: "Versione alpha" };

  function testa(p) {
    const cat = p.categorie.map(categoria).filter(Boolean);
    const etichette = [...cat.filter((c) => ETICHETTE[c.id]).map((c) => h("span", { class: "etichetta" }, ETICHETTE[c.id]))];
    return h(
      "header",
      { class: "testa-pagina" },
      h("h1", null, p.titolo),
      etichette.some(Boolean) ? h("div", { class: "etichette" }, etichette) : null,
      cat.length ? h("div", { class: "categorie-pagina" }, cat.map((c) => h("a", { class: "chip", href: link.categoria(c.id) }, c.it))) : null,
    );
  }

  function piede(p) {
    const f = stato.indice.fonte || {};
    const cronologia = `${p.url}${p.url.includes("?") ? "&" : "?"}action=history`;
    return h(
      "footer",
      { class: "piede-pagina tenue piccolo" },
      h("p", null, `Testo della ${f.sito || "Outer Wilds Wiki"} (licenza `, f.licenzaUrl ? h("a", { href: f.licenzaUrl, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, f.licenza || "CC BY-SA 3.0") : f.licenza || "CC BY-SA 3.0", "), scritto dai suoi autori volontari.", p.toccata ? ` Ultima modifica sulla wiki: ${data(p.toccata)}.` : ""),
      h(
        "p",
        null,
        h("a", { href: p.url, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, "Apri sulla wiki"),
        " · ",
        h("a", { href: cronologia, class: "esterno", target: "_blank", rel: "noopener noreferrer" }, "Autori e cronologia"),
      ),
    );
  }

  function vistaPagina(main, id, ancora) {
    let viva = true;
    main.append(h("div", { class: "caricamento" }, "Caricamento…"));
    pagina(id)
      .then((p) => {
        if (!viva) return;
        const ctx = { id: p.id };
        document.title = `${p.titolo} · Selvaggi Esterni`;
        main.replaceChildren(
          h(
            "article",
            { class: "articolo" },
            testa(p),
            p.schede?.length ? h("div", { class: "schede-pagina" }, p.schede.map((s) => scheda(s, ctx))) : null,
            indicePagina(p),
            h("div", { class: "testo-wiki" }, blocchi(p.blocchi, ctx)),
            piede(p),
          ),
        );
        if (ancora) requestAnimationFrame(() => scorri(ancora));
      })
      .catch((e) => {
        if (!viva) return;
        main.replaceChildren(h("div", { class: "vuoto" }, h("p", null, e.stato === 404 ? "Questa pagina non c'è nella copia della wiki." : `Pagina non disponibile: ${e.message}`), h("p", null, h("a", { href: "#/" }, "Torna all'inizio"))));
      });
    return () => {
      viva = false;
      document.title = "Selvaggi Esterni";
    };
  }
  // La navigazione dentro la stessa pagina (indice della pagina, note) scorre senza ridisegnare
  vistaPagina.scorri = scorri;
  vista("pagina", vistaPagina);

  window.SE.wiki = { pezzi, blocchi, figura, testo };
})();
