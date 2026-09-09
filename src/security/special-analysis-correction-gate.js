import {auditRepository} from '../data/audit-repository.js';
import {sessionManager} from './session-manager.js';

const QUALITY_PASSWORD='CALIDAD';

function actorId(){
  const s=sessionManager.current();
  return s?.uid||s?.email||s?.displayName||'LOCAL_USER';
}

class SpecialAnalysisCorrectionGate{
  actor(){return actorId()}
  async authorize({entityId='',label='esta muestra',from=false,to=false}={}){
    const userId=this.actor();
    const fromLabel=from?'CON DQO / Tensoactivos':'SIN DQO / Tensoactivos';
    const toLabel=to?'CON DQO / Tensoactivos':'SIN DQO / Tensoactivos';
    const entered=window.prompt(`CORRECCIÓN RESTRINGIDA — CALIDAD\n\nSe cambiará ${label}:\n${fromLabel} → ${toLabel}.\n\nEl cambio quedará registrado en la trazabilidad.\nIngrese la contraseña de Calidad para continuar:`);
    if(entered===null){
      await auditRepository.record({action:'SPECIAL_ANALYSIS_CORRECTION_AUTH_CANCELLED',domain:'SAMPLES',entityId,entityType:'SAMPLE',userId,metadata:{policy:'QUALITY_PASSWORD_REQUIRED',from:fromLabel,to:toLabel}}).catch(()=>{});
      return false;
    }
    const allowed=entered===QUALITY_PASSWORD;
    await auditRepository.record({action:allowed?'SPECIAL_ANALYSIS_CORRECTION_AUTHORIZED':'SPECIAL_ANALYSIS_CORRECTION_AUTH_DENIED',domain:'SAMPLES',entityId,entityType:'SAMPLE',userId,metadata:{policy:'QUALITY_PASSWORD_REQUIRED',from:fromLabel,to:toLabel}}).catch(()=>{});
    if(!allowed)throw new Error('Cambio DQO/Tenso bloqueado. Contraseña de Calidad incorrecta.');
    return true;
  }
}

export const specialAnalysisCorrectionGate=new SpecialAnalysisCorrectionGate();
