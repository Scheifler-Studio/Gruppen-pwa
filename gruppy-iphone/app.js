"use strict";
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const KEY='gruppen-duo-iphone';let settings=JSON.parse(localStorage.getItem(KEY)||'{}'),members=[],reports=[],order=[],group='',person='',myRole='';
let reorderMode=false,requesting=false,refreshing=false,pendingTimer=null,reminderTimer=null;const OUTBOX_KEY='gruppen-iphone-report-outbox-v20';let outbox=[];try{outbox=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');if(!Array.isArray(outbox))outbox=[]}catch{outbox=[]}let sendingOutbox=false;const REPORT_ERRORS_KEY='gruppen-iphone-report-errors-v34';let reportErrors={};try{reportErrors=JSON.parse(localStorage.getItem(REPORT_ERRORS_KEY)||'{}')||{}}catch{reportErrors={}};const SNAPSHOT_KEY='gruppen-iphone-bootstrap-cache-v31';let lastSendErrorAt=0;
// Contact edits are optimistic and stored separately from the existing report outbox.
// Multiple members may be edited while an earlier change is awaiting a server response.
const CONTACT_OUTBOX_KEY='gruppen-iphone-contacts-outbox-v33';
let contactOutbox=[];try{contactOutbox=JSON.parse(localStorage.getItem(CONTACT_OUTBOX_KEY)||'[]');if(!Array.isArray(contactOutbox))contactOutbox=[]}catch{contactOutbox=[]}
let sendingContacts=false,contactSendFailedAt=0;const contactSuccess=new Map(),contactErrors=new Map();
function saveContacts(){localStorage.setItem(CONTACT_OUTBOX_KEY,JSON.stringify(contactOutbox))}
function contactPending(id){return contactOutbox.some(x=>x.memberId===id)}
function showContactStatus(id){
 const safe=esc(id),pending=contactPending(id);
 if(pending)return `<span class="contact-sync is-sending" role="status" aria-label="Изменения отправляются" title="Изменения ожидают отправки"><span class="contact-spinner"></span></span>`;
 if(contactErrors.has(id))return `<button type="button" class="contact-sync is-error" data-retry-contact="${safe}" title="Ошибка сохранения. Нажмите для повтора" aria-label="Ошибка отправки. Повторить">!</button>`;
 if(contactSuccess.has(id))return `<span class="contact-sync is-success" aria-label="Данные сохранены" title="Сохранено">✓</span>`;
 return '';
}
function applyPendingContacts(){
 for(const entry of contactOutbox){
  let member=members.find(m=>m.id===entry.memberId);
  if(!member&&entry.action==='phoneAddMember'){member={id:entry.memberId,groupId:group||'',role:'',category:entry.data.category||'V'};members.push(member)}
  if(member)Object.assign(member,entry.data,{id:entry.memberId});
 }
}
function cacheSnapshot(){try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({token:settings.token,members,reports,order,group,person,myRole,month:$('month').value}))}catch{}}
function permanentContactError(err){return /недействител|отозван|не найден|не подтвержден|нет прав|доступ запрещ|некоррект|укажи фамилию|нужны имя|превышен предел|invalid|permission|registration|auth/i.test(String(err?.message||''))}
async function flushContactOutbox(){
 if(sendingContacts||!settings.token||!contactOutbox.length||!navigator.onLine)return;
 sendingContacts=true;
 try{
  while(contactOutbox.length){
   const entry=contactOutbox[0];
   try{
    const result=await phoneCall(entry.action,entry.data);
    contactOutbox.shift();saveContacts();contactSendFailedAt=0;
    if(entry.action==='phoneAddMember'&&result?.memberId){
     const member=members.find(m=>m.id===entry.memberId);if(member)member.id=result.memberId;
     // Another edit could have been queued for the newly added participant.
     for(const pending of contactOutbox){if(pending.memberId===entry.memberId){pending.memberId=result.memberId;pending.data.memberId=result.memberId}}
     saveContacts();
    }
    const id=entry.action==='phoneAddMember'?(result?.memberId||entry.memberId):entry.memberId;
    if(!contactPending(id)){
     contactErrors.delete(id);contactSuccess.set(id,Date.now());
     setTimeout(()=>{if(contactSuccess.get(id)&&Date.now()-contactSuccess.get(id)>=4800){contactSuccess.delete(id);render()}},5100);
    }
    cacheSnapshot();render();
    // Fetch server data only after queue drains to avoid replacing unsent local edits.
   }catch(err){
    if(permanentContactError(err)){
     contactOutbox.shift();saveContacts();
     contactErrors.set(entry.memberId,err.message||'Сервер отклонил изменение');
     if(entry.action==='phoneAddMember')members=members.filter(x=>x.id!==entry.memberId);
     else if(entry.before){const member=members.find(x=>x.id===entry.memberId);if(member&&!contactPending(entry.memberId))Object.assign(member,entry.before)}
     applyPendingContacts();cacheSnapshot();render();
     notice('Изменения не приняты сервером: '+(err.message||'Ошибка')+'. Проверьте данные.');
     continue;
    }
    contactSendFailedAt=Date.now();render();
    notice('Нет связи с сервером. Изменения сохранены на телефоне и будут отправлены повторно.');
    break;
   }
  }
 }finally{sendingContacts=false}
}
const serviceTypes=['APV','HPV','HPV-30','HPV-60','HPV-90','V','UV'];
const months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function prevMonth(){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
$('month').value=prevMonth();
const show=id=>{for(const x of ['login','pending','active'])$(x).hidden=x!==id;const el=document.querySelector('.screen');el.classList.remove('login-mode','pending-mode','active-mode');el.classList.add(id+'-mode')};
let noticeTimer=null;
function notice(s){$('notice').textContent=s;$('notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').hidden=true,4500)}
function save(){localStorage.setItem(KEY,JSON.stringify(settings))}
let bridgeInitialized=false;
function connectBridge(){if(!bridgeInitialized){GoogleBridge.connect(APP_SCRIPT_URL);bridgeInitialized=true}}
function phoneCall(action,payload={}){connectBridge();return GoogleBridge.call(action,payload,settings.token||'')}
const maxMonth=()=>prevMonth();
const monthText=m=>{const a=/^(\d{4})-(\d{2})$/.exec(m||'');return a?`${a[1]} · ${months[Number(a[2])-1]}`:'—'};
function statusFor(m){const queued=outbox.find(x=>x.data.memberId===m.id&&x.data.month===$('month').value);if(queued)return {cls:'pending',glyph:'',label:reportErrors[reportKey(queued.data)]?'Ошибка отправки отчёта: '+reportErrors[reportKey(queued.data)]:'Отчёт на телефоне, ожидает подтверждения сервера'};const report=reports.find(x=>x.memberId===m.id);if(report)return {cls:'done',glyph:'✓',label:'Отчёт сохранён'};const now=new Date();const day=now.getDate();const isLatest=$('month').value===prevMonth();if(isLatest&&day>15)return {cls:'late',glyph:'−',label:'Отчёт просрочен'};if(isLatest&&day>10)return {cls:'warn',glyph:'−',label:'Отчёт ожидается'};return {cls:'empty',glyph:'',label:'Нет отчёта'}}
function updateCalendarIcon(){const now=new Date(),abbr=['ЯНВ','ФЕВ','МАР','АПР','МАЙ','ИЮН','ИЮЛ','АВГ','СЕН','ОКТ','НОЯ','ДЕК'];$('todayMonth').textContent=abbr[now.getMonth()];$('todayDay').textContent=String(now.getDate())}
function updatePeriod(){const m=$('month').value;$('periodLabel').innerHTML='<span class="period-year">'+esc(m.slice(0,4))+'</span><span class="period-month">'+esc(months[Number(m.slice(5))-1]||'')+'</span>';updateCalendarIcon();renderMonthChoices()}
function renderMonthChoices(){const active=prevMonth(),lastYear=Math.max(2026,Number(active.slice(0,4)));let html='';for(let year=2026;year<=lastYear;year++){html+=`<div class="month-year">${year}</div><div class="month-grid">`;for(let i=0;i<12;i++){const key=`${year}-${String(i+1).padStart(2,'0')}`,available=key===active;html+=`<button type="button" data-period="${key}" ${available?'':'disabled'} class="${available?'current':''}" aria-label="${months[i]} ${year}${available?'':' — недоступно'}">${months[i]}</button>`}html+='</div>'} $('monthChoices').innerHTML=html}
function render(){
 updatePeriod();$('groupName').textContent=group;
 const collator=new Intl.Collator(['ru','de','en'],{sensitivity:'base'});
 // The secretary's manual order remains the tie-breaker. Unsubmitted reports are always first.
 const stateById=new Map(members.map(m=>[m.id,statusFor(m)]));
 const all=members.slice().sort((a,b)=>{
  const aDone=stateById.get(a.id).cls==='done',bDone=stateById.get(b.id).cls==='done';
  if(aDone!==bDone)return aDone?1:-1;
  const ai=order.indexOf(a.id),bi=order.indexOf(b.id);
  if(ai>=0&&bi>=0)return ai-bi;
  if(ai>=0)return -1;if(bi>=0)return 1;
  return collator.compare(a.lastName||'',b.lastName||'')||collator.compare(a.firstName||'',b.firstName||'');
 });
 const day=new Date().getDate();
 $('members').innerHTML=all.map((m,i)=>{
  const state=stateById.get(m.id),role=m.role==='leader'?'leader':m.role==='assistant'?'assistant':'';
  const rowTone=(state.cls==='done'||state.cls==='pending')?'reported':day<=10?'waiting':'overdue';
  const suffix='';
  return `<div class="member-row ${rowTone}" data-member="${esc(m.id)}" title="${esc(state.label+suffix)}"><div class="member-details"><span class="member-names"><span class="member-name ${role}">${esc(m.lastName)} ${esc(m.firstName)}</span></span>${showContactStatus(m.id)}${reportSyncIndicator(m)}<button type="button" class="member-action" data-edit="${esc(m.id)}" aria-label="Внести отчёт: ${esc(m.lastName)} ${esc(m.firstName)}"><span aria-hidden="true">•••</span></button></div>${reorderMode?`<div class="order-buttons"><button data-up="${esc(m.id)}" ${i===0?'disabled':''} aria-label="Выше">↑</button><button data-down="${esc(m.id)}" ${i===all.length-1?'disabled':''} aria-label="Ниже">↓</button></div>`:''}</div>`;
 }).join('')||'<div class="empty">В группе пока нет участников.</div>';
}

async function refresh(){if(!settings.token){show('login');return}if(refreshing)return;refreshing=true;try{
 const d=await phoneCall('phoneBootstrap',{month:$('month').value});
 if(d.status==='pending'){show('pending');$('pendingText').textContent='Ваш код отправлен. В ближайшее время заявка будет рассмотрена.';return}
 if(d.status==='rejected'){settings.token='';save();show('login');notice('Регистрация отклонена. Обратитесь к секретарю.');return}
 if(d.status!=='approved')throw Error('Нет подтверждения регистрации');
 members=Array.isArray(d.members)?d.members:[];applyPendingContacts();reports=Array.isArray(d.reports)?d.reports:[];order=Array.isArray(d.order)?d.order:[];group=d.group||'';person=d.person||'';myRole=d.role||'';try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({token:settings.token,members,reports,order,group,person,myRole,month:$('month').value}))}catch(e){console.warn('Кэш недоступен',e)}show('active');render();showMonthlyReminder();flushContactOutbox();flushOutbox();flushReminderAcks();decemberReminder();
 }catch(e){if(/недействител|отозван|не найден|отклонен|отклонён|Регистрация удалена/i.test(e.message)){settings.token='';save();show('login');notice(e.message)}else {if(members.length||!$('active').hidden){show('active');render();notice('Нет интернета. Данные доступны, отчёты будут отправлены при подключении.')}else notice('Нет связи с Google Drive: '+e.message)}}finally{refreshing=false}}
function showMonthlyReminder(){const now=new Date(),monthKey=`${now.getFullYear()}-${now.getMonth()+1}`;if(now.getDate()!==1||now.getHours()<10)return;
 if(localStorage.getItem('gruppen-month-reminder')===monthKey)return;
 localStorage.setItem('gruppen-month-reminder',monthKey);$('monthReminder').hidden=false;
 setTimeout(()=>$('monthReminder').hidden=true,15000);
 // Notification only while the PWA is executing. Closed-app push requires a push service.
 if('Notification'in window&&Notification.permission==='granted'&&document.visibilityState==='visible')try{new Notification('Группы',{body:'Наступило время собирать отчёты',icon:'icon-192.png'})}catch{} }
const options=(from,to,value)=>Array.from({length:to-from+1},(_,i)=>`<option value="${i+from}" ${Number(value)===i+from?'selected':''}>${i+from}</option>`).join('');
function openSheet(title,html){$('formTitle').textContent=title;$('formBody').innerHTML=html;$('overlay').hidden=false}
function closeSheet(){$('overlay').hidden=true;$('formBody').innerHTML=''}
function saveOutbox(){localStorage.setItem(OUTBOX_KEY,JSON.stringify(outbox))}
function saveReportErrors(){localStorage.setItem(REPORT_ERRORS_KEY,JSON.stringify(reportErrors))}
function reportKey(data){return String(data.memberId)+'|'+String(data.month)}
function reportSyncIndicator(m){
 const entry=outbox.find(x=>x.data.memberId===m.id&&x.data.month===$('month').value);
 if(entry){const error=reportErrors[reportKey(entry.data)];return `<span class="report-sync ${error?'is-error':'is-sending'}" role="status" title="${esc(error||'Отчёт ждёт подтверждения сервера')}">${error?'!':'<span class="report-spinner"></span>'}</span>`}
 const stamp=reportSuccess.get(m.id);
 if(stamp&&Date.now()-stamp<5000)return '<span class="report-sync is-success" role="status" title="Отчёт подтверждён сервером">✓</span>';
 return '';
}
const reportSuccess=new Map();

function rejectedReportError(err){
 return /недействительн|отозван|не найден участник|участник удалён|неверн|недопустим|нет прав|доступ запрещ|выбери|регистрация|изучения|часы|validation|invalid|неизвестная операция/i.test(String(err?.message||''));
}
async function flushOutbox(){
 if(sendingOutbox||!settings.token||!outbox.length||!navigator.onLine)return;
 sendingOutbox=true;
 try{
  for(const entry of [...outbox]){
   if(!outbox.some(x=>x.id===entry.id))continue;
   const key=reportKey(entry.data);
   // A server validation error is not a network issue. Keep data until corrected.
   if(reportErrors[key])continue;
   try{
    const result=await phoneCall('phoneReport',entry.data);
    if(!result||result.ok!==true)throw Error('Сервер не подтвердил сохранение отчёта');
    outbox=outbox.filter(x=>x.id!==entry.id);
    saveOutbox();delete reportErrors[key];saveReportErrors();lastSendErrorAt=0;
    if(entry.data.month===$('month').value&&!outbox.some(x=>x.data.memberId===entry.data.memberId&&x.data.month===entry.data.month)){
     reports=reports.filter(r=>r.memberId!==entry.data.memberId);
     reports.push({...entry.data,updatedAt:new Date().toISOString()});
     try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({token:settings.token,members,reports,order,group,person,myRole,month:$('month').value}))}catch{}
    }
    reportSuccess.set(entry.data.memberId,Date.now());render();
    setTimeout(()=>{if(Date.now()-(reportSuccess.get(entry.data.memberId)||0)>=4900){reportSuccess.delete(entry.data.memberId);render()}},5100);
   }catch(err){
    const msg=String(err?.message||'Неизвестная ошибка');
    if(rejectedReportError(err)){
     reportErrors[key]=msg;saveReportErrors();entry.failed=true;saveOutbox();render();
     notice('Отчёт не принят сервером: '+msg+'. Откройте отчёт участника и исправьте данные.');
     continue;
    }
    entry.failed=true;saveOutbox();lastSendErrorAt=Date.now();render();
    notice('Не удалось отправить отчёт: '+msg+'. Отчёт остался на телефоне, повторим отправку позже.');
    break;
   }
  }
 }finally{sendingOutbox=false}
}
function loadOfflineSnapshot(){
 if(!settings.token)return false;
 try{
  const d=JSON.parse(localStorage.getItem(SNAPSHOT_KEY)||'null');
  if(!d||d.token!==settings.token||!Array.isArray(d.members))return false;
  members=d.members;reports=Array.isArray(d.reports)?d.reports:[];
  order=Array.isArray(d.order)?d.order:[];group=d.group||'';person=d.person||'';myRole=d.myRole||'';
  applyPendingContacts();show('active');render();decemberReminder();return true;
 }catch{return false}
}

function editReport(m){if($('month').value!==prevMonth()){$('month').value=prevMonth();render()}const r=outbox.find(x=>x.data.memberId===m.id&&x.data.month===$('month').value)?.data||reports.find(x=>x.memberId===m.id)||{},category=r.category||m.effectiveCategory||m.category||'APV';openSheet(m.lastName+' '+m.firstName,`<form id="reportForm"><div class="report-period">${esc(monthText($('month').value))}</div><div class="report-inline-fields"><label class="report-service-field">Вид служения<select name="category">${serviceTypes.map(x=>`<option ${x===category?'selected':''}>${x}</option>`).join('')}</select></label><div class="report-value-field"><label id="hoursField">Часы<select name="hours">${options(0,999,r.hours??0)}</select></label><label id="answerField" hidden>Ответ<select name="answer" class="answer-select"><option value="" ${!r.answer?'selected':''} disabled>Выбрать</option><option value="yes" ${r.answer==='yes'?'selected':''}>Да</option><option value="no" ${r.answer==='no'?'selected':''}>Нет</option></select></label></div><label class="report-studies-field">Изучения<select name="studies">${options(0,10,r.studies??0)}</select></label></div><label>Примечание<textarea name="note" maxlength="3000" placeholder="Заметка">${esc(r.note||'')}</textarea></label><div id="error" class="error" hidden></div><button class="primary" type="submit">Сохранить</button></form>`);
 const form=$('reportForm');function mode(){const hours=['APV','HPV','HPV-30','HPV-60','HPV-90'].includes(form.elements.category.value);$('hoursField').hidden=!hours;$('answerField').hidden=hours}form.elements.category.onchange=mode;mode();
 const answerSelect=form.elements.answer;
 function updateAnswerPlaceholder(){answerSelect.classList.toggle('answer-placeholder',!answerSelect.value)}
 answerSelect.addEventListener('change',updateAnswerPlaceholder);updateAnswerPlaceholder();
 form.onsubmit=e=>{e.preventDefault();const f=e.currentTarget,submit=f.querySelector('button[type=submit]');if(submit.disabled)return;submit.disabled=true;const data={memberId:m.id,month:$('month').value,category:f.elements.category.value,hours:Number(f.elements.hours.value),answer:f.elements.answer.value,studies:Number(f.elements.studies.value),note:f.elements.note.value};if(['V','UV'].includes(data.category)&&!['yes','no'].includes(data.answer)){submit.disabled=false;$('error').textContent='Для V и UV необходимо выбрать «Да» или «Нет»';$('error').hidden=false;return}delete reportErrors[reportKey(data)];saveReportErrors();outbox=outbox.filter(x=>!(x.data.memberId===data.memberId&&x.data.month===data.month));outbox.push({id:String(Date.now())+'-'+Math.random().toString(36).slice(2),data,failed:false});saveOutbox();closeSheet();render();notice(navigator.onLine?'Сохранено на телефоне. Отправляем в Google Drive…':'Сохранено на телефоне. Отправим при появлении интернета.');if(navigator.onLine)flushOutbox()}}
const contactFields=['firstName','lastName'];
function memberFormHtml(m){
 const val=k=>esc(m?.[k]||'');
 return `<form id="contactForm" class="contact-form"><div class="contact-name-row"><label>Имя<input required name="firstName" maxlength="120" value="${val('firstName')}"></label><label>Фамилия<input required name="lastName" maxlength="120" value="${val('lastName')}"></label></div>${!m?`<label>Вид служения<select name="category"><option value="">Выбрать</option>${serviceTypes.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label>`:''}<p class="hint">Группа ${esc(group)}. Назначения изменяет секретарь.</p><div id="error" class="error" hidden></div><button class="primary" type="submit">Сохранить</button></form>`;
}
function editMemberContact(m=null){$('groupSettings').hidden=true;openSheet(m?'Редактировать участника':'Новый участник',memberFormHtml(m));
 $('contactForm').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,btn=f.querySelector('[type=submit]');if(btn.disabled)return;const data={};for(const k of contactFields)data[k]=f.elements[k].value.trim();if(!m)data.category=f.elements.category.value;
 if(!data.firstName||!data.lastName){$('error').hidden=false;$('error').textContent='Укажи фамилию и имя';return}
 if(!m&&!serviceTypes.includes(data.category)){$('error').hidden=false;$('error').textContent='Выбери вид служения';return}
 const id=m?.id||'local-'+Date.now()+'-'+Math.random().toString(36).slice(2),before=m?Object.fromEntries(contactFields.map(k=>[k,m[k]||''])):null;
 if(m)data.memberId=id;
 const entry={id:'edit-'+Date.now()+'-'+Math.random().toString(36).slice(2),memberId:id,action:m?'phoneUpdateMember':'phoneAddMember',data,before};
 // When a new member is still local, update its queued creation instead of sending an invalid temporary member ID.
 const create=contactOutbox.find(x=>x.memberId===id&&x.action==='phoneAddMember');
 if(create){Object.assign(create.data,data);delete create.data.memberId}else contactOutbox.push(entry);
 try{saveContacts()}catch(err){$('error').hidden=false;$('error').textContent='Не удалось сохранить на телефоне. Освободи место и повтори.';return}
 if(m)Object.assign(m,data);else members.push({...data,id,groupId:group,role:''});
 contactErrors.delete(id);contactSuccess.delete(id);cacheSnapshot();closeSheet();render();
 notice(navigator.onLine?'Изменения сохранены на телефоне. Отправляются…':'Изменения сохранены на телефоне. Отправим при появлении интернета.');
 if(navigator.onLine)flushContactOutbox();
 }
}
function addMember(){editMemberContact()}
function viewMember(m){const fields=[['Имя',m.firstName],['Фамилия',m.lastName],['Вид служения',m.category]];
 openSheet('Информация об участнике',`<div class="contact-view">${fields.map(([label,value])=>`<div><span>${esc(label)}</span><strong>${esc(value||'—')}</strong></div>`).join('')}</div><div class="contact-actions"><button type="button" id="contactClose">Закрыть</button><button type="button" id="contactEdit" class="primary">Изменить</button></div>`);
 $('contactClose').onclick=closeSheet;$('contactEdit').onclick=()=>editMemberContact(m);
}
function chooseMember(mode){$('groupSettings').hidden=true;openSheet(mode==='view'?'Информация об участниках':'Редактировать',`<div class="contact-choices">${members.slice().sort((a,b)=>String(a.lastName||'').localeCompare(String(b.lastName||''),'ru')).map(m=>`<button type="button" data-contact-id="${esc(m.id)}">${esc(m.lastName)} ${esc(m.firstName)}</button>`).join('')}</div>`);
 $('formBody').onclick=e=>{const b=e.target.closest('[data-contact-id]');if(!b)return;const m=members.find(x=>x.id===b.dataset.contactId);if(m)(mode==='view'?viewMember(m):editMemberContact(m))};
}

async function removeMember(m){if(m.role){notice('Удалять ответственного и помощника может только секретарь');return}if(!confirm('Удалить участника '+m.lastName+' '+m.firstName+' из списка? Его JSON останется на Google Drive.'))return;try{await phoneCall('phoneRemoveMember',{memberId:m.id});await refresh();notice('Участник скрыт из группы')}catch(e){notice(e.message)}}

const DECEMBER_ACK_KEY='gruppen-december-ack-v32';let reminderAcks=[];try{reminderAcks=JSON.parse(localStorage.getItem(DECEMBER_ACK_KEY)||'[]')}catch{reminderAcks=[]}
function saveReminderAcks(){localStorage.setItem(DECEMBER_ACK_KEY,JSON.stringify(reminderAcks))}
let decemberShownKey='';
function decemberDate(){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Object.fromEntries(parts.map(p=>[p.type,p.value]))}
function decemberReminder(){if(!settings.token||myRole!=='leader'||$('active').hidden||!$('overlay').hidden)return;const d=decemberDate(),year=Number(d.year),day=Number(d.day);
 if(Number(d.month)!==12||![15,22].includes(day)||Number(d.hour)<10)return;
 const id=`${year}-${day}-${settings.token}`;if(reminderAcks.some(x=>x.id===id)||decemberShownKey===id)return;
 decemberShownKey=id;const msg=day===15?'Наступило время проверить верность контактных данных возвещателей вашей группы! Пожалуйста, сделайте проверку в течение 14 дней.':'Время проверить верность контактных данных возвещателей вашей группы подходит к концу! У вас осталась ещё неделя. Пожалуйста, сделайте проверку в течение 7 дней.';
 openSheet('Напоминание',`<div class="reminder-brand"><img src="icon-192.png" alt=""> <strong>Группы</strong></div><p>${esc(msg)}</p><p class="hint">${day} декабря ${year}</p><button id="reminderRead" class="primary">Прочитано</button>`);
 $('reminderRead').onclick=()=>{reminderAcks.push({id,year,day,confirmed:false});saveReminderAcks();closeSheet();flushReminderAcks()};
}
async function flushReminderAcks(){if(!settings.token||!navigator.onLine)return;for(const r of [...reminderAcks]){if(r.confirmed)continue;try{await phoneCall('phoneReminderAck',{year:r.year,day:r.day});r.confirmed=true;saveReminderAcks()}catch(e){console.warn('Подтверждение прочтения ожидает сервера',e);break}}}

const digits=Array.from(document.querySelectorAll('.code-digit')),joinedCode=$('joinedCode');
function setDigits(text,start=0){const numbers=String(text||'').replace(/\D/g,'');if(!numbers)return;for(let i=0;i<numbers.length&&start+i<4;i++)digits[start+i].value=numbers[i];joinedCode.value=digits.map(x=>x.value).join('');digits[Math.min(start+numbers.length,3)].focus()}
digits.forEach((field,i)=>{field.addEventListener('input',()=>{const v=field.value.replace(/\D/g,'');field.value='';setDigits(v,i);if(!v)joinedCode.value=digits.map(x=>x.value).join('')});field.addEventListener('paste',e=>{const v=e.clipboardData?.getData('text')||'';if(/\d/.test(v)){e.preventDefault();setDigits(v,i)}});field.addEventListener('keydown',e=>{if(e.key==='Backspace'){if(field.value)field.value='';else if(i>0){digits[i-1].value='';digits[i-1].focus()}joinedCode.value=digits.map(x=>x.value).join('');e.preventDefault()}else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();digits[i-1].focus()}else if(e.key==='ArrowRight'&&i<3){e.preventDefault();digits[i+1].focus()}});field.addEventListener('focus',()=>field.select())});
$('loginForm').onsubmit=async e=>{e.preventDefault();if(requesting)return;const code=digits.map(x=>x.value).join('');if(!/^\d{4}$/.test(code)){notice('Введите все четыре цифры кода');digits.find(x=>!x.value)?.focus();return}requesting=true;const btn=$('loginForm').querySelector('button');btn.disabled=true;show('pending');$('pendingText').textContent='Отправляем ваш код…';try{const a=await phoneCall('phoneRegister',{code});settings.token=a.token;save();$('pendingText').textContent='Ваш код отправлен. В ближайшее время заявка будет рассмотрена.';refresh()}catch(ex){show('login');notice(ex.message)}finally{requesting=false;btn.disabled=false}};
$('check').onclick=refresh;$('calendarToggle').onclick=()=>{$('monthPanel').hidden=!$('monthPanel').hidden;$('groupSettings').hidden=true};
$('monthChoices').onclick=e=>{const b=e.target.closest('[data-period]');if(!b||b.disabled||b.dataset.period!==prevMonth())return;$('month').value=b.dataset.period;$('monthPanel').hidden=true;refresh()};
$('gear').onclick=()=>{$('groupSettings').hidden=!$('groupSettings').hidden;$('monthPanel').hidden=true};
$('addMember').onclick=addMember;
$('editContacts').onclick=()=>chooseMember('edit');$('viewContacts').onclick=()=>chooseMember('view');$('reorderToggle').onclick=()=>{reorderMode=!reorderMode;$('reorderToggle').textContent=reorderMode?'Завершить изменение порядка':'Изменить порядок участников';$('groupSettings').hidden=true;render()};
$('aboutApp').onclick=()=>{$('groupSettings').hidden=true;openSheet('О программе',`<div class="about-app"><strong>Группы</strong><p>Установленная версия: <b>${esc(APP_VERSION)}</b></p><p id="updateStatus">Проверка обновлений ещё не выполнялась</p><button class="secondary-action" id="checkUpdate" type="button">Проверить обновление</button><button class="primary" id="installUpdate" type="button" hidden>Обновить программу</button></div>`);$('checkUpdate').onclick=()=>checkAppUpdate(true);$('installUpdate').onclick=installAppUpdate;checkAppUpdate(false)};
let newAvailableVersion='';
async function checkAppUpdate(interactive=false){
 const status=$('updateStatus'),button=$('installUpdate');
 if(status)status.textContent='Проверяем новую версию…';
 try{
  const url=new URL('version.json',location.href);url.searchParams.set('t',String(Date.now()));
  const res=await fetch(url.href,{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);
  const manifest=await res.json();const next=String(manifest.version||'');if(!/^\d+(?:\.\d+)*$/.test(next))throw Error('Некорректный номер версии');
  newAvailableVersion=next.split('.').map(Number).reduce((v,n)=>v*1000+n,0)>APP_VERSION.split('.').map(Number).reduce((v,n)=>v*1000+n,0)?next:'';
  if(status)status.textContent=newAvailableVersion?'Доступна новая версия: '+newAvailableVersion:'Установлена актуальная версия '+APP_VERSION;
  if(button)button.hidden=!newAvailableVersion;
 }catch(err){if(status)status.textContent='Не удалось проверить обновления: '+err.message;else if(interactive)notice('Не удалось проверить обновление: '+err.message)}
}
async function installAppUpdate(){
 const status=$('updateStatus');if(status)status.textContent='Загружаем обновление…';
 try{
  if('serviceWorker'in navigator){const reg=await navigator.serviceWorker.getRegistration();if(reg){await reg.update();await navigator.serviceWorker.ready}}
  // Delete only this application's asset cache. Never clear localStorage, tokens or report queues.
  if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('gruppen-iphone-')).map(k=>caches.delete(k)))}
  location.replace(location.pathname+"?updated="+Date.now());
 }catch(e){if(status)status.textContent='Не получилось применить обновление: '+e.message}
}

$('groupInfo').onclick=()=>{$('groupSettings').hidden=true;openSheet('Информация о группе',`<div class="about-app"><p><strong>Группа ${esc(group||'—')}</strong></p><p>Количество участников: <strong>${members.length}</strong></p></div>`)};
$('notifyToggle').onclick=()=>{if(!('Notification'in window)){notice('Уведомления не поддерживаются в этом браузере');return}Notification.requestPermission().then(p=>notice(p==='granted'?'Уведомления разрешены':'Уведомления не разрешены'))};
let touchStart=null;
$('members').addEventListener('touchstart',e=>{const row=e.target.closest('[data-member]');if(row&&e.touches.length===1)touchStart={id:row.dataset.member,x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
$('members').addEventListener('touchend',e=>{if(!touchStart||!e.changedTouches.length)return;const end=e.changedTouches[0],dx=end.clientX-touchStart.x,dy=end.clientY-touchStart.y,id=touchStart.id;touchStart=null;if(dx<-85&&Math.abs(dy)<50){const m=members.find(x=>x.id===id);if(m)removeMember(m)}},{passive:true});
$('members').onclick=async e=>{const retry=e.target.closest('[data-retry-contact]');if(retry){const id=retry.dataset.retryContact;contactErrors.delete(id);render();notice('Откройте участника и повторите сохранение');return}const edit=e.target.closest('[data-edit]'),up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');if(edit&&!reorderMode){const m=members.find(x=>x.id===edit.dataset.edit);if(m)editReport(m);return}if(up||down){const id=up?.dataset.up||down.dataset.down;const sorted=members.slice().sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?9999:ai)-(bi<0?9999:bi)});const index=sorted.findIndex(m=>m.id===id),next=index+(up?-1:1);if(next<0||next>=sorted.length)return;[sorted[index],sorted[next]]=[sorted[next],sorted[index]];const ids=sorted.map(m=>m.id);try{await phoneCall('phoneReorder',{ids});order=ids;render()}catch(ex){notice(ex.message)}}};
$('close').onclick=closeSheet;$('overlay').onclick=e=>{if(e.target===$('overlay'))closeSheet()};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js?v=36',{updateViaCache:'none'}).catch(()=>{});
connectBridge();checkAppUpdate(false);if(settings.token){loadOfflineSnapshot();if(navigator.onLine){flushContactOutbox();refresh()}else notice('Работа без интернета: новые отчёты сохраняются на телефоне.')}else show('login');
let phoneNetworkRecovery=false;
function recoverPhoneConnection(){
 if(phoneNetworkRecovery||!navigator.onLine)return;
 phoneNetworkRecovery=true;
 try{GoogleBridge.reconnect();bridgeInitialized=true}catch(e){console.warn('Подключение ожидает сеть',e)}
 setTimeout(()=>{phoneNetworkRecovery=false;if(settings.token){refresh();flushOutbox();flushContactOutbox();flushReminderAcks()}},1800);
}
window.addEventListener('online',()=>{notice('Соединение восстановлено. Синхронизируем данные…');recoverPhoneConnection()});
setInterval(()=>{if(settings.token&&!document.hidden&&$('overlay').hidden&&navigator.onLine){if(contactOutbox.length&&(!contactSendFailedAt||Date.now()-contactSendFailedAt>60000))flushContactOutbox();if(outbox.length){if(!lastSendErrorAt||Date.now()-lastSendErrorAt>60000)flushOutbox()}else if(!contactOutbox.length)refresh()}},30000);
setInterval(()=>{if(settings.token&&!document.hidden&&!$('active').hidden){showMonthlyReminder();decemberReminder();flushReminderAcks()}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){decemberReminder();flushReminderAcks();checkAppUpdate(false);if(settings.token&&navigator.onLine){refresh();flushOutbox();flushContactOutbox()}}});
