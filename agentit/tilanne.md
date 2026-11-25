# Tilanne

Päivitetty 2026-10-24 (Orca-maininnat siivottu 2026-11-25). Päivitä tämä jokaisen isomman kokonaisuuden lopuksi. Lue tämä ennen kuin jatkat kehitystä.

## Lyhyesti

- **Aalto 4 valmis: peli on 3D:nä mainissa** (`src/render3d/`, Three.js 0.170.0 `vendor/`-kansiossa, omistajan hyväksymä pysyvästi). 2D-piirto on poistettu, eikä varaversiota ole.
- **Kamera: viisto** (omistajan päätös ainakin alkuun). Olan yli -demon haara `lateepatee/kokeilu3d` poistettiin 2026-11-25 (viimeinen commit 9583450); idea voi palata erämuuttujana (ehdotus 9). Aaltoon 5: viiston kameran elävöitys (matalammalle vaarassa, tähtäyksen ennakointi, tärähdys).
- Main on pushattu GitHubiin (tarkistettu 2026-11-25). Omistaja pushaa itse.

## Valmistunut (mainissa)

| Työ | Mitä |
|---|---|
| Aalto 1: simulaattori, testit, tähtäyskorjaus, pelitestausohje | ks. `tools/sim/README.md`, `npm test`, `agentit/pelitestaus.md` |
| Aalto 2: suunnittelija | `agentit/ehdotukset.md` (9 ehdotusta + koordinaattorin lisäykset, VHS-säätöarvot) |
| Kirjastosääntö | `CLAUDE.md`, Kirjastot-osio |
| 3D-kokeilu | `kokeilu3d.html`, `src/kokeilu3d/`, `vendor/three-0.170.0/`: paikallinen peli boteilla, viisto kamera, PS1/Puppet Combo -ilme |

2D-grafiikkakokeilut (korkeat seinät, VHS) hylättiin, ja niiden haarat poistettiin. VHS-arvot ovat tallessa `ehdotukset.md`:ssä.

## Aalto 4 (valmis)

- 3D moninpeliin (Opus): mainissa. Kenttäelementit ovat vielä yksinkertaisia (ikkunat, seinäaseet, arpalaatikko, automaatit, tehosteet), veriläiskät puuttuvat. fps mitattu vain RTX 5080:llä.
- Olan yli -demo valmis ja pelattu: viisto toimi paremmin. Haara poistettu 2026-11-25. Olan yli vaatisi simulaatioon ja verkkoon tarkan liikesuunnan (nyt 8 suuntaa).

## Aalto 5A (valmis)

- Testitila: `?testi=1&era=8&bossi=1&botit=3&katsele=1&nopeus=4` (vain localhost, ohje `pelitestaus.md`).
- Erän tempo: sumu 5 s + 30 s, bossi 8 s, zombit maltillisemmiksi (vahinko 12, nopeus 58, tasoväli 25 s). Simulaattori: erän mediaani 21 → 32 s, pelaajien tappamat 12 → 24 %, sumu 0,2 → 9 %. Omistaja hioo arvot kaveritestien mukaan.

## Aalto 5B (valmis)

- Kenttä 3D:hen: ikkunoista kiipeävät zombit ja repeävät laudat (`render3d/windows.js`), ostopaikat esineinä (`props.js`), tehosteet (`pickups.js`), veriläiskät (`decals.js`), elävä kamera (`camera.js`).
- Satunnainen testi korjattu: `tests/vision.test.js`:n alaprosessin aikaraja 2 s → 30 s (kuormassa Noden käynnistys > 2 s).
- Agentit ylittivät kuvakaappausrajan (8 vs. 4), koska testitilassa kamera ei kohdistu haluttuun paikkaan. Seuraavaan tehtävään: testitilaan kamerakomento (esim. `__testi.kamera(x, y)`) tai tekstimuotoinen tarkistus.

## Kaveritesti (odottaa omistajaa)

Main on pushattu; omistaja pelaa kavereiden kanssa Pagesin kautta. Katsottavaa:
1. Pyöriikö peli kaverien koneilla? Laatuasetus aulassa, `?fps=1` näyttää ruudun keston.
2. Erän pituus ja tunnelma: tuleeko sumu ja bossi sopivasti, ovatko zombit liian helppoja tai vaikeita?
3. Ikkunasta kiipeävät zombit: erottuuko kiipeäminen pimeässä?
4. Kamera: onko vaaran lähestyminen ja tärähdys liikaa vai sopivasti?
5. Näkyvyys: tuntuuko pimeässä piilossa oleva vastustaja reilulta?
6. Bugit ja yhteysongelmat (liittyminen koodilla, katkeilu).

## Seuraavaksi (omistajan kanssa sovittu järjestys)

- Kaveritestin palautteen korjaukset ja säädöt.
- Aalto 6: wau-ominaisuudet: tappokamera, tappoloki ja tuntuma, suunnasta kuuluvat äänet, rikottavat lamput.
- Teemaa muuttavat ideat odottavat omistajan erillistä lupaa: kruunu (ehdotus 8), "varjo paljastaa".

## Omistajan linja

Omistaja ei jaksa testata yksin isoja kokonaisuuksia, varsinkaan myöhäistä peliä. Agenttien pitää todentaa itse (testitila, simulaattori), ja omistaja ajaa pelin sisään kavereiden kanssa.

Tavoite on wau-efekti kavereiden kanssa pelatessa: vanhojen pelien nostalgia, hauskanpito ja kilpailu. Inspiraationa ovat PS2-kauhu ja Puppet Combon pelit. Bottien toimivuus ei ole prioriteetti. VHS-tyylissä liika sutu ja kohina ärsyttävät, joten efektit pidetään hillittyinä.

## Simulaattorin havainnot (eivät ole korjattuja, odottavat päätöstä)

20 ottelua, 4 bottia, siemen 1 (100 ottelun ajossa sama kuva):
- Kuolinsyyt: zombi 82 %, pelaaja 12 %, bossi 6 %, sumu 0,2 %. Erä kestää keskimäärin 25 s, joten se loppuu ennen kuin sumu (`ZONE_DELAY` 10 s ja kutistuminen 60 s) ajaa pelaajat yhteen.
- Lyhtymies kaatui vain 3 %:ssa eristä, joissa se ilmestyi. Kolmannes arvotuista bosseista ei ilmesty ollenkaan, koska erä loppuu ennen `BOSS_SPAWN_TIME`:a (15 s).
- Voittajan pisteistä 89 % tulee erävoitoista ja 11 % tapoista.
- Talousluvut ovat epäluotettavia, koska botit eivät osta arpalaatikosta eivätkä juomia.
