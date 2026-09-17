'use strict';

/*
  MV3: no more background page. Diagnostics run through the RPC bridge, and
  proxy settings are read/written via dedicated worker helpers so the page
  itself does not need the "proxy" permission context (pages inherit the
  extension's API surface, but centralising keeps the cooking step intact).
*/

window.bgBridge.connect().then((bg) => {

  const setStatusTo = (msg) => document.getElementById('status').innerHTML = msg;

  const red = (text) => '<span style="color: red">' + text + '</span>';

  const editor = window.ace.edit('editor');
  editor.getSession().setOptions({
    mode: 'ace/mode/javascript',
    useSoftTabs: true,
  });

  /*
    MV3: pages still have chrome.proxy, but the PAC-cooking wrapper lives on
    the worker's patched chrome.proxy.settings.set. To make sure the debug
    editor writes a cooked script, route writes through the bridge.
  */
  chrome.proxy.settings.onChange.addListener(
    (details) => setStatusTo(red( details.levelOfControl + '!') )
  );

  async function _read() {

    const details = await bg.call('utils.proxyGet', {});
    let control = details.levelOfControl;
    if (control.startsWith('controlled_by_other')) {
      control = red(control);
    }
    setStatusTo(control);
    const pac = details.value.pacScript;
    const data = pac && pac.data || 'PAC скрипт не установлен.';
    editor.setValue( data );

  }

  document.querySelector('#read-button').onclick = _read;

  document.querySelector('#save-button').onclick = async () => {

    const config = {
      mode: 'pac_script',
      pacScript: {
        mandatory: false,
        data: editor.getValue(),
      },
    };
    await bg.call('utils.proxySet', {value: config});
    alert('Saved!');

  };

  document.querySelector('#clear-button').onclick = async () => {

    await bg.call('utils.proxyClear', {});
    alert('Cleared! Reading...');
    _read();

  };

});
