'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = 'D:/runet-censorship-bypass/extensions/chromium/runet-censorship-bypass';
const { contexts } = require(path.join(root, 'src/templates-data.js'));

const outDir = path.join(os.tmpdir(), 'acr-verify');

const render = (tplPath, ctx) => {

  const tpl = fs.readFileSync(tplPath, 'utf8');
  const keys = Object.keys(ctx);
  const fn = new Function(...keys, 'return `' + tpl + '`;');
  return fn(...keys.map((k) => ctx[k]));

};

const targets = [
  ['extension-common/manifest.tmpl.json', 'manifest.json', 'json'],
  ['extension-common/background.tmpl.js', 'background.js', 'js'],
  ['extension-common/37-sync-pac-script-with-pac-provider-api.tmpl.js', 'sync.js', 'js'],
];

fs.mkdirSync(outDir, { recursive: true });

let failures = 0;

for (const name of ['full', 'mini', 'firefox', 'beta']) {

  const ctx = contexts[name];

  for (const [tpl, out, kind] of targets) {

    const tplPath = path.join(root, 'src', tpl);
    const dst = path.join(outDir, `${name}-${out}`);
    try {
      const text = render(tplPath, ctx);
      fs.writeFileSync(dst, text);
      if (kind === 'json') {
        JSON.parse(text);
        console.log(`${name} ${out}: valid JSON`);
      } else {
        execFileSync(process.execPath, ['--check', dst], { stdio: 'pipe' });
        console.log(`${name} ${out}: valid JS`);
      }
    } catch (e) {
      failures++;
      console.log(`${name} ${out}: ERROR -> ${(e.stderr && e.stderr.toString()) || e.message}`);
    }

  }

}

console.log(failures ? `\nFAILURES: ${failures}` : '\nALL TEMPLATES OK');
