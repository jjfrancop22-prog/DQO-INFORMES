import {auditRepository} from '../data/audit-repository.js';
import {sessionManager} from './session-manager.js';

const BILLING_CORRECTION_PASSWORD='2026';

function actorId(){
  const s=sessionManager.current();
  return s?.uid||s?.email||s?.displayName||'LOCAL_USER';
}

class BillingCorrectionGate{
  actor(){return actorId()}
  async authorize(record={}){
    const userId=this.actor();
    const code=record.code||record.codeFull||record.id||'registro';
    const entered=window.prompt(`EDICIÓN CONTROLADA — FACTURACIÓN\n\nEl código ${code} ya está marcado como FACTURADO.\nLa modificación quedará registrada en la trazabilidad.\n\nIngrese la contraseña de autorización para editar:`);
    if(entered===null){
      await auditRepository.record({action:'BILLING_FACTURADO_EDIT_AUTH_CANCELLED',domain:'BILLING',entityId:record.id||'',entityType:'BillingRecord',userId,metadata:{policy:'BILLING_FACTURADO_PASSWORD_REQUIRED',code}}).catch(()=>{});
      return false;
    }
    const allowed=entered===BILLING_CORRECTION_PASSWORD;
    await auditRepository.record({action:allowed?'BILLING_FACTURADO_EDIT_AUTHORIZED':'BILLING_FACTURADO_EDIT_AUTH_DENIED',domain:'BILLING',entityId:record.id||'',entityType:'BillingRecord',userId,metadata:{policy:'BILLING_FACTURADO_PASSWORD_REQUIRED',code}}).catch(()=>{});
    if(!allowed)throw new Error('Edición bloqueada. Contraseña incorrecta.');
    return true;
  }
}
export const billingCorrectionGate=new BillingCorrectionGate();
