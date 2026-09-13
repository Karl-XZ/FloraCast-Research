// FloraCast Subpath & API Base Resolver
// Automatically ensures API calls and static assets work seamlessly whether deployed
// at root domain (http://localhost:5174/) or under a subpath (https://openl.work/FloraCast/).
(function () {
  const pathname = window.location.pathname;
  const isFloraCast = pathname.startsWith('/FloraCast');
  const base = isFloraCast ? '/FloraCast' : '';
  window.APP_BASE_PATH = base;

  // Intercept window.fetch so /api/... automatically prefixes with /FloraCast/api/...
  const originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    if (typeof resource === 'string') {
      if (resource.startsWith('/api/')) {
        resource = base + resource;
      } else if (resource.startsWith(window.location.origin + '/api/')) {
        resource = resource.replace(window.location.origin + '/api/', window.location.origin + base + '/api/');
      }
    } else if (resource instanceof Request) {
      const url = resource.url;
      if (url.startsWith(window.location.origin + '/api/')) {
        const newUrl = url.replace(window.location.origin + '/api/', window.location.origin + base + '/api/');
        resource = new Request(newUrl, resource);
      }
    }
    return originalFetch.call(this, resource, init);
  };

  // Intercept EventSource for SSE streaming
  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function (url, configuration) {
      if (typeof url === 'string') {
        if (url.startsWith('/api/')) {
          url = base + url;
        } else if (url.startsWith(window.location.origin + '/api/')) {
          url = url.replace(window.location.origin + '/api/', window.location.origin + base + '/api/');
        }
      }
      return new OriginalEventSource(url, configuration);
    };
    window.EventSource.prototype = OriginalEventSource.prototype;
  }
})();
