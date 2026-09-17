# Runet Censorship Bypass — Manifest V3

Это форк расширения
[anticensority/runet-censorship-bypass](https://github.com/anticensority/runet-censorship-bypass),
переписанный на **Manifest V3**.

Оригинал выходит на Manifest V2, который современные версии Chromium больше
не загружают. Этот форк сохраняет функциональность оригинала и добавляет:

* полный перенос на Manifest V3 (фоновый service worker, `chrome.action`,
  отказ от `webRequestBlocking`);
* парольные прокси через встраивание учётных данных в PAC-строку (в MV3
  блокирующий `onAuthRequired` недоступен);
* провайдер **YouBoost** — опция «Использовать прокси YouBoost»: регистрирует
  бесплатный доступ на youboost.app, получает прокси типа `vpn` и использует
  его как свои прокси, с возможностью перегенерировать доступ.

## Оригинал

* Репозиторий: <https://github.com/anticensority/runet-censorship-bypass>
* Этот форк меняет только код расширения, но не PAC-скрипты, которые оно
  загружает.

## Исходный код расширения

`extensions/chromium/runet-censorship-bypass`

## Сборка

```
npm install
cd extensions/chromium/runet-censorship-bypass/src/extension-common/pages/options/
npm install
cd -

cd extensions/chromium/runet-censorship-bypass
npm start
```

Готовые сборки появятся в `extensions/chromium/runet-censorship-bypass/build`.
Загружайте `build/extension-full` или `build/extension-mini` через
`chrome://extensions` → «Загрузить распакованное расширение».
