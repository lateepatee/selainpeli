# Tilanne

Päivitetty 2026-10-24. Koordinaattori päivittää tämän jokaisen aallon lopuksi. Uusi koordinaattori: lue tämä, sitten `koordinaattori.md`.

## Lyhyesti

- **Suunta on päätetty: peli siirtyy 3D:hen** (Three.js 0.170.0, `vendor/`, omistajan hyväksymä pysyvästi). 2D-piirto (`render.js`) poistuu, eikä varaversiota jätetä.
- **Kamera: viisto** (omistajan päätös ainakin alkuun). Olan yli -demo on haarassa `lateepatee/kokeilu3d` (ei mergetä); se voi palata erämuuttujana (ehdotus 9). Aaltoon 5: viiston kameran elävöitys (matalammalle vaarassa, tähtäyksen ennakointi, tärähdys).
- Main on origin/mainia edellä, eikä mitään ole pushattu. Omistaja pushaa itse.

## Valmistunut (mainissa)

| Työ | Mitä |
|---|---|
| Aalto 1: simulaattori, testit, tähtäyskorjaus, pelitestausohje | ks. `tools/sim/README.md`, `npm test`, `agentit/pelitestaus.md` |
| Aalto 2: suunnittelija | `agentit/ehdotukset.md` (9 ehdotusta + koordinaattorin lisäykset, VHS-säätöarvot) |
| Kirjastosääntö | `CLAUDE.md`, Kirjastot-osio |
| 3D-kokeilu | `kokeilu3d.html`, `src/kokeilu3d/`, `vendor/three-0.170.0/`: paikallinen peli boteilla, viisto kamera, PS1/Puppet Combo -ilme |

2D-grafiikkakokeilut (korkeat seinät, VHS) hylättiin, ja niiden haarat poistettiin. VHS-arvot ovat tallessa `ehdotukset.md`:ssä.

## Kesken (aalto 4, Run `run_0fb2adc264f9`)

- **3D moninpeliin** (Opus): 3D-piirto oikeaan peliin (host, liittyjä, aula, chat), HUD 2D-kerroksena, laatuasetus, `versio.py`:n tuki uusille kansioille, lopuksi `render.js`:n poisto.
- Olan yli -demo valmis ja pelattu: viisto toimi paremmin. Huom: olan yli vaatisi simulaatioon ja verkkoon tarkan liikesuunnan (nyt 8 suuntaa).

## Seuraavaksi (omistajan kanssa sovittu järjestys)

- Aalto 5: kenttäelementit 3D:hen (ikkunat, seinäaseet, arpalaatikko, automaatit, tehosteet), ja zombit kiipeämään ikkunoista näyttävästi. Erän tempo (ehdotus 3).
- Aalto 6: wau-ominaisuudet: tappokamera, tappoloki ja tuntuma, suunnasta kuuluvat äänet, rikottavat lamput.
- Teemaa muuttavat ideat odottavat omistajan erillistä lupaa: kruunu (ehdotus 8), "varjo paljastaa".

## Omistajan linja

Tavoite on wau-efekti kavereiden kanssa pelatessa: vanhojen pelien nostalgia, hauskanpito ja kilpailu. Inspiraationa ovat PS2-kauhu ja Puppet Combon pelit. Bottien toimivuus ei ole prioriteetti. VHS-tyylissä liika sutu ja kohina ärsyttävät, joten efektit pidetään hillittyinä.

## Simulaattorin havainnot (eivät ole korjattuja, odottavat päätöstä)

20 ottelua, 4 bottia, siemen 1 (100 ottelun ajossa sama kuva):
- Kuolinsyyt: zombi 82 %, pelaaja 12 %, bossi 6 %, sumu 0,2 %. Erä kestää keskimäärin 25 s, joten se loppuu ennen kuin sumu (`ZONE_DELAY` 10 s ja kutistuminen 60 s) ajaa pelaajat yhteen.
- Lyhtymies kaatui vain 3 %:ssa eristä, joissa se ilmestyi. Kolmannes arvotuista bosseista ei ilmesty ollenkaan, koska erä loppuu ennen `BOSS_SPAWN_TIME`:a (15 s).
- Voittajan pisteistä 89 % tulee erävoitoista ja 11 % tapoista.
- Talousluvut ovat epäluotettavia, koska botit eivät osta arpalaatikosta eivätkä juomia.

## Opittua Orcasta (Windows, Orca 1.4.239)

- **Pohjahaara:** anna `worker-start`ille aina `--base-branch main`. Muuten worktree haarautuu `origin/main`ista, jossa pushaamattomat commitit puuttuvat (aallossa 1 agentit joutuivat kelaamaan haaransa itse).
- **Bypass-tila:** Orca käynnistää Clauden lipulla `--dangerously-skip-permissions`. Varoitus on hyväksytty kerran (`skipDangerousModePermissionPrompt` käyttäjän Claude-asetuksissa). Jos se poistetaan, työntekijät sulkeutuvat heti käynnistyksessä.
- **Odotus:** `check --wait --types worker_done,...` voi palata myös heartbeatilla. Kuittaa ja odota uudelleen. Viestien rungossa on ääkkösiä ja π-merkkejä, joten Pythonilla tulostettaessa käytä `PYTHONIOENCODING=utf-8`.
- **Selain:** piilossa oleva Orcan selainpaneeli pyörittää peliä noin 1,5 fps:llä. Kiertotie on kuvattu `pelitestaus.md`:ssä.
- **Malli:** `worker-start --model sonnet` toimii (tarkistettu `worker-show`n `launch.effective`-kentästä).
- `worker-start` voi palauttaa `outcome_unknown`, vaikka työntekijä käynnistyy. Tarkista `worker-show`/`worker-read` ennen uutta yritystä.
- `check --wait --json` tulostaa ensin `_keepalive`-rivejä ja vasta sitten varsinaisen JSONin: suodata `grep -v _keepalive` ennen jäsentämistä.
- Selainvälilehdet ovat worktreekohtaisia: `orca tab list --worktree name:<nimi>`.
