'use strict';
/* Provas do planner selecionado: carregar, desenhar, cadastrar, editar e excluir */
async function loadRecords(){
 if(!S.planner){S.records=[];render();return}
 const pid=S.planner.planner_id;
 const {data,error}=await S.sb.from('school_planner_items').select('*').eq('planner_id',pid).order('exam_date',{ascending:true});
 if(error)throw error;
 if(!S.planner||S.planner.planner_id!==pid)return; // trocou de planner enquanto carregava
 S.records=data||[];render();
}
async function refresh(){try{await loadRecords()}catch(e){toast('Erro ao carregar dados: '+friendlyError(e))}}

function render(){renderWeek();renderDay();renderAll();renderStats();renderFilters();if(S.detailId&&!$('#detailback').classList.contains('hidden'))openDetail(S.detailId)}

function renderWeek(){
 const grid=$('#week-grid');grid.innerHTML='';
 const end=plusDays(S.weekAnchor,6);
 $('#week-label').textContent=`${fmt(iso(S.weekAnchor),{day:'2-digit',month:'long'})} – ${fmt(iso(end),{day:'2-digit',month:'long',year:'numeric'})}`;
 const today=iso(new Date());
 for(let i=0;i<7;i++){
  const d=plusDays(S.weekAnchor,i),key=iso(d),items=S.records.filter(r=>r.exam_date===key);
  const el=document.createElement('div');
  el.className='day'+(key===today?' today':'')+(key===S.selectedDate?' selected':'');
  el.innerHTML=`<div class="dayname">${d.toLocaleDateString('pt-BR',{weekday:'short'})}</div><div class="daynum">${d.getDate()}</div><div class="dayev">${items.map(r=>`<div class="event" data-open="${esc(r.id)}" style="--h:${subjColor(r.subject)}"><b>${r.status==='Estudado'||r.status==='Realizada'?'✓ ':''}${r.priority==='alta'?'❗':''}${esc(r.subject)}</b></div>`).join('')}</div>`;
  el.tabIndex=0;el.setAttribute('role','button');
  el.onclick=()=>{S.selectedDate=key;render()};
  el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();el.onclick()}};
  el.querySelectorAll('[data-open]').forEach(c=>c.onclick=e=>{e.stopPropagation();openDetail(c.dataset.open)});
  grid.appendChild(el);
 }
}

function itemMarkup(r){
 const done=r.status==='Estudado'||r.status==='Realizada',late=r.exam_date<iso(new Date())&&!done,edit=canEdit();
 const quick=edit?`<div class="quick">${!done?`<button class="secondary" data-quick="Estudado" data-id="${esc(r.id)}">✓ Estudado</button>`:''}${r.status!=='Realizada'?`<button class="secondary" data-quick="Realizada" data-id="${esc(r.id)}">Realizada</button>`:`<button class="secondary" data-quick="A estudar" data-id="${esc(r.id)}">Reabrir</button>`}</div>`:'';
 return `<article class="item"><div class="itemtop"><div class="item-heading"><h3>${esc(r.title)}</h3><span class="subject" style="--h:${subjColor(r.subject)}">${esc(r.subject)}</span> <span class="pill">${esc(r.status||'A estudar')}</span><div class="item-meta">${fmt(r.exam_date)} · <span class="${late?'late':''}">${dias(r.exam_date)}</span> · Prioridade ${esc(r.priority||'normal')}</div></div>${edit?`<button class="secondary edit-button" data-edit="${esc(r.id)}">Editar</button>`:''}</div>${r.topics?`<p class="item-detail"><b>Conteúdos:</b> ${esc(r.topics).replace(/\n/g,'<br>')}</p>`:''}${r.study_notes?`<p class="item-detail plan-detail"><b>Plano:</b> ${esc(r.study_notes).replace(/\n/g,'<br>')}</p>`:''}${quick}</article>`;
}

function openDetail(id){const r=S.records.find(x=>x.id===id);if(!r)return;S.detailId=id;$('#detail-title').textContent=r.subject;$('#detail-body').innerHTML=itemMarkup(r);bindEdit();$('#detailback').classList.remove('hidden')}
function closeDetail(){S.detailId=null;$('#detailback').classList.add('hidden')}

function renderDay(){
 const list=S.records.filter(r=>r.exam_date===S.selectedDate).sort((a,b)=>a.subject.localeCompare(b.subject));
 $('#selected-title').textContent='Agenda · '+fmt(S.selectedDate,{weekday:'short',day:'2-digit',month:'short'});
 $('#day-list').innerHTML=list.length?list.map(itemMarkup).join(''):'<p class="muted small">Nenhuma prova cadastrada para este dia.</p>';
 bindEdit();
}
function renderAll(){
 const filter=$('#filter-subject').value,now=iso(new Date());
 const arr=S.records.filter(r=>!filter||r.subject===filter).filter(r=>$('#show-past').checked||r.exam_date>=now).sort((a,b)=>a.exam_date.localeCompare(b.exam_date));
 $('#all-list').innerHTML=arr.length?arr.map(itemMarkup).join(''):'<p class="muted">Nenhuma prova futura cadastrada.</p>';
 bindEdit();
}
function bindEdit(){
 document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{closeDetail();openEdit(S.records.find(r=>r.id===b.dataset.edit))});
 document.querySelectorAll('[data-quick]').forEach(b=>b.onclick=async e=>{
  e.stopPropagation();if(!canEdit())return;
  const {error}=await S.sb.from('school_planner_items').update({status:b.dataset.quick,updated_at:new Date().toISOString(),updated_by:S.user.id}).eq('id',b.dataset.id).eq('planner_id',S.planner.planner_id);
  if(error)return toast('Erro: '+friendlyError(error));
  await refresh();
 });
}
function renderStats(){
 const wk=startWeek(new Date()),end=iso(plusDays(wk,6)),start=iso(wk),now=iso(new Date());
 $('#stat-week').textContent=S.records.filter(r=>r.exam_date>=start&&r.exam_date<=end&&r.status!=='Realizada').length;
 const next=S.records.filter(r=>r.exam_date>=now&&r.status!=='Realizada').sort((a,b)=>a.exam_date.localeCompare(b.exam_date))[0];
 $('#stat-next').textContent=next?fmt(next.exam_date,{day:'2-digit',month:'2-digit'}):'—';
 $('#stat-next-sub').textContent=next?next.subject+' · '+dias(next.exam_date):'Próxima prova';
 $('#stat-subjects').textContent=new Set(S.records.map(r=>r.subject.trim().toLowerCase()).filter(Boolean)).size;
}
function renderFilters(){
 const old=$('#filter-subject').value,subs=[...new Set(S.records.map(r=>r.subject).filter(Boolean))].sort();
 $('#filter-subject').innerHTML='<option value="">Todas as disciplinas</option>'+subs.map(s=>`<option>${esc(s)}</option>`).join('');
 $('#filter-subject').value=subs.includes(old)?old:'';
}

function openNew(date=S.selectedDate){
 if(!canEdit())return toast('Você tem acesso somente de leitura neste planner.');
 $('#item-form').reset();$('#item-id').value='';$('#date').value=date;$('#status').value='A estudar';
 $('#modal-title').textContent='Cadastrar prova';$('#delete-item').classList.add('hidden');$('#modalback').classList.remove('hidden');
}
function openEdit(r){
 if(!r||!canEdit())return;
 $('#item-id').value=r.id;$('#subject').value=r.subject||'';$('#date').value=r.exam_date;$('#title').value=r.title||'';
 $('#status').value=r.status||'A estudar';$('#topics').value=r.topics||'';$('#study').value=r.study_notes||'';$('#color').value=r.priority||'normal';
 $('#modal-title').textContent='Editar prova';$('#delete-item').classList.remove('hidden');$('#modalback').classList.remove('hidden');
}
function closeModal(){$('#modalback').classList.add('hidden')}

async function saveItem(e){
 e.preventDefault();
 if(!canEdit())return toast('Você tem acesso somente de leitura neste planner.');
 const id=$('#item-id').value;
 const row={subject:$('#subject').value.trim(),exam_date:$('#date').value,title:$('#title').value.trim(),status:$('#status').value,topics:$('#topics').value.trim(),study_notes:$('#study').value.trim(),priority:$('#color').value,updated_at:new Date().toISOString(),updated_by:S.user.id};
 if(!row.subject||!row.exam_date||!row.title)return;
 try{
  const res=id?await S.sb.from('school_planner_items').update(row).eq('id',id).eq('planner_id',S.planner.planner_id).select()
              :await S.sb.from('school_planner_items').insert({...row,planner_id:S.planner.planner_id,created_by:S.user.id}).select();
  if(res.error)throw res.error;
  S.selectedDate=row.exam_date;closeModal();await refresh();toast('Registro salvo e sincronizado.');
 }catch(err){toast('Não foi possível salvar: '+friendlyError(err))}
}
async function deleteItem(){
 const id=$('#item-id').value;
 if(!id||!canEdit()||!confirm('Excluir este registro para todos os usuários deste planner?'))return;
 try{
  const {error}=await S.sb.from('school_planner_items').delete().eq('id',id).eq('planner_id',S.planner.planner_id);
  if(error)throw error;
  closeModal();await refresh();toast('Registro excluído.');
 }catch(err){toast('Erro ao excluir: '+friendlyError(err))}
}
