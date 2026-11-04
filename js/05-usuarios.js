'use strict';
/* Aba Usuários: permissões por pessoa no planner atual + visão geral do administrador geral */
function roleOptions(selected){
 const roles=S.planner&&S.planner.kind==='generico'?['leitor','editor','admin']:['leitor','editor'];
 return roles.map(r=>`<option value="${r}"${r===selected?' selected':''}>${ROLE_LABEL[r]}</option>`).join('');
}

async function loadUsersTab(){
 if(!S.planner||!canManage())return;
 const p=S.planner;
 $('#users-planner-name').textContent=p.name;
 $('#users-kind').textContent=p.kind==='marista'?'Marista':'Genérico';
 $('#invite-role').innerHTML=roleOptions('leitor');
 document.querySelector('label[for="invite-email"]').textContent=S.isAppAdmin?'Convidar e-mail que ainda não tem conta':'Dar acesso por e-mail';
 $('#delete-planner').classList.toggle('hidden',p.kind!=='generico');
 $('#users-overview').classList.toggle('hidden',!S.isAppAdmin);
 renderOverview();
 const box=$('#members-list');box.innerHTML='<p class="muted small">Carregando...</p>';
 const pid=p.planner_id;
 if(S.isAppAdmin){
  const [u,m]=await Promise.all([S.sb.rpc('sp_all_users',{p_planner:pid}),S.sb.rpc('sp_members',{p_planner:pid})]);
  if(!S.planner||S.planner.planner_id!==pid)return;
  const err=u.error||m.error;
  if(err){box.innerHTML='<p class="muted small">Não foi possível carregar: '+esc(friendlyError(err))+'</p>';return}
  renderAllUsers(u.data||[],(m.data||[]).filter(x=>x.r_pending));
  return;
 }
 const {data,error}=await S.sb.rpc('sp_members',{p_planner:pid});
 if(!S.planner||S.planner.planner_id!==pid)return;
 if(error){box.innerHTML='<p class="muted small">Não foi possível carregar: '+esc(friendlyError(error))+'</p>';return}
 renderMembers(data||[]);
}

/* Administrador geral: todos os usuários cadastrados, cada um com a permissão neste planner */
function renderAllUsers(users,pending){
 const rank=u=>u.r_is_admin?0:(u.r_role?1:2);
 users=users.slice().sort((a,b)=>rank(a)-rank(b)||String(a.r_email).localeCompare(b.r_email));
 const semAcesso='<option value="">Sem acesso</option>';
 const rows=users.map(u=>{
  if(u.r_is_admin)return `<div class="member-row"><div class="member-info"><b>${esc(u.r_email)}</b><small>Administrador geral · acesso total</small></div></div>`;
  const st=(u.r_is_owner?'Dono · ':'')+(u.r_role?(u.r_active?'Acesso ativo':'Acesso pausado'):'Sem acesso');
  const pause=u.r_role?`<button class="secondary" data-act="${u.r_active?'pause':'resume'}" data-user="${esc(u.r_user_id)}" data-role="${esc(u.r_role)}">${u.r_active?'Pausar':'Reativar'}</button>`:'';
  return `<div class="member-row${u.r_role&&!u.r_active?' paused':''}"><div class="member-info"><b>${esc(u.r_email)}</b><small>${st}</small></div>
  <select data-act="set-role" data-user="${esc(u.r_user_id)}" data-email="${esc(u.r_email)}" aria-label="Permissão de ${esc(u.r_email)}">${semAcesso.replace('<option value="">',u.r_role?'<option value="">':'<option value="" selected>')}${roleOptions(u.r_role)}</select>${pause}</div>`}).join('');
 const inv=pending.length?'<h3 style="margin:14px 0 4px;font-size:14px">Convites pendentes</h3>'+pending.map(m=>`<div class="member-row"><div class="member-info"><b>${esc(m.r_email)}</b><small>Convite pendente · ${esc(ROLE_LABEL[m.r_role]||m.r_role)}</small></div><button class="secondary" data-act="del-invite" data-invite="${esc(m.r_invite_id)}">Cancelar convite</button></div>`).join(''):'';
 $('#members-list').innerHTML='<h3 style="margin:0 0 4px;font-size:14px">Usuários cadastrados</h3><p class="small muted" style="margin:0 0 6px">Escolha a permissão de cada pessoa neste planner. "Sem acesso" remove o acesso.</p>'+(rows||'<p class="muted small">Nenhum usuário cadastrado.</p>')+inv;
}

function renderMembers(list){
 const box=$('#members-list');
 const note=S.planner.kind==='marista'?'<p class="small muted" style="margin:0 0 6px">O administrador geral já tem acesso total e não aparece nesta lista.</p>':'';
 if(!list.length){box.innerHTML=note+'<p class="muted small">Ninguém além de você tem acesso a este planner ainda.</p>';return}
 box.innerHTML=note+list.map(m=>{
  if(m.r_pending)return `<div class="member-row"><div class="member-info"><b>${esc(m.r_email)}</b><small>Convite pendente · ${esc(ROLE_LABEL[m.r_role]||m.r_role)}</small></div><button class="secondary" data-act="del-invite" data-invite="${esc(m.r_invite_id)}">Cancelar convite</button></div>`;
  return `<div class="member-row${m.r_active?'':' paused'}"><div class="member-info"><b>${esc(m.r_email)}</b><small>${m.r_is_owner?'Dono · ':''}${m.r_active?'Acesso ativo':'Acesso pausado'}</small></div>
  <select data-act="role" data-user="${esc(m.r_user_id)}" aria-label="Permissão de ${esc(m.r_email)}">${roleOptions(m.r_role)}</select>
  <button class="secondary" data-act="${m.r_active?'pause':'resume'}" data-user="${esc(m.r_user_id)}" data-role="${esc(m.r_role)}">${m.r_active?'Pausar':'Reativar'}</button>
  <button class="danger" data-act="remove" data-user="${esc(m.r_user_id)}" data-email="${esc(m.r_email)}">Remover</button></div>`}).join('');
}

async function usersRpc(fn,args,okMsg){
 try{
  const {data,error}=await S.sb.rpc(fn,args);
  if(error)throw error;
  if(okMsg)toast(okMsg);
  await loadUsersTab();
  loadPlanners(S.planner.planner_id).then(()=>{renderBanner()}).catch(()=>{});
  return data;
 }catch(e){toast(friendlyError(e));await loadUsersTab()}
}

function onMembersClick(e){
 const b=e.target.closest('button[data-act]');if(!b||!canManage())return;
 const pid=S.planner.planner_id,act=b.dataset.act;
 if(act==='pause')return usersRpc('sp_update_member',{p_planner:pid,p_user:b.dataset.user,p_role:b.dataset.role,p_active:false},'Acesso pausado.');
 if(act==='resume')return usersRpc('sp_update_member',{p_planner:pid,p_user:b.dataset.user,p_role:b.dataset.role,p_active:true},'Acesso reativado.');
 if(act==='remove'){if(!confirm('Remover o acesso de '+b.dataset.email+' a este planner?'))return;return usersRpc('sp_remove_member',{p_planner:pid,p_user:b.dataset.user},'Acesso removido.')}
 if(act==='del-invite')return usersRpc('sp_remove_invite',{p_invite:b.dataset.invite},'Convite cancelado.');
}
function onMembersChange(e){
 if(!canManage())return;
 const pid=S.planner.planner_id;
 const sr=e.target.closest('select[data-act="set-role"]');
 if(sr){
  if(sr.value==='')return usersRpc('sp_remove_member',{p_planner:pid,p_user:sr.dataset.user},'Acesso removido.');
  return usersRpc('sp_grant',{p_planner:pid,p_email:sr.dataset.email,p_role:sr.value},'Permissão atualizada.');
 }
 const s=e.target.closest('select[data-act="role"]');if(!s)return;
 usersRpc('sp_update_member',{p_planner:pid,p_user:s.dataset.user,p_role:s.value,p_active:true},'Permissão atualizada.');
}

async function inviteUser(e){
 e.preventDefault();if(!canManage())return;
 const email=$('#invite-email').value.trim();
 const r=await usersRpc('sp_grant',{p_planner:S.planner.planner_id,p_email:email,p_role:$('#invite-role').value});
 if(r==='adicionado'){toast('Acesso liberado para '+email+'.');$('#invite-email').value=''}
 else if(r==='convite'){toast('Convite criado: o acesso é liberado quando '+email+' entrar com esse e-mail.');$('#invite-email').value=''}
}

async function renamePlanner(){
 if(!canManage())return;
 const nome=prompt('Novo nome do planner:',S.planner.name);
 if(!nome||nome.trim()===S.planner.name)return;
 try{
  const {error}=await S.sb.rpc('sp_rename_planner',{p_planner:S.planner.planner_id,p_name:nome});
  if(error)throw error;
  await loadPlanners(S.planner.planner_id);await loadUsersTab();toast('Planner renomeado.');
 }catch(err){toast(friendlyError(err))}
}

async function deletePlanner(){
 if(!canManage()||S.planner.kind!=='generico')return;
 const nome=prompt('Excluir apaga TODAS as provas e acessos deste planner e não tem volta.\nDigite o nome do planner para confirmar:\n'+S.planner.name);
 if(nome===null)return;
 if(nome.trim()!==S.planner.name)return toast('O nome digitado não confere. Nada foi excluído.');
 try{
  const {error}=await S.sb.rpc('sp_delete_planner',{p_planner:S.planner.planner_id});
  if(error)throw error;
  S.planner=null;await loadPlanners();applyPermissions();
  if(S.planner)await switchPlanner(S.planner.planner_id);else{S.records=[];render()}
  setTab('home');toast('Planner excluído.');
 }catch(err){toast(friendlyError(err))}
}

function renderOverview(){
 const box=$('#overview-list');
 if(!S.isAppAdmin){box.innerHTML='';return}
 box.innerHTML=S.planners.map(p=>`<div class="overview-row"><div class="member-info"><b>${esc(p.name)}</b><small>${p.kind==='marista'?'Planner Marista':'Genérico · dono: '+esc(p.owner_email||'—')} · ${Number(p.member_count)} membro(s)</small></div>${S.planner&&p.planner_id===S.planner.planner_id?'<span class="pill">Aberto</span>':`<button class="secondary" data-open-planner="${esc(p.planner_id)}">Abrir</button>`}</div>`).join('');
 box.querySelectorAll('[data-open-planner]').forEach(b=>b.onclick=()=>switchPlanner(b.dataset.openPlanner));
}
