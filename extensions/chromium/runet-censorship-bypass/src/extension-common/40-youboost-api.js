'use strict';

/*
  YouBoost proxy provider.

  YouBoost hands out short-lived HTTP proxies to a device that has completed a
  free-trial registration. Flow (all endpoints are public, no user account):

    1. POST /premium/api/v1/uboost-premium/create-new-user
         { deviceId, deviceIp }
       -> { userId }

    2. POST /premium/api/v1/uboost-premium/setup-tariff
         { userId, deviceId, deviceIp, tariff: 'free_trial', isAutoRenew: false }
       -> { status: 'done' }

    3. POST /api/v2/premium/update-and-get-subscription
         { userId, deviceId, deviceIp }
       -> subscription info (used to know when the trial expires)

    4. POST /api/v2/premium/get-proxy-with-subscription
         { userId, deviceId, deviceIp, withAuth: false }
       -> { proxies: [ { host, port, proxy_type, auth } ... ] }

  We keep only proxies with proxy_type === 'vpn'. They are plain HTTP proxies
  that support CONNECT (so HTTPS works) and need NO authentication.

  Everything about the registration is cached in chrome.storage.local under
  'youboost-', so a device is created only once.

  Regeneration: the popup offers a button that runs the whole flow again with
  a brand new deviceId + user, optionally through a user-supplied proxy. That
  proxy is used as Chrome's egress for the API calls (browser fetch cannot be
  routed per-request in MV3), so chrome.proxy is temporarily switched and then
  restored.

  All API calls run in the service worker so they are not subject to page CORS.
*/

{
  const API_BASE = 'https://youboost.app';
  const CLIENT_VERSION = '8.11.16';

  const state = window.utils.createStorage('youboost-');

  const ENDPOINTS = {
    createUser: '/premium/api/v1/uboost-premium/create-new-user',
    setupTariff: '/premium/api/v1/uboost-premium/setup-tariff',
    subscription: '/api/v2/premium/update-and-get-subscription',
    proxies: '/api/v2/premium/get-proxy-with-subscription',
  };

  const headers = {
    'accept': 'application/json',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'pragma': 'no-cache',
    'x-client-version': CLIENT_VERSION,
  };

  const generateDeviceId = () => {

    // RFC4122 v4 UUID from crypto.getRandomValues (available in the worker).
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20, 32),
    ].join('-');

  };

  /*
    Chrome extensions cannot route an individual fetch through a proxy: the
    egress is controlled by chrome.proxy for the whole browser context. To let
    the user activate a trial through their own proxy, we temporarily install a
    PAC pointing at that proxy, run the API calls, then put the extension's own
    PAC back.

    Two details matter:
      * the raw (unpatched) proxy setters are used, so the PAC kitchen does not
        wrap our temporary script;
      * on exit we do NOT restore arbitrary previous settings (that could be a
        fixed_servers config from something else and would silently take the
        extension out of control). Instead the provider PAC is re-installed by
        the caller through the normal sync flow.
  */
  const withGenerationProxyAsync = async (proxyScheme, fn) => {

    if (!proxyScheme) {
      return fn();
    }

    const parsed = window.utils.parseProxyScheme(proxyScheme);

    const [hostname, port] = [parsed.hostname, Number(parsed.port)];
    const pacData = `function FindProxyForURL(url, host) {
      return "${parsed.type.toUpperCase()} ${hostname}:${port}";
    }`;

    console.log('YouBoost: использую прокси для генерации', hostname + ':' + port);

    await window.utils.proxySetRaw({
      value: {
        mode: 'pac_script',
        pacScript: { data: pacData, mandatory: false },
      },
    });

    // Give Chrome a moment to apply the new proxy before the API calls.
    await new Promise((r) => setTimeout(r, 800));

    try {
      return await fn();
    } finally {
      /*
        Hand control back to the extension's PAC. The caller re-runs
        keepCookedNowAsync afterwards, which re-installs the cooked script.
      */
      console.log('YouBoost: возвращаю прокси расширения...');
    }

  };

  const postJson = async (path, body) => {

    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
    });

    /*
      Parse the body even on failure: YouBoost returns structured errors
      (e.g. tariff_unavailable) with a non-2xx status, and the code lives in
      the body.
    */
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    const errorCode = json && json.error && json.error.code;

    if (errorCode === 'tariff_unavailable') {
      const err = new Error(
        'YouBoost: бесплатный trial уже был активирован для вашего IP. ' +
        'Он выдаётся один раз на адрес. Чтобы активировать новый trial, ' +
        'включите собственный прокси или VPN и попробуйте снова.',
      );
      err.code = 'trial_already_used';
      throw err;
    }

    if (!res.ok) {
      throw new Error(
        `YouBoost API ${path} ответил кодом ${res.status}` +
        (json && json.error ? ': ' + JSON.stringify(json.error) : '.'),
      );
    }

    if (json && json.error) {
      throw new Error(
        'YouBoost API вернул ошибку: ' + JSON.stringify(json.error),
      );
    }
    return json;

  };

  /*
    Returns { deviceId, userId }. Creates and activates the trial on first
    run; afterwards the cached values are reused.

    If the trial was already used for this IP, the registration still
    completes: a previously activated subscription may still hand out
    proxies. The trial error is remembered so fetchProxiesAsync can report it
    when no proxies come back.
  */
  let lastTrialError = null;

  const registerFreshAsync = async () => {

    const deviceId = generateDeviceId();
    const deviceIp = '127.0.0.1';

    console.log('YouBoost: регистрирую устройство...', deviceId);
    const created = await postJson(ENDPOINTS.createUser, { deviceId, deviceIp });
    const userId = created && created.userId;
    if (!userId) {
      throw new Error('YouBoost не вернул userId при регистрации.');
    }

    console.log('YouBoost: активирую free_trial...', userId);
    try {
      await postJson(ENDPOINTS.setupTariff, {
        userId,
        deviceId,
        deviceIp,
        tariff: 'free_trial',
        isAutoRenew: false,
      });
      lastTrialError = null;
    } catch (err) {
      if (err.code === 'trial_already_used') {
        /*
          Not fatal here: the device may already have a subscription from an
          earlier activation, in which case proxies are still returned. The
          error is surfaced only if the proxy fetch comes back empty.
        */
        console.warn('YouBoost: trial недоступен, проверяю существующую подписку.');
        lastTrialError = err;
      } else {
        throw err;
      }
    }

    const registration = { deviceId, userId, deviceIp, createdAt: Date.now() };
    state('registration', registration);
    return registration;

  };

  const ensureRegistrationAsync = async () => {

    const saved = state('registration') || {};
    if (saved.deviceId && saved.userId) {
      return saved;
    }
    return registerFreshAsync();

  };

  const getSubscriptionAsync = async () => {

    const { deviceId, userId, deviceIp } = await ensureRegistrationAsync();
    const json = await postJson(ENDPOINTS.subscription, { userId, deviceId, deviceIp });
    return json && json.data;

  };

  /*
    Fetches Proxy entries. Only 'vpn' type is used: plain HTTP proxy, no auth.
    Returns [{ host, port, proxy_type }].
  */
  const fetchProxiesForRegistrationAsync = async ({ deviceId, userId, deviceIp }) => {

    const json = await postJson(ENDPOINTS.proxies, {
      userId, deviceId, deviceIp, withAuth: false,
    });

    const list = (json && json.data && json.data.proxies) || [];
    const vpnProxies = list.filter((p) => p && p.proxy_type === 'vpn');
    if (!vpnProxies.length) {
      /*
        No proxy came back. The most common cause is the trial already being
        used for this IP; in that case surface the actionable message.
      */
      if (lastTrialError) {
        throw lastTrialError;
      }
      throw new Error(
        'YouBoost не вернул ни одного прокси типа "vpn". ' +
        'Возможно, пробный период закончился или использован.',
      );
    }
    return vpnProxies.map(({ host, port }) => ({ host, port: Number(port) }));

  };

  const fetchProxiesAsync = async () => {

    const registration = await ensureRegistrationAsync();
    return fetchProxiesForRegistrationAsync(registration);

  };

  /*
    Picks a proxy and renders it in the PAC proxy-string format.

    YouBoost "vpn" proxies are plain HTTP without auth, so the PAC type is
    PROXY (the PAC synonym for an HTTP proxy). HTTPS-locked requests still work
    because an HTTP proxy tunnels them via CONNECT.
  */
  const toPacProxyString = ({ host, port }) => `PROXY ${host}:${port}`;

  const self = window.apis.youboost = {

    ENDPOINTS,
    generateDeviceId,

    getRegistration() {

      return state('registration') || null;

    },

    resetRegistration() {

      state('registration', null);
      state('proxy', null);

    },

    /*
      Returns the cached proxy if it is still fresh, otherwise fetches new
      ones. The result is cached so the PAC script stays stable between
      updates.
    */
    async getProxyAsync({ force = false } = {}) {

      const cached = state('proxy');
      if (
        !force &&
        cached &&
        cached.pacProxyString &&
        cached.fetchedAt &&
        (Date.now() - cached.fetchedAt) < self.proxyTtlMs
      ) {
        return cached;
      }

      const proxies = await fetchProxiesAsync();
      return self._storeChosen(proxies[0]);

    },

    /*
      Full regeneration: a brand new deviceId + account + trial, optionally
      through the user's own proxy (so YouBoost sees a different egress IP).
      Used by the "Сгенерировать новые прокси" button.

      Resolves with the new proxy record. Rejects with an error carrying
      code 'trial_already_used' when the IP has no trial left.
    */
    async generateNewAsync({ proxyScheme = '' } = {}) {

      // Forget the previous account and proxy first.
      state('registration', null);
      state('proxy', null);
      lastTrialError = null;

      const runFlow = async () => {

        const registration = await registerFreshAsync();
        const proxies = await fetchProxiesForRegistrationAsync(registration);
        return self._storeChosen(proxies[0]);

      };

      const record = await withGenerationProxyAsync(proxyScheme, runFlow);

      /*
        If a generation proxy was used, chrome.proxy now holds a temporary PAC
        and the extension's PAC is gone. Re-download/re-cook the provider PAC
        so the extension regains control and the new YouBoost proxy is applied.

        Done here, not by the caller, so every entry point (button, periodic
        sync, RPC) is covered.
      */
      if (proxyScheme && window.apis.antiCensorRu) {
        try {
          await window.apis.antiCensorRu.syncWithPacProviderAsyncPromise({});
        } catch (err) {
          console.warn('YouBoost: не удалось вернуть PAC расширения:', err);
        }
      }

      // Remember which proxy was used, for display in the UI.
      state('lastGenerationProxy', proxyScheme || '');
      console.log('YouBoost: новый прокси сгенерирован', record.pacProxyString);
      return record;

    },

    // Shared: persist the chosen proxy in the cache.
    _storeChosen(chosen) {

      const record = {
        host: chosen.host,
        port: chosen.port,
        pacProxyString: toPacProxyString(chosen),
        fetchedAt: Date.now(),
      };
      state('proxy', record);
      console.log('YouBoost: получен прокси', record.pacProxyString);
      return record;

    },

    /*
      Synchronous accessor used while cooking the PAC script (which cannot be
      async). Returns null if nothing has been fetched yet.
    */
    getCachedProxyString() {

      const cached = state('proxy');
      return (cached && cached.pacProxyString) || null;

    },

    // Full cached record ({host, port, pacProxyString, fetchedAt}) or null.
    getProxyStringRecord() {

      return state('proxy') || null;

    },

    getLastGenerationProxy() {

      return state('lastGenerationProxy') || '';

    },

    // Proxies are valid for the whole trial; refresh daily to be safe.
    proxyTtlMs: 24 * 60 * 60 * 1000,

    /*
      Drops the cached proxy so the next cook fetches a fresh one. Kept for
      the periodic refresh; there is no automatic error watchdog.
    */
    async invalidateAsync(reason = 'обновление') {

      state('proxy', null);
      console.warn('YouBoost: прокси сброшен (' + reason + ').');

      try {
        const fresh = await self.getProxyAsync({ force: true });
        return { refreshed: true, proxy: fresh };
      } catch (err) {
        console.warn('YouBoost: не удалось обновить прокси:', err);
        return { refreshed: false, error: String(err && err.message || err) };
      }

    },

    // RPC-friendly promise twins.
    getProxyAsyncPromise(opts) {

      return self.getProxyAsync(opts);

    },

    generateNewAsyncPromise(opts) {

      return self.generateNewAsync(opts);

    },

    getSubscriptionAsyncPromise() {

      return getSubscriptionAsync();

    },

    resetRegistrationPromise() {

      return Promise.resolve(self.resetRegistration());

    },

  };

  // Asked by pac-kitchen to contribute a proxy string to the PAC script.
  window.utils.addRequestResponder(
    'youboost-get-proxy-string',
    (cb) => cb(null, self.getCachedProxyString()),
  );

}
