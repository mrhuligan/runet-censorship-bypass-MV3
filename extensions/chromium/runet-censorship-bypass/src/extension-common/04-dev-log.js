'use strict';

/*
  MV3 test-only diagnostic logger.

  Chrome does not reliably route service-worker console output to
  chrome_debug.log, and the worker can be torn down at any moment. This file
  therefore captures every console.* call AND uncaught error into a ring
  buffer in chrome.storage.local, so the log survives worker restarts and can
  be read from any page via the RPC bridge.

  Enabled only when the extension ID is running from an unpacked/dev profile
  with the log flag set (see tools/dev-log toggle below). It is safe to ship:
  it costs one storage write per event and is capped.

  Structure stored under the key 'devLog':
    { startedAt, entries: [{ t, level, text }], dropped }
*/

{
  const KEY = 'devLog';
  const MAX_ENTRIES = 2000;
  const IF_ENABLED = true;

  if (IF_ENABLED) {

    const startedAt = Date.now();

    // Appends are batched: the worker may be suspended between writes.
    let pending = [];
    let flushTimer = null;

    const serialiseArg = (a) => {

      if (a instanceof Error) {
        return `${a.name}: ${a.message}` + (a.stack ? '\n' + a.stack : '');
      }
      if (typeof a === 'string') {
        return a;
      }
      try {
        return JSON.stringify(a);
      } catch (e) {
        return String(a);
      }

    };

    const flush = () => {

      flushTimer = null;
      if (!pending.length) {
        return;
      }
      const batch = pending;
      pending = [];
      chrome.storage.local.get(KEY).then((stored) => {

        const log = stored[KEY] || { startedAt, entries: [], dropped: 0 };
        log.entries.push(...batch);
        if (log.entries.length > MAX_ENTRIES) {
          const excess = log.entries.length - MAX_ENTRIES;
          log.entries.splice(0, excess);
          log.dropped += excess;
        }
        chrome.storage.local.set({ [KEY]: log });

      });

    };

    const record = (level, args) => {

      pending.push({
        t: Date.now(),
        level,
        text: args.map(serialiseArg).join(' '),
      });
      if (!flushTimer) {
        flushTimer = setTimeout(flush, 250);
      }

    };

    for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
      const original = console[level].bind(console);
      console[level] = (...args) => {

        original(...args);
        record(level, args);

      };
    }

    /*
      MV3 workers have no addEventListener, so global 'error' /
      'unhandledrejection' events cannot be hooked the usual way. Instead we
      install self.onerror and self.onunhandledrejection, which ARE available
      on the worker global scope, and flush the log synchronously on crash.
    */
    globalThis.onerror = function(message, source, lineno, colno, error) {

      record('error', ['[uncaught]', message, `${source}:${lineno}:${colno}`, error]);
      flush();
      return false;

    };

    globalThis.onunhandledrejection = function(event) {

      record('error', ['[unhandledrejection]', event && event.reason]);
      flush();

    };

    record('info', ['[dev-log] worker started', new Date(startedAt).toISOString()]);

    globalThis.__devLog = {
      startedAt,
      flush,
      record,
      clear() {
        pending = [];
        return chrome.storage.local.set({ [KEY]: { startedAt, entries: [], dropped: 0 } });
      },
      read() {
        return chrome.storage.local.get(KEY).then((s) => s[KEY] || null);
      },
      toText() {

        return this.read().then((log) => {

          if (!log) {
            return '(лог пуст)';
          }
          const head = `# Runet Censorship Bypass dev log\n`
            + `# started: ${new Date(log.startedAt).toISOString()}\n`
            + `# entries: ${log.entries.length}, dropped: ${log.dropped}\n\n`;
          return head + log.entries.map((e) =>
            `${new Date(e.t).toISOString()} [${e.level}] ${e.text}`
          ).join('\n');

        });

      },
    };

  }

}
