/**
 * iOS serves the app from `capacitor://localhost`, which API Gateway refuses
 * as a CORS origin. With `CapacitorHttp` enabled, Capacitor routes fetch and
 * XHR through native HTTP; this narrows that to the API origin on iOS so the
 * rest (streaming chat function URLs, S3 upload progress) stays on the web
 * view's own fetch and XHR. Must run before anything creates an XHR, because
 * Capacitor's XHR patch rewrites the shared prototype on construction.
 */
type CapacitorWebXhr = {
  fullObject: typeof XMLHttpRequest;
  prototype: XMLHttpRequest;
  abort: XMLHttpRequest["abort"];
  open: XMLHttpRequest["open"];
  send: XMLHttpRequest["send"];
  setRequestHeader: XMLHttpRequest["setRequestHeader"];
  getAllResponseHeaders: XMLHttpRequest["getAllResponseHeaders"];
  getResponseHeader: XMLHttpRequest["getResponseHeader"];
};

type CapacitorHttpWindow = Window & {
  CapacitorWebFetch?: typeof fetch;
  CapacitorWebXMLHttpRequest?: CapacitorWebXhr;
};

function originOf(url: string): string | null {
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return null;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function scopeNativeHttp(nativeOrigins: readonly string[]): void {
  const w = window as CapacitorHttpWindow;
  const webFetch = w.CapacitorWebFetch;
  const webXhr = w.CapacitorWebXMLHttpRequest;
  if (!webFetch || !webXhr || webFetch === window.fetch) return;

  window.XMLHttpRequest = webXhr.fullObject;
  Object.assign(webXhr.prototype, {
    abort: webXhr.abort,
    open: webXhr.open,
    send: webXhr.send,
    setRequestHeader: webXhr.setRequestHeader,
    getAllResponseHeaders: webXhr.getAllResponseHeaders,
    getResponseHeader: webXhr.getResponseHeader,
  });

  const nativeFetch = window.fetch;
  const origins = new Set(nativeOrigins);
  window.fetch = (input, init) => {
    const origin = originOf(requestUrl(input));
    const viaNative = origin !== null && origins.has(origin);
    return (viaNative ? nativeFetch : webFetch).call(window, input, init);
  };
}
