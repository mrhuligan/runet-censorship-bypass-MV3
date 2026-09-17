'use strict';

/*
  Firefox-only shim.

  Firefox does not accept a PAC-script body through proxy.settings like
  Chromium does: it requires an autoConfigUrl. This shim stores the PAC data
  in chrome.storage.local and serves it back through a Blob URL.

  MV3: proxy.settings.get/set/clear are Promise-based, so the shim wraps the
  promise API instead of callbacks.
*/

if (window.apis.platform.ifFirefox) {

  const prefix = 'firefox-only';

  const originalSet = chrome.proxy.settings.set.bind( chrome.proxy.settings );
  chrome.proxy.settings.set = function(details, cb) {

    const pac = window.utils.getProp(details, 'value.pacScript') || {};
    if (!(pac && pac.data)) {
      const p = originalSet(details);
      if (cb) {
        p.then(() => cb(), () => cb());
        return undefined;
      }
      return p;
    }

    const blob = new Blob([pac.data], { type : 'application/x-ns-proxy-autoconfig' });
    const blobUrl = URL.createObjectURL(blob);
    const p = originalSet({
      value: {
        proxyType: 'autoConfig',
        autoConfigUrl: blobUrl,
      },
    }).then(
      async () => {
        await window.utils.promisedLocalStorage.set({ [`${prefix}-pac-data`]: pac.data });
        cb && cb();
      },
      (err) => {
        window.utils.lastError = err;
        cb && cb();
        if (!cb) {
          throw err;
        }
      },
    );
    return cb ? undefined : p;
  };

  const originalGet = chrome.proxy.settings.get.bind( chrome.proxy.settings );
  chrome.proxy.settings.get = function(details, cb) {

    const p = originalGet(details).then(async (originalDetails) => {

      const pacData = await window.utils.promisedLocalStorage.get(`${prefix}-pac-data`);
      if (!pacData || !Object.keys(pacData).length) {
        return originalDetails;
      }
      return Object.assign(
        originalDetails,
        {
          value: {
            mode: 'pac_script',
            pacScript: {
              data: pacData,
            },
          },
        }
      );

    });

    if (cb) {
      p.then((res) => cb(res), (err) => {
        window.utils.lastError = err;
        cb();
      });
      return undefined;
    }
    return p;
  };

  const originalClear = chrome.proxy.settings.clear.bind( chrome.proxy.settings );
  chrome.proxy.settings.clear = function(details, cb) {

    const p = window.utils.promisedLocalStorage.remove(`${prefix}-pac-data`)
      .then(() => originalClear(details));
    if (cb) {
      p.then(() => cb(), () => cb());
      return undefined;
    }
    return p;
  };
}
