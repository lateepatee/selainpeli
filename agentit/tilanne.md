# Tilanne

Päivitetty 2026-10-24. Koordinaattori päivittää tämän jokaisen aallon lopuksi. Uusi koordinaattori: lue tämä, sitten `koordinaattori.md`.

## Lyhyesti

- **Aalto 1 (työkalut) on valmis** ja kaikki on mergetty mainiin. Mitään ei ole kesken.
- **Main on 10 committia origin/mainia edellä, eikä mitään ole pushattu.** Omistaja pushaa itse.
- Seuraavaksi: omistaja hyväksyy (tai muuttaa) aallon 2 ja vastaa kahteen kysymykseen alla.

## Valmistunut (mainissa)

| Työ | Haara | Mitä |
|---|---|---|
| Tasapainosimulaattori | `lateepatee/simulaattori` | `node tools/sim/simuloi.mjs`, ohje `tools/sim/README.md` |
| Testisarja | `lateepatee/testit` | `npm test`, 66 testiä, noin 2 s |
| Tähtäysbugin korjaus | `lateepatee/tahtayskorjaus` | Vieras pystyi jäädyttämään pelin `aim: 1e300`:lla. Nyt `wrapAngle` (`geometry.js`) |
| Selainpelitestaus | `lateepatee/pelitestaus` | Ohje `agentit/pelitestaus.md`, ajettu kerran läpi |

Aallon 1 worktreet ja haarat on poistettu (`orca worktree rm`). Mainin lisäksi ei ole muita worktreitä.

Uudet tokenisäännöt ovat `koordinaattori.md`:ssä: Sonnet-työntekijät, enintään 2 rinnakkain, kuvakaappaukset vain pakon edessä.

Orcan Run `run_3d6a0d60f5ad` (aalto 1): kaikki dispatchit on ratkaistu, eikä kuittaamattomia viestejä ole. Aallolle 2 luodaan uusi Run.

## Odottaa omistajaa

**Kysymykset (pelitestauksesta):**
1. Kentän esineet piirtyvät HUDin päälle (arpalaatikko ammusmäärän kohdalla, Varasto). Lisätäänkö HUDiin taustalaatta?
2. Valaisematon vastustaja näkyy pimeässä himmeänä hahmona (pimeyden peittävyys 0,9–0,95, `render.js` `theme().darkness`). Nimi ja HP ovat piilossa. Onko tämä hyvä, vai pitäisikö vastustajan olla täysin näkymätön?

**Ehdotettu aalto 2 (ei vielä hyväksytty):**
- **Suunnittelija:** kirjoittaa `agentit/ehdotukset.md`:hen 5–10 ideaa (myös yllättäviä, teeman rajoissa). Jokaisesta: perustelu, tiedostot, riski ja mittari. Pohjana simulaattorin havainnot, pelitestaus ja kysymykset yllä. Ei koodaa.
- **Bottien ostot:** botit käyttämään arpalaatikkoa ja juoma-automaatteja (vain `bot.js`), jotta simulaattorin talousluvut pitävät paikkansa.

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
- **Malli:** `worker-start` hyväksyy `--model <id>` (ja `--effort`). Ensimmäisellä Sonnet-työntekijällä pitää tarkistaa (`worker-show`), kelpaako alias `sonnet` vai tarvitaanko koko mallitunnus.
- `worker-start` voi palauttaa `outcome_unknown`, vaikka työntekijä käynnistyy. Tarkista `worker-show`/`worker-read` ennen uutta yritystä.
