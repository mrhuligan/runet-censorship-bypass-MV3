'use strict';

/*
  MV3: talks to the worker through window.bgBridge (lib/bg-bridge.js).
  All former callback-style calls become awaited promises.
*/

window.bgBridge.connect().then(async (bg) => {

  const editor = document.getElementById('editor');
  const loadBtn = document.getElementById('load');
  const saveBtn = document.getElementById('save');
  const status = document.getElementById('status');

  const load = async () => {

    const mods = await bg.apis.pacKitchen.getPacModsAsync();
    editor.value = `# Комментарии начинаются с # и действуют до конца строки.
# Комментарии НЕ сохраняются!
# Сначала идёт список проксируемых сайтов,
# затем ==== на отдельной строке,
# затем исключённые сайты.
# После ещё одной строки с ==== идёт белый список.
# Сортировка — с конца строки.
# Адреса со звёздочками поддерживаются: *.kasparov.ru, например.

# ПРОКСИРОВАТЬ:

${(mods.included || []).join('\n')}

===============================
# НЕ ПРОКСИРОВАТЬ:

${(mods.excluded || []).join('\n')}


===============================
# БЕЛЫЙ СПИСОК
# Разрешить расширению работать только с этими адресами:

${(mods.whitelist || []).join('\n')}

`.trim();

    status.innerText = 'Успешно загружено!';

  };

  loadBtn.onclick = load;
  await load();

  saveBtn.onclick = async function() {

    let [proxyList, dontProxyList, whitelist] = editor.value
      .trim()
      .replace(/#.*/g, '')
      .split(/=+/g)
      .map( (listStr) => listStr
        .trim()
        .split(/(?:\s*\r?\n\s*)+/g)
        .filter((host) => host)
      )
    dontProxyList = dontProxyList || [];
    whitelist = whitelist || [];

    const exceptions = {};
    proxyList.forEach((host) => (exceptions[host] = true));
    dontProxyList.forEach((host) => (exceptions[host] = false));
    const mods = await bg.apis.pacKitchen.getPacModsAsync();
    mods.exceptions = exceptions;
    mods.whitelist = whitelist;
    try {
      await bg.apis.pacKitchen.keepCookedNowAsyncPromise(mods);
      status.innerText = 'Успешно сохранено!';
      loadBtn.click();
    } catch (err) {
      status.innerText = '<em>ОШИБКА:</em>' + err;
    }

  };

  editor.oninput = () => (status.innerText = 'Вы держитесь там!');

  document.documentElement.style.display = 'initial';

});
