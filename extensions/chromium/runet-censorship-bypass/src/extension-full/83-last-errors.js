'use strict';

{
  /*
    MV3: window.localStorage is unavailable in the worker. The flag is kept
    in the storage shim (chrome.storage.local) so it survives worker
    restarts. The in-memory list is intentionally NOT persisted: last errors
    are a debugging aid, not durable user data.
  */

  const chromified = window.utils.chromified;

  const lastErrors = [];
  const lastErrorsLength = 20;

  const IF_COLL_KEY = 'err-to-exc-if-coll';

  const privates = {
    ifCollecting: window.utils.createStorage('last-errors-')(IF_COLL_KEY) || false,
  };

  const that = window.apis.lastNetErrors = {
    get ifCollecting() {

      return privates.ifCollecting;

    },

    set ifCollecting(newValue) {

      privates.ifCollecting = newValue;
      window.utils.createStorage('last-errors-')(IF_COLL_KEY, newValue);

    },

    get: () => lastErrors,

    // RPC-friendly setter (a setter cannot be invoked over the bridge).
    __setIfCollecting(newValue) {

      that.ifCollecting = newValue;
      return newValue;

    },
  }

  /*
    MV3: the listener is registered directly at top level. `chromified`
    would defer it through setTimeout, which breaks worker wake-up.
  */
  chrome.webRequest.onErrorOccurred.addListener((details) => {

      if (!that.ifCollecting || [
              'net::ERR_BLOCKED_BY_CLIENT',
              'net::ERR_ABORTED',
              'net::ERR_CACHE_MISS',
              'net::ERR_INSUFFICIENT_RESOURCES',
          ].includes(details.error) ) {
        return;
      }
      const last = lastErrors[0];
      if (last && details.error === last.error && details.url === last.url) {
        // Dup.
        return;
      }

      lastErrors.unshift(details);
      if (lastErrors.length > lastErrorsLength) {
        lastErrors.pop();
      }

    },
    {urls: ['<all_urls>']}
  );

}
