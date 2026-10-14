import {outboxRepository} from '../data/outbox-repository.js';
import {inboxRepository} from '../data/inbox-repository.js';
import {firebaseCloudAdapterSingleton as adapter} from '../sync/firebase-cloud-adapter.js';
import {eventBus} from '../core/event-bus.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lastAck=null, busy=false, refreshTimer=null;
function schedule(){clearTimeout(refreshTimer);if(!$('pepSyncMonitor')?.hidden)refreshTimer=setTimeout(refresh,450)}
async function refresh(){if(busy)return;busy=true;const body=$('pepSyncMonitorBody');const button=$('pepSyncMonitorRefresh');if(button)button.disabled=true;
 try{const [health,outbox,inbox]=await Promise.all([adapter.health(),outboxRepository.all(),inboxRepository.all()]);
 const pending=outbox.filter(x=>['PENDING','ERROR'].includes(String(x.status||'').toUpperCase()));const errors=pending.filter(x=>String(x.status).toUpperCase()==='ERROR');const incoming=inbox.filter(x=>!x.processed);
 const domains=[...new Set(pending.map(x=>x.domain||'SIN DOMINIO'))];const active=health.connected&&navigator.onLine;
 const state=!active?'SIN CONEXIÓN':errors.length?'REVISAR ERRORES':pending.length||incoming.length?'PENDIENTE':'SIN PENDIENTES LOCALES';
 body.innerHTML=`<div class="pep-sync-monitor-row"><b>Estado:</b> ${esc(state)}</div><div class="pep-sync-monitor-row"><b>Firebase:</b> ${active?'Conectado':'Desconectado o sin red'}</div><div class="pep-sync-monitor-row"><b>Envíos pendientes:</b> ${pending.length}</div><div class="pep-sync-monitor-row"><b>Recepciones pendientes:</b> ${incoming.length}</div><div class="pep-sync-monitor-row"><b>Errores de envío:</b> ${errors.length}</div><div class="pep-sync-monitor-row"><b>Módulos pendientes:</b> ${esc(domains.join(', ')||'Ninguno')}</div><div class="pep-sync-monitor-row"><b>Última confirmación observada:</b> ${lastAck?esc(new Date(lastAck).toLocaleString('es-EC')):'No registrada en esta sesión'}</div>${errors.length?`<p class="pep-sync-error">${esc(errors[0].lastError||'Revise el inspector de sincronización')}</p>`:''}<small>Sin pendientes locales no garantiza que todos los cambios remotos ya se hayan recibido. Consulte Salud Global para verificar listeners y estado de todos los dominios.</small>`;
 const quick=$('pepSyncQuickStatus');if(quick&&!['syncing'].includes(quick.classList[1])){if(!active||errors.length||pending.length||incoming.length){quick.textContent=`${errors.length?'⚠':'⟳'} ${errors.length?'Error sync':`Pendientes ${pending.length+incoming.length}`}`;quick.className=`pep-sync-quick ${errors.length||!active?'warn':'syncing'}`;quick.title=state}}
 }catch(e){body.textContent=`No se pudo consultar el estado local: ${e.message||e}`;}finally{busy=false;if(button)button.disabled=false}}
$('pepSyncQuickStatus')?.addEventListener('click',()=>{const panel=$('pepSyncMonitor');panel.hidden=!panel.hidden;$('pepSyncQuickStatus').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)refresh()});
$('pepSyncMonitorClose')?.addEventListener('click',()=>{$('pepSyncMonitor').hidden=true;$('pepSyncQuickStatus').setAttribute('aria-expanded','false')});
$('pepSyncMonitorRefresh')?.addEventListener('click',refresh);
$('pepSyncMonitorRetry')?.addEventListener('click',()=>{const el=$('pepSyncMonitorBody');el.insertAdjacentHTML('beforeend','<p>Para reintentar de forma segura, abra Sincronización → Live Sync → Sincronizar todos ahora. No se modificó el mecanismo de reintentos.</p>')});
for(const event of ['outbox:changed','sync:ack','sync:error','sync:remote-applied'])eventBus.on(event,e=>{if(event==='sync:ack')lastAck=new Date().toISOString();schedule()});
window.addEventListener('online',schedule);window.addEventListener('offline',schedule);
