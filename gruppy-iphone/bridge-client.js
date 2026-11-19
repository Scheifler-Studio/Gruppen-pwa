'use strict';
// Google Apps Script serves HTML inside a second, nested Google iframe.
// MessageChannel avoids reliance on event.source === the outer iframe.
const GoogleBridge=(()=>{
  let frame=null,port=null,ready=false,seq=0,currentUrl='',channel='';
  const waiting=new Map(),listeners=new Set();
  const pattern=/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec(?:\?.*)?$/;
  const googleOrigin=/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)$/i;
  function normalizeUrl(url){const u=String(url||'').trim();if(!pattern.test(u))throw Error('Укажи ссылку Google Apps Script с окончанием /exec');return u}
  function announce(state){for(const listener of listeners){try{listener(state)}catch(e){console.warn(e)}}}
  window.addEventListener('message',event=>{
    const m=event.data;
    if(!frame||!m||m.source!=='gruppen-google-bridge'||m.type!=='ready'||
        m.channel!==channel||!googleOrigin.test(event.origin)||!event.ports?.[0])return;
    if(port)port.close();
    port=event.ports[0];
    port.onmessage=onPortMessage;
    port.start();
    ready=true;announce('ready');
  });
  function onPortMessage(event){
    const m=event.data;
    if(!m||m.source!=='gruppen-google-bridge'||m.channel!==channel||
        m.type!=='result'||!waiting.has(m.id))return;
    const w=waiting.get(m.id);waiting.delete(m.id);clearTimeout(w.timer);
    if(m.ok)w.resolve(m.data);else w.reject(Error(m.error||'Ошибка Google Apps Script'));
  }
  function disconnect(){
    for(const [id,w] of waiting){clearTimeout(w.timer);w.reject(Error('Подключение было изменено'));waiting.delete(id)}
    port?.close();port=null;ready=false;frame?.remove();frame=null;channel='';currentUrl='';announce('disconnected');
  }
  function connect(url){
    url=normalizeUrl(url);
    if(frame&&currentUrl===url)return;
    disconnect();currentUrl=url;
    channel=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
    frame=document.createElement('iframe');frame.title='Соединение с Google Drive';
    frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:absolute;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    const u=new URL(url);u.searchParams.set('channel',channel);frame.src=u.href;
    document.body.appendChild(frame);announce('connecting');
  }
  function call(action,payload={},token=''){
    if(!frame)return Promise.reject(Error('Сначала укажи Google Apps Script в настройках'));
    return new Promise((resolve,reject)=>{
      const id=String(++seq),start=Date.now();
      let waitTimer=null;
      const w={resolve,reject,timer:null};waiting.set(id,w);
      function send(){
        if(!waiting.has(id))return;
        if(!ready||!port){
          if(Date.now()-start>=25000){waiting.delete(id);reject(Error('Google Apps Script не ответил за 25 секунд. Проверь публикацию Bridge.html и разрешение Safari на загрузку Google.'));return}
          waitTimer=setTimeout(send,150);return;
        }
        try{port.postMessage({source:'gruppen-pwa',channel,id,action,payload,token})}
        catch(e){waiting.delete(id);reject(e);return}
        w.timer=setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);reject(Error('Google Apps Script не прислал ответ. Проверь журнал выполнения скрипта.'))}},45000);
      }
      send();
    });
  }
  return {connect,disconnect,call,normalizeUrl,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},get ready(){return ready}};
})();
