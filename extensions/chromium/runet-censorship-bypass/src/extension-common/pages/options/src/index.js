// @flow

import Inferno from 'inferno';
import createElement from 'inferno-create-element';
import appendGlobalCss from './globalCss';
import css from 'csjs-inject';
import getApp from './components/App';

/*
  MV3: chrome.runtime.getBackgroundPage() no longer exists. The page connects
  to the service worker through window.bgBridge (loaded from
  ../lib/bg-bridge.js before this bundle). Everything the app used to read
  synchronously from the background window now arrives as an async snapshot
  or via awaitable RPC calls.

  The body lives in an async IIFE because the Babel preset used by this page
  predates top-level await support.
*/

(async () => {

  try {

    const bg = await window.bgBridge.connect();

    const apis = bg.apis;

    /*
      Pure helpers needed during render are provided by
      ../lib/utils-local.js (loaded before this bundle). They cannot be
      shipped from the worker as source: MV3 CSP forbids eval.
    */
    const utils = Object.assign({}, bg.utils, window.utilsLocal);

    const theState = {
      utils: utils,
      apis,
      bg,
      state: bg.state,
      flags: {
        /* Shortcuts to boolean values. */
        ifNotControlled: !bg.state.ifControllable,
        ifMini: bg.state.ifMini,
      },
      // Kept for call sites that only need non-API values (confirm, etc.).
      bgWindow: {
        confirm: window.confirm.bind(window),
        localStorage: window.localStorage,
      },
    };

    /*
      bg.refreshState() swaps in a new state object; keep theState.state
      pointing at it so components see fresh data after mutations.
    */
    window.__onBgStateRefreshed = (next) => {
      theState.state = next;
    };

    // IF INSIDE OPTIONS TAB

    const currentTab = await new Promise(
      (resolve) => chrome.tabs.query(
        {active: true, currentWindow: true},
        ([tab]) => resolve(tab),
      )
    );

    theState.flags.ifInsideOptionsPage = !(currentTab && currentTab.url) || /.*:\/\/extensions\/\?options=/g.test(currentTab.url) || currentTab.url.startsWith('about:addons');
    theState.flags.ifInsideEdgeOptionsPage = theState.flags.ifInsideOptionsPage && currentTab && currentTab.url && currentTab.url.startsWith('edge://');

    theState.currentTab = currentTab;

    // If opened not via popup and not via options modal.
    // E.g., if opened via copy-pasting an URL into the address bar from somewhere.
    // If browser is not Chrome (Opera, e.g.) then options page may be opened in a separate tab
    // and then you will get a false positive.
    theState.flags.ifOpenedUnsafely = Boolean(await new Promise(
      (resolve) => chrome.tabs.getCurrent(resolve),
    ));

    // STATE DEFINED, COMPOSE.

    appendGlobalCss(document, theState);
    // Extendable css classes.

    Inferno.render(
      createElement(getApp(theState), theState),
      document.getElementById('app-root'),
    );
    // READY TO RENDER

    const show = () => { document.documentElement.style.visibility = 'initial'; };

    if (theState.flags.ifInsideOptionsPage) {
      show();
    } else {
      setTimeout(show, 200); // Mac bug: https://bugs.chromium.org/p/chromium/issues/detail?id=428044
    }

  } catch (err) {

    console.error('Failed to connect to background:', err);
    document.documentElement.style.visibility = 'initial';

  }

})();
