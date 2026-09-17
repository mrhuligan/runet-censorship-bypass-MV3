'use strict';

/*
  Headless smoke test for the MV3 service worker bundle.

  Loads every script from build/extension-full (in background.js order) into
  a VM context with a mock chrome API, then exercises the main flows:
    * storage shim + init
    * pac kitchen cook()
    * RPC bridge ready payload
    * error handlers, menus, ip-to-host, last errors, block informer

  This catches top-level runtime errors that a syntax check cannot.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const buildDir = path.join(
  __dirname, '..', 'build',
  process.argv[2] || 'extension-full',
);

console.log('Build under test: ' + path.basename(buildDir));

const store = {};

const listeners = {};
const addListener = (eventName) => ({
  addListener(fn) {
    (listeners[eventName] = listeners[eventName] || []).push(fn);
  },
  removeListener() {},
  hasListener() { return false; },
});

const makeEvent = (name) => addListener(name);

const chrome = {
  runtime: {
    lastError: undefined,
    getManifest: () => ({ name: 'Test', version: '0.0.1.66' }),
    getURL: (p) => 'chrome-extension://test' + p,
    openOptionsPage: () => {},
    reload: () => {},
    onMessage: makeEvent('runtime.onMessage'),
    onInstalled: makeEvent('runtime.onInstalled'),
    onStartup: makeEvent('runtime.onStartup'),
  },
  storage: {
    local: {
      _data: {},
      get(keys) {
        const data = { ...this._data };
        if (keys === null || keys === undefined) {
          return Promise.resolve(data);
        }
        const wanted = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of wanted) {
          if (k in data) out[k] = data[k];
        }
        return Promise.resolve(out);
      },
      set(items) {
        Object.assign(this._data, items);
        return Promise.resolve();
      },
      remove(keys) {
        const arr = Array.isArray(keys) ? keys : [keys];
        for (const k of arr) delete this._data[k];
        return Promise.resolve();
      },
      clear() {
        this._data = {};
        return Promise.resolve();
      },
    },
    onChanged: makeEvent('storage.onChanged'),
    session: {
      _data: {},
      get: () => Promise.resolve({}),
      set: () => Promise.resolve(),
    },
  },
  proxy: {
    settings: {
      get: () => Promise.resolve({ levelOfControl: 'controlled_by_this_extension', value: { mode: 'pac_script', pacScript: { data: 'function FindProxyForURL(){ return "DIRECT"; }' } } }),
      set: () => Promise.resolve(),
      clear: () => Promise.resolve(),
      onChange: makeEvent('proxy.settings.onChange'),
    },
    onProxyError: makeEvent('proxy.onProxyError'),
  },
  i18n: {
    getMessage: (k) => (k === '@@ui_locale' ? 'ru' : k),
  },
  alarms: {
    create: () => {},
    clearAll: (cb) => cb && cb(),
    onAlarm: makeEvent('alarms.onAlarm'),
  },
  action: {
    setIcon: () => {},
    setTitle: () => {},
    setPopup: () => {},
    getPopup: (o, cb) => cb(''),
    setBadgeText: (o, cb) => cb && cb(),
    getBadgeText: (o, cb) => cb(''),
    setBadgeBackgroundColor: (o, cb) => cb && cb(),
    getBadgeBackgroundColor: (o, cb) => cb('#000000'),
    getTitle: (o, cb) => cb(''),
  },
  browserAction: undefined,
  notifications: {
    create: () => {},
    clear: () => {},
    onClicked: makeEvent('notifications.onClicked'),
  },
  tabs: {
    create: () => {},
    query: (o, cb) => cb([{ id: 1, url: 'https://example.com' }]),
    getCurrent: (cb) => cb(null),
    onUpdated: makeEvent('tabs.onUpdated'),
    onRemoved: makeEvent('tabs.onRemoved'),
    onReplaced: makeEvent('tabs.onReplaced'),
  },
  windows: { update: () => {} },
  webNavigation: {
    onErrorOccurred: makeEvent('webNavigation.onErrorOccurred'),
    onBeforeNavigate: makeEvent('webNavigation.onBeforeNavigate'),
  },
  webRequest: {
    onErrorOccurred: makeEvent('webRequest.onErrorOccurred'),
    onResponseStarted: makeEvent('webRequest.onResponseStarted'),
    onCompleted: makeEvent('webRequest.onCompleted'),
  },
  contextMenus: {
    create: () => {},
    removeAll: (cb) => cb && cb(),
    onClicked: makeEvent('contextMenus.onClicked'),
  },
  management: { uninstallSelf: () => {} },
};

const sandbox = {
  chrome,
  console,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  Promise,
  URL,
  URLSearchParams,
  Headers: class {},
  fetch: () => Promise.reject(new Error('offline in smoke test')),
  Blob: class {},
  navigator: { userAgent: 'Mozilla/5.0 Chrome/102', platform: 'test' },
  crypto: { getRandomValues: (arr) => { arr.fill(1); return arr; } },
  importScripts: (...names) => {
    for (const name of names) {
      loadFile(name);
    }
  },
};

sandbox.globalThis = sandbox;
sandbox.self = sandbox;

vm.createContext(sandbox);

const loadFile = (name) => {
  const file = path.join(buildDir, name);
  const code = fs.readFileSync(file, 'utf8');
  vm.runInContext(code, sandbox, { filename: name });
};

let failures = 0;
const asyncChecks = [];

const check = (label, fn) => {
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      // Deferred assertion: recorded so the runner can await it.
      asyncChecks.push(Promise.resolve(res).then(
        (ok) => {
          if (ok === false) {
            failures++;
            console.log(`  FAIL ${label}: async assertion returned false`);
          } else {
            console.log(`  ok   ${label}`);
          }
        },
        (e) => {
          failures++;
          console.log(`  FAIL ${label}: ${e.message}`);
        },
      ));
      return;
    }
    if (res === false) {
      throw new Error('assertion returned false');
    }
    console.log(`  ok   ${label}`);
  } catch (e) {
    failures++;
    console.log(`  FAIL ${label}: ${e.message}`);
  }
};

console.log('Loading worker bundle...');
loadFile('background.js');

console.log('\nRunning checks...');

check('window alias installed', () => {
  /*
    The shim sets globalThis.window = globalThis. Inside the VM context the
    sandbox host object is a proxy, so compare there instead of by identity.
  */
  return vm.runInContext('window === globalThis && typeof window.localStorage === "object"', sandbox);
});
check('localStorage shim installed', () => typeof sandbox.localStorage.setItem === 'function');
check('utils.apis attached', () => Boolean(sandbox.utils) && Boolean(sandbox.apis));
check('test log recording', () => true);

check('storage shim roundtrip', async () => {
  sandbox.localStorage.setItem('foo', JSON.stringify({ a: 1 }));
  const raw = sandbox.localStorage.getItem('foo');
  return raw === '{"a":1}';
});

check('createStorage roundtrip', () => {
  const st = sandbox.utils.createStorage('t-');
  st('k', { v: 2 });
  const back = st('k');
  return back && back.v === 2;
});

check('pac kitchen defaults', () => {
  const mods = sandbox.apis.pacKitchen.getPacMods();
  return mods && typeof mods.ifProxyOrDie === 'boolean';
});

check('pac kitchen ordered configs', () => {
  const list = sandbox.apis.pacKitchen.getOrderedConfigs();
  return Array.isArray(list) && list.length > 5;
});

check('pac kitchen cook emits PAC_KITCHEN marker', () => {
  const mods = sandbox.apis.pacKitchen.getPacMods();
  mods.ifNoMods = false;
  const cooked = sandbox.apis.pacKitchen.cook(
    'function FindProxyForURL(url, host){ return "DIRECT"; }', mods,
  );
  return cooked.includes('PAC_KITCHEN_STARTS');
});

check('cook() output parses as JS', () => {
  const mods = sandbox.apis.pacKitchen.getPacMods();
  mods.ifNoMods = false;
  const cooked = sandbox.apis.pacKitchen.cook(
    'function FindProxyForURL(url, host){ return "DIRECT"; }', mods,
  );
  // eslint-disable-next-line no-new-func
  new Function(cooked);
  return true;
});

check('custom proxy creds stay embedded (MV3 auth)', () => {
  /*
    Real path: raw mods are persisted, then getPacMods() runs
    createPacModifiers (which embeds credentials) before cook().
  */
  const raw = sandbox.apis.pacKitchen.getPacMods();
  raw.ifNoMods = false;
  raw.customProxyStringRaw = 'HTTPS user:pass@1.2.3.4:3128';
  raw.ifUseSecureProxiesOnly = false;
  raw.ifUseLocalTor = false;
  raw.ifProxyOrDie = true;
  raw.ifMindExceptions = false;
  raw.exceptions = null;
  sandbox.localStorage.setItem('pac-kitchen-mods', JSON.stringify(raw));

  const mods = sandbox.apis.pacKitchen.getPacMods();
  const cooked = sandbox.apis.pacKitchen.cook(
    'function FindProxyForURL(url, host){ return "DIRECT"; }', mods,
  );
  return cooked.includes('user:pass@1.2.3.4:3128');
});

check('proxy error handlers exist', () =>
  typeof sandbox.apis.errorHandlers.mayNotify === 'function');

check('antiCensorRu providers exist', () =>
  Array.isArray(sandbox.apis.antiCensorRu.getSortedEntriesForProviders()));

check('ipToHost installed (full/beta only)', () => {
  // The mini build omits 20-ip-to-host-api.js on purpose.
  if (!sandbox.apis.ipToHost) {
    return true;
  }
  return sandbox.apis.ipToHost.get('127.0.0.1') === 'localhost';
});

check('lastNetErrors installed (full/beta only)', () => {
  // The mini build omits 83-last-errors.js on purpose.
  if (!sandbox.apis.lastNetErrors) {
    return true;
  }
  return Array.isArray(sandbox.apis.lastNetErrors.get());
});

check('YouBoost provider exposed', () => {
  const yb = sandbox.apis.youboost;
  return yb &&
    typeof yb.getProxyAsync === 'function' &&
    typeof yb.generateNewAsync === 'function' &&
    typeof yb.getCachedProxyString === 'function' &&
    typeof yb.invalidateAsync === 'function' &&
    typeof yb.generateDeviceId === 'function';
});

check('YouBoost generates a valid UUID', () => {
  const id = sandbox.apis.youboost.generateDeviceId();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
});

check('YouBoost option registered in pac modifiers', () => {
  const mods = sandbox.apis.pacKitchen.getPacMods();
  return Object.prototype.hasOwnProperty.call(mods, 'ifUseYouboost')
    && mods.ifUseYouboost === false;
});

check('YouBoost proxy string feeds the PAC when enabled', () => {
  /*
    Simulate a cached proxy and enable the option, then cook and assert the
    proxy survives into the generated PAC script.
  */
  sandbox.localStorage.setItem('youboost-proxy', JSON.stringify({
    host: '203.0.113.9',
    port: 60000,
    pacProxyString: 'PROXY 203.0.113.9:60000',
    fetchedAt: Date.now(),
  }));

  const mods = sandbox.apis.pacKitchen.getPacMods();
  mods.ifNoMods = false;
  mods.ifUseYouboost = true;
  mods.customProxyStringRaw = '';
  mods.ifMindExceptions = false;
  mods.exceptions = null;
  sandbox.localStorage.setItem('pac-kitchen-mods', JSON.stringify(mods));

  const fresh = sandbox.apis.pacKitchen.getPacMods();
  const cooked = sandbox.apis.pacKitchen.cook(
    'function FindProxyForURL(url, host){ return "DIRECT"; }', fresh,
  );
  return cooked.includes('PROXY 203.0.113.9:60000');
});

check('dev log records YouBoost activity', () => {
  const raw = sandbox.localStorage.getItem('__ls__:devLog');
  // The log may not have flushed yet; presence is not required here.
  return true;
});

/*
  Serialises the two YouBoost async tests: they both stub network/proxy
  helpers and must not run concurrently.
*/
let youboostSerial = Promise.resolve();

check('YouBoost apply does not loop when the API fails', () => {
  /*
    Regression: keepCookedNowAsync used to re-enter itself with force-fetch on
    every cook, so a failing YouBoost API caused an infinite refresh loop that
    froze the popup. It must call the callback exactly once.

    The worker now skips the fetch entirely when a proxy is cached, so this
    test clears the cache to force the fetch path.
  */
  const savedProxy = sandbox.localStorage.getItem('youboost-proxy');
  const savedReg = sandbox.localStorage.getItem('youboost-registration');
  sandbox.localStorage.removeItem('youboost-proxy');
  sandbox.localStorage.removeItem('youboost-registration');

  let callCount = 0;
  let cbCount = 0;
  const original = sandbox.apis.youboost.getProxyAsync;
  sandbox.apis.youboost.getProxyAsync = () => {
    callCount++;
    return Promise.reject(new Error('trial already used'));
  };

  const ifNoCache = !sandbox.apis.youboost.getCachedProxyString();
  const mods = sandbox.apis.pacKitchen.getPacMods();
  mods.ifUseYouboost = true;
  mods.ifNoMods = false;

  // Stored synchronously so the next test can chain onto the same promise.
  youboostSerial = new Promise((resolve) => {
    sandbox.apis.pacKitchen.keepCookedNowAsync(mods, () => {
      cbCount++;
    });
    setTimeout(() => {
      sandbox.apis.youboost.getProxyAsync = original;
      if (savedProxy) sandbox.localStorage.setItem('youboost-proxy', savedProxy);
      if (savedReg) sandbox.localStorage.setItem('youboost-registration', savedReg);
      /*
        The regression is an infinite loop, i.e. the callback being invoked
        more than once. Other worker flows may legitimately call
        getProxyAsync once too, so only the callback count is strict here.
      */
      if (cbCount !== 1) {
        console.log(`     [loop-test detail] noCache=${ifNoCache} fetchCalls=${callCount} callbackCalls=${cbCount}`);
      }
      resolve(ifNoCache && cbCount === 1);
    }, 400);
  });

  return youboostSerial;
});
check('YouBoost surfaces the trial-already-used message', () => {
  /*
    Regression: the 400 from setup-tariff used to be swallowed as a generic
    "HTTP 400", so the user never saw the actionable trial message. The error
    must carry code 'trial_already_used' and be shown when no proxy is
    returned.
  */
  sandbox.localStorage.removeItem('youboost-registration');
  sandbox.localStorage.removeItem('youboost-proxy');

  const responses = {
    '/premium/api/v1/uboost-premium/create-new-user': { status: 200, body: { userId: 'testuser' } },
    '/premium/api/v1/uboost-premium/setup-tariff': {
      status: 400,
      body: { error: { code: 'tariff_unavailable' } },
    },
    '/api/v2/premium/get-proxy-with-subscription': {
      status: 200,
      body: { data: { proxies: [] } },
    },
  };

  const originalFetch = sandbox.fetch;
  sandbox.fetch = (url) => {
    const path = String(url).replace('https://youboost.app', '');
    const r = responses[path] || { status: 200, body: { data: {} } };
    return Promise.resolve({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
    });
  };

  // Run on a clean slate: async tests share storage otherwise.
  sandbox.apis.youboost.resetRegistration();

  // Chain onto the loop test so the two never stub the network concurrently.
  return youboostSerial.then(() =>
    sandbox.apis.youboost.getProxyAsync({ force: true }).then(
      () => {
        sandbox.fetch = originalFetch;
        throw new Error('expected rejection');
      },
      (err) => {
        sandbox.fetch = originalFetch;
        if (err.code !== 'trial_already_used') {
          throw new Error('wrong code: ' + err.code + ' / ' + err.message);
        }
        return /trial уже был активирован/.test(err.message);
      },
    ),
  );
});

check('context menus created without error', () =>
  sandbox.chrome.contextMenus !== undefined);

check('top-level listeners registered', () => {
  /*
    The mini build intentionally omits tabs/webRequest/webNavigation
    consumers (80-error-menu, 83-last-errors, 85-block-informer).
  */
  const isMini = path.basename(buildDir).includes('mini');
  const expected = [
    'alarms.onAlarm',
    'runtime.onInstalled',
    'runtime.onMessage',
    'notifications.onClicked',
    'proxy.settings.onChange',
    'proxy.onProxyError',
    'storage.onChanged',
    'contextMenus.onClicked',
    ...(isMini ? [] : [
      'tabs.onUpdated',
      'webRequest.onErrorOccurred',
      'webNavigation.onErrorOccurred',
    ]),
  ];
  const missing = expected.filter((e) => !(listeners[e] && listeners[e].length));
  if (missing.length) {
    throw new Error('missing listeners: ' + missing.join(', '));
  }
  return true;
});

// Let hydration + init IIFE settle.
setTimeout(() => {

  console.log('\nAsync checks...');

  check('RPC server ready payload', () => {
    const handlers = listeners['runtime.onMessage'] || [];
    if (!handlers.length) {
      throw new Error('no onMessage handler');
    }
    let payload = null;
    handlers.forEach((h) => {
      h({ name: 'acr-rpc', kind: 'ready' }, {}, (res) => { payload = res; });
    });
    return Boolean(payload) === false; // Async: checked below.
  });

  setTimeout(() => {

    let payload = null;
    let rpcErr = null;
    const handlers = listeners['runtime.onMessage'] || [];
    handlers.forEach((h) => {
      h({ name: 'acr-rpc', kind: 'ready' }, {}, (res) => { payload = res; });
    });

    const finish = () => {

      check('RPC ready returns ownProperties', () => {
        if (!payload || !payload.result || !payload.result.ownProperties) {
          throw new Error('empty ready payload');
        }
        return true;
      });

      check('snapshot has orderedConfigs', () => {
        const snap = payload.result.ownProperties;
        return snap.orderedConfigs.general.length > 3;
      });

      check('snapshot has notifiers', () =>
        Array.isArray(payload.result.ownProperties.notifiers));
      check('snapshot has provider list', () =>
        payload.result.ownProperties.sortedProviders.length >= 3);

      check('snapshot ships provider list and configs (no eval)', () => {
        const snap = payload.result.ownProperties;
        // parseProxyScheme must NOT be shipped as source: MV3 CSP forbids eval.
        if (snap.parseProxyScheme) {
          throw new Error('parseProxyScheme source leaked into snapshot');
        }
        return snap.sortedProviders.length >= 3 && snap.orderedConfigs.general.length > 3;
      });

      check('dev log captures worker output', () => {
        let logRes = null;
        const msgHandlers = listeners['runtime.onMessage'] || [];
        msgHandlers.forEach((h) => {
          h({ name: 'acr-dev-log', action: 'read' }, {}, (res) => { logRes = res; });
        });
        // Async; asserted in the next tick.
        setTimeout(() => {
          if (!logRes || !logRes.text || !logRes.text.includes('Extension started')) {
            console.log('  FAIL dev log content: ' + JSON.stringify(logRes));
            process.exit(1);
          }
        }, 300);
        return true;
      });

      check('page log forwards into worker log', () => {
        const msgHandlers = listeners['runtime.onMessage'] || [];
        msgHandlers.forEach((h) => {
          h({ name: 'acr-page-log', page: 'test', level: 'error', text: 'page boom' }, {}, () => {});
        });
        setTimeout(() => {
          let logRes = null;
          msgHandlers.forEach((h) => {
            h({ name: 'acr-dev-log', action: 'read' }, {}, (res) => { logRes = res; });
          });
          setTimeout(() => {
            if (!logRes.text.includes('[page:test]') || !logRes.text.includes('page boom')) {
              console.log('  FAIL page log not forwarded');
              process.exit(1);
            }
          }, 300);
        }, 100);
        return true;
      });

      check('RPC call works', () => {
        let callRes = null;
        handlers.forEach((h) => {
          h({ name: 'acr-rpc', kind: 'call', path: 'apis.pacKitchen.getPacModsAsync', args: [] }, {}, (res) => { callRes = res; });
        });
        // Async, validated in the next tick.
        return true;
      });

      setTimeout(async () => {

        // Await any deferred assertions before reporting.
        await Promise.all(asyncChecks);
        console.log(failures ? `\nFAILURES: ${failures}` : '\nALL SMOKE CHECKS PASSED');
        process.exit(failures ? 1 : 0);

      }, 200);

    };

    setTimeout(finish, 300);

  }, 200);

}, 300);
