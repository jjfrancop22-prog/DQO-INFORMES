import {eventBus} from '../core/event-bus.js';
import {repositories} from '../data/repositories.js';

const KEY='PEP_INTELLIGENT_NOTIFICATIONS_A7033';
const READ_KEY='PEP_INTELLIGENT_NOTIFICATIONS_READ_A7033';
const MAX=180;
const clean=v=>String(v??'').trim();
const fmtDate=v=>{if(!v)return '—';const d=new Date(`${String(v).slice(0,10)}T12:00:00`);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('es-EC')};
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const id=()=>`N_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

class IntelligentNotificationCenter{
  constructor(){this.items=[];this.read=new Set();this.started=false;this.remoteSeen=new Set();}
  load(){try{this.items=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(this.items))this.items=[]}catch{this.items=[]}try{this.read=new Set(JSON.parse(localStorage.getItem(READ_KEY)||'[]'))}catch{this.read=new Set()}}
  save(){localStorage.setItem(KEY,JSON.stringify(this.items.slice(0,MAX)));localStorage.setItem(READ_KEY,JSON.stringify([...this.read].slice(-500)))}
  actor(v=''){return clean(v)||'Usuario PEP'}
  async sample(sampleId){return sampleId?repositories.samples.get(sampleId).catch(()=>null):null}
  signature(n){return [n.type,n.sampleId,n.code,n.date,n.actor,n.source].join('|')}
  push(n,{popup=true}={}){
    const now=Date.now();const item={id:id(),at:new Date().toISOString(),priority:'normal',category:'MUESTRAS',source:'LOCAL',...n};
    const sig=this.signature(item);const recent=this.items.find(x=>this.signature(x)===sig&&now-new Date(x.at).getTime()<4000);if(recent)return;
    this.items.unshift(item);this.items=this.items.slice(0,MAX);this.save();this.render();if(popup)this.popup(item);
  }
  popup(n){
    const host=document.getElementById('pepSmartPopupHost');if(!host)return;
    const el=document.createElement('div');el.className=`pep-smart-popup ${n.priority==='high'?'high':''}`;
    el.innerHTML=`<div class="pep-smart-popup-icon">${n.icon||'🔔'}</div><div><b>${esc(n.title)}</b><p>${esc(n.message)}</p><small>${esc(n.context||'')}</small></div><button type="button" aria-label="Cerrar">×</button>`;
    el.querySelector('button').onclick=()=>el.remove();host.prepend(el);setTimeout(()=>el.remove(),6500);
  }
  unread(){return this.items.filter(x=>!this.read.has(x.id)).length}
  render(){
    const count=document.getElementById('pepNotificationCount'),list=document.getElementById('pepNotificationList');if(count){const n=this.unread();count.textContent=n>99?'99+':String(n);count.hidden=!n}
    if(!list)return;
    if(!this.items.length){list.innerHTML='<div class="pep-notification-empty">Sin novedades. La campana mostrará cambios importantes del flujo.</div>';return}
    const groups=[];for(const n of this.items){const day=new Date(n.at).toLocaleDateString('es-EC');let g=groups.at(-1);if(!g||g.day!==day){g={day,items:[]};groups.push(g)}g.items.push(n)}
    list.innerHTML=groups.slice(0,7).map(g=>`<div class="pep-notification-day"><div class="pep-notification-day-title">${esc(g.day)}</div>${g.items.map(n=>`<button class="pep-notification-item ${this.read.has(n.id)?'read':'unread'}" data-notification-id="${n.id}" type="button"><span class="pep-notification-icon">${n.icon||'🔔'}</span><span><b>${esc(n.title)}</b><span>${esc(n.message)}</span><small>${esc(n.context||'')}${n.actor?' · '+esc(n.actor):''} · ${new Date(n.at).toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'})}</small></span></button>`).join('')}</div>`).join('');
  }
  mark(idValue){this.read.add(idValue);this.save();this.render()}
  markAll(){this.items.forEach(x=>this.read.add(x.id));this.save();this.render()}
  clear(){this.items=[];this.read.clear();this.save();this.render()}
  toggle(force){const p=document.getElementById('pepNotificationPanel');if(!p)return;const open=force??!p.classList.contains('show');p.classList.toggle('show',open);if(open)this.render()}
  context(s){if(!s)return '';return [s.clientId,s.branch,s.matrixId].filter(Boolean).join(' · ')}
  async localRegistration(d){const s=await this.sample(d.id);if(!s)return;window.__pepNotificationSnapshot?.set(s.id,structuredClone(s));this.push({type:'REGISTERED',sampleId:s.id,code:s.code,title:`Código ${s.code} registrado`,message:`Nueva muestra ${s.codeFull||s.code} · fecha ${fmtDate(s.samplingDate)}.`,context:this.context(s),actor:this.actor(s.updatedBy),icon:'🆕',priority:'high'});}
  async transition(d){const s=await this.sample(d.id);if(!s)return;window.__pepNotificationSnapshot?.set(s.id,structuredClone(s));const to=clean(d.to),action=clean(d.action);if(to==='SAMPLE_REGISTRY')this.push({type:'TO_LAB',sampleId:s.id,code:s.code,title:`${s.code} listo para Laboratorio`,message:'El control previo terminó y la muestra quedó habilitada para ingreso a Laboratorio.',context:this.context(s),actor:this.actor(s.updatedBy),icon:'🧪',priority:'high'});else if(to==='WAITING')this.push({type:'WAITING',sampleId:s.id,code:s.code,title:`${s.code} enviado a En Espera`,message:'La muestra requiere resolución antes de continuar el flujo.',context:this.context(s),actor:this.actor(s.updatedBy),icon:'⏳'});else if(action.includes('STOP'))this.push({type:'STOPPED',sampleId:s.id,code:s.code,title:`${s.code} DETENIDA`,message:'La muestra fue detenida y requiere seguimiento.',context:this.context(s),actor:this.actor(s.updatedBy),icon:'🛑',priority:'high'});}
  async reception(d){for(const sid of d.ids||[]){const s=await this.sample(sid);if(s){window.__pepNotificationSnapshot?.set(s.id,structuredClone(s));this.push({type:'RECEPTION',sampleId:s.id,code:s.code,date:d.receivedDate,title:`Recepción asignada · ${s.code}`,message:`Fecha de recepción: ${fmtDate(d.receivedDate)}.`,context:this.context(s),actor:this.actor(d.userId||s.updatedBy),icon:'📅'});}}}
  async lab(d){if(d.bulk)return;const s=await this.sample(d.sampleId);const e=await repositories.laboratory.get(d.entryId).catch(()=>null);if(!s)return;this.push({type:'LAB_OFFICIAL',sampleId:s.id,code:s.code,date:e?.receptionDate,title:`${s.code} ingresó a Laboratorio`,message:`Ingreso oficial confirmado${e?.analyst?` · Analista: ${e.analyst}`:''}${e?.maxReportDate?` · Máx. informe: ${fmtDate(e.maxReportDate)}`:''}.`,context:this.context(s),actor:this.actor(e?.updatedBy||e?.officialEntryBy),icon:'🔬',priority:'high'});}
  async remote(d){
    const domain=clean(d.domain).toUpperCase(),e=d.entity;if(!e||e.deleted)return;const key=`${domain}|${e.id}|${e.revision}`;if(this.remoteSeen.has(key))return;this.remoteSeen.add(key);if(this.remoteSeen.size>500)this.remoteSeen=new Set([...this.remoteSeen].slice(-250));
    if(domain==='SAMPLES'){
      const old=(window.__pepNotificationSnapshot?.get(e.id))||null;window.__pepNotificationSnapshot=window.__pepNotificationSnapshot||new Map();window.__pepNotificationSnapshot.set(e.id,structuredClone(e));
      if(!old){this.push({type:'REGISTERED_REMOTE',sampleId:e.id,code:e.code,title:`Nuevo código ${e.code}`,message:`Registrado desde otro equipo · fecha ${fmtDate(e.samplingDate)}.`,context:this.context(e),actor:this.actor(e.updatedBy),icon:'🆕',priority:'high',source:'OTRO EQUIPO'});return}
      if(clean(old.receivedDate)!==clean(e.receivedDate)&&e.receivedDate)this.push({type:'RECEPTION_REMOTE',sampleId:e.id,code:e.code,date:e.receivedDate,title:`Recepción actualizada · ${e.code}`,message:`Nueva fecha de recepción: ${fmtDate(e.receivedDate)}.`,context:this.context(e),actor:this.actor(e.updatedBy),icon:'📅',source:'OTRO EQUIPO'});
      const a=old.workflow?.workflowStage,b=e.workflow?.workflowStage;if(a!==b&&b==='SAMPLE_REGISTRY')this.push({type:'TO_LAB_REMOTE',sampleId:e.id,code:e.code,title:`${e.code} listo para Laboratorio`,message:'Actualización recibida desde otro equipo: muestra habilitada para Laboratorio.',context:this.context(e),actor:this.actor(e.updatedBy),icon:'🧪',priority:'high',source:'OTRO EQUIPO'});
      if(old.workflow?.decisionStatus!==e.workflow?.decisionStatus&&e.workflow?.decisionStatus==='DETENIDA')this.push({type:'STOPPED_REMOTE',sampleId:e.id,code:e.code,title:`${e.code} DETENIDA`,message:'Cambio recibido desde otro equipo.',context:this.context(e),actor:this.actor(e.updatedBy),icon:'🛑',priority:'high',source:'OTRO EQUIPO'});
    }else if(domain==='LABORATORY'&&e.officialEntryAt){
      this.push({type:'LAB_REMOTE',sampleId:e.sampleId,code:e.code,title:`${e.code} ingresó a Laboratorio`,message:`Ingreso oficial desde otro equipo${e.analyst?` · Analista: ${e.analyst}`:''}.`,context:[e.clientId,e.branch,e.matrixId].filter(Boolean).join(' · '),actor:this.actor(e.updatedBy||e.officialEntryBy),icon:'🔬',priority:'high',source:'OTRO EQUIPO'});
    }
  }
  seedSnapshot(){window.__pepNotificationSnapshot=new Map((window.__pepNotificationRows||[]).map(x=>[x.id,structuredClone(x)]))}
  init(){if(this.started)return;this.started=true;this.load();this.render();
    document.getElementById('pepNotificationBell')?.addEventListener('click',e=>{e.stopPropagation();this.toggle()});
    document.getElementById('pepNotificationMarkAll')?.addEventListener('click',()=>this.markAll());document.getElementById('pepNotificationClear')?.addEventListener('click',()=>this.clear());
    document.getElementById('pepNotificationList')?.addEventListener('click',e=>{const b=e.target.closest('[data-notification-id]');if(b)this.mark(b.dataset.notificationId)});document.addEventListener('click',e=>{if(!e.target.closest('#pepNotificationPanel')&&!e.target.closest('#pepNotificationBell'))this.toggle(false)});
    eventBus.on('sample.registration.completed',e=>this.localRegistration(e.detail));eventBus.on('workflow.transition',e=>this.transition(e.detail));eventBus.on('samples.reception-date.assigned',e=>this.reception(e.detail));eventBus.on('laboratory.official-entry.completed',e=>this.lab(e.detail));eventBus.on('sync:remote-applied',e=>this.remote(e.detail));
  }
}
export const intelligentNotificationCenter=new IntelligentNotificationCenter();
