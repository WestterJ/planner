'use strict';
/* Importação por IA (PDF/foto) e backup JSON do planner selecionado */
async function extractPdf(file){
 const buf=await file.arrayBuffer(),pdf=await pdfjsLib.getDocument({data:buf}).promise;let out='';
 for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),c=await p.getTextContent();out+='--- Página '+i+' ---\n'+c.items.map(x=>x.str+(x.hasEOL?'\n':' ')).join('')+'\n'}
 return out.trim()}
function dataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(file)})}

const IMPORT_INSTRUCTION=()=>'Hoje é '+iso(new Date())+'. Você organiza calendários escolares brasileiros. Responda somente JSON válido com a estrutura {"items":[{"subject":"disciplina","exam_date":"AAAA-MM-DD","title":"nome da prova","topics":"conteúdos","study_notes":"observações","priority":"normal|alta|baixa"}]}. Não invente datas. Use ano explícito no documento; se não houver ano, use o ano atual apenas quando isso for inequívoco, caso contrário omita o registro e explique em study_notes. Ignore registros sem data identificável. Datas em formato brasileiro DD/MM/AAAA. Conteúdos podem ser texto resumido fiel ao documento.';

async function readImport(){
 if(!canEdit())return toast('Você tem acesso somente de leitura neste planner.');
 const file=$('#import-file').files[0];
 if(!file)return toast('Selecione um PDF ou uma foto primeiro.');
 if(!S.user)return toast('Entre na sua conta para usar a IA.');
 const btn=$('#ai-import');btn.disabled=true;
 $('#import-status').textContent='Lendo o arquivo e organizando as informações com IA...';
 $('#import-preview').innerHTML='';S.pendingImport=[];
 const pid=S.planner.planner_id;
 try{
  const parts=[];
  if(file.type==='application/pdf'){
   const text=await extractPdf(file);
   if(!text)throw Error('O PDF não contém texto selecionável. Para PDF digitalizado, envie fotos das páginas.');
   if(text.length>95000)throw Error(`O PDF contém ${text.length.toLocaleString('pt-BR')} caracteres. O limite atual por envio é 100.000; este documento precisa ser dividido em partes. Por enquanto, use um PDF menor ou separado por capítulos.`);
   parts.push({text:'Extraia datas de provas e conteúdos deste documento. Texto do PDF:\n'+text});
  }else if(file.type.startsWith('image/')){
   if(file.size>12*1024*1024)throw Error('A imagem deve ter no máximo 12 MB.');
   parts.push({inlineData:{mimeType:file.type,data:await dataURL(file)}});
   parts.push({text:'Leia esta foto e extraia todas as provas/avaliações, datas e conteúdos.'});
  }else throw Error('Formato não suportado. Use PDF, JPG, PNG ou WEBP.');
  const payload={modo:file.type==='application/pdf'?'edital':'agenda',systemInstruction:{parts:[{text:IMPORT_INSTRUCTION()}]},contents:[{role:'user',parts}],
   generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{items:{type:'ARRAY',items:{type:'OBJECT',properties:{subject:{type:'STRING'},exam_date:{type:'STRING'},title:{type:'STRING'},topics:{type:'STRING'},study_notes:{type:'STRING'},priority:{type:'STRING'}},required:['subject','exam_date','title','topics','study_notes','priority']}}},required:['items']},temperature:0.1,maxOutputTokens:5000}};
  const {data:sd,error:se}=await S.sb.auth.getSession();const token=sd?.session?.access_token;
  if(se||!token)throw Error('Sessão expirada. Entre novamente.');
  const resp=await fetch(supabaseConfig.url.replace(/\/$/,'')+'/functions/v1/dynamic-service',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'apikey':supabaseConfig.key},body:JSON.stringify(payload)});
  if(!resp.ok){let msg='Serviço de IA retornou HTTP '+resp.status;try{const b=await resp.json();msg=b.error||b.message||msg}catch{}throw Error(msg)}
  const data=await resp.json(),txt=data?.candidates?.[0]?.content?.parts?.find(p=>typeof p.text==='string')?.text;
  if(!txt)throw Error('A IA retornou resposta vazia.');
  const parsed=JSON.parse(txt.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim());
  if(!S.planner||S.planner.planner_id!==pid)return; // trocou de planner durante a leitura
  S.pendingImport=(parsed.items||[]).map(x=>({...x,exam_date:normalizeDate(x.exam_date),priority:['alta','baixa','normal'].includes(x.priority)?x.priority:'normal'})).filter(x=>x.subject&&x.exam_date&&/^\d{4}-\d{2}-\d{2}$/.test(x.exam_date)&&x.title);
  if(!S.pendingImport.length)throw Error('Não encontrei provas com datas válidas. Confira se o arquivo contém datas.');
  renderImportPreview();
 }catch(e){$('#import-status').textContent=e.message;toast(e.message)}
 finally{btn.disabled=false}
}

function renderImportPreview(){
 const n=S.pendingImport.length;
 $('#import-status').textContent=n?`A IA encontrou ${n} registro(s). Revise a prévia antes de salvar.`:'Nenhum registro na importação.';
 $('#import-preview').innerHTML=S.pendingImport.map((x,i)=>`<div class="item"><b>${esc(x.exam_date)} · ${esc(x.subject)}</b><div>${esc(x.title)}</div><div class="small muted">${esc(x.topics||'Sem conteúdo identificado')}</div><button class="secondary" data-drop-import="${i}" style="margin-top:6px">Remover da importação</button></div>`).join('');
 document.querySelectorAll('[data-drop-import]').forEach(b=>b.onclick=()=>{S.pendingImport.splice(Number(b.dataset.dropImport),1);renderImportPreview()});
 $('#save-import').classList.toggle('hidden',!n);
}

async function saveImport(){
 if(!S.pendingImport.length||!canEdit())return;
 try{
  const rows=S.pendingImport.map(x=>({planner_id:S.planner.planner_id,subject:x.subject.trim(),exam_date:x.exam_date,title:x.title.trim(),topics:x.topics||'',study_notes:x.study_notes||'',priority:x.priority||'normal',status:'A estudar',created_by:S.user.id,updated_by:S.user.id}));
  const nov=rows.filter(x=>!isDup(x));
  if(!nov.length)return toast('Todos esses registros já existem neste planner.');
  const {error}=await S.sb.from('school_planner_items').insert(nov);
  if(error)throw error;
  S.selectedDate=nov[0].exam_date;S.pendingImport=[];
  $('#import-preview').innerHTML='';$('#import-status').textContent='Importação salva com sucesso.';$('#save-import').classList.add('hidden');
  await refresh();
  toast('Registros importados.'+(nov.length<rows.length?` (${rows.length-nov.length} duplicado(s) ignorado(s))`:''));
 }catch(e){toast('Erro ao salvar importação: '+friendlyError(e))}
}

function exportJson(){
 try{
  const payload={app:'Planner Escolar Familiar',version:APP_VERSION,planner:S.planner?S.planner.name:'',exported_at:new Date().toISOString(),format:'planner-escolar-familiar-json-v1',
   items:S.records.map(r=>({subject:r.subject,exam_date:r.exam_date,title:r.title,topics:r.topics||'',study_notes:r.study_notes||'',status:r.status||'A estudar',priority:r.priority||'normal'}))};
  const slug=(S.planner?S.planner.name:'planner').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'planner';
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='planner-backup-'+slug+'-'+iso(new Date())+'.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  $('#json-status').textContent=`Backup exportado: ${payload.items.length} registro(s).`;toast('Backup JSON exportado.');
 }catch(e){$('#json-status').textContent='Falha ao exportar: '+e.message}
}

async function importJsonFile(e){
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(!canEdit())throw Error('Você tem acesso somente de leitura neste planner.');
  const parsed=JSON.parse(await file.text());
  const list=Array.isArray(parsed)?parsed:parsed.items;
  if(!Array.isArray(list))throw Error('O JSON precisa conter uma lista "items" ou ser uma lista de registros.');
  const clean=list.map((x,i)=>{
   const date=normalizeDate(x.exam_date||x.data||x.date),subject=String(x.subject||x.disciplina||'').trim(),title=String(x.title||x.titulo||x.prova||'').trim();
   if(!subject||!date||!title)throw Error(`Registro ${i+1}: disciplina, data e título são obrigatórios ou estão inválidos.`);
   return {planner_id:S.planner.planner_id,subject,exam_date:date,title,topics:String(x.topics||x.conteudos||x['conteúdos']||''),study_notes:String(x.study_notes||x.observacoes||x['observações']||''),
    status:['A estudar','Revisando','Estudado','Realizada'].includes(x.status)?x.status:'A estudar',priority:['normal','alta','baixa'].includes(x.priority)?x.priority:'normal',created_by:S.user.id,updated_by:S.user.id};
  });
  if(!clean.length)throw Error('O arquivo não contém registros para importar.');
  if(!confirm(`Foram encontrados ${clean.length} registro(s).\n\nOK = adicionar ao planner "${S.planner.name}".\nCancelar = não importar.`))return;
  const nov=clean.filter(x=>!isDup(x));
  if(!nov.length)throw Error('Todos os registros do arquivo já existem neste planner.');
  const {error}=await S.sb.from('school_planner_items').insert(nov);
  if(error)throw error;
  $('#json-status').textContent=`Importação concluída: ${nov.length} registro(s) adicionados.`;
  await refresh();toast('Backup JSON importado com sucesso.');
 }catch(err){$('#json-status').textContent='Não foi possível importar: '+friendlyError(err);toast('Erro no JSON: '+friendlyError(err))}
 finally{e.target.value=''}
}
