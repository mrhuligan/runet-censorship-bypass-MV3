'use strict';

/*
  MV3: getBackgroundPage() replaced with the RPC bridge. The error list is
  not JSON-serialisable as a live object graph across the boundary, but the
  worker exposes it as a plain array through lastNetErrors.get(), which is
  exactly what the bridge returns.
*/

window.bgBridge.connect().then(async (bg) => {

  const tbody = document.getElementById('errorsTable');
  const rawErrors = await bg.apis.lastNetErrors.get();
  const errors = (rawErrors || []).map(
    ({url, error}, index) => ({ message: error, hostname: new URL(url).hostname, ifChecked: false })
  );

  const renderTbody = async () => {

    const mods = await bg.apis.pacKitchen.getPacModsAsync();
    const exc = mods.exceptions || {};
    tbody.innerHTML = '';
    if (!errors.length) {
      tbody.innerHTML = '<tr><td colspan="4">Ошибок пока не было.</td></tr>';
      return;
    }
    errors.forEach((err, index) => {

      const ifProxy = exc[err.hostname];
      let style = '';
      if (ifProxy !== undefined) {
        style = `style="color: ${ifProxy ? 'green' : 'red' }"`;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index}</td>
        <td ${style}>${err.hostname}</td>
        <td>${err.message}</td>
        <td><input type="checkbox" ${ err.ifChecked ? 'checked' : '' }></td>
      `;
      tr.querySelector('input').onchange = function() {

        errors[index].ifChecked = this.checked;
        return false;

      };
      tbody.appendChild(tr);

    });

  };

  document.getElementById('allBtn').onclick = () => {

    const ifAllChecked = errors.every((err) => err.ifChecked);
    if (ifAllChecked) {
      errors.forEach((err) => { err.ifChecked = false; })
    } else {
      errors.forEach((err) => { err.ifChecked = true; })
    }
    renderTbody();
    return false;

  };

  document.getElementById('addBtn').onclick = async () => {

    const mutatedMods = await bg.apis.pacKitchen.getPacModsAsync();
    const exc = mutatedMods.exceptions || {};
    mutatedMods.exceptions = errors.reduce((acc, err) => {

      if (err.ifChecked) {
        acc[err.hostname] = true;
      }
      return acc;

    }, exc);
    try {
      await bg.apis.pacKitchen.keepCookedNowAsyncPromise(mutatedMods);
      alert('Сделано!');
    } catch (err) {
      alert(err);
    }

  };

  await renderTbody();
  document.documentElement.style.display = '';

});
