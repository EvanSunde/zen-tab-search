(() => {
  if(globalThis.__zenGlassClose) {globalThis.__zenGlassClose();return;}
  const previous=document.activeElement;
  const host=document.createElement('div');
  host.style.setProperty('all','initial','important');
  const shadow=host.attachShadow({mode:'closed'});
  const style=document.createElement('style');
  style.textContent=`dialog{box-sizing:border-box;padding:0;border:1px solid #ffffff38;border-radius:24px;width:min(780px,calc(100vw - 32px));height:min(650px,calc(100dvh - 64px));max-width:none;max-height:none;overflow:hidden;background:rgba(19,27,39,.65);backdrop-filter:blur(26px) saturate(145%);box-shadow:0 30px 100px #0008;color-scheme:dark;}dialog::backdrop{background:rgba(5,9,17,.28)}iframe{display:block;width:100%;height:100%;border:0;background:transparent}@media(prefers-color-scheme:light){dialog{background:rgba(237,244,252,.75)}}`;
  const dialog=document.createElement('dialog');
  dialog.setAttribute('aria-label','Zen Glass search');
  const frame=document.createElement('iframe');frame.title='Zen Glass command palette';
  frame.src=browser.runtime.getURL('panel.html')+'#overlay='+globalThis.__zenGlassToken;
  dialog.append(frame);shadow.append(style,dialog);document.documentElement.append(host);
  function close(){browser.runtime.onMessage.removeListener(onMessage);host.remove();delete globalThis.__zenGlassClose;if(previous?.isConnected)previous.focus();}
  function onMessage(m){if(m.type==='zen-glass-close')close();}
  globalThis.__zenGlassClose=close;
  browser.runtime.onMessage.addListener(onMessage);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  dialog.showModal();frame.focus();
})();
