'use strict';
/* Planners do usuário: carregar, trocar, criar e aplicar permissões na tela */
function storageKey(){return 'planner_atual_'+(S.user?S.user.id:'')}
function readSavedPlanner(){try{return localStorage.getItem(storageKey())}catch(e){return null}}
function savePlanner(id){try{localStorage.setItem(storageKey(),id)}catch(e){}}

async function loadPlanners(preferId){
 const {data,error}=await S.sb.rpc('sp_my_planners');
 if(error)throw error;
 S.planners=data||[];
 const want=preferId||(S.planner&&S.planner.planner_id)||readSavedPlanner();
 S.planner=S.planners.find(p=>p.planner_id===want)||S.planners[0]||null;
 if(S.planner)savePlanner(S.planner.planner_id);
 renderPlannerBar();
}

function plannerLabel(p){
 let t=p.name;
 if(p.kind==='marista')t+=' · Marista';
 else if(S.isAppAdmin&&p.owner_email)t+=' · '+p.owner_email;
 return t}

function renderPlannerBar(){
 const has=S.planners.length>0;
 $('#planner-bar').classList.toggle('hidden',!has);
 $('#view-empty').classList.toggle('hidden',has);
 $('#planner-area').classList.toggle('hidden',!has);
 const sel=$('#planner-select');sel.innerHTML='';
 S.planners.forEach(p=>sel.appendChild(new Option(plannerLabel(p),p.planner_id)));
 if(S.planner)sel.value=S.planner.planner_id;
 const badge=$('#role-badge');
 if(S.planner){const r=S.planner.role;badge.textContent=S.isAppAdmin?'Administrador geral':(ROLE_LABEL[r]||r);badge.className='role-badge '+(r||'')}
 renderBanner();
}

function renderBanner(){
 const b=$('#planner-banner');const msgs=[];
 if(S.planner){
  if(S.planner.role==='leitor')msgs.push('Modo leitura: você pode ver as provas, mas não alterar.');
  const mine=String(S.user&&S.user.email||'').toLowerCase();
  if(S.isAppAdmin&&S.planner.kind==='generico'&&S.planner.owner_email&&S.planner.owner_email.toLowerCase()!==mine)
   msgs.push('Você está vendo o planner de '+S.planner.owner_email+' como administrador geral.');
 }
 b.textContent=msgs.join(' ');b.classList.toggle('hidden',!msgs.length)}

/* Mostra/esconde botões e abas conforme o papel no planner atual */
function applyPermissions(){
 const edit=canEdit(),manage=canManage();
 $('#tab-import').classList.toggle('hidden',!edit);
 $('#tab-users').classList.toggle('hidden',!manage);
 ['#add-item','#add-item-2','#import-json-trigger'].forEach(s=>$(s).classList.toggle('hidden',!edit));
 $('#planner-area').classList.toggle('readonly',!edit);
 const active=document.querySelector('.tab.active');
 if(active&&active.classList.contains('hidden'))setTab('home');
}

async function switchPlanner(id){
 const p=S.planners.find(x=>x.planner_id===id);if(!p)return;
 S.planner=p;savePlanner(id);S.records=[];S.pendingImport=[];
 $('#import-preview').innerHTML='';$('#import-status').textContent='';$('#save-import').classList.add('hidden');
 closeDetail();renderPlannerBar();applyPermissions();render();
 await refresh();
 if(!$('#view-users').classList.contains('hidden'))loadUsersTab();
}

function openPlannerModal(){$('#planner-form').reset();$('#plannermodal').classList.remove('hidden');$('#planner-name').focus()}
function closePlannerModal(){$('#plannermodal').classList.add('hidden')}
async function createPlanner(e){
 e.preventDefault();
 const name=$('#planner-name').value.trim();
 try{
  const {data,error}=await S.sb.rpc('sp_create_planner',{p_name:name});
  if(error)throw error;
  closePlannerModal();
  await loadPlanners(data);await switchPlanner(data);
  toast('Planner criado. Você é o administrador dele.');
 }catch(err){toast('Não foi possível criar: '+friendlyError(err))}
}
