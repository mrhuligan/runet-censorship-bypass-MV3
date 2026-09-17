'use strict';

/*
  MV3: replaced getBackgroundPage() with the RPC bridge. "Clear storage"
  now targets chrome.storage.local (which backs the localStorage shim used
  by the worker), and the worker is reloaded so it rehydrates cleanly.
*/

window.bgBridge.connect().then((bg) => {

  document.querySelectorAll('.reset-settings').forEach((el) => {

    el.onclick = async () => {

      await bg.apis.pacKitchen.resetToDefaultsPromise();
      await bg.call('utils.promisedLocalStorage.clear');
      await bg.call('utils.promisedLocalStorage.remove', 'antiCensorRu');
      chrome.storage.local.clear( () => chrome.runtime.reload() );

    };
  });

  document.querySelectorAll('.view-errors').forEach((el) => {

    el.onclick = () =>
      bg.apis.errorHandlers.viewError('all');

  });

  /*
    Dev log export: the log lives in chrome.storage.local, so it survives
    service-worker restarts. Downloading gives a single file with worker and
    page errors interleaved.
  */
  const downloadText = (filename, text) => {

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

  };

  document.querySelectorAll('.download-log').forEach((el) => {

    el.onclick = async (event) => {

      event.preventDefault();
      const text = await window.bgBridge.fetchLog();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadText(`acr-log-${stamp}.txt`, text);

    };

  });

  document.querySelectorAll('.clear-log').forEach((el) => {

    el.onclick = async (event) => {

      event.preventDefault();
      await window.bgBridge.clearLog();
      alert('Лог очищен.');

    };

  });

});
