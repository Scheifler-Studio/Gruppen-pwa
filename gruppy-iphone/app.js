'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const KEY='gruppen-duo-iphone';let settings=JSON.parse(localStorage.getItem(KEY)||'{}'),members=[],reports=[],group='',person='';
const prevMonth=()=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};$('month').value=prevMonth();
const show=(id)=>{for(const x of ['login','pending','active'])$(x).hidden=x!==id;const screen=document.querySelector('.screen');screen.classList.remove('login-mode','pending-mode','active-mode');screen.classList.add(id+'-mode')};const notice=s=>{$('notice').textContent=s;$('notice').hidden=false;setTimeout(()=>$('notice').hidden=true,4200)};
const save=()=>localStorage.setItem(KEY,JSON.stringify(settings));
async function api(path,options={}){if(!APP_API_URL)throw Error('Сервер ещё не настроен. Обратитесь к секретарю.');const res=await fetch(APP_API_URL.replace(/\/$/,'')+path,{...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(settings.token?{Authorization:'Bearer '+settings.token}:{}),...(options.headers||{})}});const data=await res.json().catch(()=>({error:'Неверный ответ сервера'}));if(!res.ok)throw Object.assign(new Error(data.error||`HTTP ${res.status}`),{status:res.status});return data}
const post=(p,x)=>api(p,{method:'POST',body:JSON.stringify(x)});
async function refresh(){if(!settings.token){show('login');return}try{const d=await api('/api/phone/bootstrap?month='+encodeURIComponent($('month').value));if(d.status==='pending'){show('pending');return}members=d.members;reports=d.reports;group=d.group;person=d.person;show('active');render()}catch(e){if([401,403,410].includes(e.status)){settings.token='';save();show('login');notice('Регистрация недействительна: '+e.message)}else notice(e.message)}}
function render(){const col=new Intl.Collator(['ru','de','en'],{sensitivity:'base'});$('members').innerHTML=members.slice().sort((a,b)=>col.compare(a.lastName,b.lastName)||col.compare(a.firstName,b.firstName)).map(m=>{const r=reports.find(x=>x.memberId===m.id);return `<button class="member" data-id="${esc(m.id)}"><div><span class="member-name">${esc(m.lastName)} ${esc(m.firstName)}</span><small>${esc(r?.category||m.category||'Категория не выбрана')}</small></div><span class="status ${r?'done':''}">${r?'Сохранено':'Нет отчёта'}</span><span class="chev">›</span></button>`}).join('')||'<div class="empty">В группе пока нет участников.</div>'}
const options=(from,to,selected)=>Array.from({length:to-from+1},(_,i)=>`<option value="${i+from}" ${(i+from)===Number(selected)?'selected':''}>${i+from}</option>`).join('');
function edit(m){const r=reports.find(x=>x.memberId===m.id)||{},category=r.category||m.category||'APV';$('formTitle').textContent=m.lastName+' '+m.firstName;$('formBody').innerHTML=`<form id="reportForm"><label>Месяц<input name="month" type="month" value="${esc($('month').value)}" required></label><label>Категория<select name="category">${['APV','HPV','V','UV'].map(x=>`<option ${x===category?'selected':''}>${x}</option>`).join('')}</select></label><div class="row"><label id="hoursField">Часы<select name="hours">${options(0,999,r.hours??0)}</select></label><label id="answerField" hidden>Ответ<select name="answer"><option value="" selected disabled>Выбрать</option><option value="yes" ${r.answer==='yes'?'selected':''}>Да / Ja</option><option value="no" ${r.answer==='no'?'selected':''}>Нет / Nein</option></select></label><label>Изучение<select name="studies">${options(0,10,r.studies??0)}</select></label></div><p class="hint" id="modeHint"></p><label>Примечание<textarea name="note" maxlength="3000" placeholder="Заметка для секретаря">${esc(r.note||'')}</textarea></label><div id="error" class="error" hidden></div><button class="primary" type="submit">Сохранить отчёт</button></form>`;$('overlay').hidden=false;const f=$('reportForm');function mode(){let h=['APV','HPV'].includes(f.elements.category.value);$('hoursField').hidden=!h;$('answerField').hidden=h;$('modeHint').textContent=h?'APV / HPV: количество часов от 0 до 999.':'V / UV: только ответ «Да / Ja» или «Нет / Nein».'}f.elements.category.onchange=mode;mode();f.onsubmit=async e=>{e.preventDefault();const elems=f.elements;const data={memberId:m.id,month:elems.month.value,category:elems.category.value,hours:Number(elems.hours.value),answer:elems.answer.value,studies:Number(elems.studies.value),note:elems.note.value};try{await post('/api/phone/report',data);$('overlay').hidden=true;$('month').value=data.month;await refresh();notice('Отчёт сохранён')}catch(ex){$('error').hidden=false;$('error').textContent=ex.message}}}
const digits=Array.from(document.querySelectorAll('.code-digit'));
const joinedCode=$('joinedCode');
const setDigits=(text,start=0)=>{
 const numbers=String(text||'').replace(/\D/g,'');
 if(!numbers)return;
 for(let i=0;i<numbers.length && start+i<4;i++)digits[start+i].value=numbers[i];
 joinedCode.value=digits.map(x=>x.value).join('');
 digits[Math.min(start+numbers.length,3)].focus();
};
digits.forEach((field,i)=>{
 field.addEventListener('input',()=>{
   const value=field.value.replace(/\D/g,'');
   field.value='';
   setDigits(value,i);
   if(!value)joinedCode.value=digits.map(x=>x.value).join('');
 });
 field.addEventListener('paste',e=>{
   const clip=e.clipboardData?.getData('text')||'';
   if(/\d/.test(clip)){e.preventDefault();setDigits(clip,i)}
 });
 field.addEventListener('keydown',e=>{
   if(e.key==='Backspace'){
     if(field.value){field.value=''}
     else if(i>0){digits[i-1].value='';digits[i-1].focus()}
     joinedCode.value=digits.map(x=>x.value).join('');
     e.preventDefault();
   }else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();digits[i-1].focus()}
   else if(e.key==='ArrowRight'&&i<3){e.preventDefault();digits[i+1].focus()}
 });
 field.addEventListener('focus',()=>field.select());
});

$('loginForm').onsubmit=async e=>{e.preventDefault();try{const code=digits.map(x=>x.value).join('');if(!/^\d{4}$/.test(code)){notice('Введите все четыре цифры кода');digits.find(x=>!x.value)?.focus();return}const a=await post('/api/phone/register',{code});settings.token=a.token;save();$('pendingText').textContent=`${a.name}. Заявка отправлена секретарю. После подтверждения список участников откроется автоматически.`;show('pending')}catch(ex){notice(ex.message)}};$('check').onclick=refresh;$('month').onchange=refresh;$('members').onclick=e=>{const b=e.target.closest('[data-id]');if(b){const m=members.find(x=>x.id===b.dataset.id);if(m)edit(m)}};$('close').onclick=()=>{$('overlay').hidden=true};$('overlay').onclick=e=>{if(e.target===$('overlay'))$('overlay').hidden=true};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});if(settings.token)refresh();else show('login');setInterval(()=>{if(settings.token&&!document.hidden&&$('overlay').hidden)refresh()},30000);
