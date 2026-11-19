'use strict';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const LS='gruppen-duo-ipad-settings',older='gruppy-v1-cache',sessionKey='gruppen-appsscript-admin';let settings=JSON.parse(localStorage.getItem(LS)||'{}'),groups=[],members=[],reports=[],pending=[],selected='all',filter='all',order='az',groupOpen=false,reportOpen=false,expanded=new Set(),popover=null,popoverPosition={top:0,left:0},popoverCloseTimer=null, connected=false, token=sessionStorage.getItem(sessionKey)||'', localPreview=false;
const prevMonth=()=>{let d=new Date();d.setDate(1);d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};
$('reportMonth').value=prevMonth();
const date=s=>{if(!s)return'—';const m=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:s};
const groupName=id=>groups.find(x=>x.id===id)?.name||'—';
const roleTitle=r=>r==='leader'?'Ответственный за группу':r==='assistant'?'Помощник ответственного':'—';
function showToast(t){$('toast').textContent=t;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,4000)}
function openModal(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;$('backdrop').hidden=false}function closeModal(){$('backdrop').hidden=true;$('dialogBody').innerHTML=''}
function saveSettings(){localStorage.setItem(LS,JSON.stringify(settings))}
function isConnected(){return connected&&!!token&&GoogleBridge.ready}
function statusText(t){$('sync').textContent=t}
function checkConnection(){if(!isConnected()){showToast('Сначала подключи Google Drive в настройках');showSettings();return false}return true}
function callGoogle(action,payload){return GoogleBridge.call(action,payload,token)}
async function post(path,obj){
 if(!isConnected())throw Error('Google Drive не подключён. Открой настройки.');
 const map={'/api/admin/group':'group','/api/admin/member':'member','/api/admin/import':'import','/api/admin/pending/decision':'decision'};
 const action=map[path];if(!action)throw Error('Неизвестная операция');
 const r=await callGoogle(action,obj);
 if(r&&r.conflict){const err=new Error('Должность занята');err.status=409;err.data=r;throw err}
 return r;
}
async function refresh(){
 if(!isConnected()){statusText('Google Drive не подключён');render();return}
 try{
  const a=await callGoogle('bootstrap',{month:$('reportMonth').value});
  groups=Array.isArray(a.groups)?a.groups:[];
  members=Array.isArray(a.members)?a.members:[];
  reports=Array.isArray(a.reports)?a.reports:[];
  pending=Array.isArray(a.pending)?a.pending.filter(p=>!p.status||p.status==='pending'):[];
  localPreview=false;statusText('Google Drive · подключено');render();
 }catch(e){connected=false;statusText('Ошибка Google Drive');showToast(e.message);render()}
}
async function loginAndTest(password){
 if(!password){if(!token)throw Error('Введи пароль секретаря');}
 else {const r=await GoogleBridge.call('login',{password});token=r.token;sessionStorage.setItem(sessionKey,token)}
 const test=await GoogleBridge.call('test',{},token);
 if(!test?.ok)throw Error('Не удалось подтвердить запись в Google Drive');
 connected=true;await refresh();return test;
}
function initBridge(url){GoogleBridge.connect(url);connected=false;statusText('Подключение к Google…')}
function render(){const visible=members.filter(m=>!m.hidden);$('groupNav').innerHTML='<button data-group="all" class="'+(selected==='all'?'active':'')+'">Все участники <b>'+visible.length+'</b></button>'+groups.map(g=>`<button data-group="${esc(g.id)}" class="${selected===g.id?'active':''}">${esc(g.name)} <b>${visible.filter(m=>m.groupId===g.id).length}</b></button>`).join('');let old=$('filterGroup').value||filter;$('filterGroup').innerHTML='<option value="all">Все группы</option>'+groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');filter=groups.some(g=>g.id===old)?old:'all';$('filterGroup').value=filter;$('title').textContent=selected==='all'?'Участники':groupName(selected);const term=$('search').value.trim().toLocaleLowerCase(),col=new Intl.Collator(['ru','de','en'],{sensitivity:'base'});const found=visible.filter(m=>(selected==='all'||selected===m.groupId)&&(filter==='all'||filter===m.groupId)&&[m.firstName,m.lastName,groupName(m.groupId),m.address,m.phone].join(' ').toLocaleLowerCase().includes(term));found.sort((a,b)=>order==='date'?String(b.addedAt||'').localeCompare(String(a.addedAt||'')):(order==='za'?-1:1)*(col.compare(a.lastName,b.lastName)||col.compare(a.firstName,b.firstName)));$('count').textContent=`${selected==='all'?'Все группы':groupName(selected)} · ${found.length}`;$('list').innerHTML=found.map(m=>{const isOpen=expanded.has(m.id),menu=popover===m.id;return `<article class="member ${isOpen?'open':''}"><div class="member-line"><span class="chip">${esc(groupName(m.groupId))}</span><span class="name ${m.role==='leader'?'leader':m.role==='assistant'?'assistant':''}">${esc(m.lastName)} ${esc(m.firstName)}</span><button class="arrow ${isOpen?'open':''}" data-open="${esc(m.id)}" aria-label="Подробнее">›</button><button class="more" data-menu="${esc(m.id)}" aria-label="Действия">···</button></div>${menu?`<div class="pop" style="top:${popoverPosition.top}px;left:${popoverPosition.left}px"><button data-edit="${esc(m.id)}">Редактировать</button><hr><button data-remove="${esc(m.id)}">Удалить</button></div>`:''}${isOpen?`<div class="member-detail">${m.role?`<div><span class="detail-label">Назначение</span><b class="${m.role==='leader'?'leader':'assistant'}">${roleTitle(m.role)}</b></div>`:''}<div><span class="detail-label">Адрес</span>${esc(m.address||'—')}</div><div><span class="detail-label">Телефон</span>${esc(m.phone||'—')}</div><div><span class="detail-label">Группа</span>${esc(groupName(m.groupId))}</div><div><span class="detail-label">Дата создания</span>${date(m.addedAt)}</div>${(()=>{const r=reports.find(x=>x.memberId===m.id);return r?`<div><span class="detail-label">Отчёт (${esc(r.month)})</span>${esc(r.category)} · ${['APV','HPV'].includes(r.category)?esc(r.hours)+' ч.':r.answer==='yes'?'Да / Ja':'Нет / Nein'} · изучений: ${esc(r.studies)}</div><div><span class="detail-label">Примечание</span>${esc(r.note||'—')}</div>`:''})()}</div>`:''}</article>`}).join('')||'<div class="empty">Участников пока нет. Нажми «+», чтобы создать группу или участника.</div>';
 const counts={APV:0,HPV:0,V:0,UV:0};for(const r of reports){if(!counts.hasOwnProperty(r.category))continue;const hit=['APV','HPV'].includes(r.category)?Number.isInteger(r.hours)&&r.hours>0:r.answer==='yes';if(hit)counts[r.category]++}for(const k of Object.keys(counts))$('sum'+k).textContent=counts[k];$('sumAll').textContent=Object.values(counts).reduce((a,b)=>a+b,0);
 $('pending').hidden=!pending.length;$('pending').innerHTML=pending.length?'<b>Ожидают подтверждения на iPhone</b>'+pending.map(p=>`<div class="pending-item"><span>${esc(p.memberName)} · ${esc(groupName(p.groupId))} · ${esc(roleTitle(p.role))}</span><button data-approve="${esc(p.id)}">Подтвердить</button><button data-reject="${esc(p.id)}">Отклонить</button></div>`).join(''):'';
}
function showSettings(){
 openModal('Настройки',`<form id="settingsForm">
 <h3>Google Drive</h3>
 <p class="hint">Сначала подключи Google Drive. Без подтверждённой связи создание участников и групп заблокировано. Ссылка — опубликованный адрес Google Apps Script, оканчивающийся на /exec.</p>
 <label class="field">Адрес Google Apps Script<input name="scriptUrl" type="url" autocomplete="off" value="${esc(settings.scriptUrl||'')}" placeholder="https://script.google.com/macros/s/…/exec" required></label>
 <label class="field">Пароль секретаря<input name="password" type="password" autocomplete="off" placeholder="Пароль из ADMIN_PASSWORD"></label>
 <div id="googleStatus" class="connection-status ${isConnected()?'connected':''}">${isConnected()?'Подключено · можно сохранять JSON':'Не подключено'}</div>
 <div class="actions"><button class="secondary" type="button" id="testGoogle">Проверить подключение</button><button class="primary" type="submit" id="connectGoogle">Подключить Google Drive</button></div></form>
 <hr><h3>Перенос существующих участников</h3>
 <p class="hint">Импорт доступен только после подключения. Перенос выполняется в пустую папку Google Drive, чтобы избежать дубликатов. Локальные данные не удаляются.</p>
 <button class="secondary" type="button" id="importLocal" ${!isConnected()?'disabled':''}>Импортировать прежние данные</button>`);
 const form=$('settingsForm');
 async function submitSettings(runLogin){
  const url=GoogleBridge.normalizeUrl(form.elements.scriptUrl.value);
  const changed=url!==settings.scriptUrl;
  if(changed){settings.scriptUrl=url;saveSettings();token='';sessionStorage.removeItem(sessionKey);initBridge(url)}
  else if(!GoogleBridge.ready)initBridge(url);
  $('googleStatus').textContent='Проверка Google Drive…';
  try{
   if(runLogin) {
     const test=await loginAndTest(form.elements.password.value);
     showToast('Google Drive подключён: '+test.folder);
     closeModal();
   } else {
     await GoogleBridge.call('ping',{});
     $('googleStatus').textContent='Скрипт доступен. Для записи войди с паролем секретаря.';
     if(token){const test=await loginAndTest('');$('googleStatus').textContent='Подключено: '+test.folder}
   }
  }catch(e){connected=false;$('googleStatus').textContent='Ошибка: '+e.message;statusText('Google Drive не подключён');showToast(e.message)}
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
function showMember(m=null){if(!checkConnection())return;if(!groups.length){showToast('Сначала создай группу');return}const grp=m?.groupId||(selected==='all'?groups[0].id:selected),role=m?.role||'';openModal(m?'Карточка участника':'Новый участник',`<form id="memberForm"><label class="field">Имя<input required name="firstName" value="${esc(m?.firstName||'')}"></label><label class="field">Фамилия<input required name="lastName" value="${esc(m?.lastName||'')}"></label><div class="pair"><label class="field">Группа<select name="groupId">${groups.map(g=>`<option value="${esc(g.id)}" ${g.id===grp?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label class="field">Назначить<select name="role"><option value="">Выбрать</option><option value="leader" ${role==='leader'?'selected':''}>Ответственный за группу</option><option value="assistant" ${role==='assistant'?'selected':''}>Помощник</option></select></label></div><label id="codeField" class="field" ${role?'':'hidden'}>Одноразовый код для телефона (4 цифры)<input name="code" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="Например, 4827"><span class="hint">Код нужен для новой регистрации; можно оставить пустым при редактировании без смены должности.</span></label><label class="field">Адрес<textarea name="address" rows="2">${esc(m?.address||'')}</textarea></label><label class="field">Телефон<input name="phone" type="tel" value="${esc(m?.phone||'')}"></label><label class="field">Категория<select name="category"><option value="">Не указана</option>${['APV','HPV','V','UV'].map(x=>`<option ${m?.category===x?'selected':''}>${x}</option>`).join('')}</select></label>${m?`<p class="hint">Дата создания: ${esc(date(m.addedAt))}<br>Файл: ${esc(m.fileName||'')}</p>`:''}<div class="actions"><button type="button" class="secondary" id="cancel">Отмена</button><button class="primary">Сохранить</button></div></form>`);const form=$('memberForm');form.elements.role.onchange=()=>{const has=!!form.elements.role.value;$('codeField').hidden=!has;form.elements.code.required=has&&(!m||m.role!==form.elements.role.value||m.groupId!==form.elements.groupId.value)};form.elements.groupId.onchange=()=>form.elements.role.onchange();form.elements.role.onchange();$('cancel').onclick=closeModal;form.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget.elements,obj={id:m?.id,firstName:f.firstName.value.trim(),lastName:f.lastName.value.trim(),groupId:f.groupId.value,role:f.role.value,code:f.code.value.trim(),address:f.address.value.trim(),phone:f.phone.value.trim(),category:f.category.value,addedAt:m?.addedAt,fileName:m?.fileName};if(obj.role&&(!m||m.role!==obj.role||m.groupId!==obj.groupId)&&!obj.code)return showToast('При новом назначении укажи одноразовый код');try{await post('/api/admin/member',{member:obj});closeModal();await refresh();showToast('Участник сохранён')}catch(e){if(e.status===409&&e.data?.conflict){const yes=confirm(`В этой группе уже назначен(а) ${e.data.conflict.name}.\n\nПосле подтверждения предыдущий участник потеряет эту должность и доступ со своего телефона. Продолжить?`);if(yes){try{await post('/api/admin/member',{member:obj,replaceRole:true});closeModal();await refresh();showToast('Назначение изменено')}catch(x){showToast(x.message)}}}else showToast(e.message)}}}
$('foldGroups').onclick=()=>{groupOpen=!groupOpen;$('groupNav').hidden=!groupOpen;$('foldGroups').classList.toggle('open',groupOpen)};
$('toggleReports').onclick=()=>{reportOpen=!reportOpen;$('reportContent').hidden=!reportOpen;$('reportArrow').classList.toggle('open',reportOpen)};
$('reportMonth').onchange=refresh;$('filterGroup').onchange=e=>{filter=e.target.value;render()};$('sort').onchange=e=>{order=e.target.value;render()};$('search').oninput=render;$('settings').onclick=showSettings;$('close').onclick=closeModal;$('backdrop').onclick=e=>{if(e.target===$('backdrop'))closeModal()};$('addBtn').onclick=()=>{if(!checkConnection())return;$('addMenu').hidden=!$('addMenu').hidden};$('addMenu').onclick=e=>{const t=e.target.closest('[data-add]');if(!t)return;$('addMenu').hidden=true;t.dataset.add==='group'?showGroup():showMember()};$('groupNav').onclick=e=>{const b=e.target.closest('[data-group]');if(b){selected=b.dataset.group;render()}};function cancelPopoverClose(){if(popoverCloseTimer!==null){clearTimeout(popoverCloseTimer);popoverCloseTimer=null}}
function closePopover(){cancelPopoverClose();if(popover!==null){popover=null;render()}}
function schedulePopoverClose(){cancelPopoverClose();popoverCloseTimer=setTimeout(()=>{popoverCloseTimer=null;if(popover!==null){popover=null;render()}},3000)}
function setPopoverPosition(button){const rect=button.getBoundingClientRect(),width=208,height=118,margin=10;popoverPosition={left:Math.max(margin,Math.min(window.innerWidth-width-margin,rect.right-width)),top:rect.bottom+height+margin<window.innerHeight?rect.bottom+5:Math.max(margin,rect.top-height-5)}}
$('list').onclick=e=>{const o=e.target.closest('[data-open]'),menu=e.target.closest('[data-menu]'),edit=e.target.closest('[data-edit]'),remove=e.target.closest('[data-remove]');if(o){cancelPopoverClose();expanded.has(o.dataset.open)?expanded.delete(o.dataset.open):expanded.add(o.dataset.open);popover=null;render()}else if(menu){cancelPopoverClose();if(popover===menu.dataset.menu){popover=null}else{setPopoverPosition(menu);popover=menu.dataset.menu}render()}else if(edit){cancelPopoverClose();const m=members.find(x=>x.id===edit.dataset.edit);popover=null;if(m)showMember(m)}else if(remove){cancelPopoverClose();popover=null;render();showToast('Удаление не меняет JSON на Drive. В этой версии используйте фильтр вместо удаления.')}};
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
$('pending').onclick=async e=>{const btn=e.target.closest('[data-approve],[data-reject]');if(!btn)return;try{await post('/api/admin/pending/decision',{id:btn.dataset.approve||btn.dataset.reject,approve:!!btn.dataset.approve});await refresh()}catch(e){showToast(e.message)}};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
try{const old=JSON.parse(localStorage.getItem(older)||'{}');if(Array.isArray(old.groups)&&Array.isArray(old.members)&&old.groups.length){groups=old.groups;members=old.members;localPreview=true}}catch{}
statusText('Google Drive не подключён');render();
if(settings.scriptUrl){try{initBridge(settings.scriptUrl);if(token){GoogleBridge.subscribe(state=>{if(state==='ready'&&!connected){loginAndTest('').catch(e=>{statusText('Требуется вход');showToast(e.message)})}})}}catch(e){statusText('Некорректная ссылка Google')}}
setInterval(()=>{if(isConnected()&&!document.hidden)refresh()},30000);
