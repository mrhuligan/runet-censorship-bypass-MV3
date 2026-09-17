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

## Установка

Готовые сборки — в разделе
[Releases](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest):

* [Полная версия (runet-censorship-bypass-full.zip)](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest/download/runet-censorship-bypass-full.zip)
  — проксирование, информер блокировок, сбор ошибок, меню ошибок прокси.
* [Облегчённая версия (runet-censorship-bypass-mini.zip)](https://github.com/mrhuligan/runet-censorship-bypass-MV3/releases/latest/download/runet-censorship-bypass-mini.zip)
  — только проксирование.

1. Скачать zip и распаковать в любую папку.
2. Открыть `chrome://extensions`.
3. Включить «Режим разработчика».
4. «Загрузить распакованное расширение» и выбрать папку с `manifest.json`.

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
