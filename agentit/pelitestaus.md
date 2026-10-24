# Selainpelitestaus Orcan selaimella

Toistettava savutesti, jolla agentti todistaa, että peli toimii oikeassa selaimessa kahdella pelaajalla. Aja se jokaisen pelillisen muutoksen jälkeen omassa worktreessäsi (`npm test` ja simulaattori eivät näe DOMia, verkkoa eikä piirtoa). Kesto noin 5 minuuttia, josta suurin osa on erän vaihtumisen odottamista.

Testi ei muuta pelikoodia eikä repoa. Kuvakaappaukset ja apuskripti menevät omaan työhakemistoosi (scratchpad tai `$TEMP`), ei worktreehen.

## Mitä tarvitaan

- Orcan CLI (`orca`) ja Orcan sisäinen selain. Selainkomentojen perusohje: `orca skills get orca-cli --reference references/browser.md`.
- Bash (Windowsissa Git Bash), Python 3 (palvelin ja base64-purku). Pillow on valinnainen kuvien rajaamiseen.
- Internetyhteys: moninpeli yhdistää PeerJS:n palvelimen (`0.peerjs.com`) kautta. Ilman sitä host näyttää `Ei verkkoyhteyttä (…), vain botit` eikä liittyminen onnistu.

## Tärkeimmät sudenkuopat (selvitetty kokeilemalla)

**Ruudunpäivitykset hidastuvat.** Kun Orcan selainpaneeli ei ole näkyvissä (agentti ajaa testiä taustalla), Chromium antaa välilehdille vain noin 1,5 `requestAnimationFrame`-kutsua sekunnissa. Orca määrittelee silti `document.hidden = false` (oma, ei-muutettava ominaisuus), joten pelin taustasäie (`main.js`, Worker-ticker) ei käynnisty. Seuraukset: peli etenee ruudunpäivitysten tahdissa ja `dt` katkaistaan 0,25 s:iin, joten simulaatio pyörii noin kolmasosanopeudella. Alle ~0,7 s:n näppäin- tai hiiripainallus voi jäädä kokonaan huomaamatta, koska yksikään ruutu ei osu sen kohdalle. Korjaus testissä: `tahdista`-apufunktio (alla) korvaa sivun `requestAnimationFrame`n Workerin tahdilla, joka ei hidastu. Se ei muuta pelikoodia, vain testivälilehden ympäristöä. Tarkista `fps`-funktiolla (pitää olla yli 50). Jos löydät bugin, joka näkyy vain tahdistimen kanssa, toista se ilman tahdistinta ennen raportointia.

| Asia | Toimii | Ei toimi |
|---|---|---|
| Näppäimen pito | `orca exec --command "keydown w"` … `"keyup w"` | `"keydown KeyW"` (palauttaa ok, mutta sivulle ei tule tapahtumaa), `"keydown Space"` |
| Yksittäinen painallus | `orca keypress --key Enter` | `keypress` liikkeelle: pito kestää vain hetken |
| Ampuminen | `orca mouse move --x X --y Y`, `orca mouse down`, `orca mouse up` (vasen nappi) | välilyönti, ks. yllä |
| Elementin valinta | CSS-valitsin suoraan: `orca click --element '#host'` | `@e3`-refit vanhenevat ja vaativat `orca snapshot`in samassa välilehdessä ensin |
| Kaatumiset | `orca exec --command "errors"` | `orca console` ei näytä kaatumisia (uncaught/rejection) |
| Lataushetken virheet | näkyvät vasta, kun välilehti on ladattu uudelleen (`orca reload`) | uuden välilehden ensimmäinen lataus jää kaappaamatta |
| Testijärjestys | liike, ammunta ja chat lämmittelyssä (herää 3 s:ssa) | erässä: botit tappavat paikallaan seisovan testaajan sekunneissa, eikä erässä synnytä uudelleen |
| Odottaminen | `orca wait --page P --text "2 pelaajaa"` DOM-tekstille | `wait --text` canvasille piirretylle (erä, chat, HUD): kysele tilaa tai ota kuva |

Lisäksi:
- Peli piirtää kaiken pelinäkymän canvasille. DOMista luettavissa ovat vain aula (`#lobby`), huonerivi (`#roomtext`), napit ja chat-kenttä. Muu tarkistetaan kuvakaappauksista.
- Pelitilaa saa luettua vain lukien moduuleista dynaamisella importilla (import-kartta antaa saman moduuli-instanssin kuin pelillä): `import('./src/map.js').then(m => m.MAP_NAME)`. Älä kutsu näin saatuja funktioita (esim. `setMap`), koska se sotkee pelin tilan.
- `orca exec --command "errors"` kerää virheet koko välilehden ajalta, eikä `errors --clear` tyhjennä sitä. Avaa siksi testiin aina uudet välilehdet. `orca exec --command "console --clear"` tyhjentää konsolin.
- Orca raportoi kummankin välilehden näkyväksi (`visibilityState === 'visible'`), vaikka ne eivät olisi ruudulla. Siksi tarvitaan tahdistin (yllä). Tahdistin katoaa sivun uudelleenlatauksessa, joten aja `tahdista` uudelleen jokaisen `orca reload`in jälkeen.
- Kuvakaappauksen koko vaihtelee (esim. 1929×1281 tai 2559×1245) sen mukaan, miten Orcan paneeli on aseteltu. Laske hiiren koordinaatit `window.innerWidth/innerHeight`:sta, älä kuvan koosta.
- Chat-viesti näkyy canvasilla vain 10 s (`SHOW_TIME`, `chat.js`). Ota kuva heti lähettämisen jälkeen.
- Kuvat ovat tummia (pimeys on teema). Lue ne Read-työkalulla. Pienet tekstit (chat, HUD) näkyvät parhaiten rajattuna, ks. `rajaa` alla.

## 1. Valmistelu

Valitse työhakemisto ja portti. Rinnakkaiset worktreet voivat ajaa omaa palvelintaan, joten tarkista, ettei portti ole varattu, ja että palvelin palvelee juuri sinun worktreetäsi.

```sh
export PT_DIR="<oma scratchpad>/pelitestaus"   # ei worktreen sisälle
export PORT=8000                                # vaihda, jos varattu
mkdir -p "$PT_DIR"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/   # 000 = vapaa
```

Kirjoita apufunktiot tiedostoon ja lataa ne jokaisen komennon alussa (`source "$PT_DIR/pt.sh"`), koska agentin shell ei säilytä funktioita eikä muuttujia kutsujen välillä. Aseta siis myös `PT_DIR` ja `PORT` (`export …`) jokaisen alla olevan lohkon alkuun. Välilehtien tunnisteet tallentuvat tiedostoihin `$PT_DIR/H` ja `$PT_DIR/J`, ja `pt.sh` lukee ne muuttujiin `$H` ja `$J`.

```sh
cat > "$PT_DIR/pt.sh" <<'EOF'
export PYTHONIOENCODING=utf-8
URL="http://localhost:${PORT:-8000}/"
H=$(cat "$PT_DIR/H" 2>/dev/null); J=$(cat "$PT_DIR/J" 2>/dev/null)
# JS-lauseke sivulla, tulostaa arvon (lupaukset odotetaan).
js() { orca eval --page "$1" --expression "$2" --json | python -c "import sys,json;d=json.load(sys.stdin);print(d['result']['result'] if d.get('ok') else 'VIRHE: '+d['error']['message'])"; }
# Ruudunpäivitysten tahdistin: Orcan piilossa oleva selainpaneeli saa vain ~1,5 fps, jolloin peli hidastuu
# ja lyhyet painallukset katoavat. Korvaa sivun requestAnimationFramen Workerin 16 ms tahdilla (vain testisivulla).
tahdista() { js "$1" "(() => { if (window.__tahti) return 'jo päällä'; const w = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)']))); const q = []; w.onmessage = () => { const cbs = q.splice(0); const t = performance.now(); for (const cb of cbs) cb(t); }; window.requestAnimationFrame = (cb) => { q.push(cb); return 0; }; window.__tahti = true; return 'tahdistin päällä'; })()"; }
# Ruudunpäivitykset sekunnissa (2 s mittaus). Pitää olla yli 50 tahdistuksen jälkeen.
fps() { js "$1" "new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })"; }
# Uusi välilehti + uudelleenlataus (jotta lataushetken virheet ja konsoli kaapataan) + tahdistin.
uusi_valilehti() {
  local id; id=$(orca tab create --url "$URL" --json | python -c "import sys,json;print(json.load(sys.stdin)['result']['browserPageId'])")
  orca wait --page "$id" --load networkidle --json >/dev/null
  orca reload --page "$id" --json >/dev/null
  orca wait --page "$id" --load networkidle --json >/dev/null
  tahdista "$id" >/dev/null
  echo "$id"
}
kartta() { js "$1" "import('./src/map.js').then(m => m.MAP_NAME)"; }
huone() { js "$1" "document.getElementById('roomtext').textContent"; }
# Kuvakaappaus: kuva <sivu> <nimi> -> $PT_DIR/<nimi>.jpg
kuva() { orca screenshot --page "$1" --format jpeg --json | python -c "import sys,json,base64;open(sys.argv[1],'wb').write(base64.b64decode(json.load(sys.stdin)['result']['data']))" "$PT_DIR/$2.jpg"; echo "$PT_DIR/$2.jpg"; }
# Rajaus suhteellisina osuuksina: rajaa <nimi> <vasen> <ylä> <oikea> <ala>, esim. chat: 0 0.5 0.4 1
rajaa() { python -c "import sys;from PIL import Image;im=Image.open(sys.argv[1]);w,h=im.size;f=[float(x) for x in sys.argv[3:7]];im.crop((int(f[0]*w),int(f[1]*h),int(f[2]*w),int(f[3]*h))).save(sys.argv[2])" "$PT_DIR/$1.jpg" "$PT_DIR/$1-rajattu.jpg" "$2" "$3" "$4" "$5"; echo "$PT_DIR/$1-rajattu.jpg"; }
# Näppäimen pito: pida <sivu> <näppäin: w a s d r q e Shift> <sekuntia>
pida() { orca exec --page "$1" --command "keydown $2" --json >/dev/null; sleep "$3"; orca exec --page "$1" --command "keyup $2" --json >/dev/null; }
# Kaatumiset ja konsoli yhdestä välilehdestä.
virheet() {
  orca exec --page "$1" --command "errors" --json | python -c "import sys,json;e=json.load(sys.stdin)['result']['errors'];print(len(e),'kaatumista');[print(' ',x['text'][:300]) for x in e]"
  orca console --page "$1" --limit 200 --json | python -c "import sys,json;m=json.load(sys.stdin)['result']['messages'];print(len(m),'konsoliviestiä');[print(' ',x['type'],x['text'][:200]) for x in m]"
}
EOF
```

## 2. Palvelin

Käynnistä palvelin Orcan terminaaliin omassa worktreessäsi. Näin se näkyy omistajalle ja sen saa suljettua kahvalla, vaikka shell vaihtuu kutsujen välillä:

```sh
orca terminal create --worktree active --title pelipalvelin --command "python -m http.server $PORT" --json \
  | python -c "import sys,json;print(json.load(sys.stdin)['result']['terminal']['handle'])" > "$PT_DIR/palvelin"
cat "$PT_DIR/palvelin"                                              # term_…: palvelimen terminaalin kahva
sleep 1
```

Varmista, että palvelin palvelee tämän worktreen tiedostoja eikä jonkun toisen:

```sh
curl -s http://localhost:$PORT/index.html | md5sum; md5sum index.html   # tiivisteiden pitää täsmätä
```

Jos `index.html` tai moduulit ovat muuttuneet, aja `python tools/versio.py` ennen testiä. Muuten selain voi käyttää välimuistista vanhaa moduulia.

## 3. Host luo huoneen boteilla

```sh
source "$PT_DIR/pt.sh"
uusi_valilehti > "$PT_DIR/H"; source "$PT_DIR/pt.sh"
fps $H                                                              # yli 50, muuten aja: tahdista $H
orca fill  --page $H --element '#name'  --value "Hosti" --json      # nimikenttä
orca select --page $H --element '#bots' --value 3 --json            # Botteja: 0–3 (oletus 3)
orca click --page $H --element '#host' --json                       # "Luo huone"
orca wait  --page $H --text "Huone " --json
huone $H                                                            # odota: "Huone ABCD · 1 pelaaja"
kuva $H 01-host-lammittely
```

Odotettu tulos: aula katoaa, yläpalkissa `Huone ABCD · 1 pelaaja` ja napit *Aloita peli*, *Hahmo*, *Äänet*, *Kopioi linkki*, *Poistu*. Kuvassa lämmittelykenttä, pistetaulussa `Lämmittely` ja botit. Lämmittelyssä zombit voivat tappaa hostin heti (`Kuolit · Takaisin peliin 3 s`); se on normaalia.

Jos rivillä lukee `Luodaan huonetta…` yli 10 s tai `Ei verkkoyhteyttä`, PeerJS ei tavoita palvelintaan: kirjaa tämä ja keskeytä moninpeliosa.

## 4. Liittyjä samaan huoneeseen

```sh
source "$PT_DIR/pt.sh"
KOODI=$(huone $H | sed -E 's/^Huone ([A-Z]{4}).*/\1/'); echo $KOODI
uusi_valilehti > "$PT_DIR/J"; source "$PT_DIR/pt.sh"
fps $J                                                              # yli 50
orca fill  --page $J --element '#name' --value "Liittyja" --json
orca fill  --page $J --element '#code' --value "$KOODI" --json     # "Koodi"
orca click --page $J --element '#join' --json                       # "Liity"
orca wait  --page $H --text "2 pelaajaa" --json                     # odota hostin puolelta
huone $H; huone $J                                                  # "… · 2 pelaajaa" ja "Huone ABCD · ping N ms"
```

Liittyjän rivillä lukee aluksi `ping –`, joten älä odota tekstiä `ping`. Odota hostin `2 pelaajaa`. Vaihtoehtoinen reitti on linkki `http://localhost:$PORT/?huone=ABCD` (koodi täyttyy valmiiksi), mutta paina silti *Liity*.

## 5. Liikkuminen ja ampuminen lämmittelyssä (liittyjä)

Testaa liike, ammunta ja chat **ennen** kuin painat *Aloita peli*. Erässä ei synnytä uudelleen, ja botit ampuvat paikallaan seisovan testaajan nopeasti: ensimmäisellä ajokerralla liittyjä kuoli noin 2 s lähtölaskennan jälkeen, ennen kuin liiketesti ehti alkaa. Lämmittelyssä hahmo herää 3 s:ssa (`RESPAWN_TIME`).

Liittyjä on vaativampi kuin host, koska sen liike ennustetaan (`movePlayer`) ja hostin pitää hyväksyä se.

```sh
source "$PT_DIR/pt.sh"
kuva $J 03a-ennen          # jos kuvassa lukee "Kuolit · Takaisin peliin", odota 3 s ja ota uusi
pida $J w 1                                                         # 1 s ylös (myös a, s, d)
kuva $J 03b-liikkeen-jalkeen
LEV=$(js $J "innerWidth"); KOR=$(js $J "innerHeight")
orca mouse move --page $J --x $((LEV*3/4)) --y $((KOR/4)) --json    # tähtää oikealle ylös
orca mouse down --page $J --json; sleep 0.3; orca mouse up --page $J --json
kuva $J 03c-ammuttu
```

Odotettu tulos: hahmo on siirtynyt suhteessa seiniin. Kamera seuraa pelaajaa, joten vertaa kenttää, älä hahmon paikkaa ruudulla (paitsi kentän reunalla, jossa kamera pysähtyy). Ase osoittaa hiiren suuntaan, ja oikean alakulman ammusmäärä on pienentynyt (pistooli ampuu yhden laukauksen painallusta kohti, 8 → 7). Halutessasi toista sama hostilla.

Muut näppäimet samalla tavalla: `pida $J r 0.2` (lataa), `pida $J q 0.2` (vaihda asetta), `pida $J e 0.2` (osta), `pida $J Shift 0.2` tai `orca mouse down --button right` (väistö).

## 6. Chat molempiin suuntiin

```sh
source "$PT_DIR/pt.sh"
orca keypress --page $J --key Enter --json                          # avaa chat-kentän (#chatinput)
js $J "document.activeElement.id"                                   # pitää olla chatinput
orca type --page $J --input "Moi hosti, testiviesti 1" --json
orca keypress --page $J --key Enter --json                          # lähettää ja sulkee
sleep 0.5; kuva $H 04-host-chat; rajaa 04-host-chat 0 0.5 0.4 1

orca keypress --page $H --key Enter --json
orca type --page $H --input "Vastaus 2 <b>ei html</b>" --json
orca keypress --page $H --key Enter --json
sleep 0.5; kuva $J 04-liittyja-chat; rajaa 04-liittyja-chat 0 0.5 0.4 1
```

Odotettu tulos: rajatun kuvan vasemmassa alakulmassa näkyy `Liittyja: Moi hosti, testiviesti 1` hostilla ja `Hosti: Vastaus 2 <b>ei html</b>` liittyjällä. HTML näkyy kirjaimellisesti, koska chat piirretään canvasille. Kirjoittaessa peli ei saa liikkua: `releaseAll` vapauttaa näppäimet.

## 7. Peli alkaa: molemmat näkevät saman pelin

```sh
source "$PT_DIR/pt.sh"
orca click --page $H --element '#start' --json                      # "Aloita peli" (vain hostilla)
sleep 1
kuva $H 05-host-era1; kuva $J 05-liittyja-era1
kartta $H; kartta $J                                                # sama kentän nimi
```

Tarkista kuvista:
- Kummassakin on keskellä lähtölaskenta ja `Erä 1 · <kenttä>`. Kentän nimi on sama kuin `kartta`-komennon tulos.
- Pistetaulu (`Pisteet (20)`) listaa samat 5 pelaajaa (Hosti, Liittyja, Botti 1–3), ja oma rivi on merkitty ▸:lla.
- HUD: 100 HP, 500 $, Pistooli 8 / ∞ (aseet nollautuvat erän alussa).

## 8. Erä vaihtuu

Erä päättyy, kun yksi on jäljellä. Testaajat seisovat paikallaan, joten zombit, botit tai sumu hoitavat sen yleensä 1–2 minuutissa (sumu alkaa 10 s kohdalla ja sulkeutuu 60 s:ssa). Kysele kentän nimeä, älä odota sokkona:

```sh
source "$PT_DIR/pt.sh"
ALKU=$(kartta $H)
for i in $(seq 1 36); do sleep 5; K=$(kartta $H); [ "$K" != "$ALKU" ] && { echo "vaihtui $((i*5)) s: $ALKU -> $K"; break; }; done
kartta $H; kartta $J
kuva $H 06-host-era2; kuva $J 06-liittyja-era2
```

Odotettu tulos: kenttä vaihtuu kummassakin samaksi, kuvissa `Erä 2 · <kenttä>`, ja pistetaulu on sama molemmilla. Edellisen erän voittaja on saanut `WIN_POINTS` ja on taulun kärjessä. Jos kenttä ei vaihdu 3 minuutissa, ota kuvat ja kirjaa jumi.

## 9. Konsoli ja kaatumiset

```sh
source "$PT_DIR/pt.sh"
virheet $H; virheet $J
```

Odotettu tulos: `0 kaatumista` ja `0 konsoliviestiä` kummassakin. PeerJS ajetaan `debug: 1`:llä, joten se kirjoittaa konsoliin vain virheet. Mikä tahansa `error` tai `warning` on löydös. Kirjaa se sellaisenaan raporttiin.

## 10. Poistuminen ja siivous

```sh
source "$PT_DIR/pt.sh"
orca click --page $J --element '#leave' --json                      # "Poistu"
sleep 1.5
js $J "!document.getElementById('lobby').hidden"                    # true: aula takaisin
huone $H                                                            # "… · 1 pelaaja"
virheet $H; virheet $J                                              # yhä 0
orca tab close --page $J --json; orca tab close --page $H --json
orca terminal close --terminal "$(cat "$PT_DIR/palvelin")" --json   # sammuta palvelin
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:$PORT/   # 000 = suljettu
```

## Raportti

Liitä `worker_done`-viestiin tai raporttiin tiivis taulukko ja kuvien polut:

```
Selainpelitestaus (agentit/pelitestaus.md), haara X, PORT 8000
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

Jos muutoksesi koskee jotain tiettyä (uusi ase, kenttä, HUD), lisää oma vaiheensa: vie hahmo paikalle `pida`-komennoilla, ota kuva ja kerro, mitä kuvassa pitää näkyä.

## Mitä ei voi testata automaattisesti

Agentti näkee vain yksittäisiä kuvia ja konsolin. Seuraavat jäävät omistajalle:

- **Äänet:** Web Audio syntetisoi äänet, eikä agentti kuule niitä. Agentti voi tarkistaa vain, ettei äänikoodi kaadu (`virheet`).
- **Tuntuma:** ohjauksen viive ja jouhevuus, aseiden voima, väistön ajoitus, zombien uhkaavuus, vaikeustaso ja se, onko peli hauska.
- **Luettavuus pimeässä:** kuvat ovat yksittäisiä ruutuja. Näkyykö vastustaja ajoissa, erottuvatko värit ja onko HUD selkeä liikkeessä, on silmämääräinen arvio.
- **Oikea verkko:** molemmat välilehdet ovat samalla koneella (ping 0–1 ms). Pakettihäviö, todellinen viive, NAT ja TURN eivät tule testatuiksi.
- **Muut selaimet ja laitteet:** Orcan selain on Chromium. Firefox, Safari, mobiili ja heikot koneet (FPS) jäävät testaamatta.
- **Pitkä peli:** koko ottelu pisterajaan asti, Lyhtymies (erästä 3 alkaen, satunnainen) ja kaikki kentät. Nämä kannattaa todistaa simulaattorilla. Selaintesti näyttää vain, että piirto ja verkko toimivat.

### Miten kysyä omistajalta

Kysy koordinaattorin kautta (`orca orchestration ask`), ei suoraan. Koordinaattori välittää kysymyksen omistajalle. Tee kokeilusta helppo ja kysymyksestä suljettu:

1. **Mistä kokeilla:** worktree ja haara (Orcan diff-näkymä) sekä komento `python -m http.server 8000` siinä kansiossa, tai se, että palvelin jätetään erikseen pyytäen päälle.
2. **Mitä kokeilla:** enintään 3 asiaa, noin 5 minuuttia, konkreettisesti: "osta haulikko Kartanon seinästä ja ammu zombilaumaa".
3. **Mitä verrata:** "tuntuuko X erilaiselta kuin mainissa".
4. **Vastausvaihtoehdot** `--options`-listana, jotta vastaaminen on nopeaa.

Esimerkki:

```sh
orca orchestration ask --from <oma terminaali> --timeout-ms 600000 \
  --question "Haulikon rekyyli muutettu (haara lateepatee/haulikko). Selaintesti ja npm test OK. Kokeiletko 5 min: osta haulikko ja ammu laumaa. Tuntuuko laukaus nyt: liian heikolta, sopivalta vai liian vahvalta? Kuuluuko laukausääni oikein?" \
  --options "sopiva,liian heikko,liian vahva,en ehdi nyt"
```

Älä jää odottamaan tuntumakysymyksen vastausta, jos muu työ on valmis. Merkitse se raporttiin avoimeksi ja anna koordinaattorin päättää.

## Havainnot ohjeen ensimmäisistä ajoista (2026-10-24)

Ohje ajettiin kokonaan läpi lohko kerrallaan sellaisenaan (huone QSAS, 3 bottia). Kaikki vaiheet menivät läpi: 0 kaatumista ja 0 konsoliviestiä kummassakaan välilehdessä, erä vaihtui 45 s:ssa (Kartano → Varasto). Kaksi aiempaa koeajoa paljasti ohjeeseen nyt kirjatut sudenkuopat (ruudunpäivitysten hidastuminen, testijärjestys).

Pelistä löytyi kaksi asiaa, jotka eivät ole selviä bugeja mutta kannattaa näyttää omistajalle:

1. **HUDin päälle piirtyy kenttää.** Varastossa arpalaatikon kehys osui oikean alakulman ammusmäärän (`8 / ∞`) kohdalle, ja teksti oli vaikea lukea. HUDilla ei ole taustaa, joten kentän esineet sekoittuvat siihen.
2. **Pelaajat erottuvat pimeässä himmeinä.** Pimeyskerroksen peittävyys on 0,9–0,95 (`render.js`, `theme().darkness`), joten Hautausmaalla valaisematon vastustaja näkyi kuvassa heikkona sinisenä hahmona, vaikka nimi ja HP oli oikein piilotettu. Tämä on luultavasti tarkoituksellista, mutta se koskee teemaa ("vastustaja pimeässä on näkymätön"), joten omistaja päättää.

Lisäksi: Botti tappoi paikallaan seisovan liittyjän noin 2 s lähtölaskennan jälkeen. Tämä on odotettua pelattavuutta eikä bugi, mutta siksi testit tehdään lämmittelyssä.

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

Rajoitukset: `era` ja `bossi` toimivat vain, kun ottelu alkaa `botit`-parametrilla. `bossi=1` asettaa sumun kellon bossin syntyaikaan (15 s), joten zombien taso on hieman korkeampi kuin pelkällä `era`lla. Bossi ei synny alle kahdella elossa olevalla.

Tila luetaan konsolista: `__testi()` palauttaa `world`-olion (vain testitilassa). Esimerkki:

```sh
orca eval --page $P --expression "(w => JSON.stringify({round: w.round, zombies: w.zombies.length, boss: w.boss && {hp: w.boss.hp, state: w.boss.state}}))(__testi())" --json
orca exec --page $P --command "errors" --json
```

Esimerkkiosoitteet (palvelin kuten kohdassa 1, portti omasi):
- Myöhäinen peli ja bossi, pelkät botit: `http://localhost:8000/?testi=1&era=8&bossi=1&botit=3&katsele=1&nopeus=4`
- Ostokset: `http://localhost:8000/?testi=1&era=6&raha=max&botit=2` (pelaa itse, paljon rahaa)
- Tietty kenttä: `http://localhost:8000/?testi=1&botit=3&kentta=manor`

Tahdistin (`tahdista`) kannattaa ajaa, koska piilossa oleva paneeli antaa vain ~1,5 ruutua sekunnissa. Pienennä `nopeus` arvoon 1–2, jos haluat ottaa kuvakaappauksen tietystä hetkestä.
