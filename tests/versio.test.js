// tools/versio.py --check: index.html:n import-kartta vastaa src/-moduulien sisältöä.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Windowsilla Python on yleensä "python", muualla usein vain "python3".
function findPython() {
  for (const cmd of ['python', 'python3', 'py']) {
    const r = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (r.status === 0 && /Python 3/.test(r.stdout + r.stderr)) return cmd;
  }
  return null;
}

const python = findPython();

test('python tools/versio.py --check onnistuu', { skip: python ? false : 'Pythonia ei löytynyt' }, () => {
  const r = spawnSync(python, ['tools/versio.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, `versio.py --check epäonnistui:\n${r.stdout}${r.stderr}`);
});
