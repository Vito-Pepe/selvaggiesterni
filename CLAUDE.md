# Istruzioni per Claude (selvaggiesterni)

## Lingua

Rispondi sempre in italiano, anche nei commit, nelle PR e nei commenti al codice.

## Raspberry Pi: infrastruttura condivisa

Questa app gira su un Raspberry Pi 5 insieme ad altre app (Docker + Tailscale). L'elenco di tutto ciò che è già occupato sul Pi (porte, cartelle, progetti compose, container, reti e bridge, firewall, volumi, dispositivi e percorsi Tailscale, cron, nomi dei cookie) è nel file **`INFRASTRUTTURA-PI.md` della repo `Vito-Pepe/sillabe`**:
https://raw.githubusercontent.com/Vito-Pepe/sillabe/main/INFRASTRUTTURA-PI.md

- **Leggilo prima** di scegliere o cambiare porte, nomi, reti, volumi, `tailscale serve`/funnel, cron o firewall, e prima di dare comandi da eseguire sul Pi. Non dare per libero niente di ciò che elenca; nel dubbio fai lanciare all'utente i comandi della sua sezione 9 e lavora sul loro output.
- Se non riesci a scaricarlo, aggiungi la repo `Vito-Pepe/sillabe` alla sessione e leggilo da lì.
- **Tienilo aggiornato**: se il tuo lavoro aggiunge, cambia o toglie qualcosa di infrastrutturale sul Pi, aggiorna `INFRASTRUTTURA-PI.md` nella repo `Vito-Pepe/sillabe` (aggiungila alla sessione con accesso in scrittura) con una PR, e dai all'utente il link diretto. Fallo nello stesso lavoro, non "dopo".
- Mai `tailscale serve` sull'host del Pi per una nuova app: gli indirizzi HTTPS si aggiungono nella repo `Vito-Pepe/ingressi-https`.

## Come lavorare con l'utente

- Il Pi segue `main`. Lavora su un branch e apri una PR verso `main`; l'utente la unisce su GitHub con **"Create a merge commit"** e non cancella il branch. Dai sempre il **link diretto** della PR e, prima di chiedere di unirla, verifica che sia ancora aperta.
- Claude non può fare SSH sul Pi: prepara i comandi a blocchi, da incollare uno alla volta, con l'output atteso. Segreti solo nel `.env` sul Pi, mai su git.
- Claude non può creare repo su GitHub (403): se serve una repo nuova, chiedi all'utente di crearla (Public, con "Add a README file").
- Una repo nuova che girerà sul Pi deve avere anche lei un `CLAUDE.md` con queste istruzioni (copialo da una delle repo esistenti).

## Note su questa repo

- È la copia privata della **wiki di Outer Wilds** su Fandom (`outerwilds.fandom.com`, testi CC BY-SA 3.0). Niente build né altro: solo la wiki da consultare. Struttura presa dalla Wiki di `infernotuffatori` (stesso stile di server, aggiornatore, novità, blocchi sicuri), ma qui le pagine si leggono **già impaginate** dalla wiki (`action=parse`) e non dal wikitesto.
- Il Pi aggiorna la copia **una volta al giorno** (`server/wiki/aggiornatore.js`) e la tiene nel volume (`/data/copia/`: `wiki.json`, `stato.json`, `novita.json`, `immagini/` con il registro `immagini.json`). Se la wiki non risponde o arriva a metà (`controlla` in `server/wiki/copia.js`) resta la copia di prima. **Non c'è una copia di riserva dentro l'immagine** (la repo è pubblica: i testi della wiki non vanno su git): al primo avvio il server scarica tutto da solo; i testi sono pronti in qualche minuto, le immagini arrivano dopo (sono circa 540, Fandom le prepara al momento).
- `server/wiki/html.js` legge l'HTML della wiki; `server/wiki/blocchi.js` lo trasforma in **blocchi sicuri** (formato in testa al file): niente HTML della wiki arriva al browser, l'app disegna tutto con `createElement`/`textContent` (`app/se-pagina.js`). Se la wiki usa una struttura nuova (classi CSS, template), insegnala lì e aggiungi un caso in `test/blocchi.test.js`.
- **Pagine scartate** (`motivoScarto` in `server/wiki/copia.js`): l'elenco `ESCLUSE` (oggi una pagina vandalizzata, "Brenton Tarrant"), quelle nella categoria "Candidates for deletion" e quelle senza categorie e quasi vuote (< 1000 caratteri di wikitesto: "Universe" è senza categorie ma lunga, e resta). Si vedono in Informazioni e nelle Novità.
- **Pagine trattenute**: se sulla wiki una pagina viene svuotata o scende sotto il 30% del testo di prima (vandalismi), per 7 giorni resta la versione di prima (campo `trattenute` della copia). Per questo `wiki.json` tiene le immagini con i **nomi della wiki**: il server le traduce nei file sul Pi solo quando carica la copia (`applica` in `server/wiki/immagini.js`).
- Pagine **rinominate** nelle Novità: solo se nello stesso aggiornamento il titolo vecchio sparisce, quello nuovo compare e il vecchio ora rimanda proprio lì (`server/wiki/differenze.js`), come in infernotuffatori: niente abbinamenti a occhio.
- Immagini: copie ridotte a 800 px (Fandom le manda in WebP: circa 65 MB in tutto, le GIF animate sono le più grandi), nome del file con lo sha1 dell'originale (cache lunga nel browser). Gli SVG si servono con una CSP `sandbox`. Le immagini sono in gran parte schermate del gioco: **l'app resta privata** (LAN, tailnet e dispositivo condiviso), mai sul funnel pubblico.
- **Cloudflare blocca le immagini dal Pi** (2026-11-27): dall'indirizzo di casa `static.wikia.nocookie.net` passa da Cloudflare, che risponde 403 "Just a moment..." (verifica da browser) sia all'app sia a `curl`; dal cloud invece risponde normale. **Non aggirarlo** (niente User-Agent da browser, niente risolutori di verifiche). L'app si ferma alla prima risposta 403/429 (`bloccato` in `prepara`), tiene nel registro l'indirizzo Fandom delle immagini senza file e le serve come `{ u }`: le carica il browser, l'unica origine esterna nella CSP (`ORIGINE_FANDOM`). L'aggiornatore riprova solo le immagini (`aggiornaImmagini`): dopo 1 ora, poi il doppio fino a 12 ore, ogni volta prima con una richiesta sola. Una ogni 2 secondi (`WIKI_PAUSA_IMMAGINI_MS`).
- Testi in inglese come sulla wiki; in italiano solo l'interfaccia, i titoli delle sezioni più comuni, le etichette delle schede e i nomi delle categorie generiche (`server/wiki/nomi.js`). I nomi propri del gioco restano come sulla wiki.
- **Spoiler visibili, per scelta dell'utente**: la copia è per chi ha già finito il gioco. Niente avvisi né etichette: il riquadro "This article contains spoilers" della wiki si toglie (`blocchi.js`). Non rimettere avvisi o pagine nascoste.
- Nelle richieste verso la wiki l'app si presenta con il profilo `https://github.com/Vito-Pepe` (`AGENTE` in `server/wiki/rete.js`), una richiesta alla volta con una pausa.
- Prove: `npm test` (wiki finta in `test/finta-wiki.js`, niente rete). Con i dati veri: `node strumenti/scarica-wiki.js dati-prova` e poi `DATA_DIR=dati-prova AGGIORNA_WIKI=0 node server/server.js` (porta 3000). Da una sessione cloud servono `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` e i domini `outerwilds.fandom.com` e `static.wikia.nocookie.net` permessi nelle impostazioni dell'ambiente.
- Il dispositivo `selvaggiesterni` si **condivide** con persone fuori dalla tailnet, come `infernotuffatori`: il suo ingresso (repo `ingressi-https`) **non** usa `network_mode: host` ma la rete `ingresso-selvaggiesterni` con l'app (alias `selvaggiesterni-app`). Non riportarlo sulla rete del Pi: in modalità utente Tailscale girerebbe ogni porta del dispositivo sul `127.0.0.1` del Pi. La rete la crea `ingressi-https`, che va avviata prima dell'app.
