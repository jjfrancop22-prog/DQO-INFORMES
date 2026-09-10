let deferredInstallPrompt=null;
const PWA_RELEASE='A7.0.31';
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||window.navigator.standalone===true;
const byId=id=>document.getElementById(id);
function setInstallVisible(show){for(const id of ['pepInstallApp','pepInstallAppHeader']){const el=byId(id);if(el)el.style.display=show&&!isStandalone()?'inline-flex':'none'}}
async function installApp(){
  if(isStandalone())return;
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();try{await deferredInstallPrompt.userChoice}catch{}deferredInstallPrompt=null;setInstallVisible(false);return}
  const msg=/Mac/i.test(navigator.platform||'')?'Para instalar PEP Enterprise: en Chrome/Edge use el icono Instalar de la barra de direcciones; en Safari use Archivo → Añadir al Dock.':'Para instalar PEP Enterprise, use el icono Instalar aplicación de Chrome o Edge en la barra de direcciones.';alert(msg);
}
function showUpdate(registration){
  let bar=document.getElementById('pepPwaUpdate');
  if(bar){bar.style.display='flex';return}
  bar=document.createElement('div');bar.id='pepPwaUpdate';bar.setAttribute('role','status');
  bar.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:999999;background:#173c29;color:#fff;padding:12px 14px;border-radius:12px;box-shadow:0 12px 34px #0004;display:flex;gap:11px;align-items:center;font:600 12px system-ui;max-width:min(92vw,560px)';
  bar.innerHTML='<span>🔄 <b>Nueva versión de PEP Enterprise disponible.</b> Actualice para aplicar los cambios.</span><button type="button" style="border:0;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer;white-space:nowrap">Actualizar ahora</button>';
  bar.querySelector('button').addEventListener('click',()=>{
    const btn=bar.querySelector('button');btn.disabled=true;btn.textContent='Actualizando…';
    if(registration.waiting){registration.waiting.postMessage({type:'SKIP_WAITING'});return}
    registration.update().then(()=>{
      if(registration.waiting)registration.waiting.postMessage({type:'SKIP_WAITING'});
      else location.reload();
    }).catch(()=>{btn.disabled=false;btn.textContent='Actualizar ahora'});
  });
  document.body.appendChild(bar);
}
async function checkForUpdate(reg){
  try{
    await reg.update();
    if(reg.waiting)showUpdate(reg);
  }catch{}
}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;setInstallVisible(true)});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;setInstallVisible(false)});
window.addEventListener('DOMContentLoaded',()=>{byId('pepInstallApp')?.addEventListener('click',installApp);byId('pepInstallAppHeader')?.addEventListener('click',installApp);setInstallVisible(false)});
if('serviceWorker' in navigator){
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)return;refreshing=true;location.reload()});
  window.addEventListener('load',async()=>{
    try{
      const reg=await navigator.serviceWorker.register('/service-worker.js?v=502A7028',{updateViaCache:'none'});
      if(reg.waiting)showUpdate(reg);
      reg.addEventListener('updatefound',()=>{
        const worker=reg.installing;if(!worker)return;
        worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)showUpdate(reg)});
      });
      // Revisar al abrir la PWA, al volver a ella y periódicamente.
      await checkForUpdate(reg);
      window.addEventListener('focus',()=>checkForUpdate(reg));
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate(reg)});
      window.addEventListener('online',()=>checkForUpdate(reg));
      setInterval(()=>checkForUpdate(reg),5*60*1000);
    }catch{}
  });
}
