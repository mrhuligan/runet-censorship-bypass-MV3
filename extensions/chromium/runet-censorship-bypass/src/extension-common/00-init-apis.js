'use strict';

console.log('Extension started.');

{

  const IF_DEBUG = true;

  if (!IF_DEBUG) {
    // I believe logging objects precludes them from being GCed.
    // I also don't remove logs for sake of client-side troubleshooting
    // (though no one sent me logs so far).
    ['log', 'warn', 'error'].forEach( (meth) => {
      const _meth = console[meth].bind(console);
      console[meth] = function(...args) {

        _meth(...args.map((a) => '' + a));

      };
    });
  }

  const privates = {
    requestToResponder: {},
  };

  /*
    MV3: the worker has no `window`. 05-storage-shim.js aliases window to the
    worker global before this file runs, but we deliberately hang public
    APIs off `globalThis` to make the intent explicit and to survive the
    shim being disabled.
  */
  /*
    Kept as a standalone function rather than a method shorthand for clarity.
    Pages use their own copy in pages/lib/utils-local.js: MV3 CSP forbids
    eval, so the worker cannot ship this as source text.
  */
  const parseProxySchemeImpl = function parseProxyScheme(proxyAsStringRaw) {

    const proxyAsString = proxyAsStringRaw.trim();
    const [type] = proxyAsString.split(/\s+/);
    /*
    if (!/^[a-zA-Z0-9]+$/.test(type)) {
      throw new Error(`${type} is not a proxy type!`);
    }
      JS has no code blocks in RE, seems safe to omit this check.
    */
    const typeRe = new RegExp(`^${type}\\s+`, 'g');
    const crededAddr = proxyAsString.replace(typeRe, '');

    let parts;
    parts = crededAddr.split('@');
    let [creds, addr] = [parts.slice(0, -1).join('@'), parts[parts.length - 1]];

    const [hostname, port] = addr.split(':');

    parts = creds.split(':')
    const username = parts[0];
    const password = parts.slice(1).join(':');

    return {
      type,
      username,
      password,
      hostname,
      port,
      creds,
    }

  };

  const self = globalThis.utils = {

    mandatory() {

      throw new TypeError('Missing required argument. ' +
        'Be explicit if you swallow errors.');

    },

    throwIfError(err) {

      if(err) {
        throw err;
      }

    },

    lastError: undefined,

    checkChromeError() {

      // Chrome API calls your cb in a context different from the point of API
      // method invokation.
      const err = chrome.runtime.lastError || self.lastError;
      if (!err) {
        return;
      }
      console.warn('API returned error:', err);
      delete self.lastError;
      return new Error(err.message); // Add stack.

    },

    timeouted(cb = self.mandatory) {

      // setTimeout fixes error context, see bug #357568.
      return (...args) => setTimeout(() => cb(...args), 0);

    },

    chromified(cb = self.mandatory()) {

      // Take error first callback and convert it to chrome API callback.
      return function(...args) {

        const err = self.checkChromeError();
        self.timeouted(cb)(err, ...args);

      };

    },

    getOrDie(cb = self.mandatory()) {

      return self.chromified((err, ...args) => {

        if (err) {
          throw err;
        }
        cb(...args);

      });

    },

    /*
      MV3 proxy.settings.get/set return Promises and no longer take
      callbacks. These helpers wrap the promise API into the node-style
      callbacks the rest of the codebase still uses.
    */
    promisifiedChrome(methodName, ...args) {

      const fn = window.utils.getProp(chrome, methodName);
      return Promise.resolve(fn.apply(window.utils.getProp(chrome, methodName.split('.').slice(0, -1).join('.')), args));

    },

    proxyGet(details = {}) {

      return chrome.proxy.settings.get(details);

    },

    proxySet(details) {

      return chrome.proxy.settings.set(details);

    },

    proxyClear(details = {}) {

      return chrome.proxy.settings.clear(details);

    },

    getProp(obj, path = self.mandatory()) {

      const props = path.split('.');
      if (!props.length) {
        throw new TypeError('Property must be supplied.');
      }
      const lastProp = props.pop();
      for( const prop of props ) {
        if (!(prop in obj)) {
          return undefined;
        }
        obj = obj[prop];
      }
      return obj[lastProp];

    },

    assert(value) {

      if(!value) {
        console.assert(value);
        throw new Error('Assert failed for:' + value);
      }

    },

    addRequestResponder(requestType, responder) {

      if( privates.requestToResponder[requestType] ) {
        throw new TypeError(`Request ${requestType} already has responder!`);
      }
      privates.requestToResponder[requestType] = responder;

    },

    fireRequest(requestType, ...args) {

      const cb = args.slice(-1)[0];
      self.assert(typeof(cb) === 'function');
      const responder = privates.requestToResponder[requestType];
      if(responder) {
        responder(...args);
      } else {
        cb();
      }

    },

    // Promise wrapper over fireRequest, for async call sites.
    fireRequestPromise(requestType, ...args) {

      return new Promise((resolve, reject) => self.fireRequest(
        requestType,
        ...args,
        (err, res, ...warns) => err
          ? reject(Object.assign(err, { warns }))
          : resolve({ res, warns }),
      ));

    },

    /*
      Previously backed by window.localStorage. Now backed by
      05-storage-shim.js (chrome.storage.local). The signature is unchanged
      so call sites do not care where the data lives.
    */
    createStorage(prefix) {

      return function state(key, value) {

        key = prefix + key;
        if (value === null) {
          return globalThis.localStorage.removeItem(key);
        }
        if (value === undefined) {
          const item = globalThis.localStorage.getItem(key);
          return item && JSON.parse(item);
        }
        if (value instanceof Date) {
          throw new TypeError('Converting Date format to JSON is not supported.');
        }
        globalThis.localStorage.setItem(key, JSON.stringify(value));

      };

    },

    promisedLocalStorage: {
      get(key) {
        return new Promise((resolve) => (
          chrome.storage.local.get(
            key,
            window.utils.getOrDie((storage) => resolve(key ? storage[key] : storage)),
          )
        ));
      },
      set(items) {
        return new Promise((resolve) => (
          chrome.storage.local.set(items, resolve)
        ));
      },
      remove(keys) {
        return new Promise((resolve) => (
          chrome.storage.local.remove(keys, resolve)
        ));
      },
      clear() {
        return new Promise((resolve) => (
          chrome.storage.local.clear(resolve)
        ));
      },
    },

    /*
    * Possible values for levelOfControl:
    *
    * 1. "not_controllable"
    * 2. "controlled_by_other_extensions"
    * 3. "controllable_by_this_extension"
    * 4. "controlled_by_this_extension"
    *
    * See: https://developer.chrome.com/extensions/proxy
    * */


    areSettingsControllableFor(details) {

      return details.levelOfControl.endsWith('this_extension');

    },

    areSettingsControlledFor(details) {

      return details.levelOfControl.startsWith('controlled_by_this');

    },

    messages: {

      searchSettingsForUrl(niddle) {

        return 'chrome://settings/?search=' + (chrome.i18n.getMessage(niddle) || niddle);

      },

      whichExtensionHtml() {

        return chrome.i18n.getMessage('noControl') +
          ` <a href="${ this.searchSettingsForUrl('proxy') }">
            ${ chrome.i18n.getMessage('WhichQ') }
          </a>`;

      },

    },

    parseProxyScheme: parseProxySchemeImpl,

    openAndFocus(url) {

      chrome.tabs.create(
        {url: url},
        (tab) => chrome.windows.update(tab.windowId, {focused: true})
      );

    },

  };

  const max = 2**16;
  const versionToArray = (v) => [ ...v.split('.'), 0, 0, 0].slice(0,4);
  const versionToInt = (v) => versionToArray(v)
    .reverse()
    .reduce((acc, vv, i) => acc + parseInt(vv)*(max**i), 0);

  const compareVersions = (a, b) => versionToInt(a) - versionToInt(b);

  const ifFirefox = navigator.userAgent.toLowerCase().includes('firefox');

  let give;
  const promise = !ifFirefox ? Promise.resolve() : new Promise((resolve) => {
    give = resolve;
  });

  globalThis.apis = {
    consent: {
      promise,
      give,
    },
    platform: {
      ifFirefox,
    },
    version: {
      ifMini: false,
      build: chrome.runtime.getManifest().version.replace(/\d+\.\d+\./g, ''),

      isLeq: (a, b) => compareVersions(a, b) <= 0,
    },
  };

}
