# Zombiareena

Selaimessa pelattava kilpailullinen zombiräiskintä 2–6 pelaajalle. Pelaajat taistelevat toisiaan vastaan pimeässä kentässä, jonne zombit kiipeävät ikkunoista ja jota myrkkysumu kaventaa. Viimeinen eloonjäänyt voittaa erän.

Peli toimii suoraan selaimessa. Asennuksia, tilejä tai palvelinta ei tarvita: yksi pelaajista luo huoneen ja jakaa koodin tai linkin muille.

## Pelaaminen

1. Kirjoita nimesi ja paina **Luo huone**. Saat neljän kirjaimen huonekoodin ja linkin (Kopioi linkki).
2. Kaverit avaavat linkin tai syöttävät koodin ja painavat **Liity**.
3. Kun kaikki ovat paikalla, huoneen luoja painaa **Aloita peli**.

Botit täyttävät tyhjiä paikkoja ja väistyvät, kun oikeita pelaajia liittyy.

### Säännöt

- Erässä ei synnytä uudelleen. Viimeinen eloonjäänyt saa 3 pistettä, ja jokaisesta pelaajan tappamisesta saa 1 pisteen.
- Ensimmäinen pisterajaan päässyt voittaa pelin. Host valitsee rajan aulassa (10, 20 tai 30, oletus 20).
- Kolmannesta erästä alkaen erään voi ilmestyä **Lyhtymies**. Sen ollessa elossa on aselepo: pelaajat eivät voi vahingoittaa toisiaan. Kaataja saa 2 pistettä, muut rahaa osuutensa mukaan.
- Jokainen erä pelataan eri kentällä: Bunkkeri, Kartano, Hautausmaa tai Varasto.
- Zombeista ja pelaajista saa rahaa. Rahalla ostetaan seinäaseita, arpalaatikosta satunnaisia aseita ja juoma-automaateista erän ajan voimassa olevia etuja. Raha säilyy erästä toiseen, aseet ja juomat eivät.
- Zombeista putoaa joskus tehosteita (täydet ammukset, kertaisku, ydinpommi, tuplarahat). Ne saa se, joka ehtii ensin.

### Näppäimet

| Näppäin | Toiminto |
|---|---|
| WASD / nuolet | Liiku |
| Hiiri | Tähtää |
| Vasen nappi / välilyönti | Ammu |
| Shift / oikea nappi | Väistö |
| R | Lataa |
| Q / rulla | Vaihda asetta |
| E | Osta / käytä |
| Enter | Chat |

## Ajaminen omalla koneella

Peli käyttää JavaScript-moduuleja, joten se pitää avata paikallisen palvelimen kautta, ei suoraan tiedostona:

```sh
python -m http.server 8000
```

Avaa sitten http://localhost:8000. Kaksi selainikkunaa riittää moninpelin kokeilemiseen.

Kun verkkoviestit muuttuvat, nosta versio `PEER_PREFIX` tiedostossa `src/protocol.js` ja aja ennen julkaisua:

```sh
python tools/versio.py
```

Skripti versioi moduulien osoitteet `index.html`:ssä, jotta selaimen välimuisti ei sekoita vanhaa ja uutta versiota.

## Tekniikka

- Pelkkää JavaScriptiä ja Canvasia, ei riippuvuuksia eikä käännösvaihetta.
- Moninpeli kulkee selainten välillä suoraan (WebRTC, [PeerJS](https://peerjs.com/)). Huoneen luoja toimii hostina, joka ajaa pelin ja lähettää tilan muille. Liittyjän oma liike ennustetaan, jotta ohjaus tuntuu viiveettömältä.
- Äänet syntetisoidaan selaimessa (Web Audio), joten äänitiedostoja ei ole.

## Yksityisyys

Pelaajat yhdistyvät toisiinsa suoraan, joten samassa huoneessa olevat näkevät toistensa IP-osoitteet, kuten P2P-peleissä yleensä. Pelaa siis tuttujen kanssa. Yhteyden muodostamiseen käytetään PeerJS:n ilmaista palvelinta. Jos suora yhteys ei jonkun verkossa onnistu, pelin liikenne kulkee PeerJS:n välityspalvelimen (TURN) kautta.

## Lisenssit

- Kierroslaskurin fontti [Creepster](https://fonts.google.com/specimen/Creepster) (Font Diner), SIL Open Font License 1.1: [assets/fonts/OFL.txt](assets/fonts/OFL.txt).
- [PeerJS](https://github.com/peers/peerjs), MIT-lisenssi, ladataan CDN:stä.
