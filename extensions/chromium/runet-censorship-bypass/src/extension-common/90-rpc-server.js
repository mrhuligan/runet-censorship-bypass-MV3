'use strict';

/*
  Server side of the page<->worker bridge installed by lib/bg-bridge.js.

  It answers with values that are JSON-serialisable. Anything that used to
  be a direct function call from a page (with a node-style callback) must
  have an *Async twin exposed on the worker APIs, because callbacks cannot
  cross the process boundary.

  The server executes by default in chrome.storage.session-less in-memory
  worker scope; there is exactly one worker, so results are consistent.
*/

{
  const RPC_NAME = 'acr-rpc';

  const resolvePath = (path) => {

    const parts = String(path || '').split('.').filter(Boolean);
    let node = globalThis;
    for (const part of parts) {
      if (node === undefined || node === null) {
        return { found: false, value: undefined, parent: null, leaf: null };
      }
      if (!(part in node)) {
        return { found: false, value: undefined, parent: node, leaf: part };
      }
      node = node[part];
    }
    return { found: true, value: node, parent: null, leaf: null };

  };

  const serialiseError = (err) => ({
    name: (err && err.name) || 'Error',
    message: (err && err.message) || String(err),
    wrapped: err && err.wrapped
      ? { message: err.wrapped.message || String(err.wrapped), name: err.wrapped.name }
      : undefined,
    data: err && err.data,
    /*
      Warnings are plain objects with a `message`, not Errors. Serialise them
      to strings so the page shows real text instead of "[object Object]".
    */
    warns: (err && err.warns || [])
      .filter(Boolean)
      .map((w) => (w && (w.message || w.toString())) || ''),
  });

  /*
    Snapshot of small, synchronously-usable values pages need during render.
    Keep this list tight: it crosses the process boundary on every connect.
  */
  const buildOwnProperties = () => {

    const snapshot = {};

    try {
      const apis = globalThis.apis || {};
      snapshot.build = apis.version && apis.version.build;
      snapshot.ifFirefox = Boolean(apis.platform && apis.platform.ifFirefox);
      snapshot.ifMini = Boolean(apis.version && apis.version.ifMini);
      snapshot.ifControllable = apis.errorHandlers && apis.errorHandlers.ifControllable;
      snapshot.ifControlled = apis.errorHandlers && apis.errorHandlers.ifControlled;
      snapshot.ifFirstInstall = apis.antiCensorRu && apis.antiCensorRu.ifFirstInstall;
      snapshot.pacUpdatePeriodInMinutes =
        apis.antiCensorRu && apis.antiCensorRu.pacUpdatePeriodInMinutes;
      snapshot.lastPacUpdateStamp =
        apis.antiCensorRu && apis.antiCensorRu.lastPacUpdateStamp;
      snapshot.currentPacProviderKey =
        apis.antiCensorRu && apis.antiCensorRu.getCurrentPacProviderKey();
      snapshot.ifCollectingErrors =
        apis.lastNetErrors && apis.lastNetErrors.ifCollecting;
      // Ordered modifier configs: the options page needs them at first render.
      snapshot.orderedConfigs = {
        general: apis.pacKitchen && apis.pacKitchen.getOrderedConfigs('general'),
        ownProxies: apis.pacKitchen && apis.pacKitchen.getOrderedConfigs('ownProxies'),
        exceptions: apis.pacKitchen && apis.pacKitchen.getOrderedConfigs('exceptions'),
      };
      snapshot.pacMods = apis.pacKitchen && apis.pacKitchen.getPacMods();
      snapshot.sortedProviders =
        apis.antiCensorRu && apis.antiCensorRu.getSortedEntriesForProviders();
      // Pre-rendered HTML for the "another extension controls proxy" banner.
      snapshot.whichExtensionHtml = globalThis.utils.messages.whichExtensionHtml();
      snapshot.uiLocale = chrome.i18n.getMessage('@@ui_locale');
      // Notification toggles: [id, human name, ifOn] triples.
      snapshot.notifiers = apis.errorHandlers
        ? Array.from(apis.errorHandlers.getEventsMap()).map(([id, name]) => ([
            id,
            name,
            Boolean(apis.errorHandlers.isOn(id)),
          ]))
        : [];
    } catch (e) {
      // Snapshot is best-effort only.
    }
    return snapshot;

  };

  /*
    MV3: the storage shim hydrates asynchronously. The "ready" snapshot and
    any state-reading call must wait for hydration, otherwise pages render
    empty modifier lists on a cold worker start.
  */
  const storageReady = (globalThis.__storageShim && globalThis.__storageShim.storageReady)
    || Promise.resolve();

  const handleCall = async ({ path, args }) => {

    await storageReady;

    const { found, value } = resolvePath(path);
    if (!found || typeof value !== 'function') {
      throw new TypeError(`RPC target is not a function: ${path}`);
    }

    const context = resolvePath(path.split('.').slice(0, -1).join('.')).value;
    const result = await value.apply(context, args || []);

    /*
      Several worker helpers resolve with { res, warns } where warns are
      Warning objects (plain objects with a message). Convert them to strings
      so the page can render them instead of "[object Object]".
    */
    if (result && Array.isArray(result.warns)) {
      result.warns = result.warns
        .filter(Boolean)
        .map((w) => (w && (w.message || w.toString())) || '');
    }
    return result;

  };

  const handleGet = async ({ path }) => {

    await storageReady;

    const { found, value } = resolvePath(path);
    if (!found) {
      return null;
    }
    if (typeof value === 'function') {
      // Functions cannot be serialised: call them with no args instead.
      return value.call(resolvePath(path.split('.').slice(0, -1).join('.')).value);
    }
    return value;

  };

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (!message || message.name !== RPC_NAME) {
      /*
        Dev-log convenience channel: a page can ask for the raw worker log
        text without going through the generic proxy.
      */
      if (message && message.name === 'acr-dev-log') {
        if (!globalThis.__devLog) {
          sendResponse({ text: '(dev log disabled)' });
          return false;
        }
        if (message.action === 'clear') {
          globalThis.__devLog.clear().then(() => sendResponse({ ok: true }));
          return true;
        }
        globalThis.__devLog.toText().then((text) => sendResponse({ text }));
        return true;
      }
      /*
        Persist page-side errors into the same log so a single file contains
        both worker and page failures.
      */
      if (message && message.name === 'acr-page-log' && globalThis.__devLog) {
        globalThis.__devLog.record(
          message.level || 'error',
          [`[page:${message.page || '?'}]`, message.text],
        );
        globalThis.__devLog.flush();
        sendResponse({ ok: true });
        return false;
      }
      return false;
    }

    (async () => {

      try {
        if (message.kind === 'ready') {
          await storageReady;
          sendResponse({ result: { ownProperties: buildOwnProperties() } });
          return;
        }
        if (message.kind === 'call') {
          sendResponse({ result: await handleCall(message) });
          return;
        }
        if (message.kind === 'get') {
          sendResponse({ result: await handleGet(message) });
          return;
        }
        sendResponse({ error: { name: 'TypeError', message: `Unknown RPC kind: ${message.kind}` } });
      } catch (err) {
        sendResponse({ error: serialiseError(err) });
      }

    })();

    return true; // Keep the message channel open for the async response.

  });

  globalThis.acrRpcServer = { resolvePath, buildOwnProperties };

}
