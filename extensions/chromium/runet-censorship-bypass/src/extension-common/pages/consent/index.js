'use strict';

/*
  MV3: chrome.runtime.getBackgroundPage() is gone. window.bgBridge
  (lib/bg-bridge.js) is the replacement and must be loaded before this file.
*/

window.bgBridge.connect().then((bg) => {

  window.bg = bg;

  // Error listeners are installed locally on this page's window; they still
  // report through the worker via the bridge.
  window.addEventListener('error', (errEvent) => {

    console.warn('CONSENT:GLOBAL ERROR', errEvent);
    bg.apis.errorHandlers.mayNotify(
      'ext-error', 'Ошибка расширения', { message: errEvent.message },
      { icon: 'ext-error-128.png' },
    );

  });

  document.getElementById('agreeBtn').onclick = () => {

    bg.apis.consent.give();
    window.close();

  };

  document.getElementById('rejectBtn').onclick = () =>
    chrome.management.uninstallSelf();

});
