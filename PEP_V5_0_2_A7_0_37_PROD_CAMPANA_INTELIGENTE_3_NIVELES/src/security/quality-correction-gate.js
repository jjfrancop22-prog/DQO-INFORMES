import {auditRepository} from '../data/audit-repository.js';
import {sessionManager} from './session-manager.js';

const QUALITY_CORRECTION_PASSWORD='CALIDAD';

function actorId(){
  const s=sessionManager.current();
  return s?.uid||s?.email||s?.displayName||'LOCAL_USER';
}

class QualityCorrectionGate{
  actor(){return actorId()}
  async authorize({entityId='',entityType='SAMPLE',domain='SAMPLES',label='esta muestra'}={}){
    const userId=this.actor();
    const entered=window.prompt(`CORRECCIÓN RESTRINGIDA — CALIDAD\n\nSe cambiará el estado de ${label} de CONTINUAR a DETENIDA.\nEsta corrección no elimina ni reinicia el proceso.\n\nIngrese la contraseña de Calidad para continuar:`);
    if(entered===null){
      await auditRepository.record({action:'DECISION_CORRECTION_AUTH_CANCELLED',domain,entityId,entityType,userId,metadata:{policy:'QUALITY_PASSWORD_REQUIRED',from:'CONTINUAR',to:'DETENIDA'}});
      return false;
    }
    const allowed=entered===QUALITY_CORRECTION_PASSWORD;
    await auditRepository.record({action:allowed?'DECISION_CORRECTION_AUTHORIZED_BY_QUALITY':'DECISION_CORRECTION_AUTH_DENIED',domain,entityId,entityType,userId,metadata:{policy:'QUALITY_PASSWORD_REQUIRED',from:'CONTINUAR',to:'DETENIDA'}});
    if(!allowed)throw new Error('Corrección bloqueada. Contraseña de Calidad incorrecta.');
    return true;
  }
}
export const qualityCorrectionGate=new QualityCorrectionGate();
