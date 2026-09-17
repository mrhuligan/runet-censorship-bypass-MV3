'use strict';

/*
  Smoke test for the page-side RPC bridge (pages/lib/bg-bridge.js).

  Mocks chrome.runtime.sendMessage with the same protocol the worker's
  90-rpc-server.js implements, then checks that the transparent Proxy turns
  property chains and method calls into the right RPC messages and returns
  awaited values.
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const bridgePath = path.join(
  __dirname, '..', 'build', 'extension-full', 'pages', 'lib', 'bg-bridge.js',
);

const calls = [];

const mockWorker = (message, sendResponse) => {

  calls.push(message);

  const db = {
    'apis.pacKitchen.getPacModsAsync': { ifProxyOrDie: true },
    'apis.pacKitchen.getOrderedConfigsAsync': [{ key: 'a', value: false }],
    'apis.errorHandlers.switch': undefined,
  };

  if (message.kind === 'ready') {
    sendResponse({ result: { ownProperties: { build: '66', ifMini: false, notifiers: [] } } });
    return;
  }
  if (message.kind === 'call' || message.kind === 'get') {
    if (message.path === 'apis.antiCensorRu.getLastModifiedForKey') {
      sendResponse({ result: 'Thu, 01 Jan 1970 00:00:00 GMT' });
      return;
    }
    if (message.path in db) {
      sendResponse({ result: db[message.path] });
      return;
    }
    if (message.path === 'apis.utils.thrower') {
      sendResponse({ error: { name: 'TypeError', message: 'boom' } });
      return;
    }
    sendResponse({ result: null });
    return;
  }
  sendResponse({ error: { message: 'unknown kind' } });

};

const sandbox = {
  console,
  Promise,
  setTimeout,
  chrome: {
    runtime: {
      lastError: undefined,
      sendMessage: mockWorker,
    },
  },
};

sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(bridgePath, 'utf8'), sandbox, { filename: 'bg-bridge.js' });

let failures = 0;
const check = (label, cond) => {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
};

(async () => {

  const bg = await sandbox.window.bgBridge.connect();

  check('connect returns snapshot', bg.state && bg.state.build === '66');
  check('remote proxy object exists', (typeof bg.apis === 'object' || typeof bg.apis === 'function') && bg.apis !== null);

  const mods = await bg.apis.pacKitchen.getPacModsAsync();
  check('async method call returns value', mods && mods.ifProxyOrDie === true);
  check('call path recorded', calls.some((c) => c.path === 'apis.pacKitchen.getPacModsAsync'));

  const lastModified = await bg.call('apis.antiCensorRu.getLastModifiedForKey', 'x');
  check('bg.call forwards args', lastModified.includes('1970'));

  let threw = false;
  try {
    await bg.apis.utils.thrower();
  } catch (e) {
    threw = e.message === 'boom';
  }
  check('worker errors reject the promise', threw);

  // Long property chains must not blow up.
  const deep = await bg.apis.a.b.c.d.e.nonExistent();
  check('unknown paths resolve to null', deep === null);

  console.log(failures ? `\nFAILURES: ${failures}` : '\nALL BRIDGE CHECKS PASSED');
  process.exit(failures ? 1 : 0);

})();
