"""Päivittää moduulien versiot index.html:ään.

Selain pitää tiedostot välimuistissa (GitHub Pages: 10 min). Jos uusi ja vanha versio sekoittuvat,
peli ei käynnisty. Siksi jokainen src/-moduuli ladataan import-kartan kautta osoitteella
src/x.js?v=TIIVISTE, jossa tiiviste lasketaan tiedoston sisällöstä: muuttunut tiedosto saa
automaattisesti uuden osoitteen, muuttumattomat pysyvät välimuistissa.

Aja ennen jokaista committia (pre-commit-tarkistus muistuttaa):

    python tools/versio.py          # päivittää index.html:n
    python tools/versio.py --check  # palauttaa virheen, jos index.html on vanhentunut
"""

import base64
import hashlib
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'
SRC = ROOT / 'src'


def short_hash(path):
    # Rivinvaihdot normalisoidaan, jotta tiiviste on sama Windowsilla ja GitHubissa.
    data = path.read_bytes().replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()[:10]


versions = {p.name: short_hash(p) for p in sorted(SRC.glob('*.js'))}
importmap = json.dumps(
    {'imports': {f'./src/{m}': f'./src/{m}?v={v}' for m, v in versions.items()}},
    indent=2, ensure_ascii=False,
)
# Selain laskee CSP-tarkistussumman script-elementin sisällöstä sellaisenaan.
content = '\n' + importmap + '\n  '
digest = base64.b64encode(hashlib.sha256(content.encode('utf-8')).digest()).decode()

original = INDEX.read_text(encoding='utf-8')
html = re.sub(
    r'<script type="importmap">.*?</script>',
    lambda _: f'<script type="importmap">{content}</script>',
    original, flags=re.S,
)
html = re.sub(r"'sha256-[A-Za-z0-9+/=]+'", f"'sha256-{digest}'", html)
html = re.sub(r'src="src/main\.js(\?v=[0-9a-f]+)?"', f'src="src/main.js?v={versions["main.js"]}"', html)

if '--check' in sys.argv:
    if html != original:
        print('index.html on vanhentunut: aja python tools/versio.py ja lisää index.html committiin.')
        sys.exit(1)
    sys.exit(0)

INDEX.write_text(html, encoding='utf-8', newline='\n')
print(f'{len(versions)} moduulia versioitu sisällön mukaan, import-kartan tarkistussumma sha256-{digest}')
