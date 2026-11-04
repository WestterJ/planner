'use strict';
/* Login, cadastro, recuperação de senha e entrada no app */
function showAuth(msg){$('#auth-view').classList.remove('hidden');$('#app-view').classList.add('hidden');$('#logout').classList.add('hidden');$('#user-label').textContent='';if(msg)$('#auth-msg').textContent=msg}
function showApp(){$('#auth-view').classList.add('hidden');$('#app-view').classList.remove('hidden');$('#logout').classList.remove('hidden');$('#user-label').textContent=S.user?.email||''}

function resetSession(){S.user=null;S.enteredFor=null;S.isAppAdmin=false;S.planners=[];S.planner=null;S.records=[];S.pendingImport=[];closeDetail()}

/* Depois do login: garante perfil/convites, descobre papel e planners, carrega provas */
async function enterApp(user){
 if(S.enteredFor===user.id)return;
 S.enteredFor=user.id;S.user=user;showApp();
 try{
  const ens=await S.sb.rpc('sp_ensure_profile');if(ens.error)throw ens.error;
  const adm=await S.sb.rpc('sp_is_app_admin');if(adm.error)throw adm.error;
  S.isAppAdmin=adm.data===true;
  await loadPlanners();
  applyPermissions();
  await refresh();
  const h=location.hash.slice(1);
  setTab(TABS.includes(h)?h:'home');
 }catch(e){S.enteredFor=null;toast('Erro ao entrar: '+friendlyError(e));$('#auth-msg').textContent=friendlyError(e)}
}

async function doLogin(){
 try{
  const {data,error}=await S.sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value});
  if(error)throw error;
  await enterApp(data.user);
 }catch(e){$('#auth-msg').textContent=e.message}
}
async function doSignup(){
 try{
  const {data,error}=await S.sb.auth.signUp({email:$('#email').value.trim(),password:$('#password').value});
  if(error)throw error;
  $('#auth-msg').textContent=data.session?'Conta criada. Você já pode usar o planner: crie o seu ou aguarde o administrador liberar um planner.':'Conta criada. Confira o e-mail para confirmar o cadastro e depois entre.';
 }catch(e){$('#auth-msg').textContent=e.message}
}
async function doForgot(){
 const em=$('#email').value.trim();
 if(!em){$('#auth-msg').textContent='Digite seu e-mail acima e toque em "Esqueci a senha".';return}
 const {error}=await S.sb.auth.resetPasswordForEmail(em,{redirectTo:location.href.split('#')[0]});
 $('#auth-msg').textContent=error?error.message:'Enviamos um link para redefinir a senha. Confira seu e-mail.';
}
async function doLogout(){await S.sb.auth.signOut();resetSession();showAuth('Você saiu da conta.')}

function watchAuth(){
 S.sb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){const np=prompt('Digite a nova senha (mínimo 6 caracteres):');if(np&&np.length>=6)S.sb.auth.updateUser({password:np}).then(({error})=>toast(error?error.message:'Senha atualizada.'))}
  if(session?.user){setTimeout(()=>enterApp(session.user),0)} // fora do callback para não travar o cliente Supabase
  else{resetSession();showAuth()}
 });
 S.sb.auth.getSession().then(({data})=>{if(data.session?.user)enterApp(data.session.user);else showAuth()});
}
