import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/+esm';

const config = window.BOLHAS_CONFIG || {};
const configured = Boolean(config.SUPABASE_URL && config.SUPABASE_PUBLISHABLE_KEY);
const supabase = configured ? createClient(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
}) : null;

const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[char]);
const tz = 'America/Sao_Paulo';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit' });
const timeFmt = new Intl.DateTimeFormat('pt-BR', { timeZone:tz, hour:'2-digit', minute:'2-digit' });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { timeZone:tz, day:'2-digit', month:'long', year:'numeric' });
const dayOf = value => value ? dayFmt.format(new Date(value)) : '';
const today = () => dayOf(new Date());
const hourOf = value => value ? timeFmt.format(new Date(value)) : '—';
const minutesBetween = (first,last) => first && last ? Math.max(0,Math.round((new Date(last)-new Date(first))/60000)) : null;
const duration = value => value == null ? '—' : value >= 60 ? Math.floor(value/60)+'h '+String(value%60).padStart(2,'0')+'m' : value+' min';
const boolText = value => value ? 'Sim' : 'Não';

const state = { services:[], professionals:[], attendances:[], images:new Map(), channel:null, busy:false, photo:null, stream:null, page:'admin' };
const serviceName = id => state.services.find(s => s.id === id)?.nome || 'Serviço indisponível';
const professionalName = id => state.professionals.find(p => p.id === id)?.nome || '—';

let toastTimeout = null;
function notify(message,type='normal') {
  const node = byId('toast');
  node.textContent = message;
  node.className = 'toast show '+(type === 'error' ? 'error' : type === 'success' ? 'success' : '');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => node.classList.remove('show'), 5200);
}
function setLoading(value) {
  state.busy = value;
  byId('saveEntryBtn').disabled = value;
  byId('loginBtn').disabled = value || !configured;
}
function setConnection(status) {
  const pill = byId('connectionPill');
  pill.textContent = status === 'ok' ? '● Conectado' : '● Reconectando';
  pill.className = 'connection-pill '+(status === 'ok' ? 'ok' : 'off');
}
function switchPage(page) {
  state.page = page;
  for (const el of document.querySelectorAll('.page')) {
    const active = el.id === 'page-'+page;
    el.hidden = !active;
    el.classList.toggle('active',active);
  }
  for (const button of document.querySelectorAll('[data-page]')) button.classList.toggle('active', button.dataset.page === page);
  if (page === 'telao') renderTV();
}
function switchAdminTab(tab) {
  for(const el of document.querySelectorAll('.admin-panel')) el.hidden = el.id !== 'admin-'+tab;
  for(const button of document.querySelectorAll('[data-admin-tab]')) button.classList.toggle('active',button.dataset.adminTab===tab);
}
async function adminAuthorized() {
  const { data:{user},error } = await supabase.auth.getUser();
  if (error || !user) return false;
  const { data, error: readError } = await supabase.from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle();
  if (readError) throw readError;
  return Boolean(data);
}
async function showApp() {
  try {
    if (!await adminAuthorized()) {
      await supabase.auth.signOut();
      notify('Usuário sem autorização de administrador. Solicite liberação ao responsável.','error');
      showLogin();
      return;
    }
    byId('loginScreen').hidden = true;
    byId('appShell').hidden = false;
    byId('reportDate').value = today();
    byId('adminToday').textContent = dateFmt.format(new Date());
    switchPage('admin');
    await refresh();
    subscribe();
  } catch(err) {
    notify('Não foi possível validar o administrador: '+err.message,'error');
    showLogin();
  }
}
function showLogin() {
  if(state.channel && supabase) { supabase.removeChannel(state.channel); state.channel=null; }
  stopCamera();
  byId('appShell').hidden=true;
  byId('loginScreen').hidden=false;
}
async function refresh() {
  if(!supabase || byId('appShell').hidden) return;
  const results = await Promise.all([
    supabase.from('servicos').select('*').order('nome'),
    supabase.from('profissionais').select('*').order('nome'),
    supabase.from('atendimentos').select('*').order('criado_em',{ascending:true}).limit(2000)
  ]);
  const problem = results.find(r => r.error);
  if(problem) { setConnection('error'); notify('Falha na sincronização: '+problem.error.message,'error'); return; }
  state.services = results[0].data || [];
  state.professionals = results[1].data || [];
  state.attendances = results[2].data || [];
  await loadImageUrls();
  setConnection('ok');
  byId('lastUpdated').textContent = 'Atualizado em '+dateFmt.format(new Date())+' às '+hourOf(new Date());
  renderAll();
}
async function loadImageUrls() {
  const paths = [...new Set(state.attendances.map(r=>r.foto_path).filter(Boolean))];
  await Promise.all(paths.map(async path => {
    const cached=state.images.get(path);
    if(cached && cached.expires > Date.now()+30000) return;
    const {data,error}=await supabase.storage.from('fotos-atendimentos').createSignedUrl(path,600);
    if(!error && data?.signedUrl) state.images.set(path,{url:data.signedUrl,expires:Date.now()+600000});
  }));
}
function subscribe() {
  if(state.channel) supabase.removeChannel(state.channel);
  state.channel = supabase.channel('operacao-bolhas')
    .on('postgres_changes',{event:'*',schema:'public',table:'atendimentos'},()=>refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'servicos'},()=>refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'profissionais'},()=>refresh())
    .subscribe(status=>{if(status==='CHANNEL_ERROR')setConnection('error');});
}
function renderAll() {
  renderOptions();
  renderAdminLists();
  renderReport();
  renderQueues();
  renderTV();
}
function renderOptions() {
  const sel = byId('entryService');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Selecione um serviço</option>'+state.services.filter(s=>s.ativo).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.nome)+'</option>').join('');
  if ([...sel.options].some(o=>o.value===keep)) sel.value=keep;
}
function renderAdminLists() {
  byId('servicesList').innerHTML = state.services.map(s=>
    '<div class="entity-row"><div class="entity-name">'+esc(s.nome)+'</div><span class="tag '+(s.ativo?'':'off')+'">'+(s.ativo?'Ativo':'Inativo')+'</span><button type="button" class="btn btn-outline" data-toggle-service="'+esc(s.id)+'">'+(s.ativo?'Desativar':'Ativar')+'</button></div>'
  ).join('') || '<div class="empty">Nenhum serviço cadastrado</div>';
  byId('professionalsList').innerHTML = state.professionals.map(p=>
    '<div class="entity-row"><span class="entity-code">'+esc(p.sigla)+'</span><div class="entity-name">'+esc(p.nome)+'</div><span class="tag '+(p.ativo?'':'off')+'">'+(p.ativo?'Ativo':'Inativo')+'</span><button type="button" class="btn btn-outline" data-toggle-professional="'+esc(p.id)+'">'+(p.ativo?'Desativar':'Ativar')+'</button></div>'
  ).join('') || '<div class="empty">Nenhum profissional cadastrado</div>';
}
function renderChart(nodeId, items) {
  const target=byId(nodeId);
  if(!items.length) {target.innerHTML='<div class="empty">Sem atendimentos concluídos nesta data</div>';return;}
  const max=Math.max(...items.map(item=>item.count),1);
  target.innerHTML=items.sort((a,b)=>b.count-a.count).map(item=>
    '<div class="bar-row"><span class="bar-label" title="'+esc(item.name)+'">'+esc(item.name)+'</span><div class="bar-track"><div class="bar-fill" style="width:'+100*item.count/max+'%"></div></div><span class="bar-value">'+item.count+'</span></div>'
  ).join('');
}
function renderReport() {
  const date=byId('reportDate').value || today();
  const done=state.attendances.filter(r=>r.status==='concluido' && dayOf(r.concluido_em)===date);
  const dailyRecords=state.attendances.filter(r=>dayOf(r.criado_em)===date || dayOf(r.concluido_em)===date);
  const waiting=state.attendances.filter(r=>r.status==='aguardando').length;
  const active=state.attendances.filter(r=>r.status==='em_execucao').length;
  const times=done.map(r=>minutesBetween(r.iniciado_em,r.concluido_em)).filter(n=>n!==null);
  byId('statCompleted').textContent=done.length;
  byId('statWaiting').textContent=waiting;
  byId('statActive').textContent=active;
  byId('statDuration').textContent=times.length ? duration(Math.round(times.reduce((a,b)=>a+b,0)/times.length)) : '—';
  const byStaff=new Map(),byService=new Map();
  for (const r of done) {
    const n=professionalName(r.profissional_id),s=serviceName(r.servico_id);
    byStaff.set(n,(byStaff.get(n)||0)+1);
    byService.set(s,(byService.get(s)||0)+1);
  }
  renderChart('professionalsChart',[...byStaff].map(([name,count])=>({name,count})));
  renderChart('servicesChart',[...byService].map(([name,count])=>({name,count})));
  byId('reportTable').innerHTML = dailyRecords.map(r=>
    '<tr><td>'+esc(r.animal_nome)+'</td><td>'+esc(serviceName(r.servico_id))+'</td><td>'+esc(professionalName(r.profissional_id))+'</td><td>'+hourOf(r.criado_em)+'</td><td>'+hourOf(r.iniciado_em)+'</td><td>'+hourOf(r.concluido_em)+'</td><td>'+duration(minutesBetween(r.criado_em,r.iniciado_em))+'</td><td>'+duration(minutesBetween(r.iniciado_em,r.concluido_em))+'</td><td>'+esc(r.status==='concluido'?'Concluído':r.status==='em_execucao'?'Em execução':'Aguardando')+'</td></tr>'
  ).join('') || '<tr><td colspan="9">Nenhum atendimento registrado na data selecionada.</td></tr>';
}
function photoMarkup(r,cls='pet-photo') {
  const cached = state.images.get(r.foto_path);
  return '<div class="'+cls+'">'+(cached && cached.expires>Date.now()
    ? '<img loading="lazy" src="'+esc(cached.url)+'" alt="Foto de '+esc(r.animal_nome)+'">'
    : '✦')+'</div>';
}
function scheduleLabel(r) {
  return r.agendado ? '<span class="tag warn">Agendado · '+esc((r.horario_agendado||'').slice(0,5))+'</span>' : '<span class="tag">Ordem de entrada</span>';
}
function renderQueues() {
  const waiting=state.attendances.filter(r=>r.status==='aguardando').sort((a,b)=>new Date(a.criado_em)-new Date(b.criado_em));
  const active=state.attendances.filter(r=>r.status==='em_execucao').sort((a,b)=>new Date(a.iniciado_em)-new Date(b.iniciado_em));
  byId('waitingCount').textContent=waiting.length;byId('activeCount').textContent=active.length;
  const professionals=state.professionals.filter(p=>p.ativo);
  byId('waitingList').innerHTML=waiting.map(r=>
    '<article class="pet-card">'+photoMarkup(r)+'<div class="pet-info"><div class="pet-head"><strong>'+esc(r.animal_nome)+'</strong>'+scheduleLabel(r)+'</div><div class="pet-meta">'+esc(serviceName(r.servico_id))+' · Entrada '+hourOf(r.criado_em)+'</div>'+
    (r.tutor ? '<div class="pet-detail">Tutor: '+esc(r.tutor)+'</div>' : '')+
    (r.observacao ? '<div class="pet-detail">Obs.: '+esc(r.observacao)+'</div>' : '')+
    '<div class="pet-actions"><select aria-label="Profissional para '+esc(r.animal_nome)+'" data-assume-select="'+esc(r.id)+'"><option value="">Selecionar profissional</option>'+
    professionals.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.sigla)+' · '+esc(p.nome)+'</option>').join('')+
    '</select><button type="button" class="btn btn-primary" data-assume="'+esc(r.id)+'">Iniciar</button></div></div></article>'
  ).join('') || '<div class="empty">Nenhum animal aguardando atendimento.</div>';
  byId('activeList').innerHTML=active.map(r=>
    '<article class="pet-card">'+photoMarkup(r)+'<div class="pet-info"><div class="pet-head"><strong>'+esc(r.animal_nome)+'</strong><span class="tag active">Em execução</span></div><div class="pet-meta">'+esc(serviceName(r.servico_id))+'</div><div class="pet-detail">Profissional: <strong>'+esc(professionalName(r.profissional_id))+'</strong></div><div class="pet-detail">Início: '+hourOf(r.iniciado_em)+'</div><div class="pet-actions"><button type="button" class="btn btn-primary" data-finish="'+esc(r.id)+'">Finalizar atendimento</button></div></div></article>'
  ).join('') || '<div class="empty">Nenhum atendimento em execução.</div>';
}
function renderTV() {
  const waiting=state.attendances.filter(r=>r.status==='aguardando').sort((a,b)=>new Date(a.criado_em)-new Date(b.criado_em));
  const active=state.attendances.filter(r=>r.status==='em_execucao').sort((a,b)=>new Date(a.iniciado_em)-new Date(b.iniciado_em));
  byId('tvWaitingCount').textContent=waiting.length;byId('tvActiveCount').textContent=active.length;
  const item = (r,running)=>'<article class="tv-card">'+photoMarkup(r,'tv-photo')+'<div class="tv-card-body"><strong>'+esc(r.animal_nome)+'</strong><small>'+esc(serviceName(r.servico_id))+'</small>'+(running
      ? '<small>Profissional: '+esc(professionalName(r.profissional_id))+'</small><span class="tag active">Em atendimento</span>'
      : (r.agendado?'<span class="tag warn">Agendado '+esc((r.horario_agendado||'').slice(0,5))+'</span>':'<small>Entrada '+hourOf(r.criado_em)+'</small>'))+'</div></article>';
  byId('tvWaiting').innerHTML=waiting.map(r=>item(r,false)).join('') || '<div class="empty">Nenhum animal aguardando.</div>';
  byId('tvActive').innerHTML=active.map(r=>item(r,true)).join('') || '<div class="empty">Nenhum atendimento em execução.</div>';
}
async function runUpdate(table,id,ativo) {
  const {error}=await supabase.from(table).update({ativo:!ativo}).eq('id',id);
  if(error)notify(error.message,'error');
  else {notify(ativo?'Cadastro desativado':'Cadastro ativado','success');await refresh();}
}
async function runRpc(name,args) {
  if(state.busy)return;
  state.busy=true;
  try {
    const {error}=await supabase.rpc(name,args);
    if(error) throw error;
    notify(name==='iniciar_atendimento'?'Atendimento iniciado.':'Atendimento finalizado.','success');
    await refresh();
  } catch(err) {notify('Não foi possível atualizar: '+err.message,'error');await refresh();}
  finally{state.busy=false;}
}
function updatePhotoPreview() {
  const preview=byId('photoPreview');
  if(state.photo) {
    const url=URL.createObjectURL(state.photo);
    preview.innerHTML='<img alt="Prévia da foto selecionada">';
    preview.querySelector('img').src=url;
    preview.querySelector('img').onload=()=>URL.revokeObjectURL(url);
  } else preview.innerHTML='<span>Nenhuma imagem selecionada</span>';
}
async function shrinkImage(file) {
  if(!file.type.startsWith('image/'))throw new Error('Selecione um arquivo de imagem válido.');
  if(file.size>15*1024*1024)throw new Error('Imagem maior que 15 MB. Selecione uma foto menor.');
  const src=URL.createObjectURL(file);
  try {
    const img=new Image(); img.src=src;
    await img.decode();
    const factor=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*factor));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*factor));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao processar imagem')),'image/jpeg',0.82));
  }finally{URL.revokeObjectURL(src);}
}
async function stopCamera() {
  if(state.stream) {state.stream.getTracks().forEach(track=>track.stop());state.stream=null;}
  byId('cameraBox').hidden=true;
  byId('cameraVideo').srcObject=null;
}
function updateSchedule() {
  const visible=byId('isScheduled').value==='sim';
  byId('scheduledTimeField').hidden=!visible;
  byId('scheduledTime').required=visible;
  if(!visible)byId('scheduledTime').value='';
}
function tick() {
  byId('clock').textContent=timeFmt.format(new Date());
  byId('tvClock').textContent=dateFmt.format(new Date())+' · '+timeFmt.format(new Date());
}
function bindEvents() {
  byId('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!configured)return;
    setLoading(true);
    try {
      const {error}=await supabase.auth.signInWithPassword({email:byId('email').value.trim(),password:byId('password').value});
      if(error)throw error;
      byId('password').value='';
      await showApp();
    }catch(err){notify('Falha de autenticação: '+err.message,'error');}
    finally{setLoading(false);}
  });
  byId('logoutBtn').addEventListener('click',async()=>{await supabase.auth.signOut();showLogin();notify('Sessão encerrada.','success');});
  document.querySelectorAll('[data-page]').forEach(button=>button.addEventListener('click',()=>switchPage(button.dataset.page)));
  document.querySelectorAll('[data-admin-tab]').forEach(button=>button.addEventListener('click',()=>switchAdminTab(button.dataset.adminTab)));
  byId('reportDate').addEventListener('change',renderReport);
  byId('printBtn').addEventListener('click',()=>window.print());
  byId('serviceForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const nome=byId('serviceName').value.trim();
    if(!nome)return;
    const {error}=await supabase.from('servicos').insert({nome});
    if(error)notify(error.message,'error');
    else{e.target.reset();notify('Serviço cadastrado.','success');await refresh();}
  });
  byId('professionalForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const sigla=byId('professionalCode').value.trim(),nome=byId('professionalName').value.trim();
    if(!sigla||!nome)return;
    const {error}=await supabase.from('profissionais').insert({sigla,nome});
    if(error)notify(error.message,'error');
    else{e.target.reset();notify('Profissional cadastrado.','success');await refresh();}
  });
  byId('servicesList').addEventListener('click',e=>{
    const el=e.target.closest('[data-toggle-service]');if(!el)return;
    const record=state.services.find(s=>s.id===el.dataset.toggleService);
    if(record)runUpdate('servicos',record.id,record.ativo);
  });
  byId('professionalsList').addEventListener('click',e=>{
    const el=e.target.closest('[data-toggle-professional]');if(!el)return;
    const record=state.professionals.find(s=>s.id===el.dataset.toggleProfessional);
    if(record)runUpdate('profissionais',record.id,record.ativo);
  });
  byId('isScheduled').addEventListener('change',updateSchedule);
  byId('entryObs').addEventListener('input',()=>byId('obsCounter').textContent=byId('entryObs').value.length);
  byId('photoFile').addEventListener('change',async e=>{
    if(!e.target.files?.[0])return;
    try{state.photo=await shrinkImage(e.target.files[0]);updatePhotoPreview();}
    catch(err){notify(err.message,'error');}
  });
  byId('clearPhoto').addEventListener('click',()=>{state.photo=null;byId('photoFile').value='';updatePhotoPreview();});
  byId('openCamera').addEventListener('click',async()=>{
    if(!navigator.mediaDevices?.getUserMedia){notify('Webcam indisponível neste navegador. Use Anexar imagem.','error');return;}
    try{
      await stopCamera();
      state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false});
      byId('cameraVideo').srcObject=state.stream;
      byId('cameraBox').hidden=false;
      await byId('cameraVideo').play();
    }catch(err){notify('Não foi possível abrir a câmera: '+err.message,'error');await stopCamera();}
  });
  byId('stopCamera').addEventListener('click',stopCamera);
  byId('capturePhoto').addEventListener('click',async()=>{
    const video=byId('cameraVideo');
    if(!video.videoWidth)return;
    const canvas=document.createElement('canvas');
    const factor=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
    canvas.width=Math.round(video.videoWidth*factor);canvas.height=Math.round(video.videoHeight*factor);
    canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
    state.photo=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));
    updatePhotoPreview();await stopCamera();
  });
  byId('entryForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(state.busy)return;
    const animal_nome=byId('animalName').value.trim(),tutor=byId('tutorName').value.trim();
    const servico_id=byId('entryService').value,agendado=byId('isScheduled').value==='sim';
    const horario_agendado=agendado?byId('scheduledTime').value:null;
    if(!animal_nome||!servico_id||!byId('isScheduled').value||(agendado&&!horario_agendado)){notify('Preencha todos os campos obrigatórios.','error');return;}
    let foto_path=null;
    setLoading(true);
    try {
      if(state.photo) {
        foto_path=today()+'/'+crypto.randomUUID()+'.jpg';
        const {error}=await supabase.storage.from('fotos-atendimentos').upload(foto_path,state.photo,{contentType:'image/jpeg',upsert:false});
        if(error)throw error;
      }
      const {error}=await supabase.from('atendimentos').insert({
        animal_nome,tutor:tutor||null,servico_id,agendado,horario_agendado,
        observacao:byId('entryObs').value.trim()||null,foto_path
      });
      if(error)throw error;
      byId('entryForm').reset();state.photo=null;updatePhotoPreview();updateSchedule();
      byId('obsCounter').textContent='0';notify('Entrada registrada e enviada à fila.','success');
      await refresh();
    }catch(err){
      if(foto_path)await supabase.storage.from('fotos-atendimentos').remove([foto_path]);
      notify('Não foi possível registrar: '+err.message,'error');
    }finally{setLoading(false);}
  });
  byId('waitingList').addEventListener('click',async e=>{
    const button=e.target.closest('[data-assume]');if(!button)return;
    const id=button.dataset.assume;
    const select=byId('waitingList').querySelector('select[data-assume-select="'+id+'"]');
    if(!select?.value){notify('Selecione o profissional antes de iniciar.','error');return;}
    await runRpc('iniciar_atendimento',{p_atendimento_id:id,p_profissional_id:select.value});
  });
  byId('activeList').addEventListener('click',async e=>{
    const button=e.target.closest('[data-finish]');if(button)await runRpc('finalizar_atendimento',{p_atendimento_id:button.dataset.finish});
  });
  byId('fullscreenBtn').addEventListener('click',async()=>{
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else await byId('page-telao').requestFullscreen();
    }catch(err){notify('Tela cheia não disponível neste navegador.','error');}
  });
  window.addEventListener('pagehide',stopCamera);
}
async function start() {
  bindEvents();tick();setInterval(tick,15000);
  if(!configured){
    byId('setupInfo').hidden=false;
    byId('loginBtn').disabled=true;
    notify('MVP criado. Falta conectar a base Supabase Bolhas e Latidos.','error');
    return;
  }
  const {data:{session}}=await supabase.auth.getSession();
  if(session)await showApp();
  setInterval(()=>{if(!byId('appShell').hidden)refresh();},30000);
  supabase.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT')showLogin();
  });
}
start().catch(err=>notify('Erro ao iniciar o painel: '+err.message,'error'));
