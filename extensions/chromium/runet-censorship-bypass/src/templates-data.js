'use strict';

const pacUrls = [
  // GitHub.io (anticensority), cached:
  'https://anticensority.github.io/generated-pac-scripts/anticensority.pac',
  // GitHub repo (anticensority), cached:
  'https://raw.githubusercontent.com/anticensority/generated-pac-scripts/master/anticensority.pac',
];

const commonContext = {
  version: '1.66',
  anticensorityPacUrls: [
    ...pacUrls,
  ],
};

exports.contexts = {};

/*
  MV3 notes:
    * webRequestBlocking no longer exists: it must NOT be listed, otherwise
      the manifest is rejected on install.
    * webRequest and webNavigation are still valid *permissions* (observers),
      only the blocking flag is gone. Protected proxies are now handled by
      embedding credentials into the PAC-returned proxy string instead of
      blocking onAuthRequired.
    * `service_worker_type` becomes `"type": "module"` only when the worker
      is loaded as an ES module. All builds use importScripts(), so it stays
      empty everywhere.
*/
const extra_permissions = ', "webRequest"';

exports.contexts.full = Object.assign({}, commonContext, {
  versionSuffix: '',
  nameSuffixEn: '',
  nameSuffixRu: '',
  extra_permissions,
  service_worker_type: '',
  scripts_2x: ', "20-ip-to-host-api.js"',
  scripts_8x: ', "80-error-menu.js", "83-last-errors.js", "85-block-informer.js"',
});

exports.contexts.mini = Object.assign({}, commonContext, {
  versionSuffix: '-mini',
  nameSuffixEn: ' MINI',
  nameSuffixRu: ' МИНИ',
  extra_permissions: '',
  service_worker_type: '',
  scripts_2x: ', "20-for-mini-only.js"',
  scripts_8x: '',
});

exports.contexts.firefox = Object.assign({}, commonContext, {
  versionSuffix: '',
  nameSuffixEn: '',
  nameSuffixRu: '',
  // Firefox MV3 supports the same permission set here; webRequestBlocking is
  // absent because the PAC-level auth handling below does not need it.
  extra_permissions,
  service_worker_type: '',
  scripts_2x: ', "20-ip-to-host-api.js"',
  scripts_8x: ', "80-error-menu.js", "83-last-errors.js", "85-block-informer.js"',
});

exports.contexts.beta = Object.assign({}, commonContext, {
  anticensorityPacUrls: [
    'https://raw.githubusercontent.com/anticensority/for-testing/master/anticensority.pac',
    'https://anticensority.github.io/for-testing/anticensority.pac',
  ],
  version: '1.14',
  versionSuffix: '',
  nameSuffixEn: ' FOR TESTING',
  nameSuffixRu: ' ДЛЯ ТЕСТОВ',
  extra_permissions,
  service_worker_type: '',
  scripts_2x: ', "20-ip-to-host-api.js"',
  scripts_8x: ', "80-error-menu.js", "83-last-errors.js", "85-block-informer.js"',
});
