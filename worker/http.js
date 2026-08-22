/** Read a request body without ever buffering more than `maxBytes`.
 *
 * Content-Length is only an early rejection: HTTP/2 and streamed requests may
 * omit it, so the stream itself remains the authoritative bound.
 */
export async function readTextLimited(request, maxBytes) {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const trimmed = declared.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) > maxBytes) return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        try {
          await reader.cancel("body_too_large");
        } catch {
          /* The size decision is authoritative even if the peer has already
             torn down its half of the stream while cancellation propagates. */
        }
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
