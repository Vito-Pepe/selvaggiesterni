# Selvaggi Esterni

La **wiki di Outer Wilds** sul Raspberry Pi: una copia privata della [Outer Wilds Wiki](https://outerwilds.fandom.com/wiki/Outer_Wilds_Wiki) di Fandom, da consultare quando si vuole senza passare dal sito (anche quando il sito non risponde). Il Pi la aggiorna da solo una volta al giorno.

- Pagina: `https://selvaggiesterni.<tailnet>.ts.net` (indirizzo della repo `ingressi-https`), oppure in casa `http://192.168.1.22:8096`.
- Il dispositivo `selvaggiesterni` si può **condividere** da Tailscale (Machines → Share) con chi è fuori dalla tailnet, come Infernotuffatori: chi lo riceve vede solo la wiki.
- Si apre anche dal riquadro **Selvaggi Esterni** della homepage.
- Su iPhone: Safari → Condividi → "Aggiungi alla schermata Home".

## Cosa fa

- **Inizio**: ricerca, le sezioni della pagina principale della wiki (corpi celesti, viaggiatori, per cominciare), le pagine modificate di recente sulla wiki, e i collegamenti a categorie, indice e una pagina a caso.
- **Pagina**: tutto il testo della wiki, con:
  - la scheda (infobox) con le immagini, anche quelle a linguette;
  - l'indice della pagina;
  - dialoghi annidati, elenchi, tabelle (quelle chiuse sulla wiki si aprono toccandole), gallerie, note;
  - i riquadri di navigazione in fondo.
  
  I link portano alle altre pagine della copia, anche quando sulla wiki passano da un rimando. Le immagini si ingrandiscono toccandole. In fondo ci sono il link alla pagina originale e alla sua cronologia, con gli autori.
- **Categorie**, ad albero, e la pagina di ogni categoria con le sue pagine.
- **Dalla A alla Z**: tutte le pagine, con un filtro sul titolo.
- **Ricerca** in titoli, rimandi e testi (tutte le parole, senza badare ad accenti e maiuscole).
- **Novità**: a ogni aggiornamento, pagine nuove, modificate (con il commento di chi le ha cambiate), rinominate e tolte. C'è un pallino sul menu quando ce ne sono di nuove.
- **Informazioni**: stato degli aggiornamenti, pagine non copiate e pagine tenute com'erano, e il pulsante **Aggiorna adesso dalla wiki**.

### Spoiler

È pensata per chi ha già finito il gioco: racconta tutto di Outer Wilds e di Echoes of the Eye, finali compresi, senza nascondere niente. Il riquadro "This article contains spoilers!" della wiki qui non c'è.

### Lingua

I testi sono in inglese, come sulla wiki. In italiano ci sono l'interfaccia, i titoli delle sezioni più comuni ("Trivia" → "Curiosità"), le etichette delle schede e i nomi delle categorie generiche; i nomi propri del gioco restano come sulla wiki.

## Come resta aggiornata

Una volta al giorno (e con il pulsante in Informazioni, al massimo ogni 10 minuti) il server:

1. legge dalla wiki l'elenco delle pagine, i rimandi e le categorie;
2. scarica ogni pagina già impaginata dalla wiki e la trasforma in blocchi semplici (testo, link, immagini, tabelle): niente HTML della wiki arriva al browser;
3. scarica le immagini nuove o cambiate (ridotte a 800 px, in WebP; quelle che non cambiano non si riscaricano);
   Una ogni 2 secondi, perché dal Pi le immagini passano da Cloudflare. Se Cloudflare blocca il Pi e chiede una verifica da browser ("Just a moment…"), l'app non insiste e non prova ad aggirarla. Le immagini che mancano le carica il browser di chi guarda direttamente da Fandom, quindi si vedono lo stesso. Il Pi riprova da solo: dopo un'ora, poi ogni 2, 4, 8, fino a 12 ore, e ogni tentativo comincia con una richiesta sola. In Informazioni si vede quante immagini sono sul Pi e quante vengono da Fandom.
4. controlla che la copia sia completa e la mette in uso; se la wiki non risponde, o risponde a metà, resta quella di prima.

Non si copiano le pagine vuote, quelle che la wiki sta per cancellare e quelle vandalizzate (senza categorie e quasi vuote, più un elenco a mano). Se una pagina viene svuotata all'improvviso sulla wiki, per una settimana resta la versione di prima.

Al primo avvio la copia non c'è: il server la scarica subito. I testi sono pronti in qualche minuto, le circa 540 immagini (circa 65 MB) arrivano dopo: Fandom le prepara al momento, ci vogliono una ventina di minuti.

## Licenze

- I **testi** sono dei volontari della Outer Wilds Wiki, con licenza [CC BY-SA 3.0](https://www.fandom.com/licensing): ogni pagina dell'app cita la fonte e porta alla pagina originale e alla sua cronologia (autori). La copia sta solo nel volume del Pi, non in questa repo.
- Le **immagini** vengono dalla wiki e sono in gran parte schermate del gioco (© Mobius Digital, Annapurna Interactive). Per questo l'app resta **privata**: in casa, nella tailnet e per chi riceve il dispositivo condiviso, mai su Internet.
- Il codice di questa repo è nostro.

## Sul Pi

| | |
|---|---|
| Cartella | `~/selvaggiesterni` |
| Progetto compose | `selvaggiesterni`, container `selvaggiesterni-selvaggiesterni-1` |
| Porta | `8096` (LAN e Pi), interna `3000` |
| Volume | `selvaggiesterni_dati`: copia della wiki, immagini, novità, stato |
| HTTPS | dispositivo `selvaggiesterni` della repo `ingressi-https`, **condivisibile**: arriva all'app dalla rete Docker `ingresso-selvaggiesterni` (alias `selvaggiesterni-app`), non dalla rete del Pi |
| Aggiornamento del codice | `update.sh` dal cron ogni 5 minuti |
| Controllo di salute | `GET /api/salute` ogni 60 s (il guardiano la riavvia se si blocca) |

Esce su Internet solo per leggere la wiki (`outerwilds.fandom.com`) e le sue immagini (`static.wikia.nocookie.net`), una richiesta alla volta; non riceve niente da Internet. Le immagini che il Pi non ha, il browser le carica da `static.wikia.nocookie.net`: è l'unico sito esterno che la pagina può usare, e solo per le immagini (Content-Security-Policy).

### Prima installazione

Prima va avviato il servizio `selvaggiesterni` della repo `ingressi-https`: crea la rete `ingresso-selvaggiesterni`, che l'app usa (`external: true`). Altrimenti `docker compose up` si ferma con `network ingresso-selvaggiesterni declared as external, but could not be found`. Poi:

```bash
cd ~ && git clone https://github.com/Vito-Pepe/selvaggiesterni.git
cd ~/selvaggiesterni && docker compose up -d --build
```

e la riga del cron:

```
*/5 * * * * cd /home/pepe/selvaggiesterni && ./update.sh >> /home/pepe/selvaggiesterni/update.log 2>&1
```

### Comandi utili

```bash
docker logs --tail 50 selvaggiesterni-selvaggiesterni-1     # cosa sta facendo (righe "wiki: ...")
curl -s http://127.0.0.1:8096/api/aggiornamento               # stato dell'ultimo aggiornamento
curl -s -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8096/api/aggiornamento   # aggiorna adesso
```

## Sviluppo

Node 22, nessuna dipendenza.

```bash
npm test                                         # prove con una wiki finta, senza rete
node strumenti/scarica-wiki.js dati-prova        # scarica la wiki vera in dati-prova/
DATA_DIR=dati-prova AGGIORNA_WIKI=0 node server/server.js   # http://localhost:3000
```

| File | Cosa fa |
|---|---|
| `server/server.js` | pagine dell'app, API (`/api/indice`, `/api/pagina/<id>`, `/api/cerca?q=`, `/api/novita`, `/api/aggiornamento`, `/api/salute`), immagini |
| `server/wiki/rete.js` | richieste alla wiki, una alla volta, con pausa e nuovi tentativi |
| `server/wiki/sorgenti.js` | cosa chiedere all'API della wiki |
| `server/wiki/html.js` | lettore HTML |
| `server/wiki/blocchi.js` | HTML della wiki → blocchi sicuri (formato in testa al file) |
| `server/wiki/copia.js` | la copia: pagine, categorie, home, scartate e trattenute, controlli |
| `server/wiki/immagini.js` | immagini scaricate e registro |
| `server/wiki/differenze.js` | Novità |
| `server/wiki/cerca.js` | ricerca |
| `server/wiki/aggiornatore.js` | aggiornamento giornaliero |
| `server/wiki/nomi.js` | identificativi e traduzioni |
| `app/` | l'app (`se-base.js`, `se-pagina.js`, `se-viste.js`, `se-app.js`, `selvaggiesterni.css`) |
