// Una wiki finta, con poche pagine, che risponde come l'API di MediaWiki di Fandom: per provare
// scaricamento, copia, immagini e server senza rete.
const WIKI = "https://outerwilds.fandom.com";
const CDN = "https://static.wikia.nocookie.net/outerwilds_gamepedia/images";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

const spoiler = `<div style="background:#000"><table><tbody><tr><td><p><i>This article contains spoilers!</i> Please play the game before reading any of this!</p></td></tr></tbody></table></div>`;

function immagine(nome, w = 200, h = 100) {
  const chiave = nome.replace(/ /g, "_");
  return `<span typeof="mw:File"><a href="${CDN}/a/ab/${chiave}/revision/latest" class="mw-file-description image"><img src="data:image/gif;base64,R0lGOD" data-src="${CDN}/a/ab/${chiave}/revision/latest/scale-to-width-down/${w}" width="${w}" height="${h}" class="mw-file-element lazyload" data-image-name="${nome}" data-image-key="${encodeURIComponent(chiave)}" /></a></span>`;
}

function pagineIniziali() {
  return {
    "Outer Wilds Wiki": {
      pageid: 1,
      categorie: [],
      html: `<div class="mw-parser-output"><div class="rfpbox"><div class="heading">Astronomical objects</div><div class="body"><div class="iconlink"><div class="icon"><a href="/wiki/Timber_Hearth">${immagine("Timberhearth 1.png").replace(/<a [^>]*>|<\/a>/g, "")}</a></div><div class="text"><a href="/wiki/Timber_Hearth" title="Timber Hearth">Timber Hearth</a></div></div><div class="iconlink"><div class="text"><a href="/wiki/The_Interloper">The Interloper</a></div></div></div></div><div class="rfpbox"><div class="heading">Wiki</div><div class="body"><ul><li><a href="/wiki/Special:RecentChanges">Recent changes</a></li></ul></div></div><div class="rfpbox"><div class="heading">Basics</div><div class="body"><ul><li><a href="/wiki/Category:Characters" title="Category:Characters">Characters</a></li></ul></div></div></div>`,
    },
    "Timber Hearth": {
      pageid: 2,
      categorie: ["Planets", "Locations"],
      commento: "più dettagli",
      html: `<div class="mw-content-ltr mw-parser-output">${spoiler}<p class="mw-empty-elt"></p><aside role="region" class="portable-infobox"><h2 class="pi-item pi-header">Timber Hearth</h2><figure class="pi-item pi-image">${immagine("TH.png", 270, 150)}</figure><div class="pi-item pi-data"><h3 class="pi-data-label">Type</h3><div class="pi-data-value">Planet</div></div><div class="pi-item pi-data"><h3 class="pi-data-label">Inhabitants</h3><div class="pi-data-value"><a href="/wiki/Gabbro" title="Gabbro">Gabbro</a> (sometimes)</div></div></aside>
<p><b>Timber Hearth</b> is the home planet of the <a href="/wiki/Hearthian" title="Hearthian">Hearthians</a>. It is near <a href="/wiki/The_Interloper" class="mw-redirect">The Interloper</a>, see <a href="#Village">the village</a> and <a href="https://example.org/x" class="external text">a site</a> and <a href="/index.php?title=Nope&amp;action=edit&amp;redlink=1" class="new">a red link</a>.</p>
<h2><span class="mw-headline" id="Village">Village</span></h2>
<figure class="mw-default-size">${immagine("Village.png", 300, 200)}<figcaption>The <a href="/wiki/Village">village</a></figcaption></figure>
<p>The village has a museum. Ghost matter is dangerous.<sup id="cite_ref-1" class="reference"><a href="#cite_note-1"><span class="cite-bracket">[</span>1<span class="cite-bracket">]</span></a></sup></p>
<h2><span class="mw-headline" id="Trivia">Trivia</span></h2>
<ul><li>First fact<ul><li>Nested fact</li></ul></li><li>Second fact</li></ul>
<table class="navbox"><tbody><tr><td><table class="nowraplinks"><tbody><tr><th class="navbox-title"><span class="noprint navbar"><a href="/wiki/Template:Planets">v</a></span><a href="/wiki/Category:Planets" title="Category:Planets">Planets</a></th></tr><tr><td class="navbox-list"><strong class="mw-selflink selflink">Timber Hearth</strong> • <a href="/wiki/Interloper">Interloper</a></td></tr></tbody></table></td></tr></tbody></table>
<div class="mw-references-wrap"><ol class="references"><li id="cite_note-1"><span class="mw-cite-backlink"><a href="#cite_ref-1">↑</a></span> <span class="reference-text">From the game.</span></li></ol></div></div>`,
    },
    Gabbro: {
      pageid: 3,
      categorie: ["Characters", "Travelers"],
      html: `<div class="mw-parser-output"><p><b>Gabbro</b> lives on <a href="/wiki/Timber_Hearth#Village">Timber Hearth</a>. Plays the flute.</p>
<h2><span class="mw-headline" id="Dialogue">Dialogue</span></h2>
<dl><dd>"Hey."<dl><dd>"Hello."</dd></dl></dd></dl>
<ul class="gallery mw-gallery-traditional"><li class="gallerybox"><div class="thumb">${immagine("Gabbro.jpg", 120, 80)}</div><div class="gallerytext">Gabbro playing</div></li><li class="gallerybox"><div class="thumb">${immagine("Missing.png")}</div><div class="gallerytext"></div></li></ul>
<table class="wikitable mw-collapsible mw-collapsed"><tbody><tr><th>Hidden title</th></tr><tr><td>Hidden text</td></tr></tbody></table>
<div class="thumb embedvideo"><div class="embedvideowrap"><p><iframe src="//www.youtube.com/embed/P54o23oLziE?" width="335"></iframe></p></div></div></div>`,
    },
    Interloper: { pageid: 4, categorie: ["Planets"], html: `<div class="mw-parser-output"><p>The <b>Interloper</b> is a comet. It is made of ice and ghost matter.</p></div>` },
    Universe: { pageid: 5, categorie: [], lunghezza: 8000, html: `<div class="mw-parser-output"><p>The universe is old and about to end.</p></div>` },
    "Brenton Tarrant": { pageid: 6, categorie: [], lunghezza: 24, html: `<div class="mw-parser-output"><p>Name</p></div>` },
    "Geyser pools": { pageid: 7, categorie: [], lunghezza: 0, html: `<div class="mw-parser-output"></div>` },
    "Game Praise": { pageid: 8, categorie: ["Candidates for deletion"], lunghezza: 390, html: `<div class="mw-parser-output"><p>Great game.</p></div>` },
  };
}

class FintaWiki {
  constructor() {
    this.pagine = pagineIniziali();
    this.rimandi = { "The Interloper": "Interloper", "Hearth": "Timber Hearth" };
    this.genitori = { "Category:Planets": ["Category:Locations"], "Category:Travelers": ["Category:Characters"] };
    this.immagini = { "Timberhearth 1.png": "s1", "TH.png": "s2", "Village.png": "s3", "Gabbro.jpg": "s4" };
    this.rev = 100;
    this.richieste = [];
    // Cloudflare: dopo quante immagini scaricate comincia a chiedere la verifica da browser
    // (null = mai)
    this.bloccoDopo = null;
    this.immaginiDate = 0;
    this.scarica = this.scarica.bind(this);
  }

  cambia(titolo, html, extra = {}) {
    const p = this.pagine[titolo] || { pageid: 100 + Object.keys(this.pagine).length, categorie: ["Characters"] };
    this.pagine[titolo] = { ...p, ...extra, html, rev: ++this.rev };
  }

  togli(titolo) {
    delete this.pagine[titolo];
  }

  async scarica(url, opz = {}) {
    this.richieste.push(url);
    const u = new URL(url);
    if (u.host === "static.wikia.nocookie.net") {
      if (url.includes("Rotta")) throw Object.assign(new Error("static.wikia.nocookie.net ha risposto 404"), { stato: 404 });
      if (this.bloccoDopo != null && this.immaginiDate >= this.bloccoDopo) {
        throw Object.assign(new Error("static.wikia.nocookie.net ha risposto 403 (verifica da browser di Cloudflare)"), { stato: 403, sfida: true });
      }
      this.immaginiDate++;
      return { dati: url.includes(".png") ? PNG : WEBP, tipo: "image/webp" };
    }
    const q = Object.fromEntries(u.searchParams);
    if (q.meta === "siteinfo") {
      return { query: { general: { sitename: "Outer Wilds Wiki", mainpage: "Outer Wilds Wiki", server: WIKI, articlepath: "/wiki/$1" }, rightsinfo: { url: "https://www.fandom.com/licensing", text: "CC BY-SA 3.0" }, statistics: { articles: 6 } } };
    }
    if (q.generator === "allpages" && q.gapnamespace === "14") {
      return { query: { pages: Object.entries(this.genitori).map(([t, g], i) => ({ pageid: 900 + i, title: t, categories: g.map((x) => ({ title: x })) })) } };
    }
    if (q.generator === "allpages" && q.prop === "redirects") {
      const pagine = Object.entries(this.pagine).map(([t, p]) => ({ pageid: p.pageid, title: t, redirects: Object.entries(this.rimandi).filter(([, a]) => a === t).map(([da]) => ({ title: da })) }));
      return { query: { pages: pagine } };
    }
    if (q.generator === "allpages") {
      return {
        query: {
          pages: Object.entries(this.pagine).map(([t, p]) => ({
            pageid: p.pageid,
            title: t,
            length: p.lunghezza ?? p.html.length * 2,
            lastrevid: p.rev || p.pageid,
            revisions: [{ revid: p.rev || p.pageid, timestamp: "2026-11-01T10:00:00Z", comment: p.commento || "" }],
          })),
        },
      };
    }
    if (q.action === "parse") {
      const [t, p] = Object.entries(this.pagine).find(([, x]) => String(x.pageid) === q.pageid) || [];
      if (!p) return { error: { code: "missingtitle", info: "The page you specified doesn't exist." } };
      return { parse: { title: t, pageid: p.pageid, revid: p.rev || p.pageid, text: p.html, categories: [...p.categorie.map((c) => ({ category: c.replace(/ /g, "_") })), { category: "Hidden_stuff", hidden: true }] } };
    }
    if (q.prop === "imageinfo") {
      const titoli = q.titles.split("|");
      return {
        query: {
          pages: titoli.map((t, i) => {
            const nome = t.replace(/^File:/, "");
            if (!this.immagini[nome]) return { title: t, missing: true, ns: 6, pageid: -1 - i };
            const chiave = nome.replace(/ /g, "_");
            return { title: t, ns: 6, imageinfo: [{ width: 1200, height: 600, thumbwidth: 800, thumbheight: 400, sha1: this.immagini[nome], mime: "image/png", url: `${CDN}/a/ab/${chiave}/revision/latest`, thumburl: `${CDN}/a/ab/${chiave}/revision/latest/scale-to-width-down/800` }] };
          }),
        },
      };
    }
    throw new Error(`richiesta non prevista: ${url}`);
  }
}

module.exports = { FintaWiki, WIKI, PNG, WEBP };
