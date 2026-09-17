'use strict';

/*
  MV3 service worker entry point.

  Chrome forbids window/localStorage in a worker, so 05-storage-shim.js runs
  first: it installs the storage shim plus a window alias pointing at the
  worker global. Everything after that is the original extension code, loaded
  verbatim in dependency order.

  90-rpc-server.js must load last: it exposes the page<->worker RPC layer that
  replaced chrome.runtime.getBackgroundPage().
*/

importScripts(
    '05-storage-shim.js'
  , '04-dev-log.js'
  , '00-init-apis.js'
  , '11-error-handlers-api.js'
  , '12-errors-lib.js'
  , '13-http-lib.js'
  , '15-firefox-proxy-settings.js'
  ${scripts_2x}
  , '40-youboost-api.js'
  , '35-pac-kitchen-api.js'
  , '37-sync-pac-script-with-pac-provider-api.js'
  ${scripts_8x}
  , '70-menu-items.js'
  , '75-context-menus.js'
  , '90-rpc-server.js'
);
