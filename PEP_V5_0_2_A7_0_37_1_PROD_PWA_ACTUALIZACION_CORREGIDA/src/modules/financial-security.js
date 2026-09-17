import {securityManager} from '../security/security-manager.js';

const FINANCIAL_MODULES=new Set(['billing','receivables']);
let unlocked=false;
let pendingResolve=null;

function el(id){return document.getElementById(id)}
function clearErrors(){const e=el('finSecError');if(e)e.textContent=''}
function error(msg){const e=el('finSecError');if(e)e.textContent=msg}
function resetInputs(){if(el('finSecPassword'))el('finSecPassword').value=''}
function currentSession(){return securityManager.sessions.current()||{}}
function show(){
  clearErrors();resetInputs();
  const modal=el('financialSecurityModal');if(!modal)return;
  const s=currentSession();
  el('finSecTitle').textContent='Acceso protegido a módulos financieros';
  el('finSecText').textContent=`Confirme la contraseña de Firebase del usuario ${s.email||'actual'} para abrir Facturación y Cuentas por Cobrar en este equipo.`;
  modal.classList.add('show');
  setTimeout(()=>el('finSecPassword')?.focus(),30);
}
function hide(result=false){el('financialSecurityModal')?.classList.remove('show');const r=pendingResolve;pendingResolve=null;if(r)r(result)}
function inject(){
  if(el('financialSecurityModal'))return;
  const wrap=document.createElement('div');
  wrap.innerHTML=`<div class="modal" id="financialSecurityModal"><div class="modal-box" style="width:min(480px,100%)"><div class="modal-head"><div><h3 id="finSecTitle">Acceso financiero</h3><div class="muted" id="finSecText"></div></div><button class="close" id="finSecClose" type="button">×</button></div><form id="finSecForm"><label style="margin-top:10px">Contraseña de Firebase</label><input id="finSecPassword" type="password" autocomplete="current-password" required><div id="finSecError" style="min-height:20px;margin-top:8px;color:#b42318;font-size:11px;font-weight:800"></div><div class="actions"><button class="btn primary" id="finSecSubmit" type="submit">Desbloquear</button><button class="btn secondary" id="finSecCancel" type="button">Cancelar</button></div><div class="notice" style="margin-top:12px;margin-bottom:0"><b>Seguridad Firebase:</b> esta clave no se guarda en IndexedDB, localStorage ni en el código. Se valida directamente con Firebase Authentication para el usuario autenticado.</div></form></div></div>`;
  document.body.appendChild(wrap.firstElementChild);
  el('finSecClose').onclick=()=>hide(false);el('finSecCancel').onclick=()=>hide(false);
  el('finSecForm').onsubmit=async e=>{
    e.preventDefault();clearErrors();
    const password=el('finSecPassword').value;
    const s=currentSession();
    if(!s.authenticated||!s.email){error('Debe iniciar sesión con Firebase antes de abrir este módulo.');return}
    if(!password){error('Ingrese su contraseña.');return}
    try{
      const beforeUid=s.uid;
      const verified=await securityManager.authRuntime.signInWithEmailPassword(s.email,password);
      if(!verified?.authenticated||verified.uid!==beforeUid)throw new Error('La identidad verificada no coincide con la sesión actual.');
      unlocked=true;hide(true);
    }catch(err){error('Contraseña incorrecta o no fue posible validarla con Firebase.');}
  };
}
async function requestAccess(){
  if(unlocked)return true;
  inject();
  const s=currentSession();
  if(!s.authenticated||!s.email)return false;
  return new Promise(resolve=>{pendingResolve=resolve;show()});
}
function lock(){unlocked=false;document.dispatchEvent(new CustomEvent('pep:financial-lock'));}
async function changePassword(){
  alert('La contraseña financiera ahora corresponde a la contraseña del usuario en Firebase. Para cambiarla use Sistema → Seguridad → Usuarios Firebase.');
  return false;
}
function isFinancial(moduleId){return FINANCIAL_MODULES.has(moduleId)}
function isUnlocked(){return unlocked}
async function init(){inject();document.querySelectorAll('[data-financial-lock]').forEach(b=>b.addEventListener('click',()=>lock()));document.querySelectorAll('[data-financial-change]').forEach(b=>b.addEventListener('click',()=>changePassword()));document.addEventListener('pep:financial-force-lock',()=>lock());}
export const financialSecurity={init,requestAccess,lock,changePassword,isFinancial,isUnlocked};
