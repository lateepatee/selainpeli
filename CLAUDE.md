# Zombiareena: ohjeet agenteille

Kilpailullinen zombiräiskintä selaimessa 2–6 pelaajalle. Pelaajat ja säännöt: README.md.
Peliä kehittää agenttitiimi (Orca-orkestrointi), jota johtaa koordinaattori: `agentit/koordinaattori.md`.

## Teema pysyy

Nämä ovat pelin ydin. Niitä ei muuteta ilman projektin omistajan erillistä lupaa:

- **Pimeys ja valo:** näkyvyys on rajattu, lamput ja taskulamppu ratkaisevat. Vastustaja pimeässä on näkymätön.
- **Kaikki vastaan kaikki:** erän viimeinen eloonjäänyt voittaa, erässä ei synnytä uudelleen.
- **Zombit kiipeävät ikkunoista** ja myrkkysumu kaventaa kenttää, joten paikallaan ei voi pysyä.
- **Selainpeli ilman asennuksia:** pelaaja avaa linkin (GitHub Pages) ja pelaa, eikä mitään asenneta. Peli on staattisia tiedostoja: ei käännösvaihetta, ei omaa palvelinta. Moninpeli P2P:nä (PeerJS), host ajaa pelin. Kirjastoja saa käyttää vain alla olevin ehdoin (Kirjastot).
- **Suomenkielinen** käyttöliittymä, kommentit ja commit-viestit.

Muuten saa ehdottaa rohkeasti, yllättäviäkin asioita. **Jokainen uusi ominaisuus ja isompi muutos hyväksytetään ensin omistajalla** (koordinaattorin kautta). Agentti ei laajenna tehtäväänsä omin päin, vaan kirjaa ideat ehdotuksiksi.

## Arkkitehtuuri

- **Simulaatio** (ei DOMia, toimii myös Nodessa): `game.js` (vaiheet, erät, pisteet, `step`), `zombies.js`, `boss.js`, `weapons.js`, `bot.js`, `map.js` + `maps.js`, `geometry.js`, `vision.js`, `constants.js`, `protocol.js`. Pidä nämä DOM-vapaina, ettei simulaattori ja testit hajoa.
- **Selain:** `host.js` (ajaa simulaatiota ja lähettää tilan), `client.js` (liittyjä, ennustaa oman liikkeen), `render.js`, `sound.js`, `input.js`, `chat.js`, `appearance.js`, `main.js`.
- `step(world, inputs, dt)` palauttaa tapahtumat (`events`), joista ääni ja piirto reagoivat.
- `map.js` pitää nykyistä kenttää moduulin tilassa (`setMap`), ja botit muistavat tilaa (`forgetBot`). Yksi maailma kerrallaan per prosessi.
- Satunnaisuus tulee suoraan `Math.random`ista. Simulaattori ja testit korvaavat sen siemenellisellä generaattorilla, älä lisää pelikoodiin omaa satunnaislähdettä ilman sopimista.
- **Liittyjän ennuste:** `movePlayer` ajetaan sekä hostilla että liittyjällä. Sen pitää laskea täsmälleen samoin, siksi väistö on tickeinä.
- **Verkko:** kaikki vieraalta koneelta tuleva data on epäluotettavaa ja tarkistetaan `protocol.js`:ssä. Chat ja nimet siistitään.
- Säädettävät arvot ovat `constants.js`:ssä ja aseiden/talouden arvot `weapons.js`:ssä.

## Työskentely

- Uusi asia omaan moduuliinsa, kun mahdollista (kuten `boss.js`). `game.js`, `render.js`, `protocol.js`, `constants.js` ja `index.html` ovat yhteisiä tiedostoja: rinnakkaiset agentit muokkaavat niitä vain, jos tehtävä sen nimenomaan sallii.
- Seuraa ympäröivän koodin tyyliä: englanninkieliset nimet, suomenkieliset kommentit, kommentoi miksi, ei mitä.
- **Verkkoviestin muoto muuttuu** → `PEER_PREFIX` (`protocol.js`) pitää nostaa. Työntekijä ei nosta sitä itse, vaan mainitsee asian raportissaan; koordinaattori nostaa mergen yhteydessä.
- **Ennen committia:** `python tools/versio.py` (pre-commit-tarkistus vaatii sen). Jos `index.html`:n import-kartta menee mergessä ristiin, ota kumpi tahansa versio ja aja `python tools/versio.py` uudelleen: tiedosto lasketaan sisällöstä.
- Pre-commit hylkää myös rivit, joissa on käyttäjän kotikansioon osoittavia absoluuttisia polkuja tai sähköpostiosoitteita. Käytä suhteellisia polkuja.
- Commit-viestit suomeksi, lyhyt otsikko kuten aiemmissa.
- **Ei koskaan:** `git push` (repo on julkinen ja main näkyy suoraan pelaajille), npm-paketteja tai kirjastoja ohi Kirjastot-osion, ulkoisia palveluita, `--no-verify`.

## Kirjastot

Repo on julkinen ja peli näkyy kaikille Pagesin kautta, joten jokainen vieras tiedosto on koodia, jota pelaajien selain ajaa. Kirjasto on sallittu vain, jos kaikki ehdot täyttyvät:

- **Omistaja hyväksyy sen ensin** (koordinaattorin kautta) ja tietää, mitä kirjasto tuo ja paljonko se painaa.
- **Vain selaimen puolelle**, esimerkiksi piirtoon tai ääneen. Simulaatiomoduulit ja testit pysyvät ilman kirjastoja, jotta ne toimivat Nodessa sellaisenaan.
- **Valmis selaintiedosto, ei asennusta eikä käännöstä.** Ensisijaisesti kopioidaan repoon `vendor/`-kansioon lukitulla versiolla, lisenssitiedostoineen (MIT, BSD, Apache tai vastaava). Tällöin CSP:n `'self'` riittää eikä CDN:n muutos voi vaikuttaa peliin. Jos tiedosto ladataan CDN:stä, versio on lukittu ja `integrity`-tarkistussumma pakollinen, kuten PeerJS:llä `index.html`:ssä.
- **CSP (`index.html`) avataan vain niin paljon kuin on pakko**, esimerkiksi yksi tarkka CDN-osoite. Uusia yhteysosoitteita (`connect-src`) ei lisätä.
- Kirjasto ja sen versio kirjataan README.md:hen, jotta päivitys on tietoinen päätös.

## Testaus

Jokaisessa muutoksessa `npm test` pitää mennä läpi. Pelillisissä muutoksissa lisäksi simulaattoriraportti ennen ja jälkeen, ja selainpelitestaus `agentit/pelitestaus.md`:n mukaan (kun ohje on valmis).

- Testit: `npm test` (`node:test`, `tests/`). Testit käyttävät pelin omia vakioita; tunnettu bugi merkitään `{ todo: '...' }` -testiksi.
- Paikallinen palvelin: `python -m http.server 8000`, peli osoitteessa http://localhost:8000. Kaksi välilehteä riittää moninpeliin, botit täyttävät loput.
- Pelilogiikkaa voi ajaa Nodessa suoraan (`package.json`: `"type": "module"`): `createWorld`, `addPlayer`, `startMatch`, ja silmukassa `step(world, inputs, TICK)` sekä `botInput(world, id, TICK)` jokaiselle botille. Neljän botin kokonainen ottelu laskeutuu alle sekunnissa.
- Tasapainosimulaattori: `node tools/sim/simuloi.mjs --matches 20 --seed 1` (ohje: `tools/sim/README.md`). Aja samalla siemenellä ennen ja jälkeen pelillisen muutoksen ja vertaa raportteja.
