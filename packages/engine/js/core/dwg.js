/* =========================================================
   MiniCAD — DWG support (client side)

   The engine cannot read DWG itself: the only good open-source reader is
   GPL-3.0, and shipping it to the browser would relicense MiniCAD. So the
   host converts DWG→DXF server-side and we speak HTTP to it.
   See packages/dwg/README.md.  Nothing here imports GPL code.
   ========================================================= */

export const DWG_ENDPOINT = '/api/dwg';

export class DwgError extends Error {}

// "AC" + 4 digits — the DWG version stamp every file starts with
export function looksLikeDWG(bytes){
  return bytes.length > 6 && bytes[0]===0x41 && bytes[1]===0x43 &&
         [...bytes.subarray(2,6)].every(c => c>=0x30 && c<=0x39);
}

/* Raw .dwg bytes → DXF text. Throws DwgError with a message fit to show a user.
   `headers` lets the host add whatever its endpoint needs (Rails wants a CSRF
   token) — core stays DOM-free, so reading that token is the adapter's job. */
export async function dwgToDxf(bytes, {endpoint = DWG_ENDPOINT, headers = {}} = {}){
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/octet-stream', ...headers},
      body: bytes,
    });
  } catch {
    throw new DwgError('Could not reach the DWG converter — check your internet connection and try again.');
  }

  if (!res.ok){
    let msg = null;
    try { msg = (await res.json()).error; } catch { /* not JSON */ }
    if (res.status === 404 || res.status === 503)
      throw new DwgError(msg || 'The DWG converter is not available right now. Export a DXF from your CAD program and open that instead.');
    throw new DwgError(msg || 'That DWG could not be read.');
  }

  const text = await res.text();
  if (!text.trim()) throw new DwgError('The DWG converter returned nothing. The file may be damaged.');
  return text;
}
