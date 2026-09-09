import {repositories} from '../data/repositories.js';

const $=id=>document.getElementById(id);
const clean=v=>String(v??'').trim();
const upper=v=>clean(v).toUpperCase();
const norm=v=>upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowIso=()=>new Date().toISOString();
let clients=[];
let selectedClientId='';
let lastPreview=null;

function installStyles(){
  if($('branchNormalizationStyles'))return;
  const st=document.createElement('style');st.id='branchNormalizationStyles';st.textContent=`
  #branchNormalizeModal .modal-box{max-width:1050px}
  .bn-grid{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(420px,1.2fr);gap:16px}
  .bn-panel{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fbfdfb}
  .bn-branch-list{max-height:360px;overflow:auto;border:1px solid var(--line);border-radius:12px;background:white}
  .bn-branch{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid var(--line)}
  .bn-branch:last-child{border-bottom:0}.bn-branch input{width:auto}
  .bn-official{background:#eef8f2;border:1px solid #b7dec6;border-radius:12px;padding:12px}
  .bn-preview{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin-top:12px}
  .bn-kpi{border:1px solid var(--line);border-radius:10px;padding:10px;background:white}.bn-kpi b{font-size:20px;color:#0d6a3c;display:block}
  .bn-warning{border:1px solid #e9c46a;background:#fff9e8;border-radius:10px;padding:10px;margin-top:10px}
  .bn-success{border:1px solid #9bd7b0;background:#eefaf2;border-radius:10px;padding:10px;margin-top:10px}
  @media(max-width:800px){.bn-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(st);
}

async function reloadClients(){clients=(await repositories.clients.all()).sort((a,b)=>String(a.name).localeCompare(String(b.name),'es'));}
function selectedClient(){return clients.find(c=>c.id===selectedClientId)||null;}

function installEntryPoints(){
  const actions=document.querySelector('#catalogs .actions');
  if(actions&&!$('normalizeBranchesBtn')){
    const b=document.createElement('button');b.id='normalizeBranchesBtn';b.type='button';b.className='btn secondary';b.textContent='🧹 Unificar sucursales';actions.appendChild(b);b.onclick=openModal;
  }
  const catalogForm=document.querySelector('#clientsModal .catalog-form');
  if(catalogForm&&!$('normalizeBranchesFromClientBtn')){
    const b=document.createElement('button');b.id='normalizeBranchesFromClientBtn';b.type='button';b.className='btn secondary small';b.style.marginTop='8px';b.textContent='🧹 Unificar / corregir sucursales';
    const acts=catalogForm.querySelector('.actions');catalogForm.insertBefore(b,acts||null);b.onclick=()=>{selectedClientId=$('catalogClientId')?.value||'';openModal();};
  }
}

function ensureModal(){
  if($('branchNormalizeModal'))return;
  const modal=document.createElement('div');modal.className='modal';modal.id='branchNormalizeModal';modal.innerHTML=`
  <div class="modal-box">
    <div class="modal-head"><div><h3>🧹 Unificación controlada de sucursales</h3><div class="muted">Seleccione nombres duplicados, defina el nombre oficial y migre la trazabilidad completa.</div></div><button class="close" type="button" data-bn-close>×</button></div>
    <div class="notice"><b>Qué hace:</b> cambia la sucursal en Muestras, Laboratorio, Informes, Facturación y Cuentas por Cobrar; actualiza el catálogo y el Plan de monitoreo. <b>No elimina muestras ni códigos.</b></div>
    <div class="bn-grid" style="margin-top:12px">
      <div class="bn-panel">
        <label>Cliente</label><input id="bnClientSearch" placeholder="Buscar cliente, ej. AJEcuador" autocomplete="off">
        <select id="bnClientSelect" size="8" style="margin-top:8px"></select>
        <div class="muted" id="bnClientSummary" style="margin-top:8px"></div>
      </div>
      <div class="bn-panel">
        <div class="toolbar" style="margin-bottom:8px"><div><b>Sucursales del cliente</b><div class="muted">Marque únicamente las que desea convertir en una sola.</div></div><button class="btn secondary small" type="button" id="bnSelectAll">Seleccionar todas</button></div>
        <div class="bn-branch-list" id="bnBranchList"></div>
        <div class="bn-official" style="margin-top:12px"><label>Nombre oficial que quedará</label><input id="bnOfficialName" placeholder="Ej. PLANTA GUAYAQUIL - EFL"><div class="muted" style="margin-top:5px">Puede escribir un nombre nuevo o usar uno de los seleccionados.</div></div>
        <div class="actions"><button class="btn blue" type="button" id="bnPreview">🔎 Revisar impacto</button><button class="btn primary" type="button" id="bnApply" disabled>✅ Unificar y aplicar en todo</button></div>
        <div id="bnResult"></div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('[data-bn-close]').onclick=closeModal;
  modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
  $('bnClientSearch').addEventListener('input',renderClientOptions);
  $('bnClientSelect').addEventListener('change',()=>{selectedClientId=$('bnClientSelect').value;lastPreview=null;$('bnApply').disabled=true;renderBranches();});
  $('bnSelectAll').onclick=()=>{document.querySelectorAll('[data-bn-branch]').forEach(x=>x.checked=true);lastPreview=null;$('bnApply').disabled=true;};
  $('bnBranchList').addEventListener('change',()=>{lastPreview=null;$('bnApply').disabled=true;$('bnResult').innerHTML='';});
  $('bnOfficialName').addEventListener('input',()=>{lastPreview=null;$('bnApply').disabled=true;$('bnResult').innerHTML='';});
}

async function openModal(){
  await reloadClients();ensureModal();
  const current=$('catalogClientId')?.value;
  if(current&&clients.some(c=>c.id===current))selectedClientId=current;
  if(!selectedClientId&&clients.length)selectedClientId=clients[0].id;
  $('bnClientSearch').value='';renderClientOptions();renderBranches();
  $('branchNormalizeModal').classList.add('show');
}
function closeModal(){$('branchNormalizeModal')?.classList.remove('show');}

function renderClientOptions(){
  const q=norm($('bnClientSearch')?.value||'');
  const visible=clients.filter(c=>!q||norm(c.name).includes(q));
  const sel=$('bnClientSelect');if(!sel)return;
  sel.innerHTML=visible.map(c=>`<option value="${esc(c.id)}" ${c.id===selectedClientId?'selected':''}>${esc(c.name)} · ${(c.branches||[]).length} suc.</option>`).join('');
  if(visible.length&&!visible.some(c=>c.id===selectedClientId)){selectedClientId=visible[0].id;sel.value=selectedClientId;renderBranches();}
}
function renderBranches(){
  const c=selectedClient();const list=$('bnBranchList');if(!list)return;
  const branches=[...new Set((c?.branches||[]).map(upper).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  $('bnClientSummary').textContent=c?`${c.name} · ${branches.length} sucursal(es)`:'Seleccione un cliente.';
  list.innerHTML=branches.length?branches.map((b,i)=>`<label class="bn-branch"><input type="checkbox" data-bn-branch value="${esc(b)}"><span><b>${esc(b)}</b></span></label>`).join(''):'<div class="empty">Este cliente no tiene sucursales registradas.</div>';
  $('bnOfficialName').value='';$('bnResult').innerHTML='';$('bnApply').disabled=true;lastPreview=null;
}
function selectedAliases(){return [...document.querySelectorAll('[data-bn-branch]:checked')].map(x=>upper(x.value)).filter(Boolean);}

async function computeImpact(){
  const c=selectedClient(),aliases=selectedAliases(),official=upper($('bnOfficialName')?.value);
  if(!c)throw new Error('Seleccione un cliente.');if(!official)throw new Error('Escriba el nombre oficial de la sucursal.');if(!aliases.length)throw new Error('Seleccione al menos una sucursal para unificar.');
  const aliasSet=new Set(aliases.map(norm)),clientName=norm(c.name);
  const stores=['samples','laboratory','reports','billing','receivables'];
  const rows={};for(const key of stores)rows[key]=await repositories[key].all();
  const sampleMatches=rows.samples.filter(r=>(r.clientCatalogId===c.id||norm(r.clientId)===clientName)&&aliasSet.has(norm(r.branch)));
  const sampleIds=new Set(sampleMatches.map(x=>x.id));
  const matches={samples:sampleMatches};
  for(const key of stores.slice(1))matches[key]=rows[key].filter(r=>(r.sampleId&&sampleIds.has(r.sampleId))||(norm(r.clientId)===clientName&&aliasSet.has(norm(r.branch))));
  const planMatches=(c.monitoringPlans||[]).filter(p=>aliasSet.has(norm(p.branch)));
  return {client:c,aliases,official,aliasSet,matches,planMatches,sampleIds,total:Object.values(matches).reduce((n,a)=>n+a.length,0)};
}

async function previewImpact(){
  const btn=$('bnPreview'); if(btn){btn.disabled=true;btn.textContent='⏳ Revisando…';}
  try{
    const p=await computeImpact();lastPreview=p;
    const existing=(p.client.branches||[]).find(b=>norm(b)===norm(p.official));
    $('bnResult').innerHTML=`<div class="bn-warning"><b>Vista previa — todavía no se ha cambiado nada.</b><br>${esc(p.aliases.join(' + '))} → <b>${esc(p.official)}</b>${existing?'<br><span class="muted">El nombre oficial ya existe: los duplicados se consolidarán sobre ese registro.</span>':''}</div>
      <div class="bn-preview">
        <div class="bn-kpi"><b>${p.matches.samples.length}</b><span>Muestras</span></div>
        <div class="bn-kpi"><b>${p.matches.laboratory.length}</b><span>Laboratorio</span></div>
        <div class="bn-kpi"><b>${p.matches.reports.length}</b><span>Informes</span></div>
        <div class="bn-kpi"><b>${p.matches.billing.length}</b><span>Facturación</span></div>
        <div class="bn-kpi"><b>${p.matches.receivables.length}</b><span>Cobranza</span></div>
        <div class="bn-kpi"><b>${p.planMatches.length}</b><span>Planes</span></div>
      </div><div class="muted" style="margin-top:8px">Los códigos, fechas, resultados, facturas y estados no cambian; únicamente se normaliza la sucursal y se deja auditoría de cada actualización.</div>`;
    $('bnApply').disabled=false;
    $('bnResult').scrollIntoView({behavior:'smooth',block:'nearest'});
    const summary=`Impacto revisado: ${p.matches.samples.length} muestra(s), ${p.matches.laboratory.length} laboratorio, ${p.matches.reports.length} informe(s), ${p.matches.billing.length} facturación, ${p.matches.receivables.length} cobranza y ${p.planMatches.length} plan(es).`;
    if(window.showToast) window.showToast(summary,'success'); else alert(summary);
  }catch(e){lastPreview=null;$('bnApply').disabled=true;$('bnResult').innerHTML=`<div class="bn-warning"><b>No se puede revisar:</b> ${esc(e.message)}</div>`; alert('No se puede revisar: '+e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent='🔎 Revisar impacto';}}
}

function mergeMonitoringPlans(plans=[],aliasSet,official){
  const mapped=plans.map(p=>aliasSet.has(norm(p.branch))?{...p,branch:official}:p);
  const seen=new Set();return mapped.filter(p=>{const k=[norm(p.branch),norm(p.service),norm(p.frequency),Number(p.dueDay||30),p.active!==false].join('|');if(seen.has(k))return false;seen.add(k);return true;});
}
function historyPatch(row,client,aliases,official){
  if(!Array.isArray(row.history))return {};
  return {history:[...row.history,{action:'BRANCH_NORMALIZED',at:nowIso(),userId:'QUALITY_BRANCH_NORMALIZATION',detail:`${client.name}: ${aliases.join(' / ')} → ${official}`} ]};
}

async function applyNormalization(){
  const applyBtn=$('bnApply');
  try{
    const fresh=await computeImpact();
    if(!lastPreview||lastPreview.client.id!==fresh.client.id||norm(lastPreview.official)!==norm(fresh.official)||lastPreview.aliases.map(norm).sort().join('|')!==fresh.aliases.map(norm).sort().join('|'))throw new Error('La selección cambió. Pulse primero “Revisar impacto”.');
    const msg=`Se actualizarán ${fresh.total} registros operativos y el catálogo de ${fresh.client.name}.\n\n${fresh.aliases.join(' + ')} → ${fresh.official}\n\nNo se eliminarán muestras ni códigos. ¿Continuar?`;
    if(!window.confirm(msg))return;
    $('bnApply').disabled=true;$('bnPreview').disabled=true;$('bnResult').innerHTML='<div class="notice">Aplicando normalización con trazabilidad…</div>';
    const userId='QUALITY_BRANCH_NORMALIZATION';
    const newBranches=[];let inserted=false;
    for(const b of (fresh.client.branches||[])){
      if(fresh.aliasSet.has(norm(b))){if(!inserted){newBranches.push(fresh.official);inserted=true}}else if(!newBranches.some(x=>norm(x)===norm(b)))newBranches.push(upper(b));
    }
    if(!inserted&&!newBranches.some(x=>norm(x)===norm(fresh.official)))newBranches.push(fresh.official);
    const monitoringPlans=mergeMonitoringPlans(fresh.client.monitoringPlans||[],fresh.aliasSet,fresh.official);
    await repositories.clients.update(fresh.client.id,{branches:newBranches,monitoringPlans,branchNormalizationHistory:[...(fresh.client.branchNormalizationHistory||[]),{at:nowIso(),aliases:fresh.aliases,official:fresh.official,userId}]},{userId});
    let updated=0;
    for(const row of fresh.matches.samples){await repositories.samples.update(row.id,{branch:fresh.official,clientId:fresh.client.name,clientCatalogId:fresh.client.id,...historyPatch(row,fresh.client,fresh.aliases,fresh.official)},{userId});updated++;}
    for(const key of ['laboratory','reports','billing','receivables']){
      for(const row of fresh.matches[key]){await repositories[key].update(row.id,{branch:fresh.official,clientId:fresh.client.name,...historyPatch(row,fresh.client,fresh.aliases,fresh.official)},{userId});updated++;}
    }
    await reloadClients();selectedClientId=fresh.client.id;renderClientOptions();renderBranches();
    alert(`Unificación completada. ${updated} registros actualizados. Nombre oficial: ${fresh.official}`);
    $('bnResult').innerHTML=`<div class="bn-success"><b>✅ Unificación completada.</b><br><b>${esc(fresh.official)}</b> quedó como nombre único en el catálogo. Se actualizaron ${updated} registros operativos y ${fresh.planMatches.length} referencia(s) del plan de monitoreo.<br><span class="muted">Los cambios fueron realizados mediante los repositorios normales del ERP, por lo que quedan en Auditoría/Outbox y se sincronizan por el flujo estable.</span></div>`;
    document.dispatchEvent(new CustomEvent('pep:branch-normalized',{detail:{clientId:fresh.client.id,official:fresh.official}}));
    setTimeout(()=>{document.querySelector('.tab[data-view="catalogs"]')?.click();},50);
  }catch(e){$('bnResult').innerHTML=`<div class="bn-warning"><b>Error:</b> ${esc(e.message)}</div>`;}finally{$('bnPreview').disabled=false;}
}

function installActionFallback(){
  if(window.__bnActionFallback)return; window.__bnActionFallback=true;
  document.addEventListener('click',async e=>{
    const preview=e.target.closest?.('#bnPreview');
    const apply=e.target.closest?.('#bnApply');
    if(!preview&&!apply)return;
    e.preventDefault(); e.stopPropagation();
    if(preview) await previewImpact();
    if(apply && !apply.disabled) await applyNormalization();
  },true);
}
async function init(){installStyles();installEntryPoints();ensureModal();installActionFallback();const obs=new MutationObserver(()=>installEntryPoints());obs.observe(document.body,{childList:true,subtree:true});}
init().catch(e=>console.error('[Branch Normalization Addon]',e));
