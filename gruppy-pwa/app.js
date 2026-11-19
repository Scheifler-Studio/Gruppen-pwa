'use strict';
const $=id=>document.getElementById(id);
const KEY='gruppy-v1-settings',DATA='gruppy-v1-cache',HIDDEN='gruppy-v1-hidden';
const defaults={clientId:'',folderId:'',theme:'blue',fontSize:19,itemSize:21};
let settings={...defaults,...read(KEY,{})};let groups=[],members=[],hiddenIds=read(HIDDEN,[]),selected='all',filterGroup='all',sortOrder='az',expanded=false,accessToken='',tokenExpires=0,tokenClient=null,busy=false;let expandedMembers=new Set(),openMemberMenu=null;
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
function cache(){save(DATA,{groups,members})}
function esc(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]))}
function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').hidden=true,4200)}
function setStatus(s){$('syncStatus').textContent=s}
function applySettings(){const themes={blue:['#f0f4f8','#e7edf5','#3478ce'],green:['#f0f6f2','#e2eee7','#248260'],sand:['#f8f4ed','#eee6d9','#9a6a32'],dark:['#17212d','#202f40','#568cd2']};const [bg,side,accent]=themes[settings.theme]||themes.blue;let st=document.documentElement.style;st.setProperty('--bg',bg);st.setProperty('--side',side);st.setProperty('--accent',accent);st.setProperty('--panel',settings.theme==='dark'?'#263646':'#fff');st.setProperty('--text',settings.theme==='dark'?'#f4f7fb':'#172638');st.setProperty('--muted',settings.theme==='dark'?'#b0bdc9':'#6e7b89');st.setProperty('--stroke',settings.theme==='dark'?'#33465a':'#c8d0d8');st.setProperty('--base',settings.fontSize+'px');st.setProperty('--item',settings.itemSize+'px')}
function roleTitle(role){return role==='leader'?'Ответственный за группу':role==='assistant'?'Помощник ответственного':'Участник'}
function roleClass(role){return role==='leader'?'role-leader':role==='assistant'?'role-assistant':''}
function groupName(id){return groups.find(g=>g.id===id)?.name||'Без группы'}
function visibleMembers(){return members.filter(m=>!hiddenIds.includes(m.id))}
function formatRuDate(iso){if(!iso)return '—';const d=new Date(iso);if(Number.isNaN(d.getTime())){const m=String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:String(iso)}return new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
function render(){
 const list=$('groupList');const visible=visibleMembers();
 list.innerHTML='<button class="group-btn all-btn '+(selected==='all'?'active':'')+'" data-group="all"><span>Все участники</span><span class="count">'+visible.length+'</span></button>'+groups.map(g=>'<button class="group-btn '+(selected===g.id?'active':'')+'" data-group="'+esc(g.id)+'"><span>'+esc(g.name)+'</span><span class="count">'+visible.filter(m=>m.groupId===g.id).length+'</span></button>').join('');
 const groupFilter=$('groupFilter');
 const prior=groupFilter.value||filterGroup;
 groupFilter.innerHTML='<option value="all">Все группы</option>'+groups.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name)+'</option>').join('');
 if(prior==='all'||groups.some(g=>g.id===prior)){filterGroup=prior;}else{filterGroup='all';}
 groupFilter.value=filterGroup;
 $('viewTitle').textContent=selected==='all'?'Участники':groupName(selected);
 const query=$('search').value.trim().toLocaleLowerCase();
 const filtered=visible.filter(m=>(selected==='all'||m.groupId===selected)&&(filterGroup==='all'||m.groupId===filterGroup)&&[m.firstName,m.lastName,m.phone,m.address,groupName(m.groupId)].join(' ').toLocaleLowerCase().includes(query));
 const collator=new Intl.Collator(['ru','de','en'],{sensitivity:'base',numeric:true});
 filtered.sort((a,b)=>sortOrder==='date'?String(b.addedAt||'').localeCompare(String(a.addedAt||'')):(sortOrder==='za'?-1:1)*(collator.compare(a.lastName||'',b.lastName||'')||collator.compare(a.firstName||'',b.firstName||'')));
 $('subtitle').textContent=selected==='all'?'Все группы · '+filtered.length:'Участников: '+filtered.length;
 const target=$('memberList');
 target.innerHTML=filtered.length?filtered.map(m=>{
  const isOpen=expandedMembers.has(m.id),menuOpen=openMemberMenu===m.id;
  return '<article class="member-row'+(isOpen?' is-expanded':'')+'" data-member="'+esc(m.id)+'">'+
  '<div class="member-line"><div class="member-primary"><span class="group-chip">'+esc(groupName(m.groupId))+'</span><span class="member-name '+roleClass(m.role)+'">'+esc(m.lastName)+' '+esc(m.firstName)+'</span><button type="button" class="row-icon expand-icon" data-expand="'+esc(m.id)+'" aria-label="'+(isOpen?'Свернуть':'Показать')+' сведения об участнике" aria-expanded="'+isOpen+'" title="'+(isOpen?'Свернуть':'Подробнее')+'"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button></div>'+ 
  '<div class="row-controls"><button type="button" class="row-icon menu-icon" data-menu="'+esc(m.id)+'" aria-haspopup="true" aria-expanded="'+menuOpen+'" aria-label="Действия с участником" title="Действия"><svg viewBox="0 0 24 24" width="23" height="23" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></div></div>'+ 
  (menuOpen?'<div class="member-popover" role="menu"><button type="button" role="menuitem" data-edit="'+esc(m.id)+'">Редактировать участника</button><div class="popover-rule"></div><button type="button" role="menuitem" class="danger" data-hide="'+esc(m.id)+'">Удалить участника</button></div>':'')+
  (isOpen?'<div class="member-detail">'+(m.role?'<div class="detail-field"><span>Назначение</span><div class="'+roleClass(m.role)+'">'+esc(roleTitle(m.role))+'</div></div>':'')+'<div class="detail-field"><span>Адрес</span><div>'+esc(m.address||'—')+'</div></div><div class="detail-field"><span>Телефон</span><div>'+esc(m.phone||'—')+'</div></div><div class="detail-field"><span>Группа</span><div>'+esc(groupName(m.groupId))+'</div></div><div class="detail-field"><span>Дата добавления</span><div>'+esc(formatRuDate(m.addedAt))+'</div></div></div>':'')+
  '</article>';
 }).join(''):'<div class="empty"><strong>Участников пока нет</strong>Нажмите «+» в правом верхнем углу, чтобы создать группу или участника.</div>';
}
function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modalBackdrop').hidden=false}
function closeModal(){$('modalBackdrop').hidden=true;$('modalBody').innerHTML=''}
function showGroup(){openModal('Новая группа','<form id="groupForm"><label class="field">Название группы<input name="name" maxlength="100" required autofocus placeholder="Например, Группа А"></label><div class="actions"><button class="secondary" type="button" id="cancelForm">Отмена</button><button class="primary" type="submit">Создать группу</button></div></form>');$('cancelForm').onclick=closeModal;$('groupForm').onsubmit=async e=>{e.preventDefault();const name=e.target.elements.name.value.trim();if(!name)return;if(groups.some(g=>g.name.toLocaleLowerCase()===name.toLocaleLowerCase()))return toast('Группа с таким названием уже существует');const g={id:crypto.randomUUID(),name,createdAt:new Date().toISOString()};groups.push(g);cache();render();closeModal();if(cloudConfigured()){try{await writeGroups();toast('Группа сохранена в Google Drive')}catch(err){toast('Группа локально сохранена; ошибка Drive: '+err.message)}}else toast('Группа создана локально. Для Drive откройте настройки.')};}
function memberForm(m=null){
 if(!groups.length){toast('Сначала создайте группу');return}
 const edit=!!m;
 const initialGroup=m?.groupId||(selected!=='all'?selected:groups[0].id);
 const selectedRole=m?.role||'';
 const groupOptions=groups.map(g=>'<option value="'+esc(g.id)+'" '+(initialGroup===g.id?'selected':'')+'>'+esc(g.name)+'</option>').join('');
 openModal(edit?'Карточка участника':'Новый участник',
 '<form id="memberForm"><label class="field">Имя<input name="firstName" required maxlength="120" value="'+esc(m?.firstName||'')+'"></label>'+ 
 '<label class="field">Фамилия<input name="lastName" required maxlength="120" value="'+esc(m?.lastName||'')+'"></label>'+ 
 '<div class="assignment-row"><label class="field group-field">Группа<select name="groupId" required>'+groupOptions+'</select></label>'+ 
 '<label class="field appointment-field">Назначить<select name="role"><option value="">Выбрать</option><option value="leader" '+(selectedRole==='leader'?'selected':'')+'>Ответственный за группу</option><option value="assistant" '+(selectedRole==='assistant'?'selected':'')+'>Помощник</option></select></label></div>'+ 
 '<label class="field">Адрес<textarea name="address" rows="2">'+esc(m?.address||'')+'</textarea></label>'+ 
 '<label class="field">Телефон<input name="phone" type="tel" value="'+esc(m?.phone||'')+'"></label>'+ 
 (edit?'<p class="hint">Дата создания: '+esc(formatRuDate(m.addedAt))+'<br>Файл: '+esc(m.fileName||'')+'</p>':'<p class="hint">Дата добавления устанавливается автоматически. Для каждого участника создаётся отдельный JSON.</p>')+
 '<div class="actions"><button class="secondary" type="button" id="cancelForm">Отмена</button><button class="primary" type="submit">'+(edit?'Сохранить':'Добавить участника')+'</button></div></form>');
 $('cancelForm').onclick=closeModal;
 $('memberForm').onsubmit=async e=>{
  e.preventDefault();const f=e.target.elements;
  const record={...(m||{}),firstName:f.firstName.value.trim(),lastName:f.lastName.value.trim(),groupId:f.groupId.value,role:f.role.value,address:f.address.value.trim(),phone:f.phone.value.trim()};
  if(!record.firstName||!record.lastName)return;
  const oldHolder=record.role?members.find(x=>x.id!==record.id&&x.groupId===record.groupId&&x.role===record.role):null;
  if(oldHolder){
   const name=(oldHolder.lastName+' '+oldHolder.firstName).trim();
   const roleName=roleTitle(record.role);
   const text='В группе «'+groupName(record.groupId)+'» уже назначен(а) '+roleName.toLowerCase()+': '+name+'.\n\nЕсли продолжить, '+name+' больше не будет занимать эту должность. Назначение перейдёт к '+record.lastName+' '+record.firstName+'.\n\nПродолжить?';
   if(!confirm(text))return;
  }
  if(!edit){record.id=crypto.randomUUID();record.addedAt=new Date().toISOString();record.fileName=createFileName(record)}
  record.updatedAt=new Date().toISOString();
  // Сначала обновляем прежнего держателя должности, затем назначаем нового.
  if(oldHolder){oldHolder.role='';oldHolder.updatedAt=new Date().toISOString()}
  if(edit)members=members.map(x=>x.id===record.id?record:x);else members.push(record);
  cache();render();closeModal();
  if(cloudConfigured()){
   try{
    if(oldHolder)await writeMember(oldHolder);
    await writeMember(record);
    toast('Назначение и участник сохранены в Google Drive');
   }catch(err){toast('Изменения сохранены локально. Ошибка Drive: '+err.message+' — повторите синхронизацию')}
  }else toast('Изменения сохранены локально. Для Google Drive откройте настройки.');
 };
}
function createFileName(m){let d=new Date(m.addedAt);const date=String(d.getFullYear()).slice(-2)+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');const clean=s=>s.normalize('NFC').replace(/[\\/\x00-\x1F:*?"<>|]/g,'').trim().replace(/\s+/g,'_').slice(0,80);return date+'-'+clean(m.lastName)+'-'+clean(m.firstName)+'.json'}
function showSettings(){openModal('Настройки','<form id="settingsForm"><div class="settings-section"><h3>Google Drive</h3><label class="field">Google OAuth Client ID<input name="clientId" autocomplete="off" placeholder="123456789-xxx.apps.googleusercontent.com" value="'+esc(settings.clientId)+'"></label><label class="field">ID папки или ссылка Google Drive<input name="folderId" autocomplete="off" placeholder="https://drive.google.com/drive/folders/…" value="'+esc(settings.folderId)+'"></label><p class="hint">Для подключения создайте OAuth Client ID типа Web application в Google Cloud Console и добавьте адрес сайта в Authorized JavaScript origins. Требуются права на файлы, создаваемые приложением в Drive. Для уже существующей папки используется отдельный выбор через Google Picker либо расширенное разрешение Drive: эта версия запрашивает доступ к Drive, чтобы читать JSON внутри указанной папки.</p><button type="button" class="secondary" id="connectBtn">Подключить Google Drive</button> <button type="button" class="secondary" id="refreshBtn">Обновить из Drive</button></div><div class="settings-section"><h3>Оформление</h3><label class="field">Цветовая схема<select name="theme"><option value="blue">Голубая</option><option value="green">Зелёная</option><option value="sand">Песочная</option><option value="dark">Тёмная</option></select></label><label class="field">Размер шрифта интерфейса <span id="fontVal">'+settings.fontSize+'</span> px<input name="fontSize" type="range" min="16" max="27" value="'+settings.fontSize+'"></label><label class="field">Размер имени в списке <span id="itemVal">'+settings.itemSize+'</span> px<input name="itemSize" type="range" min="18" max="34" value="'+settings.itemSize+'"></label></div><div class="settings-section"><h3>Локальное отображение</h3><p class="hint">«Убрать» скрывает участника только на этом iPad. Исходный JSON в Google Drive не удаляется и не изменяется.</p><button class="secondary" type="button" id="restoreBtn">Вернуть скрытых участников ('+hiddenIds.length+')</button></div><div class="actions"><button type="button" class="secondary" id="cancelForm">Закрыть</button><button class="primary" type="submit">Сохранить настройки</button></div></form>');const f=$('settingsForm');f.elements.theme.value=settings.theme;f.elements.fontSize.oninput=()=> $('fontVal').textContent=f.elements.fontSize.value;f.elements.itemSize.oninput=()=> $('itemVal').textContent=f.elements.itemSize.value;$('cancelForm').onclick=closeModal;$('restoreBtn').onclick=()=>{hiddenIds=[];save(HIDDEN,hiddenIds);render();showSettings();toast('Все скрытые участники восстановлены')};f.onsubmit=e=>{e.preventDefault();commitSettings(f);closeModal();toast('Настройки сохранены')};$('connectBtn').onclick=()=>{commitSettings(f);connectDrive(true)};$('refreshBtn').onclick=async()=>{commitSettings(f);await syncFromDrive()};}
function commitSettings(f){const oldClient=settings.clientId;settings={clientId:f.elements.clientId.value.trim(),folderId:parseFolderId(f.elements.folderId.value),theme:f.elements.theme.value,fontSize:Number(f.elements.fontSize.value),itemSize:Number(f.elements.itemSize.value)};save(KEY,settings);applySettings();if(oldClient!==settings.clientId){tokenClient=null;accessToken='';tokenExpires=0}}
function parseFolderId(s){return (s.match(/\/folders\/([a-zA-Z0-9_-]+)/)||[])[1]||s.trim()}
function cloudConfigured(){return !!(settings.clientId&&settings.folderId)}
function initializeClient(){if(!window.google?.accounts?.oauth2)throw Error('Библиотека авторизации Google пока не загрузилась');if(!tokenClient)tokenClient=google.accounts.oauth2.initTokenClient({client_id:settings.clientId,scope:'https://www.googleapis.com/auth/drive',callback:()=>{}})}
function connectDrive(interactive=false){if(!cloudConfigured()){toast('Введите Client ID и папку в настройках');return Promise.resolve(false)}try{initializeClient()}catch(err){toast(err.message);return Promise.resolve(false)}return new Promise(resolve=>{tokenClient.callback=async result=>{if(result.error){setStatus('Требуется вход');if(interactive)toast('Google: '+result.error);resolve(false);return}accessToken=result.access_token;tokenExpires=Date.now()+(Number(result.expires_in)||3600)*1000-90000;setStatus('Google Drive подключён');try{await syncFromDrive();resolve(true)}catch(err){toast('Ошибка чтения Drive: '+err.message);resolve(false)}};tokenClient.error_callback=()=>{setStatus('Требуется вход');resolve(false)};try{tokenClient.requestAccessToken({prompt:interactive?'consent':''})}catch(err){toast(err.message);resolve(false)}})}
async function ensureToken(){if(accessToken&&Date.now()<tokenExpires)return accessToken;const ok=await connectDrive(false);if(!ok)throw Error('Требуется подключение Google Drive в настройках');return accessToken}
async function api(path,options={}){let token=accessToken&&Date.now()<tokenExpires?accessToken:null;if(!token)token=await ensureToken();const response=await fetch('https://www.googleapis.com/drive/v3/'+path,{...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})}});if(!response.ok){const err=await response.text();throw Error('HTTP '+response.status+': '+err.slice(0,180))}if(response.status===204)return null;return response.json()}
async function listFolder(){const q=encodeURIComponent("'"+settings.folderId.replace(/'/g,'')+"' in parents and trashed = false");let page='',files=[];do{const data=await api('files?q='+q+'&fields=nextPageToken,files(id,name,mimeType)&page_size=1000'+(page?'&pageToken='+encodeURIComponent(page):''));files.push(...data.files);page=data.nextPageToken||''}while(page);return files}
async function readFile(id){return api('files/'+encodeURIComponent(id)+'?alt=media')}
async function uploadJson(name,value,existingId){const data=JSON.stringify(value,null,2);let res;if(existingId){res=await fetch('https://www.googleapis.com/upload/drive/v3/files/'+encodeURIComponent(existingId)+'?uploadType=media&fields=id,name',{method:'PATCH',headers:{Authorization:'Bearer '+await ensureToken(),'Content-Type':'application/json; charset=UTF-8'},body:data})}else{const boundary='gruppy'+crypto.randomUUID().replace(/-/g,'');const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name,parents:[settings.folderId],mimeType:'application/json'})+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+data+'\r\n--'+boundary+'--';res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',{method:'POST',headers:{Authorization:'Bearer '+await ensureToken(),'Content-Type':'multipart/related; boundary='+boundary},body})}if(!res.ok)throw Error('HTTP '+res.status+': '+(await res.text()).slice(0,130));return res.json()}
async function writeGroups(){const files=await listFolder();const old=files.find(f=>f.name==='_groups.json');await uploadJson('_groups.json',{version:1,groups},old?.id)}
async function writeMember(m){const files=await listFolder();let remote=files.find(f=>f.name===m.fileName);if(remote&&remote.id!==m.driveId&&!m.driveId&&!members.some(x=>x.id!==m.id&&x.fileName===m.fileName)){try{const other=await readFile(remote.id);if(other.id!==m.id)remote=null}catch{remote=null}}if(remote&&remote.id!==m.driveId&&!m.driveId){m.fileName=m.fileName.replace(/\.json$/,'-'+m.id.slice(0,8)+'.json');remote=null}const result=await uploadJson(m.fileName,m,m.driveId||remote?.id);m.driveId=result.id;cache()}
async function syncFromDrive(){if(!cloudConfigured())return;if(busy)return;busy=true;setStatus('Синхронизация…');try{const files=await listFolder();const gf=files.find(f=>f.name==='_groups.json');if(gf){const doc=await readFile(gf.id);groups=Array.isArray(doc.groups)?doc.groups:[]}else if(groups.length){await writeGroups()}const remote=[];for(const f of files.filter(x=>x.name.endsWith('.json')&&x.name!=='_groups.json')){try{const m=await readFile(f.id);if(m&&m.id&&m.firstName&&m.lastName)remote.push({...m,driveId:f.id,fileName:f.name})}catch(err){console.warn('Cannot read',f.name,err)}}const localUnsynced=members.filter(m=>!m.driveId&&!remote.some(r=>r.id===m.id));members=[...remote,...localUnsynced];cache();render();setStatus('Google Drive · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));if(localUnsynced.length)toast('Есть локальные записи, ещё не отправленные в Drive')}catch(err){setStatus('Ошибка синхронизации');throw err}finally{busy=false}}
$('toggleGroups').onclick=()=>{expanded=!expanded;$('groupList').hidden=!expanded;$('toggleGroups').setAttribute('aria-expanded',expanded);$('chevron').classList.toggle('expanded',expanded)};
$('groupList').onclick=e=>{const b=e.target.closest('[data-group]');if(!b)return;selected=b.dataset.group;render()};
$('search').oninput=render;
$('groupFilter').onchange=e=>{filterGroup=e.target.value;render()};
$('sortSelect').onchange=e=>{sortOrder=e.target.value;render()};
$('addBtn').onclick=()=>{$('addMenu').hidden=!$('addMenu').hidden;$('addBtn').setAttribute('aria-expanded',String(!$('addMenu').hidden))};
$('menuAddGroup').onclick=()=>{$('addMenu').hidden=true;$('addBtn').setAttribute('aria-expanded','false');showGroup()};
$('menuAddMember').onclick=()=>{$('addMenu').hidden=true;$('addBtn').setAttribute('aria-expanded','false');memberForm()};
$('settingsBtn').onclick=showSettings;
$('closeModal').onclick=closeModal;
$('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))closeModal()};
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal();$('addMenu').hidden=true}});
$('memberList').onclick=e=>{
 const expand=e.target.closest('[data-expand]'), menu=e.target.closest('[data-menu]'),edit=e.target.closest('[data-edit]'),hide=e.target.closest('[data-hide]');
 if(expand){const id=expand.dataset.expand;expandedMembers.has(id)?expandedMembers.delete(id):expandedMembers.add(id);openMemberMenu=null;render();return}
 if(menu){openMemberMenu=openMemberMenu===menu.dataset.menu?null:menu.dataset.menu;render();return}
 if(edit){const m=members.find(x=>x.id===edit.dataset.edit);openMemberMenu=null;if(m)memberForm(m);render();return}
 if(hide){const m=members.find(x=>x.id===hide.dataset.hide);openMemberMenu=null;if(m&&confirm('Удалить '+m.firstName+' '+m.lastName+' из списка только на этом iPad? JSON в Google Drive останется без изменений.')){if(!hiddenIds.includes(m.id))hiddenIds.push(m.id);save(HIDDEN,hiddenIds);expandedMembers.delete(m.id);render();toast('Участник удалён из списка. JSON не изменён.')}else render();return}
};
document.addEventListener('click',e=>{if(openMemberMenu&&!e.target.closest('.member-popover, [data-menu]')){openMemberMenu=null;render()}if(!$('addMenu').hidden&&!e.target.closest('#addBtn, #addMenu')){$('addMenu').hidden=true;$('addBtn').setAttribute('aria-expanded','false')}});
(function init(){const cached=read(DATA,{groups:[],members:[]});groups=cached.groups||[];members=cached.members||[];applySettings();render();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(console.warn);if(cloudConfigured()){setStatus('Подключение…');window.addEventListener('load',()=>setTimeout(()=>connectDrive(false),600))}})();
