// Base dell'app: elementi, dati dal Pi, navigazione, finestre e messaggi.
(function () {
  "use strict";

  // --- Elementi ---
  // Il DOM si fa solo con createElement e textContent: niente HTML dalla wiki arriva alla pagina

  const PROPRIETA = new Set(["value", "checked", "disabled", "selected", "open"]);

  function h(tag, props, ...figli) {
    const el = document.createElement(tag);
    imposta(el, props);
    aggiungi(el, figli);
    return el;
  }

  function s(tag, props, ...figli) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    imposta(el, props);
    aggiungi(el, figli);
    return el;
  }

  function imposta(el, props) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") el.setAttribute("class", v);
      // Gli stili passano dal CSSOM: la Content-Security-Policy blocca l'attributo style
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (PROPRIETA.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }

  function aggiungi(el, figli) {
    figli.flat(Infinity).forEach((c) => {
      if (c == null || c === false) return;
      el.append(c instanceof Node ? c : String(c));
    });
  }

  // --- Memoria del browser: solo comodità (avviso spoiler già visto, novità già lette) ---

  function leggiLocale(chiave, predefinito) {
    try {
      const v = localStorage.getItem(chiave);
      return v ? JSON.parse(v) : predefinito;
    } catch {
      return predefinito;
    }
  }

  function scriviLocale(chiave, valore) {
    try {
      if (valore == null) localStorage.removeItem(chiave);
      else localStorage.setItem(chiave, JSON.stringify(valore));
    } catch {
      // senza memoria si rivede solo l'avviso
    }
  }

  // --- Dati sul Pi ---

  async function chiama(metodo, percorso, corpo) {
    const r = await fetch(`/api/${percorso}`, {
      method: metodo,
      headers: corpo !== undefined ? { "Content-Type": "application/json" } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    let json = null;
    try {
      json = await r.json();
    } catch {
      // risposta vuota
    }
    if (!r.ok) throw Object.assign(new Error(json?.errore || `Errore ${r.status}`), { stato: r.status });
    return json;
  }

  const stato = {
    indice: { pagine: [], categorie: [], home: [] },
    perId: new Map(),
    categorie: new Map(),
    pagine: new Map(), // pagine già scaricate in questa visita
  };

  function usaIndice(indice) {
    stato.indice = indice;
    stato.perId = new Map(indice.pagine.map((p) => [p.id, p]));
    stato.categorie = new Map(indice.categorie.map((c) => [c.id, c]));
  }

  async function carica() {
    usaIndice(await chiama("GET", "indice"));
  }

  async function pagina(id) {
    if (!stato.pagine.has(id)) stato.pagine.set(id, await chiama("GET", `pagina/${encodeURIComponent(id)}`));
    return stato.pagine.get(id);
  }

  const voce = (id) => stato.perId.get(id) || null;
  const categoria = (id) => stato.categorie.get(id) || null;

  // --- Messaggi ---

  function avviso(testo, tipo = "") {
    let box = document.querySelector(".messaggi");
    if (!box) document.body.append((box = h("div", { class: "messaggi", role: "status", "aria-live": "polite" })));
    const m = h("div", { class: `messaggio ${tipo}` }, testo);
    box.append(m);
    setTimeout(() => m.remove(), tipo === "errore" ? 6000 : 3200);
  }

  // --- Finestra (immagine ingrandita, avviso spoiler) ---

  function finestra({ titolo, contenuto, classe = "", chiudibile = true, alChiudere }) {
    const prima = document.activeElement;
    const chiudi = () => {
      velo.remove();
      document.removeEventListener("keydown", tasto);
      document.body.style.overflow = "";
      if (prima && prima.focus) prima.focus();
      if (alChiudere) alChiudere();
    };
    const tasto = (e) => chiudibile && e.key === "Escape" && chiudi();
    const pulsanteChiudi = chiudibile ? h("button", { class: "chiudi", type: "button", "aria-label": "Chiudi", onclick: chiudi }, "×") : null;
    const velo = h(
      "div",
      { class: "velo", onclick: (e) => chiudibile && e.target === velo && chiudi() },
      h("div", { class: `finestra ${classe}`, role: "dialog", "aria-modal": "true", "aria-label": titolo }, h("div", { class: "capo" }, h("h1", null, titolo), pulsanteChiudi), h("div", { class: "corpo" }, contenuto)),
    );
    document.body.append(velo);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", tasto);
    (pulsanteChiudi || velo.querySelector("button"))?.focus();
    return { chiudi };
  }

  // --- Navigazione (#/percorso) ---

  const viste = {};
  let pulizia = null;
  let ultimo = null;

  function vista(nome, fn) {
    viste[nome] = fn;
  }

  function vai(percorso) {
    if (location.hash === `#${percorso}`) mostra();
    else location.hash = percorso;
  }

  function mostra() {
    const percorso = location.hash.replace(/^#/, "") || "/";
    const [, nome = "", ...argomenti] = percorso.split("/");
    const fn = viste[nome] || viste[""];
    const args = argomenti.map((a) => {
      try {
        return decodeURIComponent(a);
      } catch {
        return a;
      }
    });
    // Dentro la stessa pagina (indice della pagina, note): si scorre, senza ridisegnare
    if (nome === "pagina" && ultimo && ultimo.nome === "pagina" && ultimo.args[0] === args[0] && viste.pagina.scorri) {
      ultimo = { nome, args };
      viste.pagina.scorri(args[1]);
      return;
    }
    ultimo = { nome, args };
    if (pulizia) pulizia();
    pulizia = null;
    const main = document.querySelector("main");
    main.replaceChildren();
    document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("attiva", a.dataset.vista === (nome || "inizio")));
    window.scrollTo(0, 0);
    const risultato = fn(main, ...args);
    if (typeof risultato === "function") pulizia = risultato;
  }

  function data(iso, conOra = false) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", ...(conOra ? { hour: "2-digit", minute: "2-digit" } : {}) });
  }

  function numero(x) {
    return Number(x || 0).toLocaleString("it-IT");
  }

  // Indirizzi interni
  const link = {
    pagina: (id, ancora) => `#/pagina/${encodeURIComponent(id)}${ancora ? `/${encodeURIComponent(ancora)}` : ""}`,
    categoria: (id) => `#/categoria/${encodeURIComponent(id)}`,
    cerca: (q) => `#/cerca/${encodeURIComponent(q)}`,
    immagine: (f) => `/immagini/${encodeURIComponent(f)}`,
  };

  window.SE = { h, s, chiama, stato, carica, usaIndice, pagina, voce, categoria, avviso, finestra, vista, vai, mostra, leggiLocale, scriviLocale, data, numero, link };
})();
