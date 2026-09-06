import type {Placement} from './types';
export const money=(v:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v/100);
export const date=(n:number)=>new Date(Number(n)).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
export const duration=(p:Placement)=>{if(!p.started_at)return 'Not aired';const mins=Math.max(1,Math.round(((Number(p.ended_at)||Date.now())-Number(p.started_at))/60000));return mins>=60?`${Math.floor(mins/60)}h ${mins%60}m`:`${mins}m`;};
export async function api<T=any>(url:string,method='GET',body?:unknown):Promise<T>{const r=await fetch(url,{method,headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});let data;try{data=await r.json();}catch{throw new Error('The connection was interrupted. Please try again.');}if(!r.ok)throw new Error(data.error||'Please try again.');return data;}
export function instrument(event:string,placementId?:string){void api('/api/instrument','POST',{event,placementId}).catch(()=>{});}
export const number=(n:number|null|undefined)=>n==null?'Private':n.toLocaleString('en-US');
