'use strict';
/* Utilidades, estado global (S) e permissões do planner atual */
const $=s=>document.querySelector(s);
function iso(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function startWeek(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function plusDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function fmt(s,opts={day:'2-digit',month:'2-digit',year:'numeric'}){if(!s)return '—';return new Date(s+'T12:00:00').toLocaleDateString('pt-BR',opts)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dias(d){const n=Math.round((new Date(d+'T12:00:00')-new Date(iso(new Date())+'T12:00:00'))/864e5);return n<0?`atrasada há ${-n} d`:n===0?'hoje':n===1?'amanhã':`em ${n} dias`}
function subjColor(t){let h=0;for(const c of String(t).trim().toLowerCase())h=(h*31+c.charCodeAt(0))%360;return h}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.add('hidden'),3800)}
function normalizeDate(v){if(!v)return '';let s=String(v).trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;return ''}
function friendlyError(e){const m=String((e&&e.message)||e||'');
 if(/could not find the function|schema cache/i.test(m))return 'O banco ainda não foi atualizado para a v2.0.0. Rode o schema_v2.sql no Supabase.';
 if(/row-level security/i.test(m))return 'Você não tem permissão para esta ação neste planner.';
 return m}

/* Estado único do app: evita variáveis globais soltas */
const S={sb:null,user:null,enteredFor:null,isAppAdmin:false,planners:[],planner:null,records:[],
 selectedDate:iso(new Date()),weekAnchor:startWeek(new Date()),pendingImport:[],detailId:null};

function initClient(){
 if(!window.supabase||!supabaseConfig.url||!supabaseConfig.key)throw Error('Não encontrei a configuração do Supabase. Confira supabase-config.js.');
 S.sb=window.supabase.createClient(supabaseConfig.url,supabaseConfig.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}})}

/* Permissões do planner selecionado (a regra real é aplicada no banco; aqui só controla a tela) */
function canEdit(){return !!S.planner&&(S.planner.role==='editor'||S.planner.role==='admin')}
function canManage(){return !!S.planner&&(S.isAppAdmin||(S.planner.kind==='generico'&&S.planner.role==='admin'))}
function isDup(x){const k=r=>[r.exam_date,String(r.subject).trim().toLowerCase(),String(r.title).trim().toLowerCase()].join('|');return S.records.some(r=>k(r)===k(x))}
