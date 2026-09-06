import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import type {LiveState} from '../lib/types';
export function useLiveState(){
 const [data,setData]=useState<LiveState|null>(null),[error,setError]=useState('');
 const alive=useRef(true),inflight=useRef<Promise<void>|null>(null);
 const refresh=useCallback(async()=>{
  if(inflight.current)return inflight.current;
  const job=(async()=>{try{const next=await api<LiveState>('/api/state');if(alive.current){setData(next);setError('');}}catch(e){if(alive.current)setError((e as Error).message);}})();
  inflight.current=job;try{await job;}finally{inflight.current=null;}
 },[]);
 useEffect(()=>{alive.current=true;void refresh();const stream=new EventSource('/api/events');const onRefresh=()=>{if(!document.hidden)void refresh();};stream.addEventListener('refresh',onRefresh);const timer=setInterval(onRefresh,10000);document.addEventListener('visibilitychange',onRefresh);return()=>{alive.current=false;stream.close();clearInterval(timer);document.removeEventListener('visibilitychange',onRefresh);};},[refresh]);
 return {data,error,refresh};
}
