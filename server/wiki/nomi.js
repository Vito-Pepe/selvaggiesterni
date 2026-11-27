// Nomi: identificativi delle pagine e delle categorie, titoli della wiki e traduzioni in
// italiano di etichette, titoli delle sezioni e categorie (solo quelle generiche: i nomi propri
// del gioco restano come sulla wiki).

// "Giant's Deep" → "giants-deep", "Outer Wilds:Alpha" → "outer-wilds-alpha"
function slug(testo) {
  const s = String(testo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "");
  return s || "pagina";
}

// Titolo come lo scrive MediaWiki: spazi al posto dei _, prima lettera maiuscola
function titolo(t) {
  const s = String(t || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

// Identificativi unici: se due titoli danno lo stesso slug, il secondo prende -2, -3...
function assegnaId(titoli, prefisso = "") {
  const usati = new Set();
  const mappa = new Map();
  for (const t of [...titoli].sort((a, b) => a.localeCompare(b, "en"))) {
    const base = `${prefisso}${slug(t)}`;
    let id = base;
    for (let n = 2; usati.has(id); n++) id = `${base}-${n}`;
    usati.add(id);
    mappa.set(t, id);
  }
  return mappa;
}

// Testo per cercare: minuscolo, senza accenti, segni e spazi doppi
function normalizza(testo) {
  return String(testo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Titoli delle sezioni più comuni
const SEZIONI = {
  trivia: "Curiosità",
  references: "Fonti",
  description: "Descrizione",
  gallery: "Galleria",
  "alpha gallery": "Galleria (alpha)",
  dialogue: "Dialoghi",
  dialog: "Dialoghi",
  features: "Caratteristiche",
  history: "Storia",
  "texts and recordings": "Testi e registrazioni",
  notes: "Note",
  "notes & trivia": "Note e curiosità",
  "notes and trivia": "Note e curiosità",
  locations: "Luoghi",
  location: "Posizione",
  inhabitants: "Abitanti",
  fate: "Destino",
  details: "Dettagli",
  ending: "Finale",
  purpose: "Scopo",
  biology: "Biologia",
  technology: "Tecnologia",
  structure: "Struttura",
  appearance: "Aspetto",
  culture: "Cultura",
  usage: "Uso",
  use: "Uso",
  accessibility: "Accessibilità",
  bugs: "Bug",
  hazards: "Pericoli",
  physics: "Fisica",
  rumors: "Voci",
  legacy: "Eredità",
  overview: "Panoramica",
  biography: "Biografia",
  personality: "Carattere",
  "flora & fauna": "Flora e fauna",
  planets: "Pianeti",
  "initial conversation": "Prima conversazione",
  "introduction dialogue": "Dialogo iniziale",
  "introduction dialog": "Dialogo iniziale",
  "followup conversation": "Conversazione successiva",
  "follow-up conversation": "Conversazione successiva",
  "follow-up dialog": "Dialogo successivo",
  "secondary dialogue": "Dialogo secondario",
  "secondary dialog": "Dialogo secondario",
  "question menu": "Domande",
  "first loop": "Primo ciclo",
  "second loop": "Secondo ciclo",
  "third loop": "Terzo ciclo",
  "see also": "Vedi anche",
  videos: "Video",
  "list of achievements": "Elenco degli obiettivi",
  achievements: "Obiettivi",
  controls: "Comandi",
  walkthrough: "Soluzione",
  strategy: "Strategia",
  tips: "Consigli",
};

// Etichette delle schede (infobox)
const ETICHETTE = {
  species: "Specie",
  planet: "Pianeta",
  location: "Luogo",
  gender: "Genere",
  type: "Tipo",
  inhabitants: "Abitanti",
  gravity: "Gravità",
  creator: "Creatore",
  purpose: "Scopo",
  "developer(s)": "Sviluppo",
  "publisher(s)": "Editore",
  engine: "Motore",
  "platform(s)": "Piattaforme",
  "release date(s)": "Uscita",
  "genre(s)": "Genere",
  "mode(s)": "Modalità",
  "media/distribution": "Distribuzione",
  stores: "Negozi",
  "rating(s)": "Classificazione",
  website: "Sito",
  "other works": "Altre opere",
  status: "Stato",
  age: "Età",
  occupation: "Occupazione",
  affiliation: "Affiliazione",
  orbit: "Orbita",
  moons: "Lune",
  size: "Dimensioni",
  "first appearance": "Prima apparizione",
};

// Categorie
const CATEGORIE = {
  characters: "Personaggi",
  locations: "Luoghi",
  alpha: "Versione alpha",
  technology: "Tecnologia",
  "ash twin project members": "Membri dell'Ash Twin Project",
  planets: "Pianeti",
  gameplay: "Come si gioca",
  "outer wilds ventures members": "Membri di Outer Wilds Ventures",
  travelers: "Viaggiatori",
  races: "Specie",
  moons: "Lune",
  stubs: "Pagine da completare",
  modding: "Mod",
  creatures: "Creature",
  phenomena: "Fenomeni",
  "mod characters": "Personaggi delle mod",
  "outer wilds wiki": "La wiki",
  videos: "Video",
  "pages to be merged": "Pagine da unire",
  "pages to be moved": "Pagine da spostare",
  relics: "Reliquie",
  person: "Persone reali",
  guides: "Guide",
  community: "Comunità",
};

const chiave = (t) => String(t || "").replace(/\s+/g, " ").trim().toLowerCase();

function sezione(t) {
  return SEZIONI[chiave(t)] || null;
}

function etichetta(t) {
  const pulita = String(t || "").replace(/\s+/g, " ").trim();
  return ETICHETTE[chiave(pulita)] || pulita;
}

// "Locations on Giant's Deep" → "Luoghi: Giant's Deep"
function categoria(nome) {
  const k = chiave(nome);
  if (CATEGORIE[k]) return CATEGORIE[k];
  const luogo = /^locations (?:on|in) (?:the )?(.+)$/i.exec(String(nome).trim());
  if (luogo) return `Luoghi: ${luogo[1][0].toUpperCase()}${luogo[1].slice(1)}`;
  return String(nome).trim();
}

module.exports = { slug, titolo, assegnaId, normalizza, sezione, etichetta, categoria };
