"""Päivittää pelin version index.html:ään.

Selain pitää tiedostot välimuistissa (GitHub Pages: 10 min). Jos uusi ja vanha versio sekoittuvat,
peli ei käynnisty. Siksi jokainen src/-moduuli ladataan osoitteella src/x.js?v=VERSIO import-kartan
kautta, ja uusi versio = uudet osoitteet = ei vanhaa välimuistia.

Versio luetaan protocol.js:n PEER_PREFIXistä (areena-peli-vN-), joka nostetaan aina kun
verkkoviestit muuttuvat. Aja tämä aina ennen julkaisua:

    python tools/versio.py
"""

import base64
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SRC = ROOT / 'src'

protocol = (SRC / 'protocol.js').read_text(encoding='utf-8')
version = re.search(r"PEER_PREFIX = 'areena-peli-v(\d+)-'", protocol).group(1)

modules = sorted(p.name for p in SRC.glob('*.js'))
importmap = json.dumps(
    {'imports': {f'./src/{m}': f'./src/{m}?v={version}' for m in modules}},
    indent=2, ensure_ascii=False,
)
# Selain laskee tarkistussumman script-elementin sisällöstä sellaisenaan.
content = '\n' + importmap + '\n  '
digest = base64.b64encode(hashlib.sha256(content.encode('utf-8')).digest()).decode()

html = INDEX.read_text(encoding='utf-8')
html = re.sub(
    r'<script type="importmap">.*?</script>',
    lambda _: f'<script type="importmap">{content}</script>',
    html, flags=re.S,
)
html = re.sub(r"'sha256-[A-Za-z0-9+/=]+'", f"'sha256-{digest}'", html)
html = re.sub(r'src="src/main\.js(\?v=\d+)?"', f'src="src/main.js?v={version}"', html)
INDEX.write_text(html, encoding='utf-8', newline='\n')
print(f'Versio {version}: {len(modules)} moduulia, import-kartan tarkistussumma sha256-{digest}')
