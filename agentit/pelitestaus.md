# Selainpelitestaus

Toistettava savutesti, jolla agentti todistaa, että peli toimii oikeassa selaimessa kahdella pelaajalla. Aja se jokaisen pelillisen muutoksen jälkeen (`npm test` ja simulaattori eivät näe DOMia, verkkoa eikä piirtoa). Kesto noin 5 minuuttia, josta suurin osa on erän vaihtumisen odottamista.

Testi ei muuta pelikoodia eikä repoa. Kuvakaappaukset ja apuskriptit menevät omaan työhakemistoosi (scratchpad tai `$TEMP`), ei repoon.

> **Työkalusta:** ohje kirjoitettiin ja ajettiin alun perin Orcan sisäisellä selaimella (2026-10-24). Orca poistettiin käytöstä 2026-11-25, joten alla vaiheet on kuvattu työkalusta riippumatta: mitä tehdään, mistä elementistä ja mitä pitää näkyä. Käytä mitä tahansa selainautomaatiota, joka osaa avata kaksi välilehteä, klikata ja täyttää CSS-valitsimella, pitää näppäintä pohjassa, ajaa JS-lausekkeen sivulla, lukea konsolin ja ottaa kuvakaappauksen (esim. Playwright, Clauden selaintyökalut tai headless Chrome + DevTools-protokolla, jolla peliä testattiin jo 2026-10). Kun ajat ohjeen ensimmäisen kerran uudella työkalulla, kirjaa sen tarkat komennot tänne.

## Mitä tarvitaan

- Selainautomaatio (ks. yllä) ja Python 3 paikalliseen palvelimeen.
- Internetyhteys: moninpeli yhdistää PeerJS:n palvelimen (`0.peerjs.com`) kautta. Ilman sitä host näyttää `Ei verkkoyhteyttä (…), vain botit` eikä liittyminen onnistu.

## Tärkeimmät sudenkuopat (selvitetty kokeilemalla)

**Ruudunpäivitykset voivat hidastua taustalla.** Jos selainikkuna ei ole näkyvissä, Chromium voi antaa välilehdille vain noin 1,5 `requestAnimationFrame`-kutsua sekunnissa. Jos selain silti ilmoittaa `document.hidden = false`, pelin taustasäie (`main.js`, Worker-ticker) ei käynnisty. Seuraukset: peli etenee ruudunpäivitysten tahdissa ja `dt` katkaistaan 0,25 s:iin, joten simulaatio pyörii noin kolmasosanopeudella, ja alle ~0,7 s:n painallus voi jäädä huomaamatta. Tarkista ruudunpäivitysten määrä (`fps`, alla; pitää olla yli 50). Jos se on alhainen, aja testivälilehdellä tahdistin, joka korvaa sivun `requestAnimationFrame`n Workerin tahdilla. Se ei muuta pelikoodia. Jos löydät bugin, joka näkyy vain tahdistimen kanssa, toista se ilman tahdistinta ennen raportointia.

Hyödylliset JS-lausekkeet sivulla:

```js
// fps: ruudunpäivitykset sekunnissa (2 s mittaus)
new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })

// tahdistin: rAF Workerin 16 ms tahdilla. Katoaa sivun uudelleenlatauksessa, aja uudelleen.
(() => { if (window.__tahti) return 'jo päällä'; const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)']))); const q = []; w.onmessage = () => { const cbs = q.splice(0); const t = performance.now(); for (const cb of cbs) cb(t); }; window.requestAnimationFrame = (cb) => { q.push(cb); return 0; }; window.__tahti = true; return 'tahdistin päällä'; })()

// nykyinen kenttä (lukien; älä kutsu näin saatuja funktioita, esim. setMap, koska se sotkee pelin tilan)
import('./src/map.js').then(m => m.MAP_NAME)

// huonerivi
document.getElementById('roomtext').textContent
```

Lisäksi:
- **Näppäimet:** käytä näppäinarvoja `w a s d r q e Shift` (esim. "keydown w"). Orcassa `KeyW`-muotoinen koodi palautti ok mutta sivulle ei tullut tapahtumaa, ja välilyönti ei toiminut; tarkista uudella työkalulla. Liikkeeseen tarvitaan pito (keydown … odota … keyup), yksittäinen painallus kestää liian lyhyen hetken.
- **Ampuminen:** hiiri kohteeseen, vasen nappi alas, ~0,3 s, ylös. Laske koordinaatit `window.innerWidth/innerHeight`:sta, älä kuvakaappauksen koosta (ne voivat poiketa).
- **Testijärjestys:** liike, ammunta ja chat **lämmittelyssä** (hahmo herää 3 s:ssa). Erässä botit tappavat paikallaan seisovan testaajan sekunneissa, eikä erässä synnytä uudelleen.
- **Odottaminen:** DOM-tekstiä (`#roomtext`, aula, napit) voi odottaa suoraan. Canvasille piirrettyä (erä, chat, HUD) ei: kysele tilaa JS-lausekkeella tai ota kuva.
- **Virheet:** varmista, että työkalu kaappaa myös käsittelemättömät poikkeukset ja hylätyt lupaukset, ei vain `console.log`-viestejä, ja myös sivun ensimmäisen latauksen ajalta (lataa sivu tarvittaessa uudelleen kaappauksen alettua). Avaa testiin aina uudet välilehdet, jotta vanhat virheet eivät sekoitu.
- Peli piirtää kaiken pelinäkymän canvasille. DOMista luettavissa ovat vain aula (`#lobby`), huonerivi (`#roomtext`), napit ja chat-kenttä. Muu tarkistetaan kuvakaappauksista. Pelitilaa saa luettua dynaamisella importilla (import-kartta antaa saman moduuli-instanssin kuin pelillä).
- Chat-viesti näkyy canvasilla vain 10 s (`SHOW_TIME`, `chat.js`). Ota kuva heti lähettämisen jälkeen.
- Kuvat ovat tummia (pimeys on teema). Pienet tekstit (chat, HUD) näkyvät parhaiten rajattuna (chat: vasen alaneljännes, noin 0–40 % leveydestä ja 50–100 % korkeudesta).

## 1. Palvelin

Valitse portti (oletus 8000) ja tarkista, ettei se ole varattu (`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8000/` → `000` = vapaa). Käynnistä repon juuressa `python -m http.server 8000` taustalle.

Varmista, että palvelin palvelee juuri tämän kansion tiedostoja:

```sh
curl -s http://localhost:8000/index.html | md5sum; md5sum index.html   # tiivisteiden pitää täsmätä
```

Jos `index.html` tai moduulit ovat muuttuneet, aja `python tools/versio.py` ennen testiä. Muuten selain voi käyttää välimuistista vanhaa moduulia.

## 2. Host luo huoneen boteilla (välilehti H)

1. Avaa uusi välilehti `http://localhost:8000/`. Tarkista `fps` (yli 50, muuten tahdistin).
2. Täytä `#name` = `Hosti`, valitse `#bots` = `3` (Botteja 0–3), klikkaa `#host` ("Luo huone").
3. Odota tekstiä `Huone ` ja lue huonerivi: `Huone ABCD · 1 pelaaja`.
4. Kuva `01-host-lammittely`.

Odotettu tulos: aula katoaa, yläpalkissa `Huone ABCD · 1 pelaaja` ja napit *Aloita peli*, *Hahmo*, *Äänet*, *Kopioi linkki*, *Poistu*. Kuvassa lämmittelykenttä, pistetaulussa `Lämmittely` ja botit. Lämmittelyssä zombit voivat tappaa hostin heti (`Kuolit · Takaisin peliin 3 s`); se on normaalia.

Jos rivillä lukee `Luodaan huonetta…` yli 10 s tai `Ei verkkoyhteyttä`, PeerJS ei tavoita palvelintaan: kirjaa tämä ja keskeytä moninpeliosa.

## 3. Liittyjä samaan huoneeseen (välilehti J)

1. Poimi huonekoodi H:n huonerivistä (`Huone ([A-Z]{4})`).
2. Avaa toinen uusi välilehti, tarkista `fps`.
3. Täytä `#name` = `Liittyja`, `#code` = koodi ("Koodi"), klikkaa `#join` ("Liity").
4. Odota **H:n** riviltä `2 pelaajaa`. Lue molemmat huonerivit: `… · 2 pelaajaa` ja `Huone ABCD · ping N ms`.

Liittyjän rivillä lukee aluksi `ping –`, joten älä odota tekstiä `ping`. Vaihtoehtoinen reitti on linkki `http://localhost:8000/?huone=ABCD` (koodi täyttyy valmiiksi), mutta paina silti *Liity*.

## 4. Liikkuminen ja ampuminen lämmittelyssä (liittyjä)

Testaa liike, ammunta ja chat **ennen** kuin painat *Aloita peli* (ks. testijärjestys). Liittyjä on vaativampi kuin host, koska sen liike ennustetaan (`movePlayer`) ja hostin pitää hyväksyä se.

1. Kuva `03a-ennen` (jos kuvassa lukee "Kuolit · Takaisin peliin", odota 3 s ja ota uusi).
2. Pidä `w` pohjassa 1 s. Kuva `03b-liikkeen-jalkeen`.
3. Hiiri kohtaan (3/4 leveydestä, 1/4 korkeudesta), vasen nappi ~0,3 s. Kuva `03c-ammuttu`.

Odotettu tulos: hahmo on siirtynyt suhteessa seiniin. Kamera seuraa pelaajaa, joten vertaa kenttää, älä hahmon paikkaa ruudulla (paitsi kentän reunalla, jossa kamera pysähtyy). Ase osoittaa hiiren suuntaan, ja oikean alakulman ammusmäärä on pienentynyt (pistooli ampuu yhden laukauksen painallusta kohti, 8 → 7).

Muut näppäimet samalla tavalla: `r` (lataa), `q` (vaihda asetta), `e` (osta), `Shift` tai hiiren oikea nappi (väistö), kukin ~0,2 s.

## 5. Chat molempiin suuntiin

1. J: paina Enter (avaa `#chatinput`; `document.activeElement.id` pitää olla `chatinput`), kirjoita `Moi hosti, testiviesti 1`, Enter.
2. Heti kuva H:sta `04-host-chat`, rajaa chat-alue.
3. H: Enter, kirjoita `Vastaus 2 <b>ei html</b>`, Enter. Heti kuva J:stä `04-liittyja-chat`, rajaa.

Odotettu tulos: rajatun kuvan vasemmassa alakulmassa näkyy `Liittyja: Moi hosti, testiviesti 1` hostilla ja `Hosti: Vastaus 2 <b>ei html</b>` liittyjällä. HTML näkyy kirjaimellisesti, koska chat piirretään canvasille. Kirjoittaessa peli ei saa liikkua: `releaseAll` vapauttaa näppäimet.

## 6. Peli alkaa: molemmat näkevät saman pelin

H: klikkaa `#start` ("Aloita peli", vain hostilla). Odota 1 s, kuvat `05-host-era1` ja `05-liittyja-era1`, lue kentän nimi molemmista.

Tarkista kuvista:
- Kummassakin on keskellä lähtölaskenta ja `Erä 1 · <kenttä>`. Kentän nimi on sama kuin luettu `MAP_NAME`.
- Pistetaulu (`Pisteet (20)`) listaa samat 5 pelaajaa (Hosti, Liittyja, Botti 1–3), ja oma rivi on merkitty ▸:lla.
- HUD: 100 HP, 500 $, Pistooli 8 / ∞ (aseet nollautuvat erän alussa).

## 7. Erä vaihtuu

Erä päättyy, kun yksi on jäljellä. Testaajat seisovat paikallaan, joten zombit, botit tai sumu hoitavat sen yleensä 1–2 minuutissa. Kysele kentän nimeä 5 s välein enintään 3 minuuttia, älä odota sokkona. Kun nimi vaihtuu, lue se molemmista ja ota kuvat `06-host-era2` ja `06-liittyja-era2`.

Odotettu tulos: kenttä vaihtuu kummassakin samaksi, kuvissa `Erä 2 · <kenttä>`, ja pistetaulu on sama molemmilla. Edellisen erän voittaja on saanut `WIN_POINTS` ja on taulun kärjessä. Jos kenttä ei vaihdu 3 minuutissa, ota kuvat ja kirjaa jumi.

## 8. Konsoli ja kaatumiset

Lue molempien välilehtien kaatumiset ja konsoliviestit.

Odotettu tulos: 0 kaatumista ja 0 konsoliviestiä kummassakin. PeerJS ajetaan `debug: 1`:llä, joten se kirjoittaa konsoliin vain virheet. Mikä tahansa `error` tai `warning` on löydös. Kirjaa se sellaisenaan raporttiin.

## 9. Poistuminen ja siivous

1. J: klikkaa `#leave` ("Poistu"), odota 1,5 s. `!document.getElementById('lobby').hidden` pitää olla `true` (aula takaisin), ja H:n huonerivillä `… · 1 pelaaja`.
2. Virheet uudelleen molemmista: yhä 0.
3. Sulje välilehdet ja palvelin. `curl` palvelimeen → `000`.

## Raportti

Tiivis taulukko ja kuvien polut:

```
Selainpelitestaus (agentit/pelitestaus.md), haara X, portti 8000, työkalu Y
1 huone luotu         OK  Huone ABCD, 3 bottia
2 liittyminen         OK  ping 1 ms
3 liike + ammunta     OK  lämmittelyssä liittyjä liikkui, ammukset 8 → 6
4 chat                OK  molempiin suuntiin
5 sama peli           OK  Erä 1 · Kartano molemmilla, sama pistetaulu
6 erä vaihtuu         OK  45 s, Kartano → Varasto
7 konsoli/kaatumiset  OK  0 / 0
8 poistuminen         OK
Havainnot: …
```

Jos muutoksesi koskee jotain tiettyä (uusi ase, kenttä, HUD), lisää oma vaiheensa: vie hahmo paikalle näppäinten pidoilla, ota kuva ja kerro, mitä kuvassa pitää näkyä.

## Mitä ei voi testata automaattisesti

Agentti näkee vain yksittäisiä kuvia ja konsolin. Seuraavat jäävät omistajalle:

- **Äänet:** Web Audio syntetisoi äänet, eikä agentti kuule niitä. Agentti voi tarkistaa vain, ettei äänikoodi kaadu.
- **Tuntuma:** ohjauksen viive ja jouhevuus, aseiden voima, väistön ajoitus, zombien uhkaavuus, vaikeustaso ja se, onko peli hauska.
- **Luettavuus pimeässä:** kuvat ovat yksittäisiä ruutuja. Näkyykö vastustaja ajoissa, erottuvatko värit ja onko HUD selkeä liikkeessä, on silmämääräinen arvio.
- **Oikea verkko:** molemmat välilehdet ovat samalla koneella (ping 0–1 ms). Pakettihäviö, todellinen viive, NAT ja TURN eivät tule testatuiksi.
- **Muut selaimet ja laitteet:** Chromium-pohjainen testi ei kata Firefoxia, Safaria, mobiilia eikä heikkoja koneita (FPS).
- **Pitkä peli:** koko ottelu pisterajaan asti, Lyhtymies (erästä 3 alkaen, satunnainen) ja kaikki kentät. Nämä kannattaa todistaa simulaattorilla. Selaintesti näyttää vain, että piirto ja verkko toimivat.

### Miten kysyä omistajalta

Tee kokeilusta helppo ja kysymyksestä suljettu:

1. **Mistä kokeilla:** haara ja komento `python -m http.server 8000` siinä kansiossa, tai palvelin jätetään erikseen pyytäen päälle.
2. **Mitä kokeilla:** enintään 3 asiaa, noin 5 minuuttia, konkreettisesti: "osta haulikko Kartanon seinästä ja ammu zombilaumaa".
3. **Mitä verrata:** "tuntuuko X erilaiselta kuin mainissa".
4. **Valmiit vastausvaihtoehdot**, jotta vastaaminen on nopeaa. Esimerkki: "Haulikon rekyyli muutettu. Selaintesti ja npm test OK. Kokeiletko 5 min: osta haulikko ja ammu laumaa. Tuntuuko laukaus: sopiva / liian heikko / liian vahva / en ehdi nyt?"

Älä jää odottamaan tuntumakysymyksen vastausta, jos muu työ on valmis. Merkitse se raporttiin avoimeksi.

## Havainnot ohjeen ensimmäisistä ajoista (2026-10-24, Orcan selain)

Ohje ajettiin kokonaan läpi (huone QSAS, 3 bottia). Kaikki vaiheet menivät läpi: 0 kaatumista ja 0 konsoliviestiä kummassakaan välilehdessä, erä vaihtui 45 s:ssa (Kartano → Varasto). Kaksi aiempaa koeajoa paljasti ohjeeseen kirjatut sudenkuopat (ruudunpäivitysten hidastuminen, testijärjestys).

Pelistä löytyi kaksi asiaa, jotka eivät ole selviä bugeja mutta kannattaa näyttää omistajalle (2D-piirron aikaan; tarkista, koskevatko yhä 3D:tä):

1. **HUDin päälle piirtyy kenttää.** Varastossa arpalaatikon kehys osui oikean alakulman ammusmäärän (`8 / ∞`) kohdalle, ja teksti oli vaikea lukea. HUDilla ei ollut taustaa.
2. **Pelaajat erottuvat pimeässä himmeinä.** Pimeyskerroksen peittävyys oli 0,9–0,95, joten Hautausmaalla valaisematon vastustaja näkyi heikkona sinisenä hahmona, vaikka nimi ja HP oli oikein piilotettu. Koskee teemaa ("vastustaja pimeässä on näkymätön"), joten omistaja päättää.

Lisäksi: botti tappoi paikallaan seisovan liittyjän noin 2 s lähtölaskennan jälkeen. Tämä on odotettua pelattavuutta eikä bugi, mutta siksi testit tehdään lämmittelyssä.

## Testitila: myöhäinen peli ja bossi ilman koko ottelua

`src/testitila.js` vie hostin suoraan myöhäiseen peliin. Se aktivoituu vain, kun sivu on osoitteessa `localhost` tai `127.0.0.1` ja osoitteessa on `?testi=1`; julkisella Pagesilla parametreja ei lueta lainkaan, eikä liittyjä voi vaikuttaa niihin. Ruudun oikeassa alakulmassa näkyy keltainen `TESTITILA`-teksti ja käytössä olevat parametrit.

| Parametri | Vaikutus |
|---|---|
| `era=N` | peli alkaa erästä N; zombien määrä ja taso vastaavat sitä |
| `raha=N` tai `raha=max` | kaikille pelaajille rahaa (enintään `MONEY_CAP`) |
| `bossi=1` | Lyhtymies ilmestyy heti, kun erä alkaa (lähtölaskennan jälkeen) |
| `kentta=<id>` | ensimmäisen erän kenttä (`bunker`, `manor`, `graveyard`, `warehouse`); seuraavat erät arvotaan normaalisti |
| `nopeus=1..8` | simulaatio N kertaa nopeammin |
| `botit=N` | huone täytetään N botilla (0–5) ja ottelu alkaa automaattisesti ilman aulaa |
| `katsele=1` | myös host on botti; kamera seuraa elossa olevaa ja vaihtuu kuoleman jälkeen. Pelaajia on siis `botit`+1 |

Rajoitukset: `era` ja `bossi` toimivat vain, kun ottelu alkaa `botit`-parametrilla. `bossi=1` asettaa sumun kellon bossin syntyaikaan, joten zombien taso on hieman korkeampi kuin pelkällä `era`lla. Bossi ei synny alle kahdella elossa olevalla.

Tila luetaan sivulta: `__testi()` palauttaa `world`-olion (vain testitilassa). Esimerkkilauseke:

```js
(w => JSON.stringify({round: w.round, zombies: w.zombies.length, boss: w.boss && {hp: w.boss.hp, state: w.boss.state}}))(__testi())
```

Esimerkkiosoitteet:
- Myöhäinen peli ja bossi, pelkät botit: `http://localhost:8000/?testi=1&era=8&bossi=1&botit=3&katsele=1&nopeus=4`
- Ostokset: `http://localhost:8000/?testi=1&era=6&raha=max&botit=2` (pelaa itse, paljon rahaa)
- Tietty kenttä: `http://localhost:8000/?testi=1&botit=3&kentta=manor`

Tahdistin kannattaa ajaa, jos ruudunpäivitykset ovat alhaiset. Pienennä `nopeus` arvoon 1–2, jos haluat ottaa kuvakaappauksen tietystä hetkestä.
