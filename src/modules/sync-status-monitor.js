import {outboxRepository} from '../data/outbox-repository.js';
import {inboxRepository} from '../data/inbox-repository.js';
import {syncStateRepository} from '../data/sync-state-repository.js';
import {firebaseCloudAdapterSingleton as adapter} from '../sync/firebase-cloud-adapter.js';
import {eventBus} from '../core/event-bus.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=x=>x&&Number.isFinite(new Date(x).getTime())?new Date(x).toLocaleString('es-EC'):'Sin confirmación registrada';
let lastAck=null,busy=false,again=false,timer=null;
const domains=['SAMPLES','LABORATORY','REPORTS','BILLING','RECEIVABLES'];
const labels={SAMPLES:'Monitoreo',LABORATORY:'Laboratorio',REPORTS:'Informes',BILLING:'Facturación',RECEIVABLES:'Cuentas por cobrar'};
function schedule(){clearTimeout(timer);timer=setTimeout(()=>{if(!document.hidden)refresh()},550)}
async function refresh(){if(busy){again=true;return}busy=true;const body=$('pepSyncMonitorBody'),button=$('pepSyncMonitorRefresh');if(button)button.disabled=true;
 try{
  // Diagnóstico exclusivamente local: no fuerza consultas Firestore ni reconexiones.
  const [health,outbox,inbox,states]=await Promise.all([adapter.health(),outboxRepository.all(),inboxRepository.all(),syncStateRepository.all()]);
  const pending=outbox.filter(x=>['PENDING','ERROR'].includes(String(x.status||'').toUpperCase()));
  const errors=pending.filter(x=>String(x.status).toUpperCase()==='ERROR');
  const incoming=inbox.filter(x=>!x.processed);
  const stateMap=new Map(states.map(x=>[String(x.domain||'').toUpperCase(),x]));
  const domainsPending=[...new Set([...pending,...incoming].map(x=>x.domain||'SIN DOMINIO'))];
  const connected=!!health.connected;const online=navigator.onLine;
  const acknowledged=lastAck||states.map(x=>x.lastAckAt||x.lastSuccessAt).filter(Boolean).sort().at(-1)||null;
  const hasErrors=errors.length>0;
  const hasPending=pending.length+incoming.length>0;
  // Un adaptador conectado no garantiza que los listeners estén al día: evitar afirmaciones no verificadas.
  const state=hasErrors?'ERROR DE ENVÍO':hasPending?(online?'CAMBIOS PENDIENTES':'PENDIENTE DE CONEXIÓN'):connected&&online?'CONECTADO · SIN PENDIENTES LOCALES':online?'CONEXIÓN NO VERIFICADA':'RED NO DISPONIBLE';
  const firebase=connected?'Adaptador Firebase conectado (no confirma recepción remota)':online?'Estado no verificado (el adaptador no reporta conexión)':'Navegador sin red; estado remoto no verificable';
  const rows=domains.map(d=>{const s=stateMap.get(d)||{};const n=pending.filter(x=>String(x.domain||'').toUpperCase()===d).length+incoming.filter(x=>String(x.domain||'').toUpperCase()===d).length;return `<div class="pep-sync-monitor-row"><b>${esc(labels[d])}:</b> ${n?`${n} pendiente(s) · `:''}${esc(fmt(s.lastAckAt||s.lastSuccessAt||s.lastPullAt))}</div>`}).join('');
  if(body&&!$('pepSyncMonitor')?.hidden)body.innerHTML=`<div class="pep-sync-monitor-row"><b>Estado:</b> ${esc(state)}</div><div class="pep-sync-monitor-row"><b>Firebase:</b> ${esc(firebase)}</div><div class="pep-sync-monitor-row"><b>Envíos pendientes:</b> ${pending.length}</div><div class="pep-sync-monitor-row"><b>Recepciones pendientes:</b> ${incoming.length}</div><div class="pep-sync-monitor-row"><b>Errores de envío:</b> ${errors.length}</div><div class="pep-sync-monitor-row"><b>Módulos pendientes:</b> ${esc(domainsPending.join(', ')||'Ninguno')}</div><div class="pep-sync-monitor-row"><b>Última confirmación:</b> ${esc(fmt(acknowledged))}</div><strong>Actividad registrada por módulo</strong>${rows}${errors.length?`<p class="pep-sync-error">${esc(errors[0].lastError||'Revise el inspector de sincronización')}</p>`:''}<small>Las fechas reflejan eventos guardados localmente, no una comprobación en tiempo real del servidor. Para comprobar listeners y salud de todos los dominios utilice Salud Global.</small>`;
  const quick=$('pepSyncQuickStatus');
  // No sobrescribir un estado positivo confirmado por el reconciliador con una lectura incompleta del adaptador.
  if(quick){if(hasErrors||hasPending){quick.textContent=hasErrors?'⚠ Error sync':`⟳ Pendientes ${pending.length+incoming.length}`;quick.className=`pep-sync-quick ${hasErrors?'warn':'syncing'}`}else if(connected&&online){quick.textContent='✓ Sin pendientes';quick.className='pep-sync-quick ok'}else if(!quick.classList.contains('ok')){quick.textContent=online?'◌ Estado no verificado':'○ Sin red';quick.className='pep-sync-quick syncing'}quick.title=state}
 }catch(e){if(body&&!$('pepSyncMonitor')?.hidden)body.textContent=`No se pudo consultar el diagnóstico local: ${e.message||e}`}
 finally{busy=false;if(button)button.disabled=false;if(again){again=false;schedule()}}
}
$('pepSyncQuickStatus')?.addEventListener('click',()=>{const panel=$('pepSyncMonitor');panel.hidden=!panel.hidden;$('pepSyncQuickStatus').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh()});
$('pepSyncMonitorClose')?.addEventListener('click',()=>{$('pepSyncMonitor').hidden=true;$('pepSyncQuickStatus').setAttribute('aria-expanded','false')});
$('pepSyncMonitorRefresh')?.addEventListener('click',refresh);
$('pepSyncMonitorRetry')?.addEventListener('click',()=>{const el=$('pepSyncMonitorBody');if(el&&!el.querySelector('[data-retry-note]'))el.insertAdjacentHTML('beforeend','<p data-retry-note>Para reintentar sin duplicar operaciones, abra Sincronización → Live Sync → Sincronizar todos ahora.</p>')});
for(const event of ['outbox:changed','sync:ack','sync:sent','sync:error','sync:remote-applied'])eventBus.on(event,e=>{if(event==='sync:ack')lastAck=new Date().toISOString();schedule()});
window.addEventListener('online',schedule);window.addEventListener('offline',schedule);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
setInterval(()=>{if(!document.hidden&&!$('pepSyncMonitor')?.hidden)schedule()},30000);
