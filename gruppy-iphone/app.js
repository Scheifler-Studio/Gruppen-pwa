"use strict";
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const KEY='gruppen-duo-iphone';let settings=JSON.parse(localStorage.getItem(KEY)||'{}'),members=[],reports=[],order=[],group='',person='',myRole='';
let reorderMode=false,requesting=false,refreshing=false,pendingTimer=null,reminderTimer=null;const OUTBOX_KEY='gruppen-iphone-report-outbox-v20';let outbox=[];try{outbox=JSON.parse(localStorage.getItem(OUTBOX_KEY)||'[]');if(!Array.isArray(outbox))outbox=[]}catch{outbox=[]}let sendingOutbox=false;const SNAPSHOT_KEY='gruppen-iphone-bootstrap-cache-v31';let lastSendErrorAt=0;
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
function statusFor(m){const queued=outbox.find(x=>x.data.memberId===m.id&&x.data.month===$('month').value);if(queued)return {cls:'done',glyph:'✓',label:queued.failed?'Сохранено на телефоне, ожидает повторной отправки':'Сохранено на телефоне, отправляется на сервер'};const report=reports.find(x=>x.memberId===m.id);if(report)return {cls:'done',glyph:'✓',label:'Отчёт сохранён'};const now=new Date();const day=now.getDate();const isLatest=$('month').value===prevMonth();if(isLatest&&day>15)return {cls:'late',glyph:'−',label:'Отчёт просрочен'};if(isLatest&&day>10)return {cls:'warn',glyph:'−',label:'Отчёт ожидается'};return {cls:'empty',glyph:'',label:'Нет отчёта'}}
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
  const rowTone=state.cls==='done'?'reported':day<=10?'waiting':'overdue';
  const suffix='';
  return `<div class="member-row ${rowTone}" data-member="${esc(m.id)}" title="${esc(state.label+suffix)}"><div class="member-details"><span class="member-names"><span class="member-name ${role}">${esc(m.lastName)} ${esc(m.firstName)}</span></span><button type="button" class="member-action" data-edit="${esc(m.id)}" aria-label="Внести отчёт: ${esc(m.lastName)} ${esc(m.firstName)}"><span aria-hidden="true">•••</span></button></div>${reorderMode?`<div class="order-buttons"><button data-up="${esc(m.id)}" ${i===0?'disabled':''} aria-label="Выше">↑</button><button data-down="${esc(m.id)}" ${i===all.length-1?'disabled':''} aria-label="Ниже">↓</button></div>`:''}</div>`;
 }).join('')||'<div class="empty">В группе пока нет участников.</div>';
}

async function refresh(){if(!settings.token){show('login');return}if(refreshing)return;refreshing=true;try{
 const d=await phoneCall('phoneBootstrap',{month:$('month').value});
 if(d.status==='pending'){show('pending');$('pendingText').textContent='Ваш код отправлен. В ближайшее время заявка будет рассмотрена.';return}
 if(d.status==='rejected'){settings.token='';save();show('login');notice('Регистрация отклонена. Обратитесь к секретарю.');return}
 if(d.status!=='approved')throw Error('Нет подтверждения регистрации');
 members=Array.isArray(d.members)?d.members:[];reports=Array.isArray(d.reports)?d.reports:[];order=Array.isArray(d.order)?d.order:[];group=d.group||'';person=d.person||'';myRole=d.role||'';try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({token:settings.token,members,reports,order,group,person,myRole,month:$('month').value}))}catch(e){console.warn('Кэш недоступен',e)}show('active');render();showMonthlyReminder();flushOutbox();
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
function nonRetryableReportError(err){
 // Network failures and iframe timeouts never discard the locally stored report.
 return /недействительн|отозван|не найден участник|участник удалён|неверн(?:ый|ое) (?:месяц|отчёт)|недопустим|нет прав|доступ запрещён|validation|invalid (?:month|member|category)/i.test(String(err?.message||''));
}
async function flushOutbox(){
 if(sendingOutbox||!settings.token||!outbox.length||!navigator.onLine)return;
 sendingOutbox=true;
 try{
  for(const entry of [...outbox]){
   // Skip entries replaced by a newer local edit.
   if(!outbox.some(x=>x.id===entry.id))continue;
   try{
    await phoneCall('phoneReport',entry.data);
    outbox=outbox.filter(x=>x.id!==entry.id);
    saveOutbox();lastSendErrorAt=0;
    if(entry.data.month===$('month').value&&!outbox.some(x=>x.data.memberId===entry.data.memberId&&x.data.month===entry.data.month)){
     reports=reports.filter(r=>r.memberId!==entry.data.memberId);
     reports.push({...entry.data,updatedAt:new Date().toISOString()});
     try{localStorage.setItem(SNAPSHOT_KEY,JSON.stringify({token:settings.token,members,reports,order,group,person,myRole,month:$('month').value}))}catch{}
    }
    render();
   }catch(err){
    if(nonRetryableReportError(err)){
     outbox=outbox.filter(x=>x.id!==entry.id);saveOutbox();
     render();notice('Отчёт не принят сервером: '+err.message+'. Изменение отменено.');
     continue;
    }
    entry.failed=true;saveOutbox();lastSendErrorAt=Date.now();render();
    notice('Нет подтверждения сервера. Отчёт сохранён на телефоне и будет отправлен при подключении.');
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
  show('active');render();return true;
 }catch{return false}
}

function editReport(m){if($('month').value!==prevMonth()){$('month').value=prevMonth();render()}const r=outbox.find(x=>x.data.memberId===m.id&&x.data.month===$('month').value)?.data||reports.find(x=>x.memberId===m.id)||{},category=r.category||m.effectiveCategory||m.category||'APV';openSheet(m.lastName+' '+m.firstName,`<form id="reportForm"><div class="report-period">${esc(monthText($('month').value))}</div><div class="report-inline-fields"><label class="report-service-field">Вид служения<select name="category">${serviceTypes.map(x=>`<option ${x===category?'selected':''}>${x}</option>`).join('')}</select></label><div class="report-value-field"><label id="hoursField">Часы<select name="hours">${options(0,999,r.hours??0)}</select></label><label id="answerField" hidden>Ответ<select name="answer" class="answer-select"><option value="" ${!r.answer?'selected':''} disabled>Выбрать</option><option value="yes" ${r.answer==='yes'?'selected':''}>Да</option><option value="no" ${r.answer==='no'?'selected':''}>Нет</option></select></label></div><label class="report-studies-field">Изучения<select name="studies">${options(0,10,r.studies??0)}</select></label></div><label>Примечание<textarea name="note" maxlength="3000" placeholder="Заметка">${esc(r.note||'')}</textarea></label><div id="error" class="error" hidden></div><button class="primary" type="submit">Сохранить</button></form>`);
 const form=$('reportForm');function mode(){const hours=['APV','HPV','HPV-30','HPV-60','HPV-90'].includes(form.elements.category.value);$('hoursField').hidden=!hours;$('answerField').hidden=hours}form.elements.category.onchange=mode;mode();
 const answerSelect=form.elements.answer;
 function updateAnswerPlaceholder(){answerSelect.classList.toggle('answer-placeholder',!answerSelect.value)}
 answerSelect.addEventListener('change',updateAnswerPlaceholder);updateAnswerPlaceholder();
 form.onsubmit=e=>{e.preventDefault();const f=e.currentTarget,submit=f.querySelector('button[type=submit]');if(submit.disabled)return;submit.disabled=true;const data={memberId:m.id,month:$('month').value,category:f.elements.category.value,hours:Number(f.elements.hours.value),answer:f.elements.answer.value,studies:Number(f.elements.studies.value),note:f.elements.note.value};outbox=outbox.filter(x=>!(x.data.memberId===data.memberId&&x.data.month===data.month));outbox.push({id:String(Date.now())+'-'+Math.random().toString(36).slice(2),data,failed:false});saveOutbox();closeSheet();render();notice(navigator.onLine?'Сохранено на телефоне. Отправляем в Google Drive…':'Сохранено на телефоне. Отправим при появлении интернета.');if(navigator.onLine)flushOutbox()}}
function addMember(){openSheet('Новый участник',`<form id="newMemberForm"><label>Имя<input required name="firstName" maxlength="120"></label><label>Фамилия<input required name="lastName" maxlength="120"></label><label>Адрес<textarea name="address" rows="2"></textarea></label><label>Телефон<input name="phone" type="tel"></label><label>Вид служения<select name="category"><option value="">Выбрать</option>${serviceTypes.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><p class="hint">Группа ${esc(group)} назначается автоматически. Должности назначает только секретарь.</p><div id="error" class="error" hidden></div><button class="primary" type="submit">Добавить участника</button></form>`);$('newMemberForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Сохранение…';try{await phoneCall('phoneAddMember',{firstName:f.elements.firstName.value.trim(),lastName:f.elements.lastName.value.trim(),address:f.elements.address.value.trim(),phone:f.elements.phone.value.trim(),category:f.elements.category.value});closeSheet();await refresh();notice('Участник добавлен')}catch(err){btn.disabled=false;btn.textContent='Добавить участника';$('error').hidden=false;$('error').textContent=err.message}}}
async function removeMember(m){if(m.role){notice('Удалять ответственного и помощника может только секретарь');return}if(!confirm('Удалить участника '+m.lastName+' '+m.firstName+' из списка? Его JSON останется на Google Drive.'))return;try{await phoneCall('phoneRemoveMember',{memberId:m.id});await refresh();notice('Участник скрыт из группы')}catch(e){notice(e.message)}}
const digits=Array.from(document.querySelectorAll('.code-digit')),joinedCode=$('joinedCode');
function setDigits(text,start=0){const numbers=String(text||'').replace(/\D/g,'');if(!numbers)return;for(let i=0;i<numbers.length&&start+i<4;i++)digits[start+i].value=numbers[i];joinedCode.value=digits.map(x=>x.value).join('');digits[Math.min(start+numbers.length,3)].focus()}
digits.forEach((field,i)=>{field.addEventListener('input',()=>{const v=field.value.replace(/\D/g,'');field.value='';setDigits(v,i);if(!v)joinedCode.value=digits.map(x=>x.value).join('')});field.addEventListener('paste',e=>{const v=e.clipboardData?.getData('text')||'';if(/\d/.test(v)){e.preventDefault();setDigits(v,i)}});field.addEventListener('keydown',e=>{if(e.key==='Backspace'){if(field.value)field.value='';else if(i>0){digits[i-1].value='';digits[i-1].focus()}joinedCode.value=digits.map(x=>x.value).join('');e.preventDefault()}else if(e.key==='ArrowLeft'&&i>0){e.preventDefault();digits[i-1].focus()}else if(e.key==='ArrowRight'&&i<3){e.preventDefault();digits[i+1].focus()}});field.addEventListener('focus',()=>field.select())});
$('loginForm').onsubmit=async e=>{e.preventDefault();if(requesting)return;const code=digits.map(x=>x.value).join('');if(!/^\d{4}$/.test(code)){notice('Введите все четыре цифры кода');digits.find(x=>!x.value)?.focus();return}requesting=true;const btn=$('loginForm').querySelector('button');btn.disabled=true;show('pending');$('pendingText').textContent='Отправляем ваш код…';try{const a=await phoneCall('phoneRegister',{code});settings.token=a.token;save();$('pendingText').textContent='Ваш код отправлен. В ближайшее время заявка будет рассмотрена.';refresh()}catch(ex){show('login');notice(ex.message)}finally{requesting=false;btn.disabled=false}};
$('check').onclick=refresh;$('calendarToggle').onclick=()=>{$('monthPanel').hidden=!$('monthPanel').hidden;$('groupSettings').hidden=true};
$('monthChoices').onclick=e=>{const b=e.target.closest('[data-period]');if(!b||b.disabled||b.dataset.period!==prevMonth())return;$('month').value=b.dataset.period;$('monthPanel').hidden=true;refresh()};
$('gear').onclick=()=>{$('groupSettings').hidden=!$('groupSettings').hidden;$('monthPanel').hidden=true};
$('addMember').onclick=addMember;$('reorderToggle').onclick=()=>{reorderMode=!reorderMode;$('reorderToggle').textContent=reorderMode?'Завершить изменение порядка':'Изменить порядок участников';$('groupSettings').hidden=true;render()};
$('aboutApp').onclick=()=>{$('groupSettings').hidden=true;openSheet('О программе',`<div class="about-app"><strong>Группы</strong><p>Версия для iPhone: ${esc(APP_VERSION)}</p><p>Отчёты участников и управление группой</p></div>`)};
$('groupInfo').onclick=()=>{$('groupSettings').hidden=true;openSheet('Информация о группе',`<div class="about-app"><p><strong>Группа ${esc(group||'—')}</strong></p><p>Количество участников: <strong>${members.length}</strong></p></div>`)};
$('notifyToggle').onclick=()=>{if(!('Notification'in window)){notice('Уведомления не поддерживаются в этом браузере');return}Notification.requestPermission().then(p=>notice(p==='granted'?'Уведомления разрешены':'Уведомления не разрешены'))};
let touchStart=null;
$('members').addEventListener('touchstart',e=>{const row=e.target.closest('[data-member]');if(row&&e.touches.length===1)touchStart={id:row.dataset.member,x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true});
$('members').addEventListener('touchend',e=>{if(!touchStart||!e.changedTouches.length)return;const end=e.changedTouches[0],dx=end.clientX-touchStart.x,dy=end.clientY-touchStart.y,id=touchStart.id;touchStart=null;if(dx<-85&&Math.abs(dy)<50){const m=members.find(x=>x.id===id);if(m)removeMember(m)}},{passive:true});
$('members').onclick=async e=>{const edit=e.target.closest('[data-edit]'),up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');if(edit&&!reorderMode){const m=members.find(x=>x.id===edit.dataset.edit);if(m)editReport(m);return}if(up||down){const id=up?.dataset.up||down.dataset.down;const sorted=members.slice().sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?9999:ai)-(bi<0?9999:bi)});const index=sorted.findIndex(m=>m.id===id),next=index+(up?-1:1);if(next<0||next>=sorted.length)return;[sorted[index],sorted[next]]=[sorted[next],sorted[index]];const ids=sorted.map(m=>m.id);try{await phoneCall('phoneReorder',{ids});order=ids;render()}catch(ex){notice(ex.message)}}};
$('close').onclick=closeSheet;$('overlay').onclick=e=>{if(e.target===$('overlay'))closeSheet()};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
connectBridge();if(settings.token){loadOfflineSnapshot();if(navigator.onLine)refresh();else notice('Работа без интернета: новые отчёты сохраняются на телефоне.')}else show('login');
window.addEventListener('online',()=>{notice('Интернет восстановлен. Отправляем сохранённые отчёты…');flushOutbox().then(()=>refresh())});
setInterval(()=>{if(settings.token&&!document.hidden&&$('overlay').hidden&&navigator.onLine){if(outbox.length){if(!lastSendErrorAt||Date.now()-lastSendErrorAt>60000)flushOutbox()}else refresh()}},30000);
setInterval(()=>{if(settings.token&&!document.hidden&&!$('active').hidden)showMonthlyReminder()},60000);
