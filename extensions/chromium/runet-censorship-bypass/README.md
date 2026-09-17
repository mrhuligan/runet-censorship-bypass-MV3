# Runet Censorship Bypass — Manifest V3 fork

This is a fork of
[anticensority/runet-censorship-bypass](https://github.com/anticensority/runet-censorship-bypass)
ported to **Manifest V3**.

Upstream still ships Manifest V2, which Chromium no longer loads. This fork
keeps the original feature set and adds a few things:

* Full **Manifest V3** port (service worker background, `chrome.action`, no
  `webRequestBlocking`). See `src/extension-common/FOR_REVIEWERS.md` for the
  technical notes.
* **Proxy credentials** (protected proxies) are embedded into the PAC-returned
  proxy string, since MV3 removed blocking `onAuthRequired`.
* **YouBoost** provider: a new "Использовать прокси YouBoost" option that
  registers a free trial on youboost.app, fetches a `vpn` proxy and uses it as
  one of your own proxies. It can also regenerate a fresh account through a
  user-supplied proxy (the service grants one trial per IP).

## Origin

* Upstream: <https://github.com/anticensority/runet-censorship-bypass>
* Original author: anticensority team, GPLv3.
* This fork only changes the extension code, not the PAC scripts it downloads.

## Install (from source)

Tested on:

* NodeJS: v22.
* NPM: 10.
* OS: Windows 11 (also builds fine on Linux/macOS).

```
npm install
cd src/extension-common/pages/options/
npm install
cd -

# Build all variants into ./build:
npm start
```

Load `build/extension-full` (or `build/extension-mini`) via
`chrome://extensions` → "Load unpacked".

> Note: recent branded Google Chrome refuses `--load-extension`. Use
> "Load unpacked" from the extensions page, or Chrome for Testing.

## Verifying a build

```
npm run verify
```

This renders every template for every variant, loads the built service worker
under a mock `chrome` API, and exercises the page-side RPC bridge.

## For Reviewers

See ./src/extension-common/FOR_REVIEWERS.md.

## Release Instructions

1. `npm run release`
2. Edit `src/templates-data.js` and bump version.
3. Commit the bumped version.
