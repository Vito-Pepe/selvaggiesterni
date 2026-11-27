// Avvio: testata, menu, dati dal Pi e navigazione.
(function () {
  "use strict";
  const { h, s, carica, mostra, vai, chiama, leggiLocale, scriviLocale } = window.SE;

  const VOCI = [
    ["inizio", "#/", "Inizio"],
    ["categorie", "#/categorie", "Categorie"],
    ["indice", "#/indice", "Dalla A alla Z"],
    ["novita", "#/novita", "Novità"],
    ["info", "#/info", "Informazioni"],
  ];

  function logo() {
    return s(
      "svg",
      { viewBox: "0 0 32 32", "aria-hidden": "true" },
      s("rect", { width: 32, height: 32, rx: 7, fill: "var(--notte)" }),
      s("ellipse", { cx: 16, cy: 16, rx: 12.5, ry: 6, fill: "none", stroke: "var(--viola)", "stroke-width": 1.4, transform: "rotate(-24 16 16)" }),
      s("circle", { cx: 16, cy: 16, r: 5.2, fill: "var(--arancio)" }),
      s("circle", { cx: 26.2, cy: 11.6, r: 2.1, fill: "var(--acqua)" }),
      s("circle", { cx: 7, cy: 7, r: 0.8, fill: "#fff" }),
      s("circle", { cx: 25, cy: 25, r: 0.6, fill: "#fff" }),
    );
  }

  function testata() {
    const campo = h("input", { type: "search", name: "q", placeholder: "Cerca…", "aria-label": "Cerca nella wiki", autocomplete: "off", enterkeyhint: "search" });
    document.querySelector(".testata").replaceChildren(
      h("a", { class: "marchio", href: "#/", "aria-label": "Selvaggi Esterni, inizio" }, logo(), h("span", { class: "nome" }, h("b", null, "Selvaggi"), " Esterni"), h("span", { class: "sottotitolo" }, "wiki di Outer Wilds")),
      h(
        "form",
        {
          class: "cerca-testata",
          role: "search",
          onsubmit: (e) => {
            e.preventDefault();
            const q = campo.value.trim();
            campo.blur();
            campo.value = "";
            vai(`/cerca/${encodeURIComponent(q)}`);
          },
        },
        campo,
      ),
    );
    document.querySelector(".menu").replaceChildren(...VOCI.map(([vista, href, nome]) => h("a", { href, dataset: { vista } }, nome)));
  }

  // Pallino su "Novità" se ci sono aggiornamenti non ancora visti su questo dispositivo
  async function pallino() {
    try {
      const novita = await chiama("GET", "novita");
      const viste = leggiLocale("se-novita-viste", null);
      const nuove = novita.filter((n) => !n.prima && (!viste || n.data > viste)).length;
      const voce = document.querySelector('.menu a[data-vista="novita"]');
      if (!voce) return;
      voce.querySelector(".pallino")?.remove();
      if (nuove && viste) voce.append(h("span", { class: "pallino", "aria-label": `${nuove} novità` }, String(nuove)));
      if (!viste && novita[0]) scriviLocale("se-novita-viste", novita[0].data);
    } catch {
      // nessun pallino
    }
  }

  async function avvia() {
    const main = document.querySelector("main");
    testata();
    main.replaceChildren(h("div", { class: "caricamento" }, "Caricamento…"));
    try {
      await carica();
    } catch (e) {
      main.replaceChildren(h("div", { class: "vuoto" }, h("p", null, `Il Pi non risponde: ${e.message}`), h("button", { class: "pulsante", type: "button", onclick: avvia }, "Riprova")));
      return;
    }
    mostra();
    pallino();
  }

  window.addEventListener("hashchange", mostra);
  window.App = { pallino };
  avvia();
})();
