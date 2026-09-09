// Bound the full response, including its body, while preserving caller cancellation.
export function createTimeoutFetch(fetcher: typeof fetch, timeoutMs = 30_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : null);
    let rejectAbort: (reason: Error) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    const abort = () => {
      controller.abort();
      rejectAbort(new Error('Request aborted or timed out.'));
    };
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    try {
      return await Promise.race([
        aborted,
        (async () => {
          const response = await fetcher(input, { ...init, signal: controller.signal });
          // Supabase and image uploads consume finite responses. Buffer before releasing
          // the deadline so headers alone cannot leave JSON/blob parsing waiting forever.
          const method = init?.method ?? (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET');
          const body = method.toUpperCase() === 'HEAD' || [204, 205, 304].includes(response.status)
            ? null : await response.arrayBuffer();
          const complete = new Response(body, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
          Object.defineProperty(complete, 'url', { value: response.url });
          return complete;
        })(),
      ]);
    } finally {
      clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abort);
    }
  };
}
