/** Build only the trusted runtime here. Generated markup arrives after the handshake. */
export function buildVisualSandbox(channel: string): string {
  const encoded = JSON.stringify(channel).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://esm.sh https://unpkg.com; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light;--viz-bg-primary:#fff;--viz-bg-secondary:#f5f6f8;--viz-text-primary:#182331;--viz-text-secondary:#657181;--viz-border-primary:#dde3e9;--viz-info:#436cbd;--viz-font-sans:system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;font:14px/1.5 var(--viz-font-sans);color:var(--viz-text-primary);background:var(--viz-bg-primary)}#visual-root{min-height:80px}button,input,select,textarea{font:inherit}svg,canvas,img{max-width:100%}button{cursor:pointer}body.picking,body.picking *{cursor:crosshair!important}body.picking *:hover{outline:2px solid #436cbd;outline-offset:2px}
</style></head><body><main id="visual-root"></main><script>
(() => {
  const channel = ${encoded};
  const root = document.getElementById('visual-root');
  let state = {}, picking = false, initialized = false, applying = false, timer;
  const subscribers = new Set();
  const send = (type, payload = {}) => parent.postMessage({ channel, type, ...payload }, '*');
  const copy = value => JSON.parse(JSON.stringify(value));
  const publish = () => {
    clearTimeout(timer);
    send('state', { state });
  };
  const notify = () => subscribers.forEach(fn => { try { fn(copy(state)); } catch(error) { send('error', {message:String(error)}); } });
  const inputKey = el => el.id || el.name || el.getAttribute('data-agentboard-id');
  function restoreInputs() {
    applying = true;
    root.querySelectorAll('input,select,textarea').forEach(el => {
      const key = inputKey(el), value = state._inputs && state._inputs[key];
      if (!key || value === undefined) return;
      if (el.type === 'password' || el.type === 'file') return;
      if (el.type === 'checkbox') el.checked = !!value;
      else if (el.type === 'radio') el.checked = el.value === String(value);
      else if (el.multiple && Array.isArray(value)) Array.from(el.options).forEach(option => { option.selected = value.includes(option.value); });
      else el.value = String(value);
      el.dispatchEvent(new Event('input', {bubbles:true}));
    });
    applying = false;
  }
  window.agentboard = Object.freeze({
    getState: () => copy(state),
    setState: next => {
      const value = typeof next === 'function' ? next(copy(state)) : next;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return;
      state = { ...state, ...copy(value) };
      if (!applying) { notify(); publish(); }
    },
    onStateChange: fn => { subscribers.add(fn); return () => subscribers.delete(fn); },
    ask: (text, context) => {
      publish();
      send('ask', { text:String(text).slice(0,4000), context });
    },
    reference: (label, elementId) => send('reference', {reference:{label:String(label),elementId}})
  });
  window.sendPrompt = text => window.agentboard.ask(text);
  root.addEventListener('input', event => {
    if (applying) return;
    const el = event.target, key = inputKey(el);
    if (!key || el.type === 'password' || el.type === 'file') return;
    const value = el.type === 'checkbox' ? el.checked : el.multiple ? Array.from(el.selectedOptions).map(option => option.value) : el.value;
    state = { ...state, _inputs:{ ...(state._inputs || {}), [key]:value } };
    clearTimeout(timer); timer = setTimeout(publish, 120);
  });
  root.addEventListener('change', () => { if (!applying) publish(); });
  document.addEventListener('click', event => {
    const anchor = event.target.closest && event.target.closest('a');
    if (anchor) event.preventDefault();
    if (!picking) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const el = event.target.closest('[data-agentboard-id],[id],button,label,input,select,textarea,svg text,svg g') || event.target;
    send('reference', {reference:{
      label:(el.getAttribute('aria-label') || el.textContent || el.id || el.tagName).trim().slice(0,300),
      elementId:el.getAttribute('data-agentboard-id') || el.id || undefined,
      selector:el.id ? '#' + CSS.escape(el.id) : el.tagName.toLowerCase()
    }});
    picking = false; document.body.classList.remove('picking');
  }, true);
  window.addEventListener('message', async event => {
    if (event.source !== parent || !event.data || event.data.channel !== channel) return;
    const msg = event.data;
    if (msg.type === 'pick') { picking = !!msg.active; document.body.classList.toggle('picking',picking); }
    if (msg.type === 'restore') { state = copy(msg.state || {}); notify(); restoreInputs(); }
    if (msg.type !== 'init' || initialized) return;
    initialized = true; state = copy(msg.state || {});
    // Parse full documents and fragments without interpolating model code into the bootstrap.
    const parsed = new DOMParser().parseFromString(msg.html, 'text/html');
    root.replaceChildren(...Array.from(parsed.head.children), ...Array.from(parsed.body.childNodes));
    const scripts = Array.from(root.querySelectorAll('script'));
    for (const old of scripts) {
      const script = document.createElement('script');
      for (const attr of old.attributes) script.setAttribute(attr.name,attr.value);
      script.textContent = old.textContent;
      const wait = (script.src || script.type === 'module') ? new Promise(resolve => {
        script.onload = resolve;
        script.onerror = () => { send('error',{message:'资源加载失败，请使用内联代码或受支持的图表库。'}); resolve(); };
      }) : Promise.resolve();
      old.replaceWith(script); await wait;
    }
    // The host initializes after iframe load. Support page-style initialization as well as inline scripts.
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles:true }));
    window.dispatchEvent(new Event('load'));
    restoreInputs();
    send('rendered');
  });
  window.addEventListener('error', event => send('error', {message:event.message || '视觉运行出错'}));
  window.addEventListener('unhandledrejection', event => send('error', {message:String(event.reason && event.reason.message || event.reason)}));
  window.addEventListener('securitypolicyviolation', event => send('error',{message:'视觉使用了未开放的资源：' + event.violatedDirective}));
  send('ready');
})();
</script></body></html>`;
}
