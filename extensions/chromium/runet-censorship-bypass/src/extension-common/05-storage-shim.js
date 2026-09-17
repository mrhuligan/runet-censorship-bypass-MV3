'use strict';

/*
  MV3 service workers have no `window` and no `localStorage`.

  This file must be imported FIRST (before 00-init-apis.js). It creates a
  synchronous localStorage-compatible shim that is backed by
  chrome.storage.local. The shim exposes:

    * globalThis.localStorage          (getItem/setItem/removeItem/clear/key/length)
    * globalThis.window                (set to the worker global so legacy
                                        `window.*` writes keep working)

  Synchronous reads are served from an in-memory cache. The cache is
  hydrated asynchronously on worker start; every write is mirrored to
  chrome.storage.local. Code that must observe writes made by other
  contexts (pages, other worker instances) uses the exported
  `window.__storageReady` promise or listens to chrome.storage.onChanged.

  NOTE: `Storage.prototype.key` and `.length` are supported for parity but
  ordering is insertion-order of the hydration pass, not of original writes.
*/

{
  const area = chrome.storage.local;

  const MEM_PREFIX = '__ls__:';

  const cache = new Map();
  let ifHydrated = false;

  const hydrateResolvers = [];
  const storageReady = new Promise((resolve) => hydrateResolvers.push(resolve));

  const keyOf = (k) => MEM_PREFIX + String(k);

  const stripPrefix = (k) => (
    k.startsWith(MEM_PREFIX) ? k.substr(MEM_PREFIX.length) : null
  );

  const api = {

    getItem(key) {

      key = String(key);
      return cache.has(key) ? cache.get(key) : null;

    },

    setItem(key, value) {

      key = String(key);
      value = String(value);
      cache.set(key, value);
      area.set({ [keyOf(key)]: value });

    },

    removeItem(key) {

      key = String(key);
      cache.delete(key);
      area.remove(keyOf(key));

    },

    clear() {

      cache.clear();
      // Remove only our own prefixed keys, never the whole area: other parts
      // of the extension (e.g. antiCensorRu) keep their data there.
      area.get(null).then((all) => {

        const ours = Object.keys(all).filter((k) => k.startsWith(MEM_PREFIX));
        if (ours.length) {
          area.remove(ours);
        }

      });

    },

    key(index) {

      const keys = [...cache.keys()];
      return index >= 0 && index < keys.length ? keys[index] : null;

    },

    get length() {

      return cache.size;

    },

  };

  // Keep the cache coherent when a page or another worker instance writes.
  chrome.storage.onChanged.addListener((changes, areaName) => {

    if (areaName !== 'local') {
      return;
    }
    for (const changedKey of Object.keys(changes)) {

      const plainKey = stripPrefix(changedKey);
      if (plainKey === null) {
        continue;
      }
      const { newValue } = changes[changedKey];
      if (newValue === undefined) {
        cache.delete(plainKey);
      } else {
        cache.set(plainKey, newValue);
      }

    }

  });

  const hydrate = async () => {

    const all = await area.get(null);
    for (const storedKey of Object.keys(all)) {

      const plainKey = stripPrefix(storedKey);
      if (plainKey !== null) {
        cache.set(plainKey, all[storedKey]);
      }

    }
    ifHydrated = true;
    hydrateResolvers.forEach((resolve) => resolve());

  };

  hydrate();

  // Install the shim on the worker global.
  globalThis.localStorage = api;
  globalThis.Storage = Object.getPrototypeOf(api).constructor;
  globalThis.window = globalThis;

  globalThis.__storageShim = {
    storageReady,
    ifHydrated: () => ifHydrated,
    // Escape hatch for pages that want to await hydration before rendering.
    whenHydrated: () => storageReady,
  };

}
