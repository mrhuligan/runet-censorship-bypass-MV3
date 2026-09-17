'use strict';

/*
  Test-only diagnostics for extension pages.

  Sends window 'error' and 'unhandledrejection' events to the worker, which
  appends them to the same dev log used by the service worker. Include this
  AFTER bg-bridge.js on any page you want covered.

  Load order on a page:
    <script src="../lib/bg-bridge.js"></script>
    <script src="../lib/dev-log-page.js"></script>
*/

{
  const PAGE = (location.pathname.split('/').slice(-2, -1)[0]) || 'page';

  const forward = (level, text) => {

    if (window.bgBridge && window.bgBridge.logToWorker) {
      window.bgBridge.logToWorker(PAGE, level, text);
    }

  };

  window.addEventListener('error', (event) => {

    forward(
      'error',
      `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`,
    );

  });

  window.addEventListener('unhandledrejection', (event) => {

    const reason = event.reason;
    forward(
      'error',
      'unhandledrejection: ' + (reason && reason.message ? reason.message : String(reason)),
    );

  });

  forward('info', 'page loaded: ' + location.href);

}
