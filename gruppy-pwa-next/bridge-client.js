'use strict';
// A cross-origin message bridge to the Google Apps Script HTML Service iframe.
// No credentials or Drive files are fetched directly by the public GitHub PWA.
const GoogleBridge=(()=>{
  let frame=null,bridgeOrigin='',bridgeReady=false,seq=0;
  const waiting=new Map();
  const listeners=new Set();
  const URL_PATTERN=/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec(?:\?.*)?$/;
  function normalizeUrl(url){const u=String(url||'').trim();if(!URL_PATTERN.test(u))throw Error('Вставь опубликованный адрес Google Apps Script, заканчивающийся на /exec');return u}
  function announce(state){for(const f of listeners)try{f(state)}catch{}}
  window.addEventListener('message',event=>{
    if(!frame || event.source!==frame.contentWindow)return;
    const msg=event.data;
    if(!msg||msg.source!=='gruppen-google-bridge')return;
    // iframe may run at Google's sandbox host; verify by origin as well as iframe source.
    if(!/^https:\/\/([a-z0-9-]+\.)*(googleusercontent\.com|google\.com)$/.test(event.origin))return;
    if(msg.type==='ready'){bridgeOrigin=event.origin;bridgeReady=true;announce('ready');return}
    if(msg.type==='result' && waiting.has(msg.id)){
      const x=waiting.get(msg.id);waiting.delete(msg.id);clearTimeout(x.timer);
      if(msg.ok)x.resolve(msg.data);else x.reject(new Error(msg.error||'Ошибка Google Apps Script'));
    }
  });
  function disconnect(){
    for(const [id,w] of waiting){clearTimeout(w.timer);w.reject(Error('Подключение было изменено'));waiting.delete(id)}
    bridgeReady=false;bridgeOrigin='';frame?.remove();frame=null;announce('disconnected');
  }
  function connect(url){url=normalizeUrl(url);disconnect();frame=document.createElement('iframe');frame.title='Соединение с Google Drive';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;opacity:0;pointer-events:none';frame.src=url;document.body.appendChild(frame);announce('connecting')}
  function call(action,payload={},token=''){
    if(!frame) return Promise.reject(Error('Сначала подключи Google Apps Script в настройках'));
    return new Promise((resolve,reject)=>{
      let id=String(++seq), deadline=Date.now()+18000;
      const w={resolve,reject,timer:null};waiting.set(id,w);
      const send=()=>{
        if(!waiting.has(id))return;
        if(!bridgeReady){if(Date.now()>deadline){waiting.delete(id);reject(Error('Google Apps Script не отвечает. Проверь URL и настройки доступа.'));return}setTimeout(send,100);return}
        try{frame.contentWindow.postMessage({source:'gruppen-pwa',id,action,payload,token},bridgeOrigin)}catch(err){waiting.delete(id);reject(err)}
        w.timer=setTimeout(()=>{if(waiting.has(id)){waiting.delete(id);reject(Error('Превышено время ожидания ответа Google Drive'))}},45000);
      };send();
    });
  }
  return {connect,disconnect,call,normalizeUrl,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},get ready(){return bridgeReady}};
})();
