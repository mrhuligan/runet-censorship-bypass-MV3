'use strict';

/*
  Page-side copies of pure helpers that must run synchronously during render.

  MV3's default CSP forbids eval/new Function, so functions cannot be shipped
  from the worker as source (that was the original approach and it broke the
  options popup with an EvalError). Pure helpers are therefore duplicated here
  and must be kept in sync with src/extension-common/00-init-apis.js.
*/

{
  window.utilsLocal = {

    parseProxyScheme(proxyAsStringRaw) {

      const proxyAsString = proxyAsStringRaw.trim();
      const [type] = proxyAsString.split(/\s+/);
      const typeRe = new RegExp(`^${type}\\s+`, 'g');
      const crededAddr = proxyAsString.replace(typeRe, '');

      let parts;
      parts = crededAddr.split('@');
      let [creds, addr] = [parts.slice(0, -1).join('@'), parts[parts.length - 1]];

      const [hostname, port] = addr.split(':');

      parts = creds.split(':');
      const username = parts[0];
      const password = parts.slice(1).join(':');

      return {
        type,
        username,
        password,
        hostname,
        port,
        creds,
      };

    },

  };
}
