'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const LS='gruppen-duo-ipad-settings',older='gruppy-v1-cache',sessionKey='gruppen-appsscript-admin';let settings=JSON.parse(localStorage.getItem(LS)||'{}'),groups=[],members=[],reports=[],pending=[],groupEvents=[],selected='all',filter='all',order='az',groupOpen=false,reportOpen=false,expanded=new Set(),popover=null,popoverPosition={top:0,left:0},popoverCloseTimer=null, connected=false, token=localStorage.getItem(sessionKey)||sessionStorage.getItem(sessionKey)||'', localPreview=false,showValues=false;
const prevMonth=()=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
$('reportMonth').value=prevMonth();
const date=s=>{if(!s)return'—';const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:s};
const groupName=id=>groups.find(x=>x.id===id)?.name||'—';
const reportCategory=c=>/^HPV(?:-(30|60|90))?$/.test(c||'')?'HPV':c;
const serviceTypes=['APV','HPV','HPV-30','HPV-60','HPV-90','V','UV'];
const monthText=m=>{const [y,mm]=String(m||'').split('-');return (['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][Number(mm)-1]||m)+' '+y};
const roleTitle=r=>r==='leader'?'Ответственный за группу':r==='assistant'?'Помощник ответственного':'—';
function showToast(t){$('toast').textContent=t;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4000)}
function openModal(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;$('backdrop').hidden=false}function closeModal(){$('backdrop').hidden=true;$('dialogBody').innerHTML=''}
let connectTimer=null;
function showConnectionProgress(){
 const el=$('connectOverlay');$('connectSpinner').hidden=false;$('connectTitle').textContent='Соединение с сервером';$('connectDescription').textContent='Идёт соединение с сервером, подождите…';$('connectError').hidden=true;$('connectDismiss').hidden=true;$('connectElapsed').hidden=false;el.hidden=false;el.classList.remove('success');
 let secs=0;$('connectElapsed').textContent='00:00';clearInterval(connectTimer);connectTimer=setInterval(()=>{secs++;$('connectElapsed').textContent=String(Math.floor(secs/60)).padStart(2,'0')+':'+String(secs%60).padStart(2,'0')},1000);
}
function finishConnectionProgress(error){
 clearInterval(connectTimer);connectTimer=null;
 if(error){$('connectSpinner').hidden=true;$('connectTitle').textContent='Не удалось подключиться';$('connectDescription').textContent='Проверь адрес и доступ к серверу.';$('connectError').textContent=String(error.message||error);$('connectError').hidden=false;$('connectElapsed').hidden=true;$('connectDismiss').hidden=false;return;}
 $('connectOverlay').classList.add('success');$('connectSpinner').hidden=true;$('connectTitle').textContent='Сервер подключён';$('connectDescription').textContent='Соединение установлено';$('connectElapsed').hidden=true;setTimeout(()=>{if(!$('connectOverlay').hidden){$('connectOverlay').hidden=true;closeModal()}},650);
}
$('connectDismiss').onclick=()=>$('connectOverlay').hidden=true;
function saveSettings(){localStorage.setItem(LS,JSON.stringify(settings))}
function isConnected(){return connected&&!!token&&GoogleBridge.ready}
function statusText(t){const el=$('sync');el.textContent=t;const active=/подключён|подключено/i.test(t)&&!/не подключён|не подключено/i.test(t);el.classList.toggle('connected',active);el.classList.toggle('disconnected',!active)}
function checkConnection(){if(!isConnected()){showToast('Сначала подключи Google Drive в настройках');showSettings();return false}return true}
function callGoogle(action,payload){return GoogleBridge.call(action,payload,token)}
async function post(path,obj){
 if(!isConnected())throw Error('Google Drive не подключён. Открой настройки.');
 const map={'/api/admin/group':'group','/api/admin/member':'member','/api/admin/import':'import','/api/admin/pending/decision':'decision','/api/admin/archive':'archiveMember','/api/admin/report':'adminReport'};
 const action=map[path];if(!action)throw Error('Неизвестная операция');
 const r=await callGoogle(action,obj);
 if(r&&r.conflict){const err=new Error('Должность занята');err.status=409;err.data=r;throw err}
 return r;
}
async function refresh(){
 if(!isConnected()){statusText('Сервер недоступен');render();return}
 try{
  const a=await callGoogle('bootstrap',{month:$('reportMonth').value});
  groups=Array.isArray(a.groups)?a.groups:[];
  members=Array.isArray(a.members)?a.members:[];
  reports=Array.isArray(a.reports)?a.reports:[];
  pending=Array.isArray(a.pending)?a.pending.filter(p=>!p.status||p.status==='pending'):[];groupEvents=Array.isArray(a.events)?a.events:[];
  localPreview=false;statusText('Сервер подключён');render();
 }catch(e){statusText('Сервер недоступен');showToast(e.message);render()}
}
async function loginAndTest(password){
 if(!password){if(!token)throw Error('Введи пароль секретаря');}
 else {const r=await GoogleBridge.call('login',{password});token=r.token;localStorage.setItem(sessionKey,token);sessionStorage.setItem(sessionKey,token)}
 const test=await GoogleBridge.call('test',{},token);
 if(!test?.ok)throw Error('Не удалось подтвердить запись в Google Drive');
 connected=true;await refresh();return test;
}
function initBridge(url){GoogleBridge.connect(url);connected=false;statusText('Подключение к Google…')}
function render(){const visible=members.filter(m=>!m.hidden);$('groupNav').innerHTML='<button data-group="all" class="'+(selected==='all'?'active':'')+'">Все участники <b>'+visible.length+'</b></button>'+groups.map(g=>`<button data-group="${esc(g.id)}" class="${selected===g.id?'active':''}"><span class="nav-group-label">Группа <strong>${esc(g.name)}</strong></span><b>${visible.filter(m=>m.groupId===g.id).length}</b></button>`).join('');let old=$('filterGroup').value||filter;$('filterGroup').innerHTML='<option value="all">Все группы</option>'+groups.map(g=>`<option value="${esc(g.id)}">Группа ${esc(g.name)}</option>`).join('');filter=groups.some(g=>g.id===old)?old:'all';$('filterGroup').value=filter;$('title').textContent=selected==='all'?'Участники':'Группа '+groupName(selected);const term=$('search').value.trim().toLocaleLowerCase(),col=new Intl.Collator(['ru','de','en'],{sensitivity:'base'});const found=visible.filter(m=>(selected==='all'||selected===m.groupId)&&(filter==='all'||filter===m.groupId)&&[m.firstName,m.lastName,groupName(m.groupId),m.address,m.phone].join(' ').toLocaleLowerCase().includes(term));
 const alpha=(a,b)=>col.compare(a.lastName,b.lastName)||col.compare(a.firstName,b.firstName);
 found.sort((a,b)=>{if(order==='za')return -alpha(a,b);if(order==='added_desc')return String(b.addedAt||'').localeCompare(String(a.addedAt||''))||alpha(a,b);if(order==='added_asc')return String(a.addedAt||'').localeCompare(String(b.addedAt||''))||alpha(a,b);return alpha(a,b)});
 $('count').textContent=`${selected==='all'?'Все группы':'Группа '+groupName(selected)} · ${found.length}`;const list=$('list'),toggle=$('toggleValues');toggle.textContent=showValues?'Скрыть все значения':'Показать все значения';toggle.setAttribute('aria-pressed',String(showValues));list.classList.toggle('values-visible',showValues);
 const reportMap=new Map(reports.map(r=>[String(r.memberId),r]));
 if(showValues){const cv=document.createElement('canvas'),ctx=cv.getContext('2d');ctx.font='680 22px -apple-system, sans-serif';const width=Math.max(185,...found.map(m=>ctx.measureText((m.lastName||'')+' '+(m.firstName||'')).width+39));list.style.setProperty('--name-column',Math.min(440,Math.ceil(width))+'px')}else list.style.removeProperty('--name-column');
 const reportState=m=>{const r=reportMap.get(String(m.id));if(r)return {kind:'done',glyph:'✓',label:'Отчёт принят'};const current=$('reportMonth').value===prevMonth(),day=new Date().getDate();if(current&&day>15)return {kind:'late',glyph:'−',label:'Отчёт просрочен'};if(current&&day>10)return {kind:'warn',glyph:'−',label:'Отчёт ожидается'};return {kind:'empty',glyph:'',label:'Отчёт не представлен'}};
 const headings=showValues&&found.length?'<div class="value-head"><span class="month-heading">'+esc(monthText($('reportMonth').value))+'</span><span class="status-heading">Отчёт</span><span class="value-service-head">Вид</span><span class="value-result-head">Часы</span><span class="value-studies-head">Из.</span><span class="value-note-head">Примечание</span><span class="more-heading"></span></div>':'';
 list.innerHTML=headings+(found.map(m=>{const isOpen=expanded.has(m.id),menu=popover===m.id,r=reportMap.get(String(m.id)),cat=r?.category||m.category||'',v=(r&&['APV','HPV'].includes(reportCategory(cat)))?(r.hours??''):(r?.answer==='yes'?'Да':r?.answer==='no'?'Нет':''),studies=r&&Number(r.studies)>0?String(r.studies):'',hasNote=!!String(r?.note||'').trim(),state=reportState(m),gname=groupName(m.groupId);return `<article class="member" data-member-id="${esc(m.id)}"><div class="member-line"><span class="chip">${esc(gname)}</span><span class="name-cell"><span class="name ${m.role==='leader'?'leader':m.role==='assistant'?'assistant':''}">${esc(m.lastName)} ${esc(m.firstName)}</span><button class="arrow ${isOpen?'open':''}" data-open="${esc(m.id)}" aria-label="Подробнее">›</button></span>${showValues?`<span class="status-cell" title="${esc(state.label)}" aria-label="${esc(state.label)}"><span class="status-dot ${state.kind}">${state.glyph}</span></span><span class="value-service">${esc(cat)}</span><span class="value-result">${esc(v)}</span><span class="value-studies">${esc(studies)}</span><span class="value-note">${hasNote?`<button class="note-pill" data-note="${esc(m.id)}" aria-label="Читать примечание">Примечание</button>`:''}</span>`:''}<button class="more" data-menu="${esc(m.id)}" aria-label="Действия">···</button></div>${menu?`<div class="pop" style="top:${popoverPosition.top}px;left:${popoverPosition.left}px"><button data-edit="${esc(m.id)}">Редактировать</button><hr><button data-report="${esc(m.id)}">Отчёт</button></div>`:''}${isOpen?`<div class="member-detail">${m.role?`<div><span class="detail-label">Назначение</span><b class="${m.role==='leader'?'leader':'assistant'}">${roleTitle(m.role)}</b></div>`:''}<div><span class="detail-label">Адрес</span>${esc(m.address||'—')}</div><div><span class="detail-label">Телефон</span>${esc(m.phone||'—')}</div><div><span class="detail-label">Группа</span>${esc(gname)}</div><div><span class="detail-label">Дата создания</span>${date(m.addedAt)}</div>${r?`<div><span class="detail-label">${esc(monthText(r.month))}</span>${esc(cat)} · ${esc(v||'—')} · изучения: ${esc(studies||'0')}</div>`:''}</div>`:''}</article>`}).join('')||'<div class="empty">Участников пока нет. Нажми «+», чтобы создать группу или участника.</div>');

 const summary={APV:{n:0,h:0,s:0},HPV:{n:0,h:0,s:0},V:{n:0,h:0,s:0},UV:{n:0,h:0,s:0}};
 const visibleIds=new Set(visible.filter(m=>(selected==='all'||selected===m.groupId)&&(filter==='all'||filter===m.groupId)).map(m=>String(m.id)));
 // Count only reports for currently displayed people; no report = no entry.
 for(const r of reports){if(!visibleIds.has(String(r.memberId)))continue;const k=reportCategory(r.category);if(!summary[k])continue;const hours=Number(r.hours)||0,studies=Number(r.studies)||0;const valid=['APV','HPV'].includes(k)?hours>0:r.answer==='yes';if(!valid)continue;summary[k].n++;summary[k].h+=['APV','HPV'].includes(k)?hours:0;summary[k].s+=Math.max(0,studies)}
 for(const k of ['APV','HPV','V','UV']){$('sum'+k).textContent=summary[k].n;$('hours'+k).textContent=summary[k].h;$('studies'+k).textContent=summary[k].s}
 $('sumAll').textContent=Object.values(summary).reduce((a,x)=>a+x.n,0);
 $('hoursAll').textContent=Object.values(summary).reduce((a,x)=>a+x.h,0);
 $('studiesAll').textContent=Object.values(summary).reduce((a,x)=>a+x.s,0);
 $('pending').hidden=!pending.length;$('pending').innerHTML=pending.length?'<b>Ожидают подтверждения на iPhone</b>'+pending.map(p=>`<div class="pending-item"><span>${esc(p.memberName)} · ${esc(groupName(p.groupId))} · ${esc(roleTitle(p.role))}</span><button data-approve="${esc(p.id)}">Подтвердить</button><button data-reject="${esc(p.id)}">Отклонить</button></div>`).join(''):'';
}
function showSettings(){
 openModal('Настройки',`<form id="settingsForm">
 <h3>Google Drive</h3>
 <p class="hint">Сначала подключи Google Drive. Без подтверждённой связи создание участников и групп заблокировано. Ссылка — опубликованный адрес Google Apps Script, оканчивающийся на /exec.</p>
 <label class="field">Адрес Google Apps Script<input name="scriptUrl" type="url" autocomplete="off" value="${esc(settings.scriptUrl||'')}" placeholder="https://script.google.com/macros/s/…/exec" required></label>
 <label class="field">Пароль<input name="password" type="password" autocomplete="off" placeholder="Пароль из ADMIN_PASSWORD"></label>
 <div id="googleStatus" class="connection-status ${isConnected()?'connected':''}">${isConnected()?'Подключено · можно сохранять JSON':'Не подключено'}</div>
 <div class="actions"><button class="secondary" type="button" id="testGoogle">Проверить подключение</button><button class="primary" type="submit" id="connectGoogle">Подключить Google Drive</button></div></form>
 <hr><h3>Перенос существующих участников</h3>
 <p class="hint">Импорт доступен только после подключения. Перенос выполняется в пустую папку Google Drive, чтобы избежать дубликатов. Локальные данные не удаляются.</p>
 <button class="secondary" type="button" id="importLocal" ${!isConnected()?'disabled':''}>Импортировать прежние данные</button>`);
 const form=$('settingsForm');
 async function submitSettings(runLogin){
  const url=GoogleBridge.normalizeUrl(form.elements.scriptUrl.value);
  const changed=url!==settings.scriptUrl;
  if(changed){settings.scriptUrl=url;saveSettings();token='';sessionStorage.removeItem(sessionKey);localStorage.removeItem(sessionKey);initBridge(url)}
  else if(!GoogleBridge.ready)initBridge(url);
  $('googleStatus').textContent='Проверка Google Drive…';
  if(runLogin){$('connectGoogle').disabled=true;showConnectionProgress()}
  try{
   if(runLogin) {
     await loginAndTest(form.elements.password.value);
     finishConnectionProgress(null);
   } else {
     await GoogleBridge.call('ping',{});
     $('googleStatus').textContent='Скрипт доступен. Для записи войди с паролем.';
     if(token){const test=await loginAndTest('');$('googleStatus').textContent='Подключено: '+test.folder}
   }
  }catch(e){connected=false;$('googleStatus').textContent='Ошибка: '+e.message;statusText('Сервер недоступен');if(runLogin)finishConnectionProgress(e);else showToast(e.message)}
  finally{const b=$('connectGoogle');if(b)b.disabled=false}
 }
 form.onsubmit=e=>{e.preventDefault();submitSettings(true)};
 $('testGoogle').onclick=()=>submitSettings(false);
 $('importLocal').onclick=async()=>{
  if(!checkConnection())return;
  try{
   const data=JSON.parse(localStorage.getItem(older)||'{}');
   if(!Array.isArray(data.groups)||!Array.isArray(data.members)||!data.groups.length){showToast('Локальные данные прежней версии не найдены');return}
   if(!confirm(`Перенести ${data.groups.length} групп и ${data.members.length} участников? Только если папка Google Drive пустая. Локальные данные останутся.`))return;
   const r=await post('/api/admin/import',{groups:data.groups,members:data.members});
   showToast(`Перенесено: ${r.groups} групп и ${r.members} участников`);await refresh();closeModal();
  }catch(e){showToast(e.message)}
 };
}
function showGroup(){if(!checkConnection())return;openModal('Новая группа','<form id="groupForm"><label class="field">Название группы<input name="name" required maxlength="100" placeholder="Например, A1"></label><div class="actions"><button type="button" class="secondary" id="cancel">Отмена</button><button class="primary">Создать</button></div></form>');$('cancel').onclick=closeModal;$('groupForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/admin/group',{name:e.target.elements.name.value.trim()});closeModal();await refresh()}catch(e){showToast(e.message)}}}
function showMember(m=null){if(!checkConnection())return;if(!groups.length){showToast('Сначала создай группу');return}const grp=m?.groupId||(selected==='all'?groups[0].id:selected),role=m?.role||'';openModal(m?'Карточка участника':'Новый участник',`<form id="memberForm"><label class="field">Имя<input required name="firstName" value="${esc(m?.firstName||'')}"></label><label class="field">Фамилия<input required name="lastName" value="${esc(m?.lastName||'')}"></label><div class="pair"><label class="field">Группа<select name="groupId">${groups.map(g=>`<option value="${esc(g.id)}" ${g.id===grp?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label class="field">Назначить<select name="role"><option value="">Выбрать</option><option value="leader" ${role==='leader'?'selected':''}>Ответственный за группу</option><option value="assistant" ${role==='assistant'?'selected':''}>Помощник</option></select></label></div><label id="codeField" class="field" ${role?'':'hidden'}>Одноразовый код для телефона (4 цифры)<input name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Например, 4827"><span class="hint">Код нужен для новой регистрации; можно оставить пустым при редактировании без смены должности.</span></label><label class="field">Адрес<textarea name="address" rows="2">${esc(m?.address||'')}</textarea></label><label class="field">Телефон<input name="phone" type="tel" value="${esc(m?.phone||'')}"></label><label class="field">Вид служения<select name="category"><option value="">Не указана</option>${serviceTypes.map(x=>`<option ${m?.category===x?'selected':''}>${x}</option>`).join('')}</select></label>${m?`<p class="hint">Дата создания: ${esc(date(m.addedAt))}<br>Файл: ${esc(m.fileName||'')}</p>`:''}${m?`<div class="archive-area"><button type="button" class="archive-action" id="archiveMember">Удалить участника</button></div>`:''}<div class="actions"><button type="button" class="secondary" id="cancel">Отмена</button><button class="primary">Сохранить</button></div></form>`);const form=$('memberForm');form.elements.role.onchange=()=>{const has=!!form.elements.role.value;$('codeField').hidden=!has;form.elements.code.required=has&&(!m||m.role!==form.elements.role.value||m.groupId!==form.elements.groupId.value)};form.elements.groupId.onchange=()=>form.elements.role.onchange();form.elements.role.onchange();$('cancel').onclick=closeModal;if(m){$('archiveMember').onclick=()=>{openModal('Удаление участника',`<p>Вы действительно хотите удалить из активного списка <strong>${esc(m.lastName)} ${esc(m.firstName)}</strong>?</p><p class="hint">JSON и прежние отчёты останутся на Google Drive. Если участник имеет назначение, доступ его телефона будет отозван.</p><div class="actions"><button class="secondary" id="archiveCancel" type="button">Отмена</button><button class="danger-button" id="archiveConfirm" type="button">Удалить</button></div>`);$('archiveCancel').onclick=()=>showMember(m);$('archiveConfirm').onclick=async()=>{const b=$('archiveConfirm');b.disabled=true;b.textContent='Удаление…';try{await post('/api/admin/archive',{memberId:m.id});members=members.filter(x=>x.id!==m.id);closeModal();render();showToast('Участник удалён из активного списка');await refresh()}catch(ex){b.disabled=false;b.textContent='Удалить';showToast(ex.message)}}}};form.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget.elements,obj={id:m?.id,firstName:f.firstName.value.trim(),lastName:f.lastName.value.trim(),groupId:f.groupId.value,role:f.role.value,code:f.code.value.trim(),address:f.address.value.trim(),phone:f.phone.value.trim(),category:f.category.value,categoryMonth:$('reportMonth').value,addedAt:m?.addedAt,fileName:m?.fileName};if(obj.role&&(!m||m.role!==obj.role||m.groupId!==obj.groupId)&&!obj.code)return showToast('При новом назначении укажи одноразовый код');try{await post('/api/admin/member',{member:obj});closeModal();await refresh();showToast('Участник сохранён')}catch(e){if(e.status===409&&e.data?.conflict){const yes=confirm(`В этой группе уже назначен(а) ${e.data.conflict.name}.\n\nПосле подтверждения предыдущий участник потеряет эту должность и доступ со своего телефона. Продолжить?`);if(yes){try{await post('/api/admin/member',{member:obj,replaceRole:true});closeModal();await refresh();showToast('Назначение изменено')}catch(x){showToast(x.message)}}}else showToast(e.message)}}}
function editAdminReport(m){
 if(!checkConnection())return;
 const defaultMonth=prevMonth();let selectedMonth=defaultMonth,activeReport=reports.find(x=>String(x.memberId)===String(m.id)&&x.month===defaultMonth)||{};
 const nums=(max,v)=>Array.from({length:max+1},(_,i)=>`<option value="${i}" ${Number(v)===i?'selected':''}>${i}</option>`).join('');
 const serviceOptions=v=>serviceTypes.map(x=>`<option value="${x}" ${v===x?'selected':''}>${x}</option>`).join('');
 const cat=activeReport.category||m.category||'APV';
 openModal('Отчёт — '+m.lastName+' '+m.firstName,`<form id="adminReportForm"><div class="report-month-display"><span id="adminMonthLabel">${esc(monthText(defaultMonth))}</span><label class="calendar-month-action" aria-label="Выбрать месяц отчёта" title="Выбрать месяц"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5M17 3v5M3 10h18"/></svg><input type="month" id="adminReportMonth" name="month" value="${esc(defaultMonth)}" max="${esc(prevMonth())}" required aria-label="Выбрать месяц"></label></div><label class="field">Вид служения<select name="category">${serviceOptions(cat)}</select></label><div class="pair"><label class="field" id="adminHours">Часы<select name="hours">${nums(999,activeReport.hours??0)}</select></label><label class="field" id="adminAnswer" hidden>Ответ<select name="answer"><option value="" disabled ${!activeReport.answer?'selected':''}>Выбрать</option><option value="yes" ${activeReport.answer==='yes'?'selected':''}>Да</option><option value="no" ${activeReport.answer==='no'?'selected':''}>Нет</option></select></label><label class="field">Изучения<select name="studies">${nums(10,activeReport.studies??0)}</select></label></div><label class="field">Примечание<textarea name="note" maxlength="3000">${esc(activeReport.note||'')}</textarea></label><div class="actions"><button type="button" class="secondary" id="cancelAdminReport">Отмена</button><button type="submit" class="primary">Сохранить</button></div></form>`);
 const f=$('adminReportForm');const mode=()=>{const hours=['APV','HPV','HPV-30','HPV-60','HPV-90'].includes(f.elements.category.value);$('adminHours').hidden=!hours;$('adminAnswer').hidden=hours};f.elements.category.onchange=mode;mode();$('cancelAdminReport').onclick=closeModal;
 f.elements.month.onchange=async()=>{
   const month=f.elements.month.value;if(!month||month>prevMonth()){showToast('Можно выбрать только завершённый месяц');f.elements.month.value=selectedMonth;return}
   selectedMonth=month;$('adminMonthLabel').textContent=monthText(month);f.elements.month.disabled=true;const save=f.querySelector('[type=submit]');save.disabled=true;
   try{const data=await callGoogle('bootstrap',{month});if(f!==$('adminReportForm'))return;activeReport=(data.reports||[]).find(x=>String(x.memberId)===String(m.id))||{};f.elements.category.value=activeReport.category||m.category||'APV';f.elements.hours.value=String(activeReport.hours??0);f.elements.answer.value=activeReport.answer||'';f.elements.studies.value=String(activeReport.studies??0);f.elements.note.value=activeReport.note||'';mode()}
   catch(err){showToast('Не удалось загрузить месяц: '+err.message);}
   finally{if(f===$('adminReportForm')){f.elements.month.disabled=false;save.disabled=false}}
 };
 f.onsubmit=e=>{e.preventDefault();const b=f.querySelector('[type=submit]');if(b.disabled)return;const item={memberId:m.id,month:f.elements.month.value,category:f.elements.category.value,hours:Number(f.elements.hours.value),answer:f.elements.answer.value,studies:Number(f.elements.studies.value),note:f.elements.note.value};b.disabled=true;b.textContent='Сохранение…';post('/api/admin/report',item).then(async()=>{closeModal();if(item.month===$('reportMonth').value){reports=reports.filter(x=>String(x.memberId)!==String(m.id));reports.push({...item,answer:['V','UV'].includes(item.category)?item.answer:null})}render();showToast('Отчёт сохранён');await refresh()}).catch(err=>{b.disabled=false;b.textContent='Сохранить';showToast(err.message)})};
}
$('foldGroups').onclick=()=>{groupOpen=!groupOpen;$('groupNav').hidden=!groupOpen;$('foldGroups').classList.toggle('open',groupOpen)};
$('toggleReports').onclick=()=>{reportOpen=!reportOpen;$('reportContent').hidden=!reportOpen;$('reportArrow').classList.toggle('open',reportOpen)};
$('toggleValues').onclick=()=>{showValues=!showValues;popover=null;render()};$('refreshData').onclick=async()=>{const b=$('refreshData');if(b.disabled)return;b.disabled=true;b.classList.add('spinning');try{await refresh()}finally{b.disabled=false;b.classList.remove('spinning')}};$('reportMonth').onchange=refresh;$('filterGroup').onchange=e=>{filter=e.target.value;render()};$('sort').onchange=e=>{order=e.target.value;render()};$('search').oninput=render;$('settings').onclick=showSettings;$('close').onclick=closeModal;$('backdrop').onclick=e=>{if(e.target===$('backdrop'))closeModal()};$('addBtn').onclick=()=>{if(!checkConnection())return;$('addMenu').hidden=!$('addMenu').hidden};$('addMenu').onclick=e=>{const t=e.target.closest('[data-add]');if(!t)return;$('addMenu').hidden=true;t.dataset.add==='group'?showGroup():showMember()};$('groupNav').onclick=e=>{const b=e.target.closest('[data-group]');if(b){selected=b.dataset.group;render()}};function cancelPopoverClose(){if(popoverCloseTimer!==null){clearTimeout(popoverCloseTimer);popoverCloseTimer=null}}
function closePopover(){cancelPopoverClose();if(popover!==null){popover=null;render()}}
function schedulePopoverClose(){cancelPopoverClose();popoverCloseTimer=setTimeout(()=>{popoverCloseTimer=null;if(popover!==null){popover=null;render()}},3000)}
function setPopoverPosition(button){const rect=button.getBoundingClientRect(),width=208,height=116,margin=10;popoverPosition={left:Math.max(margin,Math.min(window.innerWidth-width-margin,rect.right-width)),top:rect.bottom+height+margin<window.innerHeight?rect.bottom+5:Math.max(margin,rect.top-height-5)}}
$('list').onclick=e=>{const note=e.target.closest('[data-note]'),o=e.target.closest('[data-open]'),menu=e.target.closest('[data-menu]'),edit=e.target.closest('[data-edit]'),report=e.target.closest('[data-report]');if(note){const r=reports.find(x=>String(x.memberId)===note.dataset.note);if(r&&String(r.note||'').trim()){openModal('Примечание',`<div class="note-content">${esc(r.note)}</div><div class="actions"><button id="noteClose" class="secondary" type="button">Закрыть</button></div>`);$('noteClose').onclick=closeModal}return}if(o){cancelPopoverClose();expanded.has(o.dataset.open)?expanded.delete(o.dataset.open):expanded.add(o.dataset.open);popover=null;render()}else if(menu){cancelPopoverClose();if(popover===menu.dataset.menu){popover=null}else{setPopoverPosition(menu);popover=menu.dataset.menu}render()}else if(edit){cancelPopoverClose();const m=members.find(x=>x.id===edit.dataset.edit);popover=null;edit.closest('.pop')?.remove();if(m)showMember(m)}else if(report){cancelPopoverClose();const m=members.find(x=>x.id===report.dataset.report);popover=null;report.closest('.pop')?.remove();if(m)editAdminReport(m)}};
// Close three seconds after cursor leaves the participant row, but never while navigating inside it.
$('list').addEventListener('mouseover',e=>{
  if(!popover || !window.matchMedia('(hover: hover)').matches) return;
  const row=e.target.closest('.member');
  if(row && row.querySelector('[data-menu="'+popover+'"]')) cancelPopoverClose();
});
$('list').addEventListener('mouseout',e=>{
  if(!popover || !window.matchMedia('(hover: hover)').matches) return;
  const row=e.target.closest('.member');
  if(!row || !row.querySelector('[data-menu="'+popover+'"]')) return;
  if(e.relatedTarget && row.contains(e.relatedTarget)) return;
  schedulePopoverClose();
});
// A touch outside closes immediately; scrolling also dismisses the floating popup.
document.addEventListener('pointerdown',e=>{
  if(!popover || e.target.closest('.pop, [data-menu]')) return;
  closePopover();
});
$('list').addEventListener('scroll',()=>{if(popover)closePopover()},{passive:true});
window.addEventListener('resize',()=>{if(popover)closePopover()});
$('pending').onclick=async e=>{const btn=e.target.closest('[data-approve],[data-reject]');if(!btn||btn.disabled)return;
 const id=btn.dataset.approve||btn.dataset.reject,approve=!!btn.dataset.approve,original=pending.slice();
 const row=btn.closest('.pending-item');if(row){row.querySelectorAll('button').forEach(b=>b.disabled=true);row.style.opacity='.5'}
 pending=pending.filter(p=>p.id!==id);render();
 try{await post('/api/admin/pending/decision',{id,approve});showToast(approve?'Подтверждено':'Отклонено');await refresh()}
 catch(ex){pending=original;render();showToast('Не удалось сохранить решение: '+ex.message)}
};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
try{const old=JSON.parse(localStorage.getItem(older)||'{}');if(Array.isArray(old.groups)&&Array.isArray(old.members)&&old.groups.length){groups=old.groups;members=old.members;localPreview=true}}catch{}
statusText('Сервер недоступен');render();
if(settings.scriptUrl){try{initBridge(settings.scriptUrl);if(token){GoogleBridge.subscribe(state=>{if(state==='ready'&&!connected){loginAndTest('').catch(e=>{statusText('Требуется вход');showToast(e.message)})}})}}catch(e){statusText('Некорректная ссылка Google')}}
setInterval(()=>{if(isConnected()&&!document.hidden)refresh()},30000);
