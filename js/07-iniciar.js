'use strict';
/* Abas, ligação dos botões e inicialização. Roda por último. */
function setTab(t){
 if(!TABS.includes(t))t='home';
 const btn=document.querySelector('.tab[data-tab="'+t+'"]');
 if(!btn||btn.classList.contains('hidden'))t='home';
 document.querySelectorAll('.view[id^="view-"]').forEach(v=>{if(v.id!=='view-empty')v.classList.toggle('hidden',v.id!=='view-'+t)});
 document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
 history.replaceState(null,'','#'+t);window.scrollTo({top:0});
 if(t==='users')loadUsersTab();
}

function bindEvents(){
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
 $('#login').onclick=doLogin;$('#signup').onclick=doSignup;$('#forgot').onclick=doForgot;$('#logout').onclick=doLogout;
 $('#password').onkeydown=e=>{if(e.key==='Enter')$('#login').click()};
 $('#planner-select').onchange=e=>switchPlanner(e.target.value);
 $('#new-planner').onclick=openPlannerModal;$('#new-planner-2').onclick=openPlannerModal;
 $('#close-planner-modal').onclick=closePlannerModal;$('#cancel-planner-modal').onclick=closePlannerModal;$('#planner-form').onsubmit=createPlanner;
 $('#add-item').onclick=()=>openNew(S.selectedDate);$('#add-item-2').onclick=()=>openNew(S.selectedDate);
 $('#close-modal').onclick=closeModal;$('#cancel-modal').onclick=closeModal;$('#item-form').onsubmit=saveItem;$('#delete-item').onclick=deleteItem;
 $('#close-detail').onclick=closeDetail;$('#detailback').onclick=e=>{if(e.target.id==='detailback')closeDetail()};
 $('#prev-week').onclick=()=>{S.weekAnchor=plusDays(S.weekAnchor,-7);render()};
 $('#next-week').onclick=()=>{S.weekAnchor=plusDays(S.weekAnchor,7);render()};
 $('#today-week').onclick=()=>{S.weekAnchor=startWeek(new Date());S.selectedDate=iso(new Date());render()};
 $('#filter-subject').onchange=renderAll;$('#show-past').onchange=renderAll;
 $('#ai-import').onclick=readImport;$('#save-import').onclick=saveImport;
 $('#export-json').onclick=exportJson;$('#import-json-trigger').onclick=()=>$('#import-json-file').click();$('#import-json-file').onchange=importJsonFile;
 $('#members-list').addEventListener('click',onMembersClick);$('#members-list').addEventListener('change',onMembersChange);
 $('#invite-form').onsubmit=inviteUser;$('#rename-planner').onclick=renamePlanner;$('#delete-planner').onclick=deletePlanner;
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&S.user&&S.planner)refresh()});
}

bindEvents();
if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
try{initClient();watchAuth()}catch(e){showAuth(e.message)}
