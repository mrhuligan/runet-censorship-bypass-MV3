# Runet Censorship Bypass — Manifest V3 fork

**Это форк.** Оригинал:
[anticensority/runet-censorship-bypass](https://github.com/anticensority/runet-censorship-bypass).

This is a fork of the original extension, ported to **Manifest V3**.

Upstream still ships Manifest V2, which modern Chromium builds no longer load.
This fork keeps the original feature set and adds a few things:

* Full **Manifest V3** port (service worker background, `chrome.action`, no
  `webRequestBlocking`).
* **Proxy credentials** (protected proxies) are embedded into the PAC-returned
  proxy string, since MV3 removed blocking `onAuthRequired`.
* **YouBoost** provider: a "Использовать прокси YouBoost" option that registers
  a free trial on youboost.app, fetches a `vpn` proxy and uses it as one of your
  own proxies. It can also regenerate a fresh account through a user-supplied
  proxy (the service grants one trial per IP).

## Origin

* Original: <https://github.com/anticensority/runet-censorship-bypass>
* This fork only changes the extension code, not the PAC scripts it downloads.

## Install

Готовые сборки — в разделе
[Releases](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest):
[full zip](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest/download/runet-censorship-bypass-full.zip)
и
[mini zip](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest/download/runet-censorship-bypass-mini.zip).

Распаковать zip и загрузить папку через `chrome://extensions` → «Загрузить
распакованное расширение».

## Install (from source)

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
