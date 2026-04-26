(function () {
  const host = String(window.location.hostname || '').trim().toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const sameOriginBase = window.location.protocol === 'file:' ? '' : window.location.origin;

  window.SMART_LIBRARY_CONFIG = window.SMART_LIBRARY_CONFIG || {
    // Keep local development working. For deployed/static hosting, use same-origin
    // paths so the frontend server can proxy to the local API/email services.
    apiBaseUrl: isLocal ? '' : '',
    emailBaseUrl: isLocal ? '' : sameOriginBase,

    // Legacy file-save backend is no longer required in API mode.
    saveToken: ''
  };
})();
