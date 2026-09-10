import {repositories} from '../data/repositories.js';
import {sampleRegistryService} from './sample-registry.js';

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=v=>String(v??'').trim().toUpperCase().replace(/\s+/g,' ');
const uid=()=>`PLAN-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const RULES={
  MENSUAL:{months:[1,2,3,4,5,6,7,8,9,10,11,12],labels:MONTHS},
  BIMESTRAL:{months:[2,4,6,8,10,12],labels:['1ER BIMESTRE','2DO BIMESTRE','3ER BIMESTRE','4TO BIMESTRE','5TO BIMESTRE','6TO BIMESTRE']},
  TRIMESTRAL:{months:[3,6,9,12],labels:['1ER TRIMESTRE','2DO TRIMESTRE','3ER TRIMESTRE','4TO TRIMESTRE']},
  CUATRIMESTRAL:{months:[4,8,12],labels:['1ER CUATRIMESTRE','2DO CUATRIMESTRE','3ER CUATRIMESTRE']},
  SEMESTRAL:{months:[6,12],labels:['1ER SEMESTRE','2DO SEMESTRE']},
  ANUAL:{months:[12],labels:['ANUAL']}
};

let clientCache=[], sampleCache=[], matrixCache=[];
const expandedPlannerClients=new Set();
const ROLLING_INTERVALS={TRIMESTRAL:3,SEMESTRAL:6};
const ROLLING_OFFSETS={TRIMESTRAL:3,SEMESTRAL:5};
function samplePlanIdentityMatch(sample,client,plan){
  const sameClientId=sample.clientCatalogId&&client?.id&&String(sample.clientCatalogId)===String(client.id);
  const sameClientName=norm(sample.clientId)===norm(client?.name);
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
  return true;
}
function completedSampleForLabel(client,plan,label,year){
  if(!client)return null;
  const target=canonicalPlanLabel(label);
  const rows=sampleCache.filter(sample=>{
    if(Number(sample.year)!==Number(year)||!samplePlanIdentityMatch(sample,client,plan))return false;
    const dp=declaredPeriod(sample);
    return !!dp&&dp.base===target&&decisionOf(sample)==='CONTINUAR';
  }).sort((a,b)=>String(a.samplingDate||a.sampleDate||'').localeCompare(String(b.samplingDate||b.sampleDate||''))||Number(a.code||0)-Number(b.code||0));
  return rows.at(-1)||null;
}
function periods(plan,year,client=null){
  const frequency=norm(plan.frequency||'MENSUAL');
  const r=RULES[frequency]||RULES.MENSUAL;
  const fixedEnd=['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(frequency);
  const months=[...r.months];
  const span=ROLLING_INTERVALS[frequency]||0;

  // Frecuencias periódicas: el desplazamiento depende de la regla de negocio.
  // TRIMESTRAL = cada 3 meses reales (marzo→junio→septiembre→diciembre).
  // SEMESTRAL conserva el conteo inclusivo solicitado por Calidad (mayo→octubre).
  if(client&&span>1){
    let rolling=false;
    for(let i=1;i<months.length;i++){
      const previous=completedSampleForLabel(client,plan,r.labels[i-1],year);
      const actualMonth=sampleDisplayMonth(previous);
      if(actualMonth){
        const shifted=actualMonth+(ROLLING_OFFSETS[frequency]??(span-1));
        if(shifted<=12){months[i]=shifted;rolling=true;}
      }else if(rolling){
        const shifted=months[i-1]+(ROLLING_OFFSETS[frequency]??(span-1));
        if(shifted<=12)months[i]=shifted;
      }
    }
  }

  return months.map((m,i)=>{
    const requested=Number(plan.dueDay||30);
    const lastDay=new Date(year,m,0).getDate();
    // Trimestral, semestral y anual vencen al CIERRE REAL del mes del período.
    // Ej.: 3ER TRIMESTRE = 30/09; 4TO TRIMESTRE = 31/12.
    // Para frecuencias mensuales/bimestrales/cuatrimestrales se conserva el día límite configurado.
    const day=fixedEnd?lastDay:Math.min(requested,lastDay);
    return {month:m,label:r.labels[i],year,due:`${year}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`};
  });
}
function canonicalSpecialPeriod(v){
  const x=norm(v);
  const aliases={
    'B1':'B1','1ER BIMESTRE':'B1','1ER BIMESTRAL':'B1','PRIMER BIMESTRE':'B1',
    'B2':'B2','2DO BIMESTRE':'B2','2DO BIMESTRAL':'B2','SEGUNDO BIMESTRE':'B2',
    'B3':'B3','3ER BIMESTRE':'B3','3ER BIMESTRAL':'B3','TERCER BIMESTRE':'B3',
    'B4':'B4','4TO BIMESTRE':'B4','4TO BIMESTRAL':'B4','CUARTO BIMESTRE':'B4',
    'B5':'B5','5TO BIMESTRE':'B5','5TO BIMESTRAL':'B5','QUINTO BIMESTRE':'B5',
    'B6':'B6','6TO BIMESTRE':'B6','6TO BIMESTRAL':'B6','SEXTO BIMESTRE':'B6',
    'T1':'T1','1ER TRIMESTRE':'T1','1ER TRIMESTRAL':'T1','PRIMER TRIMESTRE':'T1',
    'T2':'T2','2DO TRIMESTRE':'T2','2DO TRIMESTRAL':'T2','SEGUNDO TRIMESTRE':'T2',
    'T3':'T3','3ER TRIMESTRE':'T3','3ER TRIMESTRAL':'T3','TERCER TRIMESTRE':'T3',
    'T4':'T4','4TO TRIMESTRE':'T4','4TO TRIMESTRAL':'T4','CUARTO TRIMESTRE':'T4',
    'S1':'S1','1ER SEMESTRE':'S1','1ER SEMESTRAL':'S1','PRIMER SEMESTRE':'S1',
    'S2':'S2','2DO SEMESTRE':'S2','2DO SEMESTRAL':'S2','SEGUNDO SEMESTRE':'S2',
    'C1':'C1','1ER CUATRIMESTRE':'C1','1ER CUATRIMESTRAL':'C1','PRIMER CUATRIMESTRE':'C1',
    'C2':'C2','2DO CUATRIMESTRE':'C2','2DO CUATRIMESTRAL':'C2','SEGUNDO CUATRIMESTRE':'C2',
    'C3':'C3','3ER CUATRIMESTRE':'C3','3ER CUATRIMESTRAL':'C3','TERCER CUATRIMESTRE':'C3',
    'ANUAL':'ANUAL','1ER ANUAL':'ANUAL'
  };
  return aliases[x]||null;
}
function canonicalPlanLabel(label){
  const special=canonicalSpecialPeriod(label);
  return special||norm(label);
}

function periodScheduleKey(p){return `${Number(p.year)}|${canonicalPlanLabel(p.label)}`;}
function stateScheduleKey(p,chain){
  if(chain?.samples?.length&&!chain.closed&&!chain.inAnalysis&&chain.nextTake>1)return `${periodScheduleKey(p)}|TAKE-${chain.nextTake}`;
  return periodScheduleKey(p);
}
function plannedDateFor(plan,p,chain=null){
  const dates=plan?.scheduledDates||{};
  return String(dates[stateScheduleKey(p,chain)]||'').slice(0,10);
}
function humanDate(v){
  if(!v)return '—';
  const d=new Date(`${String(v).slice(0,10)}T12:00:00`);
  return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});
}
function dayDiff(from,to){
  const a=new Date(`${String(from).slice(0,10)}T12:00:00`),b=new Date(`${String(to).slice(0,10)}T12:00:00`);
  if(Number.isNaN(a.getTime())||Number.isNaN(b.getTime()))return null;
  return Math.round((b-a)/86400000);
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

  // Compatibilidad histórica: ID o nombre normalizado siguen siendo llaves válidas.
  if(!samplePlanIdentityMatch(sample,client,plan))return false;

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

  // TRIMESTRAL / SEMESTRAL / ANUAL: el período declarado identifica la obligación.
  // La fecha REAL no invalida el registro: sirve para ubicarlo en la matriz y, en los
  // ciclos trimestral/semestral, recalcular cuándo corresponde el siguiente monitoreo.
  if(!['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(frequency))return dp.base===target || dp.base===targetMonth;
  return dp.base===target;
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
  const scheduledDate=plannedDateFor(plan,p,chain);
  if(chain.samples.length){
    if(chain.closed)return {type:'done',text:`✅ ${chain.latest?.code||chain.latest?.codeFull||'OK'}`,sample:chain.latest,chain,scheduledDate:''};
    if(chain.inAnalysis)return {type:'planned',text:`🟠 ${chain.latest?.code||chain.latest?.codeFull||''}`,sample:chain.latest,chain,scheduledDate};
    const nextLabel=`${String(p.label||MONTHS[p.month-1]).toUpperCase()}-${ordinalTake(chain.nextTake)}`;
    return {type:'stopped',text:`🔴 ${chain.latest?.code||chain.latest?.codeFull||''} · ⚠ Planificar ${nextLabel}`,sample:chain.latest,chain,nextLabel,scheduledDate};
  }
  if(scheduledDate)return {type:'planned',text:`🟠 Planificado ${humanDate(scheduledDate)}`,chain,scheduledDate,manualSchedule:true};
  // Comparación por fecha LOCAL pura (YYYY-MM-DD), sin hora ni UTC.
  // Así un trimestre de septiembre no puede aparecer vencido antes del 30/09.
  const now=new Date();
  const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return today>String(p.due).slice(0,10)?{type:'late',text:'🔴 Vencido',chain,scheduledDate:''}:{type:'pending',text:'⬜ Pendiente',chain,scheduledDate:''};
}
async function reload(){clientCache=await sampleRegistryService.clients();sampleCache=await sampleRegistryService.all();matrixCache=await sampleRegistryService.matrices();}

function installStyles(){if($('planningAddonStyle'))return;const st=document.createElement('style');st.id='planningAddonStyle';st.textContent=`
.plan-addon{border:1px solid #cfe0d6;border-radius:14px;padding:14px;margin-top:14px;background:#f8fbf9}.plan-addon h4{margin:0 0 6px;color:#173f2a}.plan-grid{display:grid;grid-template-columns:minmax(145px,1.4fr) minmax(145px,1.3fr) minmax(160px,1.4fr) minmax(145px,1.2fr) 100px auto;gap:7px;align-items:end}.plan-grid input,.plan-grid select{width:100%}.plan-list{margin-top:10px;display:grid;gap:6px}.plan-row{display:grid;grid-template-columns:minmax(145px,1.4fr) minmax(145px,1.3fr) minmax(160px,1.4fr) minmax(145px,1.2fr) 100px auto;gap:7px;align-items:center;padding:8px;border:1px solid #dbe7df;border-radius:10px;background:#fff}.plan-matrix-wrap{overflow:auto}.plan-matrix{border-collapse:collapse;width:max-content;min-width:100%}.plan-matrix th,.plan-matrix td{border:1px solid #dce6df;padding:7px 8px;white-space:nowrap;text-align:center}.plan-matrix th:first-child,.plan-matrix td:first-child{text-align:left;position:sticky;left:0;background:#fff;z-index:1}.plan-cell-done{background:#edf8f0}.plan-cell-planned{background:#fff3df;box-shadow:inset 0 0 0 1px #e5a23a}.plan-cell-stopped{background:#ffe8e8;box-shadow:inset 0 0 0 2px #d33}.plan-cell-late{background:#fff0f0}.plan-cell-pending{background:#fffbea}.chain-stop{color:#9f1d1d;font-weight:800}.chain-planned{color:#a45b00;font-weight:800}.chain-ok{color:#086b37;font-weight:800}.chain-arrow{color:#75877b}.retake-label{font-size:10px;font-weight:800}.retake-alert{display:block;margin-top:5px;padding:4px 6px;border-radius:7px;background:#c92323;color:#fff;font-size:10px;font-weight:800}.plan-na{color:#a5afa8}.plan-clickable{cursor:pointer;transition:filter .15s ease}.plan-clickable:hover{filter:brightness(.97);outline:2px solid #9bc8aa;outline-offset:-2px}.plan-date{display:block;margin-top:4px;font-size:10px;font-weight:850;color:#8a5b00}.plan-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.planner-bell{position:relative}.planner-bell-count{display:inline-flex;min-width:19px;height:19px;align-items:center;justify-content:center;border-radius:999px;background:#c92323;color:#fff;font-size:10px;margin-left:4px;padding:0 5px}.planning-alert-panel{position:fixed;right:18px;top:82px;width:min(520px,calc(100vw - 36px));max-height:72vh;overflow:auto;background:#fff;border:1px solid #cadbd0;border-radius:14px;box-shadow:0 20px 60px #0003;padding:14px;z-index:190;display:none}.planning-alert-panel.show{display:block}.planning-alert-row{border:1px solid #e0e9e3;border-radius:10px;padding:10px;margin-top:8px;background:#fafcfb}.planning-alert-row.critical{border-color:#efb0aa;background:#fff1f0}.planning-alert-row.warning{border-color:#efd99f;background:#fff8e7}.planning-alert-row.info{border-color:#cdddf8;background:#f3f7ff}.planning-alert-title{font-weight:900;font-size:12px}.planning-alert-meta{font-size:10px;color:#66766c;margin-top:3px}.planning-date-modal{position:fixed;inset:0;background:#06170e99;display:none;align-items:center;justify-content:center;z-index:210;padding:16px}.planning-date-modal.show{display:flex}.planning-date-box{width:min(460px,100%);background:#fff;border-radius:14px;padding:18px;box-shadow:0 20px 60px #0004}.planning-date-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}.plan-toolbar label{font-size:12px;font-weight:700;color:#31513f}.plan-toolbar select{min-width:130px}.plan-summary{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.plan-pill{padding:6px 10px;border-radius:999px;background:#eef5f0;font-weight:700;font-size:12px}.period-hint{font-size:12px;color:#476555;margin-top:4px}.planner-quick-banner{border:1px solid #efc36e;background:#fff8e8;border-radius:12px;padding:12px;margin:0 0 14px}.planner-quick-banner b{color:#7a4d00}.planner-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.plan-client-summary{cursor:pointer;background:#f7faf8;font-weight:800}.plan-client-summary:hover{background:#eef6f1}.plan-client-summary td:first-child{background:#f7faf8!important}.plan-client-toggle{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:7px;background:#e5efe8;margin-right:6px;font-size:12px}.plan-client-meta{display:block;font-size:10px;color:#607268;font-weight:600;margin-top:3px}.plan-client-agg{display:flex;gap:4px;align-items:center;justify-content:center;font-size:10px;font-weight:850}.plan-client-child td:first-child{padding-left:28px!important}.plan-client-child td:first-child:before{content:"↳";color:#8aa092;margin-right:6px}.plan-group-tip{font-size:11px;color:#5f7467;margin:5px 0 10px}`;document.head.appendChild(st)}

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
function currentDraftPlans(){const c=selectedClient();return [...document.querySelectorAll('[data-plan-row]')].map(r=>{const mx=matrixFromSelect(r.querySelector('[data-p=matrix]'));const previous=(c?.monitoringPlans||[]).find(p=>String(p.id)===String(r.dataset.planRow));return {id:r.dataset.planRow,branch:r.querySelector('[data-p=branch]').value,...mx,service:r.querySelector('[data-p=service]').value,frequency:r.querySelector('[data-p=frequency]').value,dueDay:Number(r.querySelector('[data-p=dueDay]').value||30),active:true,scheduledDates:{...(previous?.scheduledDates||{})}}});}
function addPlanDraft(){const plans=currentDraftPlans();plans.push({id:uid(),branch:$('paBranch').value,...matrixFromSelect($('paMatrix')),service:$('paService').value||'MONITOREO',frequency:$('paFrequency').value,dueDay:Number($('paDueDay').value||30),active:true});renderPlanList(plans)}
function renderPlanList(plans){const el=$('paPlanList');if(!el)return;el.innerHTML=plans.length?plans.map(p=>`<div class="plan-row" data-plan-row="${esc(p.id||uid())}"><select data-p="branch">${branchOptions().map(b=>`<option ${norm(b)===norm(p.branch)?'selected':''}>${esc(b)}</option>`).join('')}</select><select data-p="matrix">${matrixOptions(p.matrixCatalogId,p.matrixName)}</select><input data-p="service" value="${esc(p.service||'MONITOREO')}"><select data-p="frequency">${Object.keys(RULES).map(f=>`<option ${f===p.frequency?'selected':''}>${f}</option>`).join('')}</select><input data-p="dueDay" type="number" min="1" max="31" value="${Number(p.dueDay||30)}"><button class="btn danger small" type="button" data-remove-plan>×</button></div>`).join(''):'<div class="muted">Todavía no hay frecuencias configuradas para este cliente.</div>';el.querySelectorAll('[data-remove-plan]').forEach(b=>b.onclick=()=>{b.closest('[data-plan-row]').remove()})}
function inlinePlanDraft(){return {id:uid(),branch:$('paBranch')?.value||'',...matrixFromSelect($('paMatrix')),service:($('paService')?.value||'MONITOREO').trim()||'MONITOREO',frequency:$('paFrequency')?.value||'MENSUAL',dueDay:Number($('paDueDay')?.value||30),active:true};}
function planKey(p){return [norm(p.branch),String(p.matrixCatalogId||norm(p.matrixName)||norm(p.groupId)||'TODAS'),norm(p.service||'MONITOREO'),norm(p.frequency||'MENSUAL'),Number(p.dueDay||30)].join('|');}
function allVisiblePlans(){const rows=currentDraftPlans();const inline=inlinePlanDraft();/* Si ya existen filas, Guardar actualiza exclusivamente esas filas. La fila superior es solo el formulario para crear otra mediante + Agregar. Esto evita duplicar el primer plan al editar/guardar. */const candidates=(rows.length?rows:[inline]).filter(p=>String(p.branch||'').trim()||String(p.service||'').trim());const seen=new Set();const plans=[];for(const p of candidates){const key=planKey(p);if(seen.has(key))continue;seen.add(key);plans.push(p)}return plans;}
async function savePlans(){const c=selectedClient();if(!c){alert('Primero guarde o seleccione un cliente existente.');return}const plans=allVisiblePlans();if(!plans.length){alert('Agregue al menos una sucursal/frecuencia antes de guardar.');return}await repositories.clients.update(c.id,{monitoringPlans:plans},{userId:'LOCAL_USER'});await reload();const saved=clientCache.find(x=>x.id===c.id);const count=(saved?.monitoringPlans||[]).length;refreshCatalogPlanEditor();refreshPeriodAssist();renderPlanner();if(count!==plans.length){alert(`El sistema intentó guardar ${plans.length} plan(es), pero solo confirmó ${count}. No continúe y revise la sincronización.`);return}alert(`Plan de monitoreo guardado correctamente: ${count} configuración(es). Todas las filas visibles quedaron registradas.`);}


let quickPlanContext=null;
function localToday(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function resolvePlanMatrix(client,plan){
  if(plan.matrixCatalogId){const m=matrixCache.find(x=>String(x.id)===String(plan.matrixCatalogId));if(m)return m;}
  if(plan.matrixName&&norm(plan.matrixName)!=='TODAS'&&norm(plan.matrixName)!=='TODAS LAS MATRICES'){
    const m=matrixCache.find(x=>norm(x.name)===norm(plan.matrixName)||norm(x.label)===norm(plan.matrixName));if(m)return m;
  }
  const rows=sampleCache.filter(s=>{
    const same=(s.clientCatalogId&&client?.id&&String(s.clientCatalogId)===String(client.id))||norm(s.clientId)===norm(client?.name);if(!same)return false;
    if(plan.branch&&norm(s.branch)!==norm(plan.branch))return false;if(plan.groupId&&norm(plan.groupId)!=='TODOS'&&norm(s.groupId)!==norm(plan.groupId))return false;return !!s.matrixCatalogId;
  }).sort((a,b)=>String(b.samplingDate||'').localeCompare(String(a.samplingDate||''))||Number(b.code||0)-Number(a.code||0));
  const hist=matrixCache.find(m=>String(m.id)===String(rows[0]?.matrixCatalogId));if(hist)return hist;
  return matrixCache.find(m=>norm(m.name)==='RESIDUAL')||matrixCache[0]||null;
}
function quickPeriodLabel(pp,chain){const base=String(pp.label||MONTHS[pp.month-1]||'').toUpperCase();if(chain?.samples?.length&&!chain.closed&&!chain.inAnalysis&&chain.nextTake>1)return `${base}-${ordinalTake(chain.nextTake)}`;return base;}
function ensureQuickPlanBanner(){
  const form=$('sampleForm');if(!form||$('plannerQuickBanner'))return;const banner=document.createElement('div');banner.id='plannerQuickBanner';banner.className='planner-quick-banner';banner.style.display='none';banner.innerHTML=`<div><b>⚡ Registro desde Planificador</b></div><div class="muted" id="plannerQuickSummary">Datos cargados desde el plan.</div><div class="planner-quick-actions"><button class="btn primary" type="button" id="plannerQuickGenerate">💾 Guardar muestra</button><button class="btn secondary" type="button" id="plannerQuickCancel">Cancelar registro rápido</button></div><div class="muted" style="margin-top:6px"><b>Ingrese manualmente el Código</b>, verifique DQO / Tensoactivos y guarde. El sistema nunca genera el código automáticamente. Al guardar, la obligación pasa a 🟠 En análisis.</div>`;form.parentElement.insertBefore(banner,form);
  $('plannerQuickCancel').onclick=()=>{quickPlanContext=null;banner.style.display='none';$('saveBtn').style.display='inline-flex';$('code').readOnly=false;document.querySelector('.tab[data-view="intelligentPlanning"]')?.click();};
  $('plannerQuickGenerate').onclick=createQuickPlannedSample;
}
function showRegisterFromPlanner(clientId,planId,year,label){
  const {client,plan,idx}=findPlan(clientId,planId);if(!client||!plan)return;const pp=periods(plan,Number(year),client).find(x=>canonicalPlanLabel(x.label)===canonicalPlanLabel(label));if(!pp)return;const st=stateFor(client,plan,pp);if(st.type==='done'){alert('Este período ya está cumplido.');return;}const matrix=resolvePlanMatrix(client,plan);if(!matrix){alert('No existe una matriz disponible para registrar la muestra.');return;}
  quickPlanContext={clientId:client.id,planId:plan.id||`INDEX-${idx}`,planIndex:idx,year:Number(year),label:pp.label,period:pp,client,plan,matrix,chain:st.chain};ensureQuickPlanBanner();document.querySelector('.tab[data-view="register"]')?.click();
  setTimeout(()=>{$('editId').value='';$('year').value=String(year);$('client').value=client.name||'';$('client').dispatchEvent(new Event('input',{bubbles:true}));$('branch').value=plan.branch||'';$('matrix').value=matrix.id;$('matrix').dispatchEvent(new Event('change',{bubbles:true}));$('samplingDate').value=localToday();$('receivedDate').value='';$('monthFrequency').value=quickPeriodLabel(pp,st.chain);$('code').value='';$('observations').value=`Planificado desde Planificador inteligente · ${pp.label}`;$('requiresSpecialAnalysis').checked=false;$('plannerQuickBanner').style.display='block';$('plannerQuickSummary').innerHTML=`<b>${esc(client.name)}</b> · ${esc(plan.branch||'GENERAL')} · ${esc(matrix.label||matrix.name)} · ${esc(plan.frequency)} · <b>${esc(quickPeriodLabel(pp,st.chain))}</b> · fecha ${esc(humanDate(localToday()))}`;$('saveBtn').style.display='none';$('code').readOnly=false;$('code').placeholder='Ingrese el código manual';$('code').focus();},80);
}
async function createQuickPlannedSample(){
  if(!quickPlanContext)return;const btn=$('plannerQuickGenerate');const code=String($('code').value||'').trim();if(!code){alert('Ingrese el Código manual antes de guardar la muestra.');$('code').focus();return;}try{btn.disabled=true;btn.textContent='Guardando...';const special=!!$('requiresSpecialAnalysis').checked;const saved=await sampleRegistryService.register({code,year:$('year').value,client:$('client').value,branch:$('branch').value,matrixCatalogId:$('matrix').value,samplingDate:$('samplingDate').value,receivedDate:$('receivedDate').value,monthFrequency:$('monthFrequency').value,requiresDqo:special,requiresSurfactants:special,observations:$('observations').value},{userId:'LOCAL_USER'});await reload();quickPlanContext=null;$('plannerQuickBanner').style.display='none';$('saveBtn').style.display='inline-flex';$('code').readOnly=false;$('code').placeholder='Ej.: 1944';document.querySelector('.tab[data-view="intelligentPlanning"]')?.click();setTimeout(()=>renderPlanner(),120);alert(`Muestra ${saved.codeFull||saved.code||code} creada correctamente con el código ingresado. Quedó 🟠 en Registro de Análisis.`);}catch(e){alert(e.message||String(e));$('code').focus();}finally{btn.disabled=false;btn.textContent='💾 Guardar muestra';}
}

function ensurePeriodAssist(){const input=$('monthFrequency');if(!input||$('planningPeriodList'))return;const dl=document.createElement('datalist');dl.id='planningPeriodList';document.body.appendChild(dl);input.setAttribute('list','planningPeriodList');const label=input.closest('.f')?.querySelector('label');if(label)label.textContent='Período / frecuencia';const hint=document.createElement('div');hint.id='planningPeriodHint';hint.className='period-hint';input.insertAdjacentElement('afterend',hint);['client','branch','matrix','samplingDate','year'].forEach(id=>$(id)?.addEventListener(id==='client'?'input':'change',()=>setTimeout(refreshPeriodAssist,50)));document.querySelector('#sampleForm')?.addEventListener('submit',()=>setTimeout(async()=>{await reload();refreshPeriodAssist();renderPlanner()},700));refreshPeriodAssist();}
function matchingPlansForForm(){const clientName=norm($('client')?.value),branch=norm($('branch')?.value),matrixId=$('matrix')?.value||'';const matrix=matrixCache.find(m=>String(m.id)===String(matrixId));const c=clientCache.find(x=>norm(x.name)===clientName);if(!c)return [];return (c.monitoringPlans||[]).filter(p=>{if(p.active===false)return false;if(p.branch&&norm(p.branch)!==branch)return false;if(p.matrixCatalogId&&String(p.matrixCatalogId)!==String(matrixId))return false;if(!p.matrixCatalogId&&p.matrixName&&matrix&&norm(p.matrixName)!==norm(matrix.name))return false;if(!p.matrixCatalogId&&!p.matrixName&&p.groupId&&matrix&&norm(p.groupId)!==norm(matrix.groupId))return false;return true}).map(p=>({client:c,plan:p}));}
function refreshPeriodAssist(){const dl=$('planningPeriodList'),hint=$('planningPeriodHint'),input=$('monthFrequency');if(!dl)return;const year=Number($('year')?.value||new Date().getFullYear());const matches=matchingPlansForForm();const options=[],urgent=[];for(const {client,plan} of matches){for(const p of periods(plan,year,client)){const st=stateFor(client,plan,p);if(st.type==='done'||st.type==='planned')continue;if(st.type==='stopped'){const v=String(st.nextLabel||'').toUpperCase();options.push(v);urgent.push(v)}else options.push(String(p.label||'').toUpperCase())}}const unique=[...new Set(options)];dl.innerHTML=unique.map(v=>`<option value="${esc(v)}"></option>`).join('');if(input&&urgent.length===1&&!String(input.value||'').trim())input.value=urgent[0];if(hint){if(urgent.length)hint.textContent=`🔴 ${urgent.length} retoma(s) requerida(s): ${[...new Set(urgent)].join(', ')}. Se mantiene abierto hasta que una retoma cierre el período.`;else hint.textContent=matches.length?`${unique.length} período(s) pendiente(s) según el plan. Los períodos ya cumplidos no se sugieren.`:'Sin plan de monitoreo configurado para esta sucursal y matriz.';}}


let planningDateContext=null;
function ensurePlanningDateModal(){
  if($('planningDateModal'))return;
  const modal=document.createElement('div');modal.id='planningDateModal';modal.className='planning-date-modal';modal.innerHTML=`<div class="planning-date-box"><div class="modal-head"><div><h3 style="margin:0">📅 Programar monitoreo</h3><div class="muted" id="planningDateSubtitle"></div></div><button class="close" type="button" id="planningDateClose">×</button></div><label>Fecha programada de monitoreo</label><input id="planningDateInput" type="date"><div class="notice" style="margin-top:10px;margin-bottom:0">La fecha programada es independiente de la <b>fecha límite</b>. La campana inteligente avisará un día antes y también si la fecha pasa sin registrarse la muestra.</div><div class="planning-date-actions"><button class="btn blue" type="button" id="planningDateToday">⚡ Planificar hoy y registrar</button><button class="btn danger" type="button" id="planningDateRemove">Quitar fecha</button><button class="btn secondary" type="button" id="planningDateCancel">Cancelar</button><button class="btn primary" type="button" id="planningDateSave">Guardar planificación</button></div></div>`;document.body.appendChild(modal);
  $('planningDateClose').onclick=$('planningDateCancel').onclick=()=>modal.classList.remove('show');
  modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('show')});
  $('planningDateSave').onclick=()=>savePlanningDate(false);
  $('planningDateRemove').onclick=()=>savePlanningDate(true);
  $('planningDateToday').onclick=()=>{if(!planningDateContext)return;$('planningDateModal').classList.remove('show');showRegisterFromPlanner(planningDateContext.clientId,planningDateContext.planId,planningDateContext.year,planningDateContext.label);};
}
function findPlan(clientId,planId){const c=clientCache.find(x=>String(x.id)===String(clientId));if(!c)return {};const plans=c.monitoringPlans||[];let idx=String(planId||'').startsWith('INDEX-')?Number(String(planId).slice(6)):plans.findIndex(p=>String(p.id)===String(planId));if((!Number.isInteger(idx)||idx<0||idx>=plans.length)&&plans.length===1)idx=0;return {client:c,plans,idx,plan:Number.isInteger(idx)&&idx>=0&&idx<plans.length?plans[idx]:null};}
function openPlanningDate(clientId,planId,year,label){
  const {client,plan}=findPlan(clientId,planId);if(!client||!plan)return;
  const pp=periods(plan,Number(year),client).find(x=>canonicalPlanLabel(x.label)===canonicalPlanLabel(label));if(!pp)return;
  const st=stateFor(client,plan,pp);if(st.type==='done'||st.chain?.inAnalysis)return;
  ensurePlanningDateModal();planningDateContext={clientId,planId:plan.id||planId,year:Number(year),label:pp.label};
  $('planningDateSubtitle').textContent=`${client.name} · ${plan.branch||'GENERAL'} · ${plan.matrixName||plan.groupId||'TODAS'} · ${pp.label}`;
  $('planningDateInput').value=st.scheduledDate||'';$('planningDateRemove').style.display=st.scheduledDate?'inline-block':'none';$('planningDateModal').classList.add('show');
}
async function savePlanningDate(remove=false){
  if(!planningDateContext)return;const {client,plans,idx,plan}=findPlan(planningDateContext.clientId,planningDateContext.planId);if(!client||!plan||idx<0)return;
  const pp=periods(plan,planningDateContext.year,client).find(x=>canonicalPlanLabel(x.label)===canonicalPlanLabel(planningDateContext.label));if(!pp)return;
  const st=stateFor(client,plan,pp);if(st.chain?.inAnalysis){$('planningDateModal')?.classList.remove('show');return;}const key=stateScheduleKey(pp,st.chain),date=String($('planningDateInput')?.value||'');
  if(!remove&&!date){alert('Seleccione una fecha de monitoreo.');return;}
  const scheduledDates={...(plan.scheduledDates||{})};if(remove)delete scheduledDates[key];else scheduledDates[key]=date;
  const nextPlans=plans.map((p,i)=>i===idx?{...p,scheduledDates}:p);await repositories.clients.update(client.id,{monitoringPlans:nextPlans},{userId:'LOCAL_USER'});$('planningDateModal').classList.remove('show');await reload();renderPlanner();
}
function planningAlerts(year){
  const today=new Date().toISOString().slice(0,10),alerts=[];
  for(const client of clientCache)for(const [planIndex,plan] of (client.monitoringPlans||[]).entries()){if(plan.active===false)continue;for(const pp of periods(plan,year,client)){
    const st=stateFor(client,plan,pp);if(st.type==='done'||st.chain?.inAnalysis)continue;const scheduled=st.scheduledDate||'',due=pp.due;const base={client,plan,planIndex,pp,st};
    if(st.type==='stopped'&&!scheduled){alerts.push({...base,level:'critical',title:'Retoma DETENIDA sin planificación',detail:`${st.nextLabel||pp.label} requiere una nueva fecha de monitoreo.`});continue;}
    if(scheduled){const d=dayDiff(today,scheduled);if(d===1)alerts.push({...base,level:'warning',title:'Monitoreo programado para mañana',detail:`Fecha programada ${humanDate(scheduled)}.`});else if(d===0)alerts.push({...base,level:'warning',title:'Monitoreo programado para hoy',detail:`Debe ejecutarse hoy ${humanDate(scheduled)}.`});else if(d<0)alerts.push({...base,level:'critical',title:'Monitoreo planificado pendiente',detail:`La fecha programada ${humanDate(scheduled)} ya pasó y no existe muestra cumplida.`});
    }else{const dd=dayDiff(today,due);if(dd===1)alerts.push({...base,level:'warning',title:'Fecha límite mañana · sin planificación',detail:`Límite ${humanDate(due)} y todavía no tiene fecha programada.`});else if(dd<=0)alerts.push({...base,level:'critical',title:'Monitoreo pendiente / vencido',detail:`Límite ${humanDate(due)} sin muestra cumplida ni fecha programada.`});}
  }}
  const rank={critical:0,warning:1,info:2};return alerts.sort((a,b)=>(rank[a.level]-rank[b.level])||String(a.pp.due).localeCompare(String(b.pp.due)));
}
function ensurePlanningBell(){
  const refresh=$('planningRefresh');if(!refresh||$('planningBell'))return;const btn=document.createElement('button');btn.id='planningBell';btn.className='btn secondary small planner-bell';btn.type='button';btn.innerHTML='🔔 Alertas <span class="planner-bell-count" id="planningBellCount">0</span>';refresh.parentElement?.insertBefore(btn,refresh);btn.onclick=()=>$('planningAlertPanel')?.classList.toggle('show');
  const panel=document.createElement('div');panel.id='planningAlertPanel';panel.className='planning-alert-panel';document.body.appendChild(panel);
}
function renderPlanningAlerts(year){
  ensurePlanningBell();const alerts=planningAlerts(year);if($('planningBellCount'))$('planningBellCount').textContent=alerts.length;const tab=document.querySelector('.tab[data-view="intelligentPlanning"]');if(tab){let badge=tab.querySelector('.planning-tab-alert-count');if(!badge){badge=document.createElement('span');badge.className='count planning-tab-alert-count';tab.appendChild(badge)}badge.textContent=alerts.length;badge.style.display=alerts.length?'inline-flex':'none';badge.title=alerts.length?`${alerts.length} alerta(s) de monitoreo`:'Sin alertas de monitoreo';}const panel=$('planningAlertPanel');if(!panel)return;panel.innerHTML=`<div class="modal-head"><div><h3 style="margin:0">🔔 Alertas inteligentes de monitoreo</h3><div class="muted">Se recalculan automáticamente según muestras, fechas límite, planificación y DETENIDAS.</div></div><button class="close" type="button" id="planningAlertsClose">×</button></div>${alerts.length?alerts.map(a=>`<div class="planning-alert-row ${a.level}" data-alert-plan-client="${esc(a.client.id)}" data-alert-plan-id="${esc(a.plan.id||`INDEX-${a.planIndex}`)}" data-alert-plan-year="${a.pp.year}" data-alert-plan-label="${esc(a.pp.label)}"><div class="planning-alert-title">${a.level==='critical'?'🔴':'🟠'} ${esc(a.title)}</div><div><b>${esc(a.client.name)}</b> · ${esc(a.plan.branch||'GENERAL')} · ${esc(a.plan.matrixName||a.plan.groupId||'TODAS')}</div><div class="planning-alert-meta">${esc(a.pp.label)} · ${esc(a.detail)}</div><button class="btn secondary small" type="button" style="margin-top:6px" data-alert-schedule>📅 Programar / cambiar fecha</button></div>`).join(''):'<div class="empty">✅ No hay alertas de monitoreo en este momento.</div>'}`;$('planningAlertsClose').onclick=()=>panel.classList.remove('show');panel.querySelectorAll('[data-alert-schedule]').forEach(b=>b.onclick=()=>{const r=b.closest('[data-alert-plan-client]');openPlanningDate(r.dataset.alertPlanClient,r.dataset.alertPlanId,r.dataset.alertPlanYear,r.dataset.alertPlanLabel);});
}

function ensurePlannerControls(){ensureQuickPlanBanner();if(!$('planningYear'))return;const now=new Date();$('planningYear').value=now.getFullYear();$('planningMonth').value=now.getMonth()+1;ensurePlanningDateModal();ensurePlanningBell();$('planningYear').addEventListener('change',renderPlanner);$('planningMonth').addEventListener('change',renderPlanner);$('planningRefresh').addEventListener('click',async()=>{await reload();renderPlanner()});}
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
  // Frecuencias periódicas: si ya existe una toma, el código se visualiza en el mes REAL
  // de la primera toma. La fecha real también reprograma el siguiente ciclo.
  if(['TRIMESTRAL','SEMESTRAL','ANUAL'].includes(frequency)&&st?.chain?.samples?.length){
    const first=st.chain.samples.find(s=>retakeNumber(s,pp)===1)||st.chain.samples[0];
    return sampleDisplayMonth(first)||pp.month;
  }
  return pp.month;
}
function renderPlanner(){
  if(!$('planningMatrix'))return;
  const year=Number($('planningYear').value||new Date().getFullYear());
  const month=Number($('planningMonth').value||1);
  const groups=[];
  for(const c of clientCache){
    const plans=(c.monitoringPlans||[]).map((p,planIndex)=>({plan:p,planIndex})).filter(x=>x.plan.active!==false);
    if(plans.length)groups.push({client:c,plans});
  }
  let done=0,planned=0,pending=0,late=0,stopped=0;
  const severity={late:5,stopped:4,planned:3,pending:2,done:1};
  const countState=st=>{if(st.type==='done')done++;else if(st.type==='planned')planned++;else if(st.type==='late')late++;else if(st.type==='stopped')stopped++;else pending++;};
  const detailRow=({client,plan,planIndex},child=false)=>{
    const ps=periods(plan,year,client);
    const periodStates=ps.map(pp=>{const st=stateFor(client,plan,pp);countState(st);return {pp,st,displayMonth:displayMonthForPeriod(plan,pp,st)}});
    const cells=MONTHS.map((m,idx)=>{
      const entries=periodStates.filter(x=>x.displayMonth===idx+1);
      if(!entries.length)return '<td class="plan-na">—</td>';
      const cellType=entries.slice().sort((a,b)=>(severity[b.st.type]||0)-(severity[a.st.type]||0))[0]?.st.type||'pending';
      const content=entries.map(({pp,st})=>{const detail=st.chain?.samples?.length?chainHtml(st.chain,pp):esc(st.text);const alert=st.type==='stopped'&&!st.scheduledDate?`<span class="retake-alert">⚠ PLANIFICAR ${esc(st.nextLabel)}</span>`:'';const scheduled=st.scheduledDate?`<span class="plan-date">📅 ${esc(humanDate(st.scheduledDate))}${st.type==='stopped'?' · RETOMA':''}</span>`:'';const locked=!!st.chain?.inAnalysis;const clickable=(st.type==='done'||locked)?'':` data-plan-schedule data-client-id="${esc(client.id)}" data-plan-id="${esc(plan.id||`INDEX-${planIndex}`)}" data-plan-year="${pp.year}" data-plan-label="${esc(pp.label)}"`;const lockNote=locked?`<span class="plan-date">🔒 Código registrado · esperando ingreso a Laboratorio</span>`:'';return `<div${clickable} title="${esc(pp.label)} · límite ${esc(pp.due)}${st.scheduledDate?` · programado ${esc(st.scheduledDate)}`:''}">${detail}${alert}${scheduled}${lockNote}<div class="muted">${esc(pp.label)}</div></div>`}).join('<hr style="border:0;border-top:1px solid #dce6df;margin:5px 0">');
      return `<td class="plan-cell-${cellType}${entries.some(x=>x.st.type!=='done'&&!x.st.chain?.inAnalysis)?' plan-clickable':''}">${content}</td>`;
    }).join('');
    return {html:`<tr class="${child?'plan-client-child':''}"><td><b>${esc(client.name)}</b><div class="muted">${esc(plan.branch||'GENERAL')} · ${esc(plan.matrixName||plan.groupId||'TODAS LAS MATRICES')} · ${esc(plan.frequency)} · ${esc(plan.service||'MONITOREO')}</div></td>${cells}</tr>`,periodStates};
  };

  let body='';
  for(const group of groups){
    const {client,plans}=group;
    if(plans.length===1){body+=detailRow({client,...plans[0]}).html;continue;}
    // Para clientes con varias sucursales/planes se calcula el estado, pero se dibuja una sola fila compacta.
    const planData=plans.map(x=>({x,...detailRow({client,...x},true)}));
    const branchCount=new Set(plans.map(x=>norm(x.plan.branch||'GENERAL'))).size;
    const expanded=expandedPlannerClients.has(String(client.id));
    const monthCells=MONTHS.map((m,idx)=>{
      const entries=planData.flatMap(d=>d.periodStates.filter(x=>x.displayMonth===idx+1));
      if(!entries.length)return '<td class="plan-na">—</td>';
      const counts={done:0,planned:0,pending:0,late:0,stopped:0};entries.forEach(e=>counts[e.st.type]=(counts[e.st.type]||0)+1);
      const cellType=Object.keys(counts).filter(k=>counts[k]>0).sort((a,b)=>(severity[b]||0)-(severity[a]||0))[0]||'pending';
      const parts=[];if(counts.done)parts.push(`✅ ${counts.done}`);if(counts.planned)parts.push(`🟠 ${counts.planned}`);if(counts.pending)parts.push(`⬜ ${counts.pending}`);if(counts.stopped)parts.push(`🔴 ${counts.stopped}`);if(counts.late)parts.push(`⛔ ${counts.late}`);
      return `<td class="plan-cell-${cellType}"><div class="plan-client-agg">${parts.join(' · ')}</div></td>`;
    }).join('');
    body+=`<tr class="plan-client-summary" data-plan-client-toggle="${esc(client.id)}" title="Clic para ${expanded?'contraer':'ver'} sucursales y cronogramas"><td><span class="plan-client-toggle">${expanded?'▼':'▶'}</span><b>${esc(client.name)}</b><span class="plan-client-meta">${branchCount} sucursal${branchCount===1?'':'es'} · ${plans.length} plan${plans.length===1?'':'es'} de monitoreo · clic para ${expanded?'contraer':'abrir cronograma'}</span></td>${monthCells}</tr>`;
    if(expanded)body+=planData.map(d=>d.html).join('');
  }
  $('planningMatrix').innerHTML=groups.length?`<div class="plan-group-tip">🧠 Vista compacta: los clientes con varias sucursales o planes aparecen agrupados. Haga clic en el cliente para abrir únicamente su cronograma.</div><div class="plan-matrix-wrap"><table class="plan-matrix"><thead><tr><th>Cliente / sucursal / matriz / frecuencia</th>${MONTHS.map(m=>`<th>${m.slice(0,3)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`:'<div class="empty">No hay planes configurados. Configure una frecuencia desde Catálogos → Clientes y sucursales.</div>';
  $('planningSummary').innerHTML=`<span class="plan-pill">✅ ${done} cumplidos</span><span class="plan-pill">🟠 ${planned} planificados / en análisis</span><span class="plan-pill">⬜ ${pending} pendientes</span><span class="plan-pill">🔴 ${stopped} detenidos / requieren retoma</span><span class="plan-pill">⛔ ${late} vencidos</span>`;
  const due=[];for(const {client,plans} of groups){for(const {plan,planIndex} of plans){for(const pp of periods(plan,year,client).filter(x=>x.month===month)){const st=stateFor(client,plan,pp);due.push({client,plan,planIndex,pp,st})}}}
  $('planningMonthTable').innerHTML=due.length?`<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Sucursal</th><th>Matriz</th><th>Frecuencia</th><th>Período</th><th>Límite</th><th>Estado / trazabilidad</th></tr></thead><tbody>${due.map(x=>`<tr class="${x.st.type==='stopped'?'plan-cell-stopped':''}"><td><b>${esc(x.client.name)}</b></td><td>${esc(x.plan.branch||'GENERAL')}</td><td>${esc(x.plan.matrixName||x.plan.groupId||'TODAS')}</td><td>${esc(x.plan.frequency)}</td><td><b>${esc(x.pp.label)}</b></td><td>${esc(x.pp.due)}</td><td>${x.st.chain?.samples?.length?chainHtml(x.st.chain,x.pp):esc(x.st.text)}${x.st.type==='stopped'&&!x.st.scheduledDate?`<span class="retake-alert">⚠ PLANIFICAR ${esc(x.st.nextLabel)}</span>`:''}${x.st.scheduledDate?`<span class="plan-date">📅 Programado: ${esc(humanDate(x.st.scheduledDate))}</span>`:''}${x.st.chain?.inAnalysis?`<span class="plan-date">🔒 Código registrado · esperando ingreso a Laboratorio</span>`:(x.st.type!=='done'?`<button class="btn secondary small" type="button" style="margin-top:5px" data-plan-schedule data-client-id="${esc(x.client.id)}" data-plan-id="${esc(x.plan.id||`INDEX-${x.planIndex}`)}" data-plan-year="${x.pp.year}" data-plan-label="${esc(x.pp.label)}">📅 Programar</button> <button class="btn blue small" type="button" style="margin-top:5px" data-plan-today data-client-id="${esc(x.client.id)}" data-plan-id="${esc(x.plan.id||`INDEX-${x.planIndex}`)}" data-plan-year="${x.pp.year}" data-plan-label="${esc(x.pp.label)}">⚡ Hoy</button>`:'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay obligaciones cuyo período cierre en este mes.</div>';
  document.querySelectorAll('[data-plan-client-toggle]').forEach(el=>{el.onclick=e=>{if(e.target.closest('[data-plan-schedule],[data-plan-today]'))return;const id=String(el.dataset.planClientToggle);if(expandedPlannerClients.has(id))expandedPlannerClients.delete(id);else expandedPlannerClients.add(id);renderPlanner();};});
  document.querySelectorAll('[data-plan-schedule]').forEach(el=>{el.onclick=e=>{e.stopPropagation();openPlanningDate(el.dataset.clientId,el.dataset.planId,el.dataset.planYear,el.dataset.planLabel);}});
  document.querySelectorAll('[data-plan-today]').forEach(el=>{el.onclick=e=>{e.stopPropagation();showRegisterFromPlanner(el.dataset.clientId,el.dataset.planId,el.dataset.planYear,el.dataset.planLabel);}});
  renderPlanningAlerts(year);
}

async function init(){try{installStyles();await reload();ensureCatalogAddon();ensurePeriodAssist();ensurePlannerControls();renderPlanner();document.addEventListener('click',e=>{if(e.target.closest('[data-client-catalog]')||e.target.id==='newClientCatalog'||e.target.id==='openClients'||e.target.id==='manageClients'||e.target.id==='quickBranch')setTimeout(refreshCatalogPlanEditor,80);if(e.target.closest('.tab[data-view="intelligentPlanning"]'))setTimeout(async()=>{await reload();renderPlanner()},50)});const obs=new MutationObserver(()=>{ensureCatalogAddon();ensurePeriodAssist()});obs.observe(document.body,{childList:true,subtree:true});}catch(e){console.error('[Planning Addon]',e)}}
window.addEventListener('DOMContentLoaded',init,{once:true});
