// Data a server-rendered page hands to the app, so the app's first render
// already has it instead of showing a loading state and moving the page when
// it arrives (the sample analysis, the tender list pages). A JSON block is
// data, not a script, so the strict CSP (script-src 'self') allows it.

/** `value` as `<script type="application/json" id=…>`. `<`, `>` and `&` are
 *  escaped so no string in it can end the element early. */
export function jsonDataBlock(id, value) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `<script type="application/json" id="${id}">${json}</script>`;
}
