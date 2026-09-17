'use strict';

{

  const timeouted = window.utils.timeouted;

  /*
    MV3: chrome.browserAction was renamed to chrome.action. Popup/badge/title
    semantics are identical, but there is no background "window" to reach for
    it, hence the alias.
  */
  const action = chrome.action;

  const isProxied = (requestDetails) => false;
  const isProxySideError = (details) =>
    /* About !main_frame: Main frame websocket errors are followed by webnavigation errors
       which chrome-internals code resets the state of the popup.
    */
    details.error === 'net::ERR_TUNNEL_CONNECTION_FAILED' && details.type !== 'main_frame' && isProxied(details) ||
    details.error === 'NS_ERROR_CONNECTION_REFUSED' && Boolean(details.proxyInfo);

  const urlToA = (url) => new URL(url).host.link(
    encodeURIComponent(url),
  );

  const isProxyErrorHandledAsync = async (details) => {

    if (!isProxySideError(details)) {
      return;
    }
    let fromPageHref = '';
    let toUrlHref = '';
    let fromPageHtml = '';
    let youMayReportHtml = '';
    const initiator = details.initiator !== 'null' && details.initiator;
    try {
      if (initiator) {
        fromPageHref = new URL(initiator).href; // Sanitize: only urls, not other stuff.
        fromPageHtml = ` со страницы ${urlToA(fromPageHref)}`;
      }
      toUrlHref = new URL(details.url).href;
      youMayReportHtml = ` Вы можете <b>${'сообщить об ошибке'.link(
        encodeURIComponent(
          '/pages/report-proxy-error/index.html?' +
          new URLSearchParams({
            fromPageHref,
            requestFailedTo: toUrlHref,
          }),
        ),
      )}</b> администратору прокси.`;
    } catch(e) {
      /* For malformed urls. */
      console.log('Error handling malformed URLs:', details);
      const msg = `Error handling malformed URLs: ${JSON.stringify(details, null, 2)}`;
      throw new TypeError(msg);
    }

    // Service workers have tabId = -1, get active tubId for them.
    const tabId = details.tabId < 0
      ? await new Promise((resolve) => chrome.tabs.query(
          { active: true },
          ([tab]) => resolve(tab.id)),
        )
      : details.tabId;

    const [oldPopup, oldText, oldColor] = await new Promise((resolve) =>
      action.getPopup({ tabId }, (oldPopup) =>
        action.getBadgeText({ tabId }, (oldText) =>
          action.getBadgeBackgroundColor({ tabId }, (oldColor) => resolve([
            oldPopup,
            oldText,
            oldColor,
          ])),
        ),
      )
    );

    const popupPrefix = chrome.runtime.getURL(`/pages/options/index.html?status=<span style="color: red">🔥 Прокси-сервер отказался обслуживать запрос к%20`);
    if (decodeURIComponent(oldPopup).startsWith(popupPrefix)) {
      return true;
    }
    const popup = `${popupPrefix}${urlToA(details.url)}${fromPageHtml}</span>. Это могло быть намеренно или по ошибке.${youMayReportHtml}#tab=exceptions`;

    action.setPopup({
      tabId,
      popup,
    });

    action.setBadgeBackgroundColor({
      tabId,
      color: 'red',
    });
    action.setBadgeText({
      tabId,
      text: '❗',
    });

    let limit = 5;
    let ifOnTurn = true;
    let ifError = false;
    const flip = () => {

      if (!ifOnTurn && !--limit || ifError) {
        clearInterval(timer);
        return;
      }
      action.setBadgeText({
        tabId,
        text: ifOnTurn ? '❗' : '',
      }, () => {
        ifError = chrome.runtime.lastError;
      });
      ifOnTurn = !ifOnTurn;
    };
    flip();
    const timer = setInterval(flip, 500);

    const restoringHandler = timeouted((eventDetails) => {

      if(eventDetails && tabId !== ((eventDetails.currentTab || eventDetails).id || eventDetails.tabId)) {
        return;
      }
      clearInterval(timer);

      action.setPopup({ tabId, popup: oldPopup});
      action.setBadgeBackgroundColor({ tabId, color: oldColor});
      action.setBadgeText({ tabId, text: oldText});

      chrome.runtime.onMessage.removeListener(restoringHandler);
      chrome.tabs.onRemoved.removeListener(restoringHandler);
      chrome.tabs.onReplaced.removeListener(restoringHandler);
      chrome.webNavigation.onBeforeNavigate.removeListener(restoringHandler);
    });
    chrome.runtime.onMessage.addListener(restoringHandler);
    chrome.tabs.onRemoved.addListener(restoringHandler);
    chrome.tabs.onReplaced.addListener(restoringHandler); // When does it happen?
    chrome.webNavigation.onBeforeNavigate.addListener(restoringHandler);

    return true;
  };

  chrome.webNavigation.onErrorOccurred.addListener(async (details) => {

    const tabId = details.tabId;
    if ( !(details.frameId === 0 && tabId >= 0) ||
          [
            'net::ERR_BLOCKED_BY_CLIENT',
            'net::ERR_ABORTED',
          ].includes(details.error) ) {
      return;
    }
    if (await isProxyErrorHandledAsync(details)) {
      return;
    }

    action.setPopup({
      tabId,
      popup: './pages/options/index.html?status=Правый клик по иконке — меню инструментов!#tab=exceptions',
    });

    action.setBadgeBackgroundColor({
      tabId,
      color: '#4285f4',
    });
    action.setBadgeText({
      tabId,
      text: '●●●',
    });

  });

  /*
    MV3: webRequest observers are still allowed without the blocking flag,
    which is exactly what is needed here. The listener must not return a
    blocking response.
  */
  chrome.webRequest.onErrorOccurred.addListener(
    (details) => { isProxyErrorHandledAsync(details); },
    {urls: ['<all_urls>']},
  );
}
