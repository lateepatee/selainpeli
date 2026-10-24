# Ehdotukset: kaveripelin wau-efekti

Kirjoittanut suunnittelija 2026-10-24. Tavoite: kaverit hämmästyvät, miten hieno ja hauska peli tämä on. Bottien toimivuus ei ole prioriteetti. **Mikään tässä ei ole hyväksytty**; jokainen ehdotus menee ensin omistajalle koordinaattorin kautta (CLAUDE.md).

## Pohjaksi nähty

- Simulaattori (`--matches 20 --seed 1`): erä kestää keskimäärin 24,5 s (mediaani 20,6 s), ottelussa on noin 16 erää. Kuolemista 82 % on zombien tekemiä, pelaajien tekemiä vain 12 % ja sumun 0,2 %. Bossi ilmestyi 17,5 %:ssa eristä ja kaatui 1/57 kertaa. Kaverit eivät siis kilpaile toisiaan vastaan vaan zombeja vastaan, ja kaikki mikä tekee pelistä erityisen (pimeys, sumu, bossi) jää kokematta.
- Pelissä on jo hyvä tapahtumavirta (`step` palauttaa `kill`, `roundEnd`, `gameOver`, `bossKill`, `dash`, `pickup`, `nuke`...), mutta niille reagoidaan vähän: ruudun tärinä vain bossille, välähdys vain ydinpommille, ei kill feediä, ei tulosten kerrontaa. Tapahtumat ovat siis valmiina; suurin osa pikavoitoista on piirto- ja äänityötä, ei simulaation muutosta.
- Erän lopetus on kuiva (`centerBox`: "X selvisi!"). Juhlinta, nolottaminen ja "vielä yksi erä" -vire puuttuvat. Ne ovat kaveripelin ydin.

Järjestys: pikavoitot ensin (1–5), isommat ideat sen jälkeen (6–9).

---

## 1. Tuntumapaketti: osumat, tapot ja kill feed (pikavoitto)

**Idea:** jokainen laukaus, osuma ja tappo tuntuu: suuliekki, osumamerkki ja vahinkoluvut, lyhyt "hitstop" (3–4 framea) tapossa, kill feed ruudun reunaan ("Make ✕ Liisa", "Sumu ✕ Make"), pelaajan kuolemalle oma räjähtävä partikkelipurske ja kaatuva nimikyltti.

**Miksi:** kaverit näkevät heti, kuka tappoi kenet, ja siitä syntyy huutoa ja naurua. Tuntuma on se, mistä "tämä on oikeasti hyvä peli" tulee ensimmäisen minuutin aikana. Tapahtumat ovat jo olemassa, joten vaikutus on iso suhteessa työhön.

**Tiedostot / työmäärä:** `render.js` (reagointi `events`-listaan, partikkelit on jo, `particles`), `sound.js` (osumaäänet), mahdollisesti uusi `feedback.js` jotta `render.js` ei kasva. **S–M.** Simulaatioon ei koske.

**Riski:** pieni. Hitstop tehdään vain piirtoon (ei simulaation pysäytystä), muuten host ja liittyjä erkanevat. Varo myös ruudun tärinää, joka ei saa haitata tähtäämistä (pidä amplitudi pienenä ja sammuta asetuksella).

**Onnistuminen:** pelitestauksessa (`pelitestaus.md`) tapon näkee ja kuulee ilman että katsoo HUDia; kill feed näyttää jokaisen kuoleman oikein 4 pelaajan ottelussa; `npm test` ja 60 fps säilyvät (konsolin frame time).

---

## 2. Äänet pimeässä: askeleet, laukaukset ja lähestyvä vastustaja (pikavoitto → M)

**Idea:** äänillä on sijainti. Toisen pelaajan askeleet, väistö, lataus ja laukaus kuuluvat stereopannauksella ja etäisyysvaimennuksella (Web Audio `StereoPannerNode` ja `GainNode`), ja kuuntelija kuulee ne myös pimeän läpi. Zombien murina ikkunoilla suuntautuu samoin.

**Miksi:** pimeässä ei näe, mutta kuulee. Siitä syntyy jännitystä ("hän on tuolla vasemmalla!"), kaverit kuuntelevat toisiaan ja kuulokkeilla kokemus on aivan eri luokkaa. Vahvistaa suoraan teemaa "pimeys ja valo" ja tekee kysymyksen 2 ratkaisusta (alla) reilun.

**Tiedostot / työmäärä:** `sound.js` (`playEvents(events, localId)` saa kuuntelijan sijainnin, nykyisin vain `localId`), `render.js`/`main.js` välittää sijainnin; tapahtumissa on jo `x`, `y`. Askeleita varten tarvitaan joko piirron puolella lasketut askeläänet tai uusi tapahtuma (`step`), mikä koskee `game.js`:ää. **M.**

**Riski:** äänet pitää rajoittaa (korkeintaan N yhtä aikaa), muuten 6 pelaajan ottelussa tulee puuroa. Jos askeltapahtuma lisätään simulaatioon, se on verkkoviestin muutos → `PEER_PREFIX` (koordinaattori nostaa). Askeleet voi laskea myös clientillä pelaajan sijaintien muutoksesta, jolloin verkko ei muutu.

**Onnistuminen:** testaajalle, jonka silmät ovat kiinni (näkymä pimeä), annetaan tehtävä: osoita suunta, jossa toinen pelaaja kävelee. Oikeassa ≥ 8/10 kerrasta. Ääniä ei ole yli 12 yhtä aikaa.

---

## 3. Erän tempo: sumu ja bossi ehtivät mukaan (pikavoitto, vain vakioita)

**Idea:** säädetään `ZONE_DELAY`, `ZONE_SHRINK_TIME`, `BOSS_SPAWN_TIME` ja zombien aloitusvaikeus niin, että erä kestää mediaanilta noin 45–60 s, sumu pakottaa kohtaamisiin ja bossi ilmestyy lähes aina kun se on arvottu. Esimerkki lähtöarvoiksi: `ZONE_DELAY` 10 → 5, `ZONE_SHRINK_TIME` 60 → 35, `BOSS_SPAWN_TIME` 15 → 8. Lisäksi zombien aloituspaine alemmas (`ZOMBIE_LEVEL_TIME`, `WARMUP_ZOMBIES`), jotta pelaajat kuolevat toisiinsa eivätkä pelkkiin zombeihin.

**Miksi:** nyt kaverit ampuvat zombeja rinnakkain 25 s ja yksi kuolee. Tarvitaan se hetki, kun sumu on ahdistanut kaikki samaan nurkkaan ja valot sammuvat. Tässä peli on hauskimmillaan, eikä se nyt ehdi tapahtua.

**Tiedostot / työmäärä:** `constants.js`, `boss.js` (`BOSS_SPAWN_TIME`), `zombies.js`. **S.** Yhteinen tiedosto `constants.js`, joten tehtävän pitää sallia se nimenomaan.

**Riski:** eräpituus kasvaa, ja 16 erää × 60 s on liikaa → samalla `TARGET_SCORE_OPTIONS` tai erävoiton pisteet uusiksi (esim. oletusraja 15). Ei verkkomuutosta. Ennuste ei muutu (vain vakioita).

**Onnistuminen:** sama siemen ennen/jälkeen: erän mediaani 45–60 s, sumun osuus kuolemista ≥ 10 %, pelaajien tappamien osuus ≥ 35 %, bossi ilmestyy ≥ 90 % arvotuista erästä, ottelun kesto pysyy 8–12 min.

---

## 4. Kuolinhetken toisto ja "voittajan hetki" (pikavoitto → M)

**Idea:** erän päättyessä näytetään 3–4 sekunnin toisto viimeisestä tapposta ja pelin lopussa voittajan juhlinta (podium, konfetti, voittajan väri valaisee ruudun). Toisto toteutetaan pelkästään clientin omalla tilapuskurilla: client tallentaa jo vastaanottamansa tilat (interpolointia varten) ja soittaa viimeiset N sekuntia uudestaan **täysin valaistuna**, joten kaikki näkevät, mitä pimeässä oikeasti tapahtui.

**Miksi:** pimeässä kukaan ei näe koko tapahtumaa, joten toisto paljastaa sen ("sinä olit koko ajan tuossa!"). Se tekee tappiosta viihdettä, ja siitä puhutaan vielä erän jälkeen. Voittajan juhlinta tekee ottelun päätöksestä hetken, jonka haluaa jakaa.

**Tiedostot / työmäärä:** `client.js` ja `host.js` (host tallentaa oman tilansa), uusi `replay.js`, `render.js` (toistotila `roundEnd`-vaiheessa, valot päälle), `ROUND_END_TIME` 4 s → ~8 s (`constants.js`). **M.**

**Riski:** muisti (60 tilaa/s × 4 s ≈ 240 tilaa; tallenna harvennettuna, esim. 20 Hz) ja se, että liittyjän tilapuskuri on harvempi kuin host. Pelkkä toisto ei muuta verkkoa, jos käytetään jo vastaanotettuja tiloja. Ei saa kuluttaa `roundEnd`-vaiheen aikaa niin, että seuraava erä viivästyy huomattavasti.

**Onnistuminen:** selainpelitestauksessa kahden välilehden ottelussa toisto näkyy molemmilla ja näyttää saman tapon; `roundEnd`-vaihe päättyy ajallaan; muistinkäyttö ei kasva ottelun aikana (konsolista).

---

## 5. Pikaemotet ja pilkka (pikavoitto)

**Idea:** pelaaja painaa 1–4 ja pään päälle ilmestyy emoji-kupla ("😂", "👍", "💀", "🧟") muutamaksi sekunniksi, kuolleena myös katsojan puolelta. Hyvä pilkka: voittaja saa automaattisesti kruunun nimensä viereen seuraavaan erään asti.

**Miksi:** kaverit puhuvat jo keskenään, mutta chat vaatii Enterin ja kirjoittamisen kesken taistelun. Yksi näppäin tuottaa nopeaa huumoria ("kuolit taas") ja tuo persoonaa moninpeliin lähes ilmaiseksi.

**Tiedostot / työmäärä:** `input.js` (näppäimet), `protocol.js` (uusi viesti, tarkistus: vain sallitut koodit, rate limit), `host.js`, `render.js`. **S–M.**

**Riski:** uusi verkkoviesti → **`PEER_PREFIX` pitää nostaa** (koordinaattori). Emoteja ei saa antaa mielivaltaisena tekstinä (vieraan data on epäluotettavaa): pelkkä indeksi 0–3, host rajaa tiheyden (esim. yksi per 2 s). Tämä ei saa osua simulaatioon eikä ennusteeseen.

**Onnistuminen:** neljä emotea toimii molempiin suuntiin host ↔ liittyjä; vieras ei saa lähetettyä muuta kuin indeksin 0–3 (testi `protocol`-tiedostolle); spämmäys ei kasvata liikennettä.

---

## 6. Kohokohdat ja palkinnot ottelun lopussa (M)

**Idea:** ottelun lopputuloksessa pistetaulukon lisäksi huumoripalkintoja tilastoista: "Kauimmin pimeässä", "Eniten sumussa", "Pelkuri (eniten väistöjä)", "Zombimagneetti (eniten zombien vahinkoa)", "Tarkka-ampuja", "Rahakuningas". Jokaiselle pelaajalle ainakin yksi, ettei kukaan jää ilman.

**Miksi:** häviäjäkin saa hetken, ja palkinnoista keskustellaan ("en minä pelkuri ole!"). Rakentaa tarinan ottelusta ja saa kaverit pelaamaan uudestaan.

**Tiedostot / työmäärä:** uusi `stats.js` (laskurit tapahtumista `events`-listasta, ei muutoksia `game.js`:ään jos laskenta tehdään hostilla step-kutsun ulkopuolella), `render.js` (`drawGameOver`), lähetys osana `gameOver`-tilaa → `protocol.js`. **M.**

**Riski:** tilastot lähetetään hostilta, joten muoto muuttuu → `PEER_PREFIX`. Älä lisää laskureita pelaajaolioon, ellei tehtävä salli `game.js`:ää. Tilastot eivät saa vaikuttaa pisteisiin.

**Onnistuminen:** simulaattorin (4 bottia) ottelun lopussa kullekin pelaajalle tulee ≥ 1 palkinto ja arvot täsmäävät lokiin (testi); ilmoitus ei venytä `GAME_OVER_TIME`-vaihetta.

---

## 7. Rikottavat lamput: kaveri voi sammuttaa valot (rohkea, M–L)

**Idea:** kentän lamput (`LAMPS`) voi ampua rikki. Rikkoutunut lamppu pimentää alueen noin 20 s ajaksi (sitten korjaantuu tai ei lainkaan erän aikana), ja lasi- ja kipinäpartikkelit kertovat, kuka sen teki. Taskulampulla ei kuitenkaan voi rikkoa omaa valoa.

**Miksi:** pimeys ei ole enää vain kentän ominaisuus vaan ase. Pelaaja voi ajaa vastustajan pimeään ja kaverit keksivät yllättäviä taktiikoita ("sammuta valot, hän on lampun alla!"). Tästä syntyvät ne tarinat, joita kerrotaan jälkeenpäin.

**Tiedostot / työmäärä:** `map.js`/`maps.js` (lamppujen tila), `game.js` (luoti vs. lamppu), `vision.js` (valaistuksen laskenta), `render.js`, `protocol.js` (lamppujen tila osana tilaa). **L** (kolme yhteistä tiedostoa).

**Riski:** korkein verkon osalta. Lamppujen tilan pitää kulkea hostilta, ja `isLitFor` ajetaan sekä renderissä että mahdollisesti ennusteessa → varmista, ettei liittyjän näkymä (`isLitFor`) poikkea hostista. `map.js` pitää kenttää moduulin tilassa (yksi maailma kerrallaan), joten rikkoutunut tila kuuluu `world`-olioon, ei `map.js`:ään. Verkkoviestin muoto muuttuu → `PEER_PREFIX`. Botit eivät tarvitse tukea.

**Onnistuminen:** Node-testi: luoti osuu lamppuun → lamppu rikkoutuu → `isLitFor` vastaa oikein; kahden välilehden pelissä molemmat näkevät saman pimeän alueen; ei vaikutusta ennusteeseen (`movePlayer` ei muutu).

---

## 8. Kruunu: johtajaa metsästetään (rohkea, M)

**Idea:** pisteissä johtava (tai edellisen erän voittaja) kantaa kruunua, joka hohtaa pimeässäkin kaikille. Kruunun kantajan tappamisesta saa +1 lisäpisteen ("kruunun metsästys"), ja kruunu siirtyy tappajalle.

**Miksi:** kaikki vastaan kaikki -pelin ongelma on, että johtaja alkaa pelata varovasti ja muut pelaavat zombeja vastaan. Kruunu pakottaa muut yhdessä johtajaa vastaan ja antaa jokaiselle takaa-ajon. Syntyy luontainen "kaikki pimeästä häntä kohti" -hetki. Tasoittaa myös tulosta, joten häviäjälläkin on toivoa ja ottelu pysyy jännittävänä loppuun.

**Tiedostot / työmäärä:** `game.js` (kruunun siirto ja piste), `vision.js` (kruunun kantaja näkyy `isLitFor`-tarkistuksessa), `render.js`, `protocol.js` (kruunun omistaja osana tilaa). **M.**

**Muuttaa teemaa:** "Vastustaja pimeässä on näkymätön." Kruunun kantaja on näkyvissä pimeässäkin. Tämä on tietoinen poikkeus yhdelle pelaajalle kerrallaan. Rajoita: kruunu näkyy vain kartalla/ikkunan reunassa suuntanuolena ("kruunu on tuolla") eikä paljasta täsmällistä sijaintia, niin teema säilyy melkein ennallaan. Omistajan päätettävä.

**Riski:** pisteytysmuutos vaikuttaa tasapainoon (simulaattori!). Verkkoviesti muuttuu → `PEER_PREFIX`. Ei vaikuta ennusteeseen.

**Onnistuminen:** simulaattori ennen/jälkeen: pisteet jakautuvat tasaisemmin (voittajan erävoittoprosentti laskee, toiseksi tulleen pisteet nousevat), pelaajien tappamien osuus kasvaa; testi: kruunun siirtymä kaikissa kuolintapauksissa (sumu, zombi, pelaaja).

---

## 9. Erämuuttujat: sähkökatko, ylikuormitus ja muut villit säännöt (rohkea, L)

**Idea:** joka kolmannessa erässä arvotaan yksi sääntö, joka näytetään erän alussa isosti: *Sähkökatko* (kaikki lamput sammuvat, vain taskulamput), *Äkkikuolema* (yksi osuma tappaa kaikki), *Zombisade* (zombeja kaksi kertaa niin paljon, mutta ne eivät tee vahinkoa vastustajille), *Painovoima* (kaikki liikkuvat hitaasti) ja *Tuplahaulikot*.

**Miksi:** koska kenttä vaihtuu jo joka erässä, erä on helppo muuttaa ainutlaatuiseksi. Kaverit odottavat "mikä nyt tulee?", ja ottelu ei muutu toistoksi. Vanhojen pelien huumoritilojen henkeä ilman kopiota mistään.

**Tiedostot / työmäärä:** uusi `mutators.js` (kaikki arvonta- ja muutoslogiikka vakioina), `game.js` (koukku erän alussa), `render.js` (otsikko), `protocol.js`. **L.**

**Riski:** jokainen sääntö vaikuttaa tasapainoon ja useimmat koskevat `movePlayer`ia (nopeus) → **ennuste**: sääntö pitää välittää liittyjälle ennen erän alkua ja `movePlayer`in pitää laskea sama arvo molemmin puolin. Aloita säännöillä, jotka eivät koske liikettä (sähkökatko, äkkikuolema, tuplahaulikot). Verkkoviesti muuttuu → `PEER_PREFIX`. Käytä `Math.random`ia (ei omaa satunnaislähdettä).

**Onnistuminen:** simulaattori `--seed`-ajo jokaisella säännöllä ilman kaatumisia; erän keston mediaani pysyy 30–90 s; kahden välilehden peli näyttää saman säännön molemmilla.

---

## Kaksi avointa kysymystä

### (1) Kentän esineet piirtyvät HUDin päälle: tarvitaanko taustalaatta?

**Kyllä, mutta ratkaise syy eikä vain oire.** Kaksi muutosta:

1. Piirrä HUD aina viimeiseksi omaan vaiheeseensa (arpalaatikon ja Varaston esineet kentällä menevät silloin HUDin alle), ja
2. anna HUDin ammus- ja HP-osille himmeä puoliläpinäkyvä taustalaatta (`rgba(0,0,0,0.55)`, pyöristetty), jotta teksti on luettavissa kirkkaan kentän päällä.

Perustelu: HUD on pelaajan tärkein tieto taistelussa. Sen lukemisen ei pidä riippua siitä, mitä kentällä sattuu olemaan. Työ on S, ja se koskee vain `render.js`:ää.

### (2) Valaisematon vastustaja näkyy himmeänä hahmona (`theme().darkness` 0,9–0,95): pitäisikö sen olla täysin näkymätön?

**Kyllä, täysin näkymätön, kunhan korvaavat vihjeet lisätään.** Syyt: CLAUDE.md:n mukaan teema on "vastustaja pimeässä on näkymätön", ja himmeä hahmo tekee lampuista ja taskulampusta vähemmän tärkeitä. Pelaaja, joka ei katso valoa, näkee silti vastustajan.

Jotta tämä ei tunnu epäreilulta kavereiden kesken, tarvitaan kolme vihjettä:
- äänet (ehdotus 2): askeleet ja laukaukset kuuluvat suunnasta,
- **suuliekki**: ampuminen paljastaa ampujan noin 0,3 sekunniksi pimeässäkin (ehdotuksen 1 suuliekki voi hoitaa tämän),
- kuolleen tai kuolevan pelaajan hahmo ei katoa heti (vain elävä hahmo piilotetaan).

Ilman näitä vihjeitä muutos kannattaa jättää pois, koska pelkkä näkymättömyys tekee pimeässä väijymisestä liian vahvaa. Tämä on pelillinen muutos → simulaattoriraportti ennen/jälkeen ja pelitestaus.

---

## Suositus: kolme ensimmäisenä toteutettavaa

1. **Ehdotus 3: erän tempo** (S). Pienin työ, ja se korjaa perusongelman: ilman sumua ja bossia ei synny sitä peliä, jota muut ehdotukset koristelevat. Sen jälkeen simulaattorin luvut ovat uskottavammat, ja muiden ehdotusten tulokset voi mitata.
2. **Ehdotus 1: tuntumapaketti ja kill feed** (S–M). Suurin ensivaikutelma per työtunti: jokainen laukaus, osuma ja kuolema tuntuu heti paremmalta, ja kill feed tekee kaverikilpailusta näkyvää.
3. **Ehdotus 4: toisto ja voittajan hetki** (M). Selvin "vau, mitä tämä on?" -hetki: toisto paljastaa pimeässä tapahtuneen. Tekee erän päättymisestä viihdettä ja on pelkkää clientin puolen työtä.

Seuraavina: ehdotus 2 (ääni pimeässä, yhdessä kysymyksen 2 ratkaisun kanssa) ja ehdotus 8 (kruunu). Ehdotukset 7 ja 9 ovat suuria; ne kannattaa tehdä vasta, kun pikavoitot ovat sisällä ja kavereiden palaute on kuultu.

---

## Lisätty koordinaattorin toimesta

### 10. Äänet hiljaiseksi taustavälilehdessä (S)

Peli soittaa ääniä täysillä, vaikka välilehti on taustalla. Host jatkaa simulaatiota taustalla, mutta äänet voisi hiljentää `document.hidden`-tilassa (`sound.js`, `main.js`). Omistaja huomasi tämän testi-ikkunoita sulkiessaan.

### VHS-tilan säätöarvot talteen (2D-näyte, haara poistettu)

Omistajan palaute ensimmäisestä VHS-näytteestä: tunnelma parempi, mutta liikaa suttua, kohinaa ja suhinaa. Hillityt arvot, jotka omistaja näki viimeisenä, käyvät pohjaksi 3D:n jälkikäsittelyyn:

```js
const CFG = {
  lowW: 960, sharp: true, strip: 4, posterLevels: 14, saturation: 0.62, satK: 0.3,
  bloomAlpha: 0.3, bloomBlur: 0.6, shift: 0.35, shiftK: 0.8, shiftTrack: 0.6,
  grain: 0.022, grainK: 0.015, dither: 0.03, scan: 0.14, sway: 0.35, swayK: 0.7,
  tearAmp: 4, trackFirst: 6, trackGap: 14, trackGapRnd: 16, trackGapK: 0.6,
  trackShift: 3, trackShiftRnd: 4, trackShiftK: 3, trackNoise: 0.07, snowAlpha: 0.08,
  bossAmp: 3, bossAmpK: 4, bossGhost: 0.14, zombieGhost: 0.12, zombieGhostK: 0.1,
};
// Ääni: hurina 0.02 + 0.03 * vaara, suhina 0.003 + 0.004 * vaara + 0.008 * seurantavirhe.
// k ja vaara = 0..1 (lähin näkyvä zombi ja oma matala HP).
```
