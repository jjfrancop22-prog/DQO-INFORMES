const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const pad=n=>String(n).padStart(2,'0');
const iso=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
const asDate=v=>{const s=String(v||'').slice(0,10);if(!DATE_RE.test(s))return null;const d=new Date(`${s}T12:00:00`);return Number.isNaN(d.getTime())?null:d};
const toIso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function easterSunday(year){
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day,12,0,0,0);
}
function shiftDays(date,n){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function observedFixed(year,month,day,{transfer=true}={}){
  const d=new Date(year,month-1,day,12,0,0,0);if(!transfer)return toIso(d);
  const w=d.getDay();
  if(w===2)return toIso(shiftDays(d,-1));      // martes -> lunes
  if(w===3||w===4)return toIso(shiftDays(d,5-w)); // miércoles/jueves -> viernes
  if(w===6)return toIso(shiftDays(d,-1));      // sábado -> viernes
  if(w===0)return toIso(shiftDays(d,1));       // domingo -> lunes
  return toIso(d);
}
function ecuadorNationalHolidays(year){
  const set=new Set();
  // Año Nuevo y Navidad se conservan en su fecha calendario.
  set.add(iso(year,1,1));
  set.add(iso(year,12,25));
  const easter=easterSunday(year);
  set.add(toIso(shiftDays(easter,-48))); // Lunes de Carnaval
  set.add(toIso(shiftDays(easter,-47))); // Martes de Carnaval
  set.add(toIso(shiftDays(easter,-2)));  // Viernes Santo
  [[5,1],[5,24],[8,10],[10,9]].forEach(([m,d])=>set.add(observedFixed(year,m,d)));
  // Feriados consecutivos de noviembre se mantienen separados para no colapsar 2 y 3 de noviembre en un solo día.
  set.add(iso(year,11,2));
  set.add(iso(year,11,3));
  return set;
}
function customHolidays(){
  try{const raw=JSON.parse(localStorage.getItem('PEP_CUSTOM_HOLIDAYS_V1')||'[]');return new Set((Array.isArray(raw)?raw:[]).map(x=>String(x||'').slice(0,10)).filter(x=>DATE_RE.test(x)))}catch{return new Set()}
}
export function holidaysForYear(year){const out=ecuadorNationalHolidays(Number(year));for(const x of customHolidays())if(x.startsWith(`${year}-`))out.add(x);return out}
export function isBusinessDay(value){const d=asDate(value);if(!d)return false;const w=d.getDay();if(w===0||w===6)return false;return !holidaysForYear(d.getFullYear()).has(toIso(d))}
export function addBusinessDays(value,days){const d=asDate(value);if(!d)return '';let remaining=Math.max(0,Number(days)||0);while(remaining>0){d.setDate(d.getDate()+1);if(isBusinessDay(toIso(d)))remaining--}return toIso(d)}
export function businessDaysBetween(from,to){const a=asDate(from),b=asDate(to);if(!a||!b)return null;if(toIso(a)===toIso(b))return 0;const sign=a<b?1:-1,start=sign>0?a:b,end=sign>0?b:a;let n=0,d=new Date(start);while(d<end){d.setDate(d.getDate()+1);if(isBusinessDay(toIso(d)))n++}return n*sign}
export function slaDaysForService(serviceType){return String(serviceType||'INTERNO').trim().toUpperCase()==='EXTERNO'?15:8}
export function calculateSlaDeadline(receptionDate,serviceType){return addBusinessDays(receptionDate,slaDaysForService(serviceType))}
export function effectiveSlaDeadline(record){return calculateSlaDeadline(record?.receptionDate||'',record?.serviceType||'INTERNO')||String(record?.maxReportDate||'').slice(0,10)}
export const BUSINESS_CALENDAR_VERSION='EC-SLA-1.0.0';
