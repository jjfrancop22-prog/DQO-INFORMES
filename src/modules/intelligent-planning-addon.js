import {repositories} from '../data/repositories.js';
import {sampleRegistryService} from './sample-registry.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
const uid=()=>`PLAN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const RULES={
  MENSUAL:{months:[1,2,3,4,5,6,7,8,9,10,11,12],labels:MONTHS},
  BIMESTRAL:{months:[2,4,6,8,10,12],labels:['B1','B2','B3','B4','B5','B6']},
  TRIMESTRAL:{months:[3,6,9,12],labels:['1ER TRIMESTRE','2DO TRIMESTRE','3ER TRIMESTRE','4TO TRIMESTRE']},
  CUATRIMESTRAL:{months:[4,8,12],labels:['C1','C2','C3']},
  SEMESTRAL:{months:[6,12],labels:['1ER SEMESTRE','2DO SEMESTRE']},
  ANUAL:{months:[12],labels:['ANUAL']}
};

let clientCache=[], sampleCache=[], matrixCache=[];
function periods(plan,year){
  const r=RULES[plan.frequency]||RULES.MENSUAL;
  const fixedEnd= ['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(norm(plan.frequency));
  return r.months.map((m,i)=>{
    const requested=Number(plan.dueDay||30);
    const day=fixedEnd?30:Math.min(requested,new Date(year,m,0).getDate());
    return {month:m,label:r.labels[i],year,due:`${year}-${String(m).padStart(2,'0')}-${String(Math.min(day,new Date(year,m,0).getDate())).padStart(2,'0')}`};
  });
}
function canonicalSpecialPeriod(v){
  const x=norm(v);
  const aliases={
    'T1':'T1','1ER TRIMESTRE':'T1','1ER TRIMESTRAL':'T1','PRIMER TRIMESTRE':'T1',
    'T2':'T2','2DO TRIMESTRE':'T2','2DO TRIMESTRAL':'T2','SEGUNDO TRIMESTRE':'T2',
    'T3':'T3','3ER TRIMESTRE':'T3','3ER TRIMESTRAL':'T3','TERCER TRIMESTRE':'T3',
    'T4':'T4','4TO TRIMESTRE':'T4','4TO TRIMESTRAL':'T4','CUARTO TRIMESTRE':'T4',
    'S1':'S1','1ER SEMESTRE':'S1','1ER SEMESTRAL':'S1','PRIMER SEMESTRE':'S1',
    'S2':'S2','2DO SEMESTRE':'S2','2DO SEMESTRAL':'S2','SEGUNDO SEMESTRE':'S2',
    'ANUAL':'ANUAL','1ER ANUAL':'ANUAL'
  };
  return aliases[x]||null;
}
function canonicalPlanLabel(label){
  const special=canonicalSpecialPeriod(label);
  return special||norm(label);
}
function declaredPeriod(sample){
  const mf=norm(sample?.monthFrequency);
  if(!mf)return null;
  const monthPattern='ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE';
  let m=mf.match(new RegExp(`^(${monthPattern})(?:\\s+20\\d{2})?$`));
  if(m)return {base:m[1],take:1,raw:mf};
  m=mf.match(new RegExp(`^(${monthPattern})\\s*-\\s*(2DA|3RA|4TA|[5-9]TA|\\d+TA)\\s+TOMA(?:\\s+20\\d{2})?$`));
  if(m)return {base:m[1],take:Number((m[2].match(/\\d+/)||['1'])[0]),raw:mf};

  // Períodos contractuales: acepta tanto los nombres visibles como los códigos históricos T1/S1.
  const noYear=mf.replace(/\s+20\d{2}$/,'');
  const specialTake=noYear.match(/^(.*?)\s*-\s*(2DA|3RA|4TA|[5-9]TA|\d+TA)\s+TOMA$/);
  if(specialTake){
    const base=canonicalSpecialPeriod(specialTake[1]);
    if(base)return {base,take:Number((specialTake[2].match(/\d+/)||['1'])[0]),raw:mf};
  }
  const base=canonicalSpecialPeriod(noYear);
  if(base)return {base,take:1,raw:mf};
  if(/^(B[1-6]|C[1-3])$/.test(noYear))return {base:noYear,take:1,raw:mf};
  return null; // Todo otro texto es ESPORÁDICO: MUESTRA ADICIONAL, PRUEBA..., etc.
}
function planSampleMatch(sample,client,plan,p){
  if(Number(sample.year)!==Number(p.year))return false;

  // Compatibilidad histórica: algunos registros pueden conservar IDs de catálogo antiguos
  // después de correcciones/unificaciones. El nombre normalizado es una segunda llave válida.
  const sameClientId=sample.clientCatalogId&&client.id&&String(sample.clientCatalogId)===String(client.id);
  const sameClientName=norm(sample.clientId)===norm(client.name);
  if(!sameClientId&&!sameClientName)return false;

  if(plan.branch&&norm(sample.branch)!==norm(plan.branch))return false;

  if(plan.matrixCatalogId){
    const sameMatrixId=sample.matrixCatalogId&&String(sample.matrixCatalogId)===String(plan.matrixCatalogId);
    const sameMatrixName=plan.matrixName&&norm(sample.matrixId)===norm(plan.matrixName);
    if(!sameMatrixId&&!sameMatrixName)return false;
  }else if(plan.matrixName&&norm(plan.matrixName)!=='TODAS'&&norm(plan.matrixName)!=='TODAS LAS MATRICES'){
    if(norm(sample.matrixId)!==norm(plan.matrixName))return false;
  }else if(plan.groupId&&norm(plan.groupId)!=='TODOS'){
    if(norm(sample.groupId)!==norm(plan.groupId))return false;
  }

  const dp=declaredPeriod(sample);
  if(!dp)return false;
  const target=canonicalPlanLabel(p.label);
  const targetMonth=norm(MONTHS[p.month-1]);
  const frequency=norm(plan.frequency);

  // MENSUAL: prevalece SIEMPRE el período declarado. La fecha puede ser posterior
  // cuando un monitoreo atrasado se ejecuta en otro mes (ej. fecha agosto, período JUNIO).
  if(frequency==='MENSUAL')return dp.base===targetMonth;

  // BIMESTRAL/CUATRIMESTRAL mantienen la misma lógica contractual por etiqueta.
  if(frequency==='BIMESTRAL'||frequency==='CUATRIMESTRAL')return dp.base===target;

  // TRIMESTRAL/SEMESTRAL/ANUAL: la etiqueta identifica la obligación y la fecha real
  // valida que la primera toma pertenezca al intervalo calendario correspondiente.
  // Las retomas (2DA, 3RA, ...) pueden ocurrir después del cierre del período y siguen
  // perteneciendo a la misma obligación declarada.
  if(!['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(frequency))return dp.base===target || dp.base===targetMonth;
  if(dp.base!==target)return false;
  if(dp.take>1)return true;

  const rawDate=String(sample.samplingDate||sample.sampleDate||'').trim();
  if(!rawDate)return true; // compatibilidad histórica si no existe fecha
  const d=new Date(rawDate+'T12:00:00');
  if(Number.isNaN(d.getTime()))return true;
  if(d.getFullYear()!==Number(p.year))return false;
  const m=d.getMonth()+1;
  if(frequency==='ANUAL')return true;
  if(frequency==='SEMESTRAL'){
    const expected=target==='S1'?[1,6]:[7,12];
    return m>=expected[0]&&m<=expected[1];
  }
  if(frequency==='TRIMESTRAL'){
    const q={T1:[1,3],T2:[4,6],T3:[7,9],T4:[10,12]}[target];
    return !!q&&m>=q[0]&&m<=q[1];
  }
  return true;
}
function decisionOf(sample){return norm(sample?.workflow?.decisionStatus||sample?.decisionStatus||sample?.status||'');}
function retakeNumber(sample,p){
  const dp=declaredPeriod(sample);
  return dp?.take||1;
}
function ordinalTake(n){if(n<=1)return '';if(n===2)return '2DA TOMA';if(n===3)return '3RA TOMA';if(n===4)return '4TA TOMA';return `${n}TA TOMA`;}
function periodSamples(client,plan,p){
  return sampleCache.filter(s=>planSampleMatch(s,client,plan,p)).sort((a,b)=>{
    const na=retakeNumber(a,p),nb=retakeNumber(b,p);
    if(na!==nb)return na-nb;
    const da=String(a.samplingDate||''),db=String(b.samplingDate||'');
    if(da!==db)return da.localeCompare(db);
    return Number(a.code||0)-Number(b.code||0);
  });
}
function isAnalysisPending(sample){
  const stage=norm(sample?.workflow?.workflowStage||'');
  const decision=decisionOf(sample);
  const record=norm(sample?.workflow?.recordStatus||sample?.status||'');
  return stage==='ANALYSIS_REGISTRATION'||decision==='PENDING_ANALYSIS'||record==='PLANIFICADA';
}
function chainFor(client,plan,p){
  const samples=periodSamples(client,plan,p);
  if(!samples.length)return {samples:[],closed:false,latest:null,nextTake:1,inAnalysis:false};
  let closed=false,latest=null;
  for(const s of samples){
    latest=s;
    if(decisionOf(s)==='CONTINUAR')closed=true;
    else if(decisionOf(s)==='DETENIDA')closed=false;
    else if(isAnalysisPending(s))closed=false;
  }
  const inAnalysis=!!latest&&isAnalysisPending(latest);
  const maxTake=Math.max(...samples.map(s=>retakeNumber(s,p)));
  return {samples,closed,latest,nextTake:(closed||inAnalysis)?null:maxTake+1,inAnalysis};
}
function fulfillment(client,plan,p){const chain=chainFor(client,plan,p);return chain.closed?chain.latest:null;}
function chainHtml(chain,p){
  return chain.samples.map((s,i)=>{
    const d=decisionOf(s),n=retakeNumber(s,p),code=esc(s.code||s.codeFull||'OK');
    const take=n>1?` <span class=\"retake-label\">${esc(ordinalTake(n))}</span>`:'';
    if(d==='DETENIDA')return `<span class=\"chain-stop\">🔴 ${code}${take}</span>`;
    if(d==='CONTINUAR')return `<span class=\"chain-ok\">✅ ${code}${take}</span>`;
    if(isAnalysisPending(s))return `<span class=\"chain-planned\">🟠 ${code}${take}</span>`;
    return `<span>${code}${take}</span>`;
  }).join('<span class=\"chain-arrow\"> → </span>');
}
function stateFor(client,plan,p){
  const chain=chainFor(client,plan,p);
  if(chain.samples.length){
    if(chain.closed)return {type:'done',text:`✅ ${chain.latest?.code||chain.latest?.codeFull||'OK'}`,sample:chain.latest,chain};
    if(chain.inAnalysis)return {type:'planned',text:`🟠 ${chain.latest?.code||chain.latest?.codeFull||''}`,sample:chain.latest,chain};
    const nextLabel=`${String(p.label||MONTHS[p.month-1]).toUpperCase()}-${ordinalTake(chain.nextTake)}`;
    return {type:'stopped',text:`🔴 ${chain.latest?.code||chain.latest?.codeFull||''} · ⚠ Planificar ${nextLabel}`,sample:chain.latest,chain,nextLabel};
  }
  const today=new Date();const due=new Date(`${p.due}T23:59:59`);return due<today?{type:'late',text:'🔴 Vencido',chain}:{type:'pending',text:'⬜ Pendiente',chain};
}
async function reload(){clientCache=await sampleRegistryService.clients();sampleCache=await sampleRegistryService.all();matrixCache=await sampleRegistryService.matrices();}

function installStyles(){if($('planningAddonStyle'))return;const st=document.createElement('style');st.id='planningAddonStyle';st.textContent=`
.plan-addon{border:1px solid #cfe0d6;border-radius:14px;padding:14px;margin-top:14px;background:#f8fbf9}.plan-addon h4{margin:0 0 6px;color:#173f2a}.plan-grid{display:grid;grid-template-columns:minmax(145px,1.4fr) minmax(145px,1.3fr) minmax(160px,1.4fr) minmax(145px,1.2fr) 100px auto;gap:7px;align-items:end}.plan-grid input,.plan-grid select{width:100%}.plan-list{margin-top:10px;display:grid;gap:6px}.plan-row{display:grid;grid-template-columns:minmax(145px,1.4fr) minmax(145px,1.3fr) minmax(160px,1.4fr) minmax(145px,1.2fr) 100px auto;gap:7px;align-items:center;padding:8px;border:1px solid #dbe7df;border-radius:10px;background:#fff}.plan-matrix-wrap{overflow:auto}.plan-matrix{border-collapse:collapse;width:max-content;min-width:100%}.plan-matrix th,.plan-matrix td{border:1px solid #dce6df;padding:7px 8px;white-space:nowrap;text-align:center}.plan-matrix th:first-child,.plan-matrix td:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1}.plan-cell-done{background:#edf8f0}.plan-cell-planned{background:#fff3df;box-shadow:inset 0 0 0 1px #e5a23a}.plan-cell-stopped{background:#ffe8e8;box-shadow:inset 0 0 0 2px #d33}.plan-cell-late{background:#fff0f0}.plan-cell-pending{background:#fffbea}.chain-stop{color:#9f1d1d;font-weight:800}.chain-planned{color:#a45b00;font-weight:800}.chain-ok{color:#086b37;font-weight:800}.chain-arrow{color:#75877b}.retake-label{font-size:10px;font-weight:800}.retake-alert{display:block;margin-top:5px;padding:4px 6px;border-radius:7px;background:#c92323;color:#fff;font-size:10px;font-weight:800}.plan-na{color:#a5afa8}.plan-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.plan-toolbar label{font-size:12px;font-weight:700;color:#31513f}.plan-toolbar select{min-width:130px}.plan-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.plan-pill{padding:6px 10px;border-radius:999px;background:#eef5f0;font-weight:700;font-size:12px}.period-hint{font-size:12px;color:#476555;margin-top:4px}`;document.head.appendChild(st)}

function ensureCatalogAddon(){const form=document.querySelector('#clientsModal .catalog-form');if(!form||$('monitoringPlanCatalogAddon'))return;const box=document.createElement('div');box.id='monitoringPlanCatalogAddon';box.className='plan-addon';box.innerHTML=`<h4>🗓 Plan de monitoreo</h4><div class="muted">Configure la frecuencia por <b>sucursal y matriz</b>. Así AGUA puede ser mensual mientras SUELO queda sin plan o con otra frecuencia. Para un solo plan puede llenar los campos y pulsar directamente <b>Guardar plan de monitoreo</b>. Use <b>＋ Agregar</b> solo si necesita otro servicio, matriz o frecuencia.</div><div class="plan-grid" style="margin-top:10px"><div><label>Sucursal</label><select id="paBranch"></select></div><div><label>Matriz / Grupo</label><select id="paMatrix"></select></div><div><label>Servicio</label><input id="paService" placeholder="Ej. Monitoreo"></div><div><label>Frecuencia</label><select id="paFrequency"><option>MENSUAL</option><option>BIMESTRAL</option><option>TRIMESTRAL</option><option>CUATRIMESTRAL</option><option>SEMESTRAL</option><option>ANUAL</option></select></div><div><label>Día límite</label><input id="paDueDay" type="number" min="1" max="31" value="30"></div><button class="btn secondary small" type="button" id="paAdd">＋ Agregar</button></div><div id="paPlanList" class="plan-list"></div><div class="actions"><button class="btn primary small" type="button" id="paSavePlans">Guardar plan de monitoreo</button></div>`;
  const actions=form.querySelector('.actions');form.insertBefore(box,actions);
  $('paAdd').addEventListener('click',addPlanDraft);$('paSavePlans').addEventListener('click',savePlans);
  refreshCatalogPlanEditor();
}
function selectedClient(){return clientCache.find(c=>c.id===$('catalogClientId')?.value)||null;}
function branchOptions(){const c=selectedClient();const fromClient=c?.branches||[];const visible=[...document.querySelectorAll('.catalogBranchInput')].map(x=>x.value.trim()).filter(Boolean);return [...new Set([...fromClient,...visible])];}
function matrixOptions(selectedId='',selectedName=''){const opts=['<option value="">TODAS LAS MATRICES</option>'];for(const m of matrixCache){const sel=(selectedId&&String(m.id)===String(selectedId))||(!selectedId&&selectedName&&norm(m.name)===norm(selectedName));opts.push(`<option value="${esc(m.id)}" data-name="${esc(m.name)}" data-group="${esc(m.groupId||'')}" ${sel?'selected':''}>${esc(m.label||m.name)} · ${esc(m.groupId||'')}</option>`)}return opts.join('');}
function matrixFromSelect(sel){const id=sel?.value||'';const m=matrixCache.find(x=>String(x.id)===String(id));return m?{matrixCatalogId:m.id,matrixName:m.name,groupId:m.groupId}:{matrixCatalogId:'',matrixName:'',groupId:''};}
function refreshCatalogPlanEditor(){if(!$('paBranch'))return;const c=selectedClient();$('paBranch').innerHTML=branchOptions().map(b=>`<option>${esc(b)}</option>`).join('')||'<option value="">MATRIZ / GENERAL</option>';if($('paMatrix'))$('paMatrix').innerHTML=matrixOptions();renderPlanList(c?.monitoringPlans||[]);}
function currentDraftPlans(){return [...document.querySelectorAll('[data-plan-row]')].map(r=>{const mx=matrixFromSelect(r.querySelector('[data-p=matrix]'));return {id:r.dataset.planRow,branch:r.querySelector('[data-p=branch]').value,...mx,service:r.querySelector('[data-p=service]').value,frequency:r.querySelector('[data-p=frequency]').value,dueDay:Number(r.querySelector('[data-p=dueDay]').value||30),active:true}});}
function addPlanDraft(){const plans=currentDraftPlans();plans.push({id:uid(),branch:$('paBranch').value,...matrixFromSelect($('paMatrix')),service:$('paService').value||'MONITOREO',frequency:$('paFrequency').value,dueDay:Number($('paDueDay').value||30),active:true});renderPlanList(plans)}
function renderPlanList(plans){const el=$('paPlanList');if(!el)return;el.innerHTML=plans.length?plans.map(p=>`<div class="plan-row" data-plan-row="${esc(p.id||uid())}"><select data-p="branch">${branchOptions().map(b=>`<option ${norm(b)===norm(p.branch)?'selected':''}>${esc(b)}</option>`).join('')}</select><select data-p="matrix">${matrixOptions(p.matrixCatalogId,p.matrixName)}</select><input data-p="service" value="${esc(p.service||'MONITOREO')}"><select data-p="frequency">${Object.keys(RULES).map(f=>`<option ${f===p.frequency?'selected':''}>${f}</option>`).join('')}</select><input data-p="dueDay" type="number" min="1" max="31" value="${Number(p.dueDay||30)}"><button class="btn danger small" type="button" data-remove-plan>×</button></div>`).join(''):'<div class="muted">Todavía no hay frecuencias configuradas para este cliente.</div>';el.querySelectorAll('[data-remove-plan]').forEach(b=>b.onclick=()=>{b.closest('[data-plan-row]').remove()})}
function inlinePlanDraft(){return {id:uid(),branch:$('paBranch')?.value||'',...matrixFromSelect($('paMatrix')),service:($('paService')?.value||'MONITOREO').trim()||'MONITOREO',frequency:$('paFrequency')?.value||'MENSUAL',dueDay:Number($('paDueDay')?.value||30),active:true};}
function planKey(p){return [norm(p.branch),String(p.matrixCatalogId||norm(p.matrixName)||norm(p.groupId)||'TODAS'),norm(p.service||'MONITOREO'),norm(p.frequency||'MENSUAL'),Number(p.dueDay||30)].join('|');}
function allVisiblePlans(){const rows=currentDraftPlans();const inline=inlinePlanDraft();const candidates=[inline,...rows].filter(p=>String(p.branch||'').trim()||String(p.service||'').trim());const seen=new Set();const plans=[];for(const p of candidates){const key=planKey(p);if(seen.has(key))continue;seen.add(key);plans.push(p)}return plans;}
async function savePlans(){const c=selectedClient();if(!c){alert('Primero guarde o seleccione un cliente existente.');return}const plans=allVisiblePlans();if(!plans.length){alert('Agregue al menos una sucursal/frecuencia antes de guardar.');return}await repositories.clients.update(c.id,{monitoringPlans:plans},{userId:'LOCAL_USER'});await reload();const saved=clientCache.find(x=>x.id===c.id);const count=(saved?.monitoringPlans||[]).length;refreshCatalogPlanEditor();refreshPeriodAssist();renderPlanner();if(count!==plans.length){alert(`El sistema intentó guardar ${plans.length} plan(es), pero solo confirmó ${count}. No continúe y revise la sincronización.`);return}alert(`Plan de monitoreo guardado correctamente: ${count} configuración(es). Todas las filas visibles quedaron registradas.`);}

function ensurePeriodAssist(){const input=$('monthFrequency');if(!input||$('planningPeriodList'))return;const dl=document.createElement('datalist');dl.id='planningPeriodList';document.body.appendChild(dl);input.setAttribute('list','planningPeriodList');const label=input.closest('.f')?.querySelector('label');if(label)label.textContent='Período / frecuencia';const hint=document.createElement('div');hint.id='planningPeriodHint';hint.className='period-hint';input.insertAdjacentElement('afterend',hint);['client','branch','matrix','samplingDate','year'].forEach(id=>$(id)?.addEventListener(id==='client'?'input':'change',()=>setTimeout(refreshPeriodAssist,50)));document.querySelector('#sampleForm')?.addEventListener('submit',()=>setTimeout(async()=>{await reload();refreshPeriodAssist();renderPlanner()},700));refreshPeriodAssist();}
function matchingPlansForForm(){const clientName=norm($('client')?.value),branch=norm($('branch')?.value),matrixId=$('matrix')?.value||'';const matrix=matrixCache.find(m=>String(m.id)===String(matrixId));const c=clientCache.find(x=>norm(x.name)===clientName);if(!c)return [];return (c.monitoringPlans||[]).filter(p=>{if(p.active===false)return false;if(p.branch&&norm(p.branch)!==branch)return false;if(p.matrixCatalogId&&String(p.matrixCatalogId)!==String(matrixId))return false;if(!p.matrixCatalogId&&p.matrixName&&matrix&&norm(p.matrixName)!==norm(matrix.name))return false;if(!p.matrixCatalogId&&!p.matrixName&&p.groupId&&matrix&&norm(p.groupId)!==norm(matrix.groupId))return false;return true}).map(p=>({client:c,plan:p}));}
function refreshPeriodAssist(){const dl=$('planningPeriodList'),hint=$('planningPeriodHint'),input=$('monthFrequency');if(!dl)return;const year=Number($('year')?.value||new Date().getFullYear());const matches=matchingPlansForForm();const options=[],urgent=[];for(const {client,plan} of matches){for(const p of periods(plan,year)){const st=stateFor(client,plan,p);if(st.type==='done'||st.type==='planned')continue;if(st.type==='stopped'){const v=String(st.nextLabel||'').toUpperCase();options.push(v);urgent.push(v)}else options.push(String(p.label||'').toUpperCase())}}const unique=[...new Set(options)];dl.innerHTML=unique.map(v=>`<option value="${esc(v)}"></option>`).join('');if(input&&urgent.length===1&&!String(input.value||'').trim())input.value=urgent[0];if(hint){if(urgent.length)hint.textContent=`🔴 ${urgent.length} retoma(s) requerida(s): ${[...new Set(urgent)].join(', ')}. Se mantiene abierto hasta que una retoma cierre el período.`;else hint.textContent=matches.length?`${unique.length} período(s) pendiente(s) según el plan. Los períodos ya cumplidos no se sugieren.`:'Sin plan de monitoreo configurado para esta sucursal y matriz.';}}

function ensurePlannerControls(){if(!$('planningYear'))return;const now=new Date();$('planningYear').value=now.getFullYear();$('planningMonth').value=now.getMonth()+1;$('planningYear').addEventListener('change',renderPlanner);$('planningMonth').addEventListener('change',renderPlanner);$('planningRefresh').addEventListener('click',async()=>{await reload();renderPlanner()});}
function sampleDisplayMonth(sample){
  const raw=String(sample?.samplingDate||sample?.sampleDate||'').trim();
  if(!raw)return null;
  const d=new Date(raw+'T12:00:00');
  return Number.isNaN(d.getTime())?null:d.getMonth()+1;
}
function displayMonthForPeriod(plan,pp,st){
  const frequency=norm(plan.frequency);
  // MENSUAL: el texto del período manda siempre, incluso cuando la toma real fue tardía.
  if(frequency==='MENSUAL')return pp.month;
  // TRIMESTRAL / SEMESTRAL / ANUAL: si ya existe una toma, el código se visualiza
  // en el mes REAL de la primera toma. La fecha límite solo controla pendiente/vencido.
  if(['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(frequency)&&st?.chain?.samples?.length){
    const first=st.chain.samples.find(s=>retakeNumber(s,pp)===1)||st.chain.samples[0];
    return sampleDisplayMonth(first)||pp.month;
  }
  return pp.month;
}
function renderPlanner(){if(!$('planningMatrix'))return;const year=Number($('planningYear').value||new Date().getFullYear());const month=Number($('planningMonth').value||1);const rows=[];for(const c of clientCache){for(const p of (c.monitoringPlans||[]).filter(x=>x.active!==false))rows.push({client:c,plan:p});}
  let done=0,planned=0,pending=0,late=0,stopped=0;const body=rows.map(({client,plan})=>{
    const ps=periods(plan,year);
    const periodStates=ps.map(pp=>{const st=stateFor(client,plan,pp);if(st.type==='done')done++;else if(st.type==='planned')planned++;else if(st.type==='late')late++;else if(st.type==='stopped')stopped++;else pending++;return {pp,st,displayMonth:displayMonthForPeriod(plan,pp,st)}});
    const cells=MONTHS.map((m,idx)=>{
      const entries=periodStates.filter(x=>x.displayMonth===idx+1);
      if(!entries.length)return '<td class="plan-na">—</td>';
      const severity={late:5,stopped:4,planned:3,pending:2,done:1};
      const cellType=entries.slice().sort((a,b)=>(severity[b.st.type]||0)-(severity[a.st.type]||0))[0]?.st.type||'pending';
      const content=entries.map(({pp,st})=>{const detail=st.chain?.samples?.length?chainHtml(st.chain,pp):esc(st.text);const alert=st.type==='stopped'?`<span class="retake-alert">⚠ PLANIFICAR ${esc(st.nextLabel)}</span>`:'';return `<div title="${esc(pp.label)} · límite ${esc(pp.due)}">${detail}${alert}<div class="muted">${esc(pp.label)}</div></div>`}).join('<hr style="border:0;border-top:1px solid #dce6df;margin:5px 0">');
      return `<td class="plan-cell-${cellType}">${content}</td>`;
    }).join('');
    return `<tr><td><b>${esc(client.name)}</b><div class="muted">${esc(plan.branch||'GENERAL')} · ${esc(plan.matrixName||plan.groupId||'TODAS LAS MATRICES')} · ${esc(plan.frequency)} · ${esc(plan.service||'MONITOREO')}</div></td>${cells}</tr>`
  }).join('');
  $('planningMatrix').innerHTML=rows.length?`<div class="plan-matrix-wrap"><table class="plan-matrix"><thead><tr><th>Cliente / sucursal / matriz / frecuencia</th>${MONTHS.map(m=>`<th>${m.slice(0,3)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`:'<div class="empty">No hay planes configurados. Configure una frecuencia desde Catálogos → Clientes y sucursales.</div>';
  $('planningSummary').innerHTML=`<span class="plan-pill">✅ ${done} cumplidos</span><span class="plan-pill">🟠 ${planned} planificados / en análisis</span><span class="plan-pill">⬜ ${pending} pendientes</span><span class="plan-pill">🔴 ${stopped} detenidos / requieren retoma</span><span class="plan-pill">⛔ ${late} vencidos</span>`;
  const due=[];for(const {client,plan} of rows){for(const pp of periods(plan,year).filter(x=>x.month===month)){const st=stateFor(client,plan,pp);due.push({client,plan,pp,st})}}
  $('planningMonthTable').innerHTML=due.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Sucursal</th><th>Matriz</th><th>Frecuencia</th><th>Período</th><th>Límite</th><th>Estado / trazabilidad</th></tr></thead><tbody>${due.map(x=>`<tr class="${x.st.type==='stopped'?'plan-cell-stopped':''}"><td><b>${esc(x.client.name)}</b></td><td>${esc(x.plan.branch||'GENERAL')}</td><td>${esc(x.plan.matrixName||x.plan.groupId||'TODAS')}</td><td>${esc(x.plan.frequency)}</td><td><b>${esc(x.pp.label)}</b></td><td>${esc(x.pp.due)}</td><td>${x.st.chain?.samples?.length?chainHtml(x.st.chain,x.pp):esc(x.st.text)}${x.st.type==='stopped'?`<span class="retake-alert">⚠ PLANIFICAR ${esc(x.st.nextLabel)}</span>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay obligaciones cuyo período cierre en este mes.</div>';
}

async function init(){try{installStyles();await reload();ensureCatalogAddon();ensurePeriodAssist();ensurePlannerControls();renderPlanner();document.addEventListener('click',e=>{if(e.target.closest('[data-client-catalog]')||e.target.id==='newClientCatalog'||e.target.id==='openClients'||e.target.id==='manageClients'||e.target.id==='quickBranch')setTimeout(refreshCatalogPlanEditor,80);if(e.target.closest('.tab[data-view="intelligentPlanning"]'))setTimeout(async()=>{await reload();renderPlanner()},50)});const obs=new MutationObserver(()=>{ensureCatalogAddon();ensurePeriodAssist()});obs.observe(document.body,{childList:true,subtree:true});}catch(e){console.error('[Planning Addon]',e)}}
window.addEventListener('DOMContentLoaded',init,{once:true});
