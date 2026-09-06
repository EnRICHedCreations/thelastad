import {useCallback,useEffect,useRef,useState} from 'react';
import {api} from '../lib/api';
import type {LiveState} from '../lib/types';
export function useLiveState(){
 const [data,setData]=useState<LiveState|null>(null),[error,setError]=useState('');
 const alive=useRef(true),inflight=useRef<Promise<void>|null>(null);
 const refresh=useCallback(async()=>{
  if(inflight.current)return inflight.current;
  const job=(async()=>{try{const next=await api<LiveState>(`/api/state?t=${Date.now()}`);if(alive.current){setData(next);setError('');}}catch(e){if(alive.current)setError((e as Error).message);}})();
  inflight.current=job;try{await job;}finally{inflight.current=null;}
 },[]);
 useEffect(()=>{
  alive.current=true;
  void refresh();
  const stream=new EventSource('/api/events');
  const onRefresh=()=>{if(!document.hidden)void refresh();};
  stream.addEventListener('refresh',onRefresh);
  stream.addEventListener('error',onRefresh);
  const timer=setInterval(onRefresh,2500);
  document.addEventListener('visibilitychange',onRefresh);
  window.addEventListener('focus',onRefresh);
  return()=>{alive.current=false;stream.close();clearInterval(timer);document.removeEventListener('visibilitychange',onRefresh);window.removeEventListener('focus',onRefresh);};
 },[refresh]);
 return {data,error,refresh};
}
