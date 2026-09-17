'use strict';

{
  /*
    MV3: event listeners must be registered synchronously during the initial
    evaluation of the service worker script. Nothing here may be deferred
    behind a callback/promise (unlike MV2), otherwise events that wake the
    worker are missed.

    Menus are (re)created on every worker start. create() fails with a
    duplicate-id error if a previous worker already made them, which is
    harmless and ignored below.
  */

  const chromified = window.utils.chromified;

  let seqId = 0;

  const createMenuLinkEntry = (title, tab2url) => {

    const id = (++seqId).toString();

    chrome.contextMenus.create({
      id: id,
      title: title,
      contexts: ['action'],
    }, chromified((err) => {

      if(err) {
        console.warn('Context menu error ignored:', err);
      }

    }));

    return { id, tab2url };

  };

  const entries = window.apis.menus.getItemsAsArray().map(
    (item) => createMenuLinkEntry(
      item.title,
      (tab) => item.getUrl(tab.url)
    )
  );

  // One top-level listener dispatching by id.
  chrome.contextMenus.onClicked.addListener((info, tab) => {

    const entry = entries.find((e) => e.id === String(info.menuItemId));
    if (!entry) {
      return;
    }
    Promise.resolve( entry.tab2url( tab ) )
      .then( (url) => chrome.tabs.create({url: url}) );

  });

}
