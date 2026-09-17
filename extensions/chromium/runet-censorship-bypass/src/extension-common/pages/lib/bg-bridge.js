'use strict';

/*
  MV3 removed chrome.runtime.getBackgroundPage().

  Pages (options/popup, consent, debug, exceptions, troubleshoot, ...) used
  to grab a live reference to the background window and call its functions
  directly. That is impossible now, so this file provides a transparent
  async proxy object.

  Usage from a page:

    const bg = await window.bgBridge.connect();
    const mods = await bg.apis.pacKitchen.getPacModsAsync();
    await bg.apis.pacKitchen.keepCookedNowAsync(mods);

  Only REMOTE (JSON-serialisable) calls are allowed. Callbacks are emulated
  by awaiting a Promise, so all page call sites must be async-aware. Every
  method that used to take a node-style callback has an accompanying
  *Async helper on the worker side (see 90-rpc-server.js).

  A page may also read a cached snapshot of frequently-used sync values via
  `bg.state` (populated by the server on connect).
*/

{
  const RPC_NAME = 'acr-rpc';
  const RPC_KINDS = {
    CALL: 'call',
    GET: 'get',
    READY: 'ready',
  };

  const buildRemote = (path) => new Proxy(function() {}, {

    get(_target, prop) {

      if (prop === 'then') {
        // Prevent accidental promise-unwrapping of the proxy itself.
        return undefined;
      }
      if (prop === '__path') {
        return path;
      }
      return buildRemote(path ? `${path}.${String(prop)}` : String(prop));

    },

    apply(_target, _thisArg, args) {

      return send(RPC_KINDS.CALL, { path, args });

    },

  });

  const send = (kind, payload) => new Promise((resolve, reject) => {

    chrome.runtime.sendMessage({ name: RPC_NAME, kind, ...payload }, (response) => {

      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('Empty RPC response. Is the service worker alive?'));
        return;
      }
      if (response.error) {
        const err = new Error(response.error.message);
        err.name = response.error.name || 'Error';
        err.wrapped = response.error.wrapped;
        err.data = response.error.data;
        err.warns = response.error.warns || [];
        reject(err);
        return;
      }
      resolve(response.result);

    });

  });

  const ready = send(RPC_KINDS.READY, {}).then((snapshot) => {

    // `snapshot.ownProperties` is a plain object of small sync values that
    // pages need during render (e.g. flags, build number).
    return snapshot;

  }).catch(() => ({}));

  window.bgBridge = {

    connect() {

      return ready.then((snapshot) => {

        const bg = {
          apis: buildRemote('apis'),
          utils: buildRemote('utils'),
          state: snapshot.ownProperties || {},
          call: (path, ...args) => send(RPC_KINDS.CALL, { path, args }),
          get: (path) => send(RPC_KINDS.GET, { path }),
          // Legacy marker so call sites can check they are talking remotely.
          __remote: true,
        };

        /*
          The connect-time snapshot is a copy. Mutating operations (installing
          a PAC provider, toggling a modifier, adding exceptions) change the
          worker state, so the page must re-fetch the snapshot or the UI keeps
          showing stale values until the popup is reopened.

          refreshState() re-reads it. It is exposed on the bridge so
          components can call it after every mutation, and a storage listener
          refreshes it automatically when the worker writes to
          chrome.storage.local (e.g. antiCensorRu).
        */
        bg.refreshState = () => send(RPC_KINDS.READY, {}).then((fresh) => {

          /*
            Replace the state object (rather than mutating it) so that
            components can detect changes by identity in
            componentWillReceiveProps. theState.state in options/src/index.js
            is the same reference and must be updated too.
          */
          const next = Object.assign({}, fresh.ownProperties || {});
          bg.state = next;
          if (window.__onBgStateRefreshed) {
            window.__onBgStateRefreshed(next);
          }
          return next;

        });

        return bg;

      });

    },

    send,

    /*
      Test/diagnostics: forward a page-side error to the worker's dev log so
      one file contains everything. Called by tools/dev-log-page.js.
    */
    logToWorker(page, level, text) {

      return new Promise((resolve) => {

        chrome.runtime.sendMessage(
          { name: 'acr-page-log', page, level, text },
          () => resolve(),
        );

      });

    },

    /*
      Fetch the accumulated worker log as plain text (survives worker
      restarts because it lives in chrome.storage.local).
    */
    fetchLog() {

      return new Promise((resolve) => {

        chrome.runtime.sendMessage({ name: 'acr-dev-log', action: 'read' }, (res) => {

          resolve(res && res.text ? res.text : '(нет ответа от воркера)');

        });

      });

    },

    clearLog() {

      return new Promise((resolve) => {

        chrome.runtime.sendMessage({ name: 'acr-dev-log', action: 'clear' }, () => resolve());

      });

    },

  };

}
