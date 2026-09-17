'use strict';

{ // Private namespace

  const timeouted = window.utils.timeouted;
  const throwIfError = window.utils.throwIfError;

  /*
    MV3: chrome.browserAction no longer exists. All icon/title/badge calls
    now go through chrome.action. Centralised here so the rest of the code
    reads the same as before.
  */
  const action = chrome.action;

  const errorJsonReplacer = function errorJsonReplacer(key, value) {

    // fooWindow.ErrorEvent !== barWindow.ErrorEvent
    if (value === globalThis) {
      return; // STUPID, because other window object may be passed.
    }
    if (!( value && value.constructor
      && ['Error', 'Event'].some(
        (suff) => value.constructor.name.endsWith(suff)
      )
    )) {
      return value;
    }
    const alt = {};

    Object.getOwnPropertyNames(value).forEach(function(key) {

        alt[key] = value[key];

    }, value);

    for(const prop in value) {
      if (/^[A-Z]/.test(prop)) {
        // MOUSEMOVE, CLICK, KEYUP, NONE, etc.
        continue;
      }
      alt[prop] = value[prop];
    }

    if (value.constructor.name === 'ErrorEvent') {
      for(const circularProp of
        [  // First line are circular props.
          'target', 'srcElement', 'path', 'currentTarget',
          'bubbles', 'cancelBubble', 'cancelable', 'composed',
          'defaultPrevented', 'eventPhase', 'isTrusted', 'returnValue',
          'timeStamp']) {
        delete alt[circularProp];
      }
    }

    if (value.name) {
      alt.name = value.name;
    }

    return alt;

  };

  const ifPrefix = 'if-on-';
  const extName = chrome.runtime.getManifest().name;
  const extVersion = window.apis.version.build;

  window.apis.errorHandlers = {

    action,

    state: window.utils.createStorage('handlers-'),

    viewError(type = window.utils.mandatory(), err) {

      const errors = err ? {[type]: err} : this.idToError;
      const json = JSON.stringify(errors, errorJsonReplacer, 0);

      window.utils.openAndFocus(
        'https://anticensority.github.io/error/?json=' + encodeURIComponent(json) +
          (type ? '&type=' + encodeURIComponent(type) : '') +
          '&version=' + chrome.runtime.getManifest().version +
          '&useragent=' + encodeURIComponent(navigator.userAgent) +
          '&platform=' + encodeURIComponent(navigator.platform),
      );

    },

    getEventsMap() {

      return new Map([
        ['pac-error', 'ошибки PAC скриптов'],
        ['ext-error', 'ошибки расширения'],
        ['no-control', 'утеря контроля над настройками'],
      ]);

    },

    switch(onOffStr, eventName) {

      if (!['on', 'off'].includes(onOffStr)) {
        throw new TypeError('First argument bust be "on" or "off".');
      }
      for(
        const name of (eventName ? [eventName] : this.getEventsMap().keys() )
      ) {
        this.state( ifPrefix + name, onOffStr === 'on' ? 'on' : null );
      }

    },

    isOn(eventName) {

      return this.state( ifPrefix + eventName );

    },

    ifControlled: null,
    ifControllable: null,

    isControllable(details) {

      if (details) {
        this.ifControllable = window.utils.areSettingsControllableFor(details);

        if (this.ifControllable) {
          this.ifControlled = window.utils.areSettingsControlledFor(details);
        } else {
          this.ifControlled = false;
        }

        if (this.ifControlled) {
          action.setIcon( {path: {128: '/icons/default-128.png'}} );
        } else {
          action.setIcon({
            path: {128: '/icons/default-grayscale-128.png'},
          });
        }
      }

      return this.ifControllable;

    },

    isControlled(details) {

      if (details) {
        this.isControllable(details);
      }
      return this.ifControlled;

    },

    updateControlState(cb = throwIfError) {

      // MV3: proxy.settings.get() returns a Promise.
      chrome.proxy.settings.get({}).then(
        timeouted(
          (details) => {

            if (details) {
              this.isControllable(details);
            }
            cb();

          }
        ),
        (err) => cb(err),
      );

    },

    idToError: {},

    mayNotify(
      id, title, errOrMessage,
      {
        icon = 'default-128.png',
        context = extName + ' ' + extVersion,
        ifSticky = true,
      } = {}
    ) {

      if ( !this.isOn(id) ) {
        return;
      }
      this.idToError[id] = errOrMessage;
      const message = errOrMessage.message || errOrMessage.toString();
      chrome.notifications.create(
        id,
        Object.assign({
          title: title,
          message: message,
          contextMessage: context,
          type: 'basic',
          iconUrl: '/icons/' + icon,
          isClickable: true,
        }, window.apis.platform.ifFirefox ? {} : { requireInteraction: ifSticky }),
      );

    },

    installListenersOn(win, name, cb) {

      /*
        MV3: service workers have a global scope but NO addEventListener.
        Pages still use this helper, so the worker call is guarded.
      */
      if (!win || typeof win.addEventListener !== 'function') {
        if (cb) {
          setTimeout(cb, 0);
        }
        return;
      }

      win.addEventListener('error', (errEvent) => {

        console.warn(name + ':GLOBAL ERROR', errEvent);
        this.mayNotify('ext-error', 'Ошибка расширения', errEvent,
          {icon: 'ext-error-128.png'});

      });

      win.addEventListener('unhandledrejection', (event) => {

        console.warn(name + ': Unhandled rejection. Throwing error.');
        event.preventDefault();
        console.log('ev', event);
        throw event.reason;

      });

      if (cb) {
        // Errors are swallowed without a timeout, bug #357568
        setTimeout(cb, 0);
      }

    },

  };

  const handlers = window.apis.errorHandlers;

  // Initialization
  // ==============

  chrome.proxy.settings.get({}).then(
    timeouted( handlers.isControllable.bind(handlers) ),
    (err) => console.warn('Proxy settings read failed:', err),
  );

  chrome.notifications.onClicked.addListener( (notId) => {

    chrome.notifications.clear(notId);
    if(notId === 'no-control') {
      return window.utils.openAndFocus(
        window.utils.messages.searchSettingsForUrl('proxy')
      );
    }
    handlers.viewError(notId);

  });

  handlers.installListenersOn(globalThis, 'BG');

  /*
    MV3: chrome.proxy.onProxyError is unavailable in some Chromium builds
    (the event lives in the chrome.proxy namespace only on Firefox and on
    older Chrome). Guard it.
  */
  const onProxyError = chrome.proxy.onProxyError || chrome.proxy.onError;
  if (onProxyError) {
    onProxyError.addListener( (details) => {

      if (!handlers.ifControlled) {
        return;
      }
      /*
        Example:
          details: "line: 7: Uncaught Error: This is error, man.",
          error: "net::ERR_PAC_SCRIPT_FAILED",
          fatal: false,
      */
      const ifConFail = [
        'net::ERR_TUNNEL_CONNECTION_FAILED',
        'net::ERR_PROXY_CONNECTION_FAILED',
      ].includes(details.error);

      if (ifConFail) {
        // Happens if you return neither proxys nor "DIRECT".
        // Ignore it.
        return;
      }
      console.warn('PAC ERROR', details);
      // TOOD: add "view pac script at this line" button.
      handlers.mayNotify('pac-error', 'Ошибка PAC!',
        (details.error || details.message /* Firefox */) + '\n' + details.details,
        {icon: 'pac-error-128.png'}
      );

    });
  } else {
    console.warn('proxy.onProxyError is not available in this browser; PAC errors will not be reported.');
  }

  chrome.proxy.settings.onChange.addListener( (details) => {

    console.log('Proxy settings changed:', details.levelOfControl);
    const noCon = 'no-control';
    const ifWasControllable = handlers.ifControllable;
    if ( !handlers.isControllable(details) && ifWasControllable ) {
      handlers.mayNotify(
        noCon,
        chrome.i18n.getMessage('noControl'),
        chrome.i18n.getMessage('WhichQ'),
        {icon: 'no-control-128.png', ifSticky: false}
      );
    } else {
      chrome.notifications.clear( noCon );
    }

  });

}
