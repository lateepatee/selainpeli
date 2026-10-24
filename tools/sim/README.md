# Tasapainosimulaattori

Pelaa Zombiareenan otteluita pelkillä boteilla Nodessa ilman selainta ja tulostaa tasapainoraportin. Pelilogiikka ladataan suoraan `src/`-moduuleista, joten raportti kertoo nykyisen koodin tilanteen. Riippuvuuksia ei ole, Node 20 riittää.

```sh
node tools/sim/simuloi.mjs --matches 20 --seed 1
```

20 ottelua neljällä botilla kestää noin 10 sekuntia.

## Valinnat

| Valinta | Oletus | Merkitys |
|---|---|---|
| `--matches N` | 20 | otteluiden määrä |
| `--bots N` | 4 | botteja ottelussa (2–6) |
| `--seed N` | arvottu | siemen; sama siemen antaa merkki merkiltä saman raportin |
| `--target 10\|20\|30` | 20 | pisteraja |
| `--map <id>` | vaihtuu | pakota kaikki erät yhdelle kentälle: `bunker`, `manor`, `graveyard`, `warehouse` |
| `--json` | | koneluettava tulos tekstin sijaan |
| `--out <polku>` | | kirjoita raportti tiedostoon (tekstinä tai `--json`-valinnalla JSONina) |

Ilman `--seed`-valintaa siemen arvotaan ja näkyy raportin alussa, joten ajon voi toistaa. Ajoaika tulostuu stderriin, ei raporttiin.

## Raportin sisältö

- Ottelut: kesto, pelivaiheen aika, eriä per ottelu, aikakatkaisut (yli 3 tuntia pelin aikaa).
- Erät: kesto kaikkiaan ja kentittäin, kuolemia per erä, tasapelit.
- Voitot: ottelu- ja erävoitot boteittain, voittajan ja toiseksi tulleen pisteet, mistä voittajan pisteet tulevat.
- Kuolinsyyt: pelaaja, zombi, sumu, bossi.
- Bossi: esiintymis- ja kaatoprosentti, erät joihin bossi arvottiin mutta jotka loppuivat ennen sen ilmestymistä, kaatoaika.
- Raha erän lopussa: keskiarvo, katossa olevien osuus, kehitys erä erältä.
- Ostot: seinäaseet asekohtaisesti, ammukset, arpalaatikko, juomat.
- Aseet: laukaukset, hallussapito-osuus, pelaaja-, zombi- ja bossitapot.
- Tehosteet: pudonneet ja poimitut tyypeittäin.
- Rajoitukset: mitä ei saa mitattua ilman pelikoodin muutosta.

Luvut ovat yhtä hyviä kuin botit. Botit (`src/bot.js`) eivät käytä arpalaatikkoa, juomia eivätkä väistöä, ja ne ostavat seinäaseen vain, kun toinen asepaikka on tyhjä. Ennen kuin teet johtopäätöksiä, vertaa raporttia ennen ja jälkeen muutoksen samalla siemenellä.

## Miten se toimii

- `Math.random` korvataan siemenellisellä generaattorilla ennen pelimoduulien latausta. Jokainen ottelu saa siemenestä johdetun oman siemenen.
- Ottelun alussa bottien muisti nollataan (`forgetBot`) ja kenttä palautetaan oletukseen (`setMap`), jotta ottelu ei riipu edellisistä.
- Tiedot kerätään `step`in palauttamista tapahtumista ja maailman tilasta. Ostosten laji päätellään vertaamalla pelaajan aseita ennen tickiä ja sen jälkeen, koska `buy`-tapahtuma ei kerro, mitä ostettiin.
- `--map` toimii rajaamalla `MAP_IDS`-listan ajon ajaksi pakotettuun kenttään ja tyhjentämällä `world.mapId`:n ennen erän alkua. Se nojaa `nextMap`in nykyiseen toteutukseen `game.js`:ssä: jos kentän arvonta muuttuu, tarkista pakotus.

Tiedostot: `simuloi.mjs` (valinnat, ottelusilmukka, tilastojen keruu) ja `raportti.mjs` (tiivistelmä ja tekstimuoto).
