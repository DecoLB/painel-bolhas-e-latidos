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
const especieLabel = r => r.especie==='gato'?'Gato':r.especie==='cachorro'?'Cachorro':'Não informada';
const racaLabel = r => r.raca || 'Não informada';
const transporteLabel = r => r.transporte_bolhas===true?'Bolhas & Latidos':r.transporte_bolhas===false?'Tutor':'Não informado';
const manejoLabels={nao_se_aplica:'Não se aplica',ansioso:'Pet Ansioso',agressivo:'Pet Agressivo',idoso:'Pet Idoso'};
const manejoLabel=r=>manejoLabels[r.manejo]||'Não informado';
const additionalNames=ids=>(ids||[]).map(id=>state.additionalCatalog.find(a=>a.id===id)?.nome||'Adicional indisponível').join(', ')||'Nenhum';
const chosenAdditions=()=>[...document.querySelectorAll('#entryAdditionalList input[type="checkbox"]:checked')].map(el=>el.value);
function renderEntryAdditionalList(){
  const node=byId('entryAdditionalList'),checked=new Set(chosenAdditions());
  const sp=byId('entrySpecies').value,breed=byId('entryBreed').value;
  const hotelAllowed=sp==='cachorro'&&['São Bernardo','Samoieda','Terra Nova','Bernese'].includes(breed);
  node.innerHTML=state.additionalCatalog.filter(a=>a.ativo&&(a.nome!=='Hotelzinho'||hotelAllowed)).map(a=>
    '<label class="extra-item"><input type="checkbox" value="'+esc(a.id)+'"'+(checked.has(a.id)?' checked':'')+'><span>'+esc(a.nome)+'</span></label>'
  ).join('')||'<small>Sem adicionais cadastrados</small>';
}
function renderEntryBreeds(){
  const species=byId('entrySpecies').value;
  const input=byId('entryBreed'),old=input.value;
  if(species==='gato'){
    input.innerHTML='<option value="Gato/Felino">Gato/Felino</option>';
    input.value='Gato/Felino';input.disabled=true;
    byId('entryBreedHelp').textContent='Raça identificada automaticamente como Gato/Felino.';
  }else if(species==='cachorro'){
    input.disabled=false;
    input.innerHTML='<option value="">Selecione a raça</option>'+
      state.breeds.filter(b=>b.especie==='cachorro')
        .map(b=>'<option value="'+esc(b.nome)+'">'+esc(b.nome)+'</option>').join('');
    if([...input.options].some(o=>o.value===old))input.value=old;
    byId('entryBreedHelp').textContent='Escolha uma das raças cadastradas.';
  }else{
    input.disabled=true;input.innerHTML='<option value="">Selecione a espécie primeiro</option>';
    byId('entryBreedHelp').textContent='Para gatos, será registrado Gato/Felino.';
  }
}
const statusBadge = (tone,label) => '<span class="tag farol-tag status-'+tone+'"><span class="farol-dot" aria-hidden="true"></span>'+esc(label)+'</span>';
const setFarol = (id,tone) => { const node=byId(id)?.closest('.stat-card, .insight-mini'); if(node)node.dataset.farol=tone; };

const state = { services:[], professionals:[], attendances:[], etapas:[], etapaProfissionais:[], breeds:[], additionalCatalog:[], images:new Map(), channel:null, busy:false, photo:null, stream:null, page:'admin', role:null };
const serviceName = id => state.services.find(s => s.id === id)?.nome || 'Serviço indisponível';
const professionalName = id => state.professionals.find(p => p.id === id)?.nome || '—';
const attendanceExecutors=r=>{
 const steps=state.etapas.filter(e=>e.atendimento_id===r.id);
 if(!steps.length)return professionalName(r.profissional_id);
 const ids=[...new Set(steps.flatMap(e=>state.etapaProfissionais
   .filter(p=>p.etapa_id===e.id&&(p.papel==='confirmado'||p.papel==='em_execucao'))
   .map(p=>p.profissional_id)))];
 return ids.length?ids.map(professionalName).join(', '):'A definir';
};

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
  const tone=status==='ok'?'success':status==='error'?'danger':'warning';
  pill.textContent=status==='ok'?'Conectado':status==='error'?'Falha na conexão':'Reconectando';
  pill.className='connection-pill connection-'+tone;
  pill.setAttribute('role','status');
}
function switchPage(page) {
  if (page === 'admin' && state.role !== 'admin') return;
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
  if(state.role !== 'admin') return;
  for(const el of document.querySelectorAll('.admin-panel')) el.hidden = el.id !== 'admin-'+tab;
  for(const button of document.querySelectorAll('[data-admin-tab]')) button.classList.toggle('active',button.dataset.adminTab===tab);
}
async function getUserRole() {
  const {data:{user},error} = await supabase.auth.getUser();
  if(error || !user) return null;
  const [admin,operator] = await Promise.all([
    supabase.from('app_admins').select('user_id').eq('user_id',user.id).maybeSingle(),
    supabase.from('app_operadores').select('user_id').eq('user_id',user.id).maybeSingle()
  ]);
  if(admin.error) throw admin.error;
  if(operator.error) throw operator.error;
  return admin.data ? 'admin' : operator.data ? 'operacional' : null;
}
async function showApp() {
  try {
    const role = await getUserRole();
    if(!role) {
      await supabase.auth.signOut();
      notify('Conta sem perfil autorizado. Solicite liberação ao administrador.','error');
      showLogin();
      return;
    }
    state.role = role;
    byId('adminNav').hidden = role !== 'admin';
    byId('rolePill').textContent = role === 'admin' ? 'Administrador' : 'Operacional';
    byId('loginScreen').hidden = true;
    byId('appShell').hidden = false;
    byId('reportDate').value = today();
    byId('adminToday').textContent = dateFmt.format(new Date());
    switchPage(role === 'admin' ? 'admin' : 'entrada');
    await refresh();
    subscribe();
    window.dispatchEvent(new Event('bolhas:authenticated'));
  } catch(err) {
    notify('Não foi possível validar o perfil: '+err.message,'error');
    showLogin();
  }
}
function showLogin() {
  if(state.channel && supabase) { supabase.removeChannel(state.channel); state.channel=null; }
  stopCamera();
  state.role=null;
  byId('appShell').hidden=true;
  byId('loginScreen').hidden=false;
}
async function refresh() {
  if(!supabase || byId('appShell').hidden) return;
  const results = await Promise.all([
    supabase.from('servicos').select('*').order('nome'),
    supabase.from('profissionais').select('*').order('nome'),
    supabase.from('atendimentos').select('*').order('criado_em',{ascending:true}).limit(2000),
    supabase.from('catalogo_racas').select('especie,nome').order('nome'),
    supabase.from('catalogo_adicionais').select('id,nome,ativo').order('nome'),
    supabase.from('atendimento_etapas').select('*').order('ordem').limit(3500),
    supabase.from('etapa_profissionais').select('*').limit(8500)
  ]);
  const problem = results.find(r => r.error);
  if(problem) { setConnection('error'); notify('Falha na sincronização: '+problem.error.message,'error'); return; }
  state.services = results[0].data || [];
  state.professionals = results[1].data || [];
  state.attendances = results[2].data || [];
  state.breeds = results[3].data || [];
  state.additionalCatalog=results[4].data||[];
  state.etapas=results[5].data||[];
  state.etapaProfissionais=results[6].data||[];
  await loadImageUrls();
  setConnection('ok');
  byId('lastUpdated').textContent = 'Atualizado em '+dateFmt.format(new Date())+' às '+hourOf(new Date());
  renderAll();
  window.dispatchEvent(new Event('bolhas:refreshed'));
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
    .on('postgres_changes',{event:'*',schema:'public',table:'atendimento_etapas'},()=>refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'etapa_profissionais'},()=>refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'servicos'},()=>refresh())
    .on('postgres_changes',{event:'*',schema:'public',table:'profissionais'},()=>refresh())
    .subscribe(status=>{if(status==='CHANNEL_ERROR')setConnection('error');});
}
function renderAll() {
  renderOptions();
  if(state.role === 'admin') {renderAdminLists(); renderReport();}
  renderQueues();
  renderTV();
}
function renderOptions() {
  const sel = byId('entryService');
  const keep = sel.value;
  sel.innerHTML = '<option value="">Selecione um serviço</option>'+state.services.filter(s=>s.ativo).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.nome)+'</option>').join('');
  if ([...sel.options].some(o=>o.value===keep)) sel.value=keep;
  renderEntryBreeds();
  renderEntryAdditionalList();
}
function renderAdminLists() {
  byId('servicesList').innerHTML = state.services.map(s=>
    '<div class="entity-row"><div class="entity-name">'+esc(s.nome)+'</div>'+statusBadge(s.ativo?'success':'neutral',s.ativo?'Ativo':'Inativo')+'<button type="button" class="btn btn-outline" data-toggle-service="'+esc(s.id)+'">'+(s.ativo?'Desativar':'Ativar')+'</button></div>'
  ).join('') || '<div class="empty">Nenhum serviço cadastrado</div>';
  byId('professionalsList').innerHTML = state.professionals.map(p=>
    '<div class="entity-row"><span class="entity-code">'+esc(p.sigla)+'</span><div class="entity-name">'+esc(p.nome)+'</div>'+statusBadge(p.ativo?'success':'neutral',p.ativo?'Ativo':'Inativo')+'<button type="button" class="btn btn-outline" data-toggle-professional="'+esc(p.id)+'">'+(p.ativo?'Desativar':'Ativar')+'</button></div>'
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
  setFarol('statCompleted','neutral');
  setFarol('statWaiting',waiting>0?'warning':'neutral');
  setFarol('statActive',active>0?'success':'neutral');
  setFarol('statDuration','neutral');
  renderInsights(date,done);
  const byStaff=new Map(),byService=new Map();
  for (const r of done) {
    const s=serviceName(r.servico_id);
    byService.set(s,(byService.get(s)||0)+1);
    const stages=state.etapas.filter(e=>e.atendimento_id===r.id&&e.status==='concluido');
    if(stages.length){
      for(const stage of stages)for(const p of state.etapaProfissionais.filter(p=>
        p.etapa_id===stage.id&&p.papel==='confirmado')){
        const n=professionalName(p.profissional_id);
        byStaff.set(n,(byStaff.get(n)||0)+1);
      }
    }else{
      const n=professionalName(r.profissional_id);
      byStaff.set(n,(byStaff.get(n)||0)+1);
    }
  }
  renderChart('professionalsChart',[...byStaff].map(([name,count])=>({name,count})));
  renderChart('servicesChart',[...byService].map(([name,count])=>({name,count})));
  const byBreed=new Map(),bySpecies=new Map();
  for(const r of done){
    const breed=racaLabel(r),species=especieLabel(r);
    byBreed.set(breed,(byBreed.get(breed)||0)+1);
    bySpecies.set(species,(bySpecies.get(species)||0)+1);
  }
  renderChart('breedsChart',[...byBreed].map(([name,count])=>({name,count})));
  renderChart('speciesChart',[...bySpecies].map(([name,count])=>({name,count})));
  byId('reportTable').innerHTML = dailyRecords.map(r=>
    '<tr><td>'+esc(r.animal_nome)+'</td><td>'+esc(especieLabel(r))+'</td><td>'+esc(racaLabel(r))+'</td><td>'+esc(transporteLabel(r))+'</td><td>'+esc(serviceName(r.servico_id))+'</td><td>'+esc(additionalNames(r.adicionais))+'</td><td>'+esc(manejoLabel(r))+'</td><td>'+esc(attendanceExecutors(r))+'</td><td>'+hourOf(r.criado_em)+'</td><td>'+hourOf(r.iniciado_em)+'</td><td>'+hourOf(r.concluido_em)+'</td><td>'+duration(minutesBetween(r.criado_em,r.iniciado_em))+'</td><td>'+duration(minutesBetween(r.iniciado_em,r.concluido_em))+'</td><td>'+statusBadge(r.status==='concluido'?'neutral':r.status==='em_execucao'?'success':'warning',r.status==='concluido'?'Concluído':r.status==='em_execucao'?'Em execução':'Aguardando')+'</td></tr>'
  ).join('') || '<tr><td colspan="14">Nenhum atendimento registrado na data selecionada.</td></tr>';
}

function renderInsights(date, done) {
  if(state.role!=='admin')return;
  const arrivals=state.attendances.filter(r=>dayOf(r.criado_em)===date);
  const started=state.attendances.filter(r=>r.iniciado_em && dayOf(r.iniciado_em)===date);
  const waitTimes=started.map(r=>minutesBetween(r.criado_em,r.iniciado_em)).filter(n=>n!==null);
  const professionals=new Set(started.map(r=>r.profissional_id).filter(Boolean));
  for(const e of state.etapas.filter(e=>e.iniciado_em&&dayOf(e.iniciado_em)===date))
    for(const p of state.etapaProfissionais.filter(p=>
      p.etapa_id===e.id&&(p.papel==='confirmado'||p.papel==='em_execucao')))
      professionals.add(p.profissional_id);
  const approvedArrivals=arrivals.filter(r=>Boolean(r.agendamento_id));
  byId('insightEntries').textContent=String(arrivals.length);
  byId('insightWait').textContent=waitTimes.length
    ? duration(Math.round(waitTimes.reduce((sum,value)=>sum+value,0)/waitTimes.length)):'—';
  byId('insightStaff').textContent=String(professionals.size);
  byId('insightAppointments').textContent=String(approvedArrivals.length);
  const transportCount=arrivals.filter(r=>r.transporte_bolhas===true).length;
  byId('insightTransport').textContent=String(transportCount);
  setFarol('insightEntries','neutral');
  setFarol('insightWait','neutral');
  setFarol('insightStaff',professionals.size>0?'success':'neutral');
  setFarol('insightAppointments',approvedArrivals.length>0?'success':'neutral');
  setFarol('insightTransport',transportCount>0?'warning':'neutral');

  const anchor=new Date(date+'T12:00:00Z');
  const dates=Array.from({length:7},(_,i)=>{
    const d=new Date(anchor);d.setUTCDate(anchor.getUTCDate()+i-6);
    return d.toISOString().slice(0,10);
  });
  const items=dates.map(day=>({
    day,entries:state.attendances.filter(r=>dayOf(r.criado_em)===day).length,
    done:state.attendances.filter(r=>r.concluido_em && dayOf(r.concluido_em)===day).length
  }));
  const max=Math.max(1,...items.flatMap(r=>[r.entries,r.done]));
  byId('insightTrend').innerHTML=items.map(r=>{
    const label=r.day.slice(8,10)+'/'+r.day.slice(5,7);
    const bars=(count,type,name)=>'<div class="insight-bar-line"><div class="insight-bar-track">'
      +'<div class="insight-bar-fill '+type+'" style="width:'+(100*count/max)+'%"></div></div>'
      +'<strong class="insight-bar-value">'+count+'</strong></div>';
    return '<div class="insight-trend-row"><strong class="insight-date">'+esc(label)+'</strong>'
      +'<div class="insight-trend-bars" role="group" aria-label="'+esc(label)+': '+r.entries+
      ' entradas e '+r.done+' conclusões">'+bars(r.entries,'entries','Entradas')
      +bars(r.done,'done','Conclusões')+'</div></div>';
  }).join('');

  const waiting=state.attendances.filter(r=>r.status==='aguardando');
  const active=state.attendances.filter(r=>r.status==='em_execucao');
  const oldest=waiting.length ? Math.max(...waiting.map(r=>minutesBetween(r.criado_em,new Date())||0)):null;
  const byService=new Map();
  for(const r of done){const id=serviceName(r.servico_id);byService.set(id,(byService.get(id)||0)+1);}
  const most=Math.max(0,...byService.values());
  const popular=[...byService].filter(x=>x[1]===most).map(x=>x[0]);
  const summary=[
    ['Entradas e conclusões','Na data selecionada: '+arrivals.length+' entrada(s) e '+done.length+' conclusão(ões).'],
    ['Fila neste momento',waiting.length+' aguardando · '+active.length+' em execução.'],
    ['Maior espera atual',oldest===null?'Sem animais aguardando.':duration(oldest)+' desde a entrada do animal que aguarda há mais tempo.'],
    ['Serviço mais concluído',popular.length?popular.join(' / ')+' ('+most+' concluído(s) na data).':'Nenhum serviço concluído nessa data.'],
    ['Transporte informado',transportCount+' atendimento(s) com solicitação de transporte do Bolhas na data selecionada.']
  ];
  byId('insightNarrative').innerHTML=summary.map(([title,desc])=>
    '<div class="insight-note"><strong>'+esc(title)+'</strong><span>'+esc(desc)+'</span></div>'
  ).join('');
}

function photoMarkup(r,cls='pet-photo') {
  const cached = state.images.get(r.foto_path);
  return '<div class="'+cls+'">'+(cached && cached.expires>Date.now()
    ? '<img loading="lazy" src="'+esc(cached.url)+'" alt="Foto de '+esc(r.animal_nome)+'">'
    : '✦')+'</div>';
}
function scheduleLabel(r) {
  return r.agendado ? statusBadge('warning','Aguardando · Agendado'+(r.horario_agendado ? ' '+r.horario_agendado.slice(0,5) : '')) : statusBadge('warning','Aguardando');
}

function professionalPicker(r,professionals) {
  const id=esc(r.id);
  const options=professionals.map(p=>
    '<button type="button" class="professional-option" role="option" aria-selected="false"'
    +' data-professional-choice="'+id+'" data-professional-id="'+esc(p.id)+'"'
    +' data-professional-name="'+esc(p.nome)+'" data-professional-code="'+esc(p.sigla)+'">'
    +'<span class="professional-code">'+esc(p.sigla)+'</span>'
    +'<span class="professional-name">'+esc(p.nome)+'</span>'
    +'</button>'
  ).join('');
  return '<div class="professional-picker" data-professional-picker="'+id+'">'
    +'<button type="button" class="professional-trigger" data-professional-toggle="'+id+'"'
    +' aria-expanded="false" aria-controls="professional-options-'+id+'"'
    +(professionals.length?'':' disabled')+'>'
    +'<span class="professional-choice"><small>Responsável</small>'
    +'<strong data-professional-label="'+id+'">'+(professionals.length?'Selecionar profissional':'Sem profissional ativo')+'</strong></span>'
    +'<span class="professional-chevron" aria-hidden="true">⌄</span></button>'
    +'<div id="professional-options-'+id+'" class="professional-menu" role="listbox"'
    +' aria-label="Escolher profissional" hidden>'+options+'</div>'
    +'<select data-assume-select="'+id+'" tabindex="-1" aria-hidden="true" hidden>'
    +'<option value="">Selecionar profissional</option>'
    +professionals.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.sigla)+' · '+esc(p.nome)+'</option>').join('')
    +'</select></div>';
}
function closeProfessionalPickers(exceptId=null){
  document.querySelectorAll('[data-professional-picker]').forEach(picker=>{
    if(exceptId && picker.dataset.professionalPicker===exceptId)return;
    const menu=picker.querySelector('.professional-menu');
    const button=picker.querySelector('[data-professional-toggle]');
    if(menu)menu.hidden=true;
    if(button)button.setAttribute('aria-expanded','false');
  });
}

function renderQueues() {
  const v23Ids=new Set(state.etapas.map(e=>e.atendimento_id));
  const waiting=state.attendances.filter(r=>r.status==='aguardando'&&!v23Ids.has(r.id)).sort((a,b)=>new Date(a.criado_em)-new Date(b.criado_em));
  const active=state.attendances.filter(r=>r.status==='em_execucao'&&!v23Ids.has(r.id)).sort((a,b)=>new Date(a.iniciado_em)-new Date(b.iniciado_em));
  byId('waitingCount').textContent=waiting.length;byId('activeCount').textContent=active.length;
  const professionals=state.professionals.filter(p=>p.ativo);
  byId('waitingList').innerHTML='<div id="v23WaitingTasks" class="v23-queue-list"></div>'+waiting.map(r=>
    '<article class="pet-card farol-card farol-warning">'+photoMarkup(r)+'<div class="pet-info"><div class="pet-head"><strong>'+esc(r.animal_nome)+'</strong>'+scheduleLabel(r)+'</div><div class="pet-meta">'+esc(serviceName(r.servico_id))+' · Entrada '+hourOf(r.criado_em)+'</div>'+
    '<div class="pet-detail"><b>Espécie:</b> '+esc(especieLabel(r))+' · <b>Raça:</b> '+esc(racaLabel(r))+'</div>'+
    '<div class="pet-detail"><b>Adicionais:</b> '+esc(additionalNames(r.adicionais))+'</div>'+
    '<div class="pet-detail"><b>Manejo:</b> '+esc(manejoLabel(r))+'</div>'+
    (r.transporte_bolhas!==null ? '<div class="pet-detail"><b>Transporte:</b> '+esc(transporteLabel(r))+'</div>' : '')+
    (r.tutor ? '<div class="pet-detail">Tutor: '+esc(r.tutor)+'</div>' : '')+
    (r.observacao ? '<div class="pet-detail">Obs.: '+esc(r.observacao)+'</div>' : '')+
    '<div class="pet-actions">'+professionalPicker(r,professionals)+
    '<button type="button" class="btn btn-primary" data-assume="'+esc(r.id)+'">Iniciar</button></div></div></article>'
  ).join('') || '<div class="empty">Nenhum animal aguardando atendimento.</div>';
  byId('activeList').innerHTML='<div id="v23ActiveTasks" class="v23-queue-list"></div>'+active.map(r=>
    '<article class="pet-card farol-card farol-success">'+photoMarkup(r)+'<div class="pet-info"><div class="pet-head"><strong>'+esc(r.animal_nome)+'</strong>'+statusBadge('success','Em execução')+'</div><div class="pet-meta">'+esc(serviceName(r.servico_id))+'</div><div class="pet-detail"><b>Espécie:</b> '+esc(especieLabel(r))+' · <b>Raça:</b> '+esc(racaLabel(r))+'</div><div class="pet-detail"><b>Adicionais:</b> '+esc(additionalNames(r.adicionais))+'</div><div class="pet-detail"><b>Manejo:</b> '+esc(manejoLabel(r))+'</div><div class="pet-detail">Profissional: <strong>'+esc(professionalName(r.profissional_id))+'</strong></div><div class="pet-detail">Início: '+hourOf(r.iniciado_em)+'</div><div class="pet-actions"><button type="button" class="btn btn-primary" data-finish="'+esc(r.id)+'">Finalizar atendimento</button></div></div></article>'
  ).join('') || '<div class="empty">Nenhum atendimento em execução.</div>';
}
function renderTV() {
  const v23Ids=new Set(state.etapas.map(e=>e.atendimento_id));
  const waiting=state.attendances.filter(r=>r.status==='aguardando'&&!v23Ids.has(r.id)).sort((a,b)=>new Date(a.criado_em)-new Date(b.criado_em));
  const active=state.attendances.filter(r=>r.status==='em_execucao'&&!v23Ids.has(r.id)).sort((a,b)=>new Date(a.iniciado_em)-new Date(b.iniciado_em));
  byId('tvWaitingCount').textContent=waiting.length;byId('tvActiveCount').textContent=active.length;
  const count=Math.max(waiting.length,active.length);
  byId('tvGrid').dataset.density=count<=1?'single':count<=4?'few':'many';
  const item = (r,running)=>'<article class="tv-card farol-card '+(running?'tv-running farol-success':'tv-waiting farol-warning')+'">'
    +photoMarkup(r,'tv-photo')
    +'<div class="tv-card-body"><strong class="tv-pet-name">'+esc(r.animal_nome)+'</strong>'
    +'<div class="tv-data-line"><span>Raça</span><strong>'+esc(racaLabel(r))+'</strong></div>'
    +'<div class="tv-data-line"><span>Adicionais</span><strong>'+esc(additionalNames(r.adicionais))+'</strong></div>'
    +'<div class="tv-data-line"><span>Manejo</span><strong>'+esc(manejoLabel(r))+'</strong></div>'
    +'<div class="tv-data-line"><span>Serviço</span><strong>'+esc(serviceName(r.servico_id))+'</strong></div>'
    +(running
      ? '<div class="tv-data-line"><span>Responsável</span><strong>'+esc(professionalName(r.profissional_id))+'</strong></div>'
        +'<span class="tv-status">'+statusBadge('success','Em atendimento')+'</span>'
      : '<div class="tv-data-line"><span>Entrada</span><strong>'+hourOf(r.criado_em)+'</strong></div>'
        +'<span class="tv-status">'+statusBadge('warning','Aguardando')+'</span>'
        +(r.agendado?'<span class="tv-booked-label">Agendado'+(r.horario_agendado?' · '+esc(r.horario_agendado.slice(0,5)):'')+'</span>':'')
    )+'</div></article>';
  byId('tvWaiting').innerHTML='<div id="v23TvWaiting" class="v23-tv-list"></div>'+(waiting.map(r=>item(r,false)).join('') || '');
  byId('tvActive').innerHTML='<div id="v23TvActive" class="v23-tv-list"></div>'+(active.map(r=>item(r,true)).join('') || '');
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
    const {data:novo,error}=await supabase.from('servicos').insert({nome}).select('id').single();
    if(error){notify(error.message,'error');return;}
    try{
      const prices=['curto','medio','longo'].map(pelagem=>({
        pelagem,value:byId('newPrice'+pelagem[0].toUpperCase()+pelagem.slice(1)).value
      })).filter(x=>x.value!=='');
      if(prices.length){
        const {error:priceError}=await supabase.from('precos_servicos').upsert(prices.map(x=>({
          servico_id:novo.id,especie:'cachorro',porte:'pequeno',
          pelagem:x.pelagem,valor_centavos:Math.round(Number(x.value)*100)
        })));
        if(priceError)throw priceError;
      }
      e.target.reset();notify('Serviço e valores cadastrados.','success');
    }catch(err){notify('Serviço criado, mas valores não salvos: '+err.message,'error');}
    await refresh();window.dispatchEvent(new Event('bolhas:catalog-changed'));
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
  byId('entrySpecies').addEventListener('change',()=>{
    renderEntryBreeds();renderEntryAdditionalList();
  });
  byId('entryBreed').addEventListener('change',renderEntryAdditionalList);
  byId('entryForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(state.busy)return;
    const animal_nome=byId('animalName').value.trim(),tutor=byId('tutorName').value.trim();
    const especie=byId('entrySpecies').value;
    const raca=especie==='gato'?'Gato/Felino':byId('entryBreed').value;
    const servico_id=byId('entryService').value,agendado=byId('isScheduled').value==='sim';
    const manejo=byId('entryManejo').value,porte=byId('entryPorte').value,
      pelagem=byId('entryPelagem').value;
    const adicionais=chosenAdditions();
    const horario_agendado=agendado?byId('scheduledTime').value:null;
    if(!animal_nome||!servico_id||!byId('isScheduled').value||(agendado&&!horario_agendado)||
      !['cachorro','gato'].includes(especie)||!state.breeds.some(b=>b.especie===especie&&b.nome===raca)||
      !Object.hasOwn(manejoLabels,manejo)||
      !['pequeno','medio','grande'].includes(porte)||!['curto','medio','longo'].includes(pelagem)){
      notify('Preencha os campos obrigatórios, incluindo espécie, raça, porte, pelagem e manejo.','error');return;
    }
    let foto_path=null,registroCriado=false;
    setLoading(true);
    try {
      if(state.photo) {
        foto_path=today()+'/'+crypto.randomUUID()+'.jpg';
        const {error}=await supabase.storage.from('fotos-atendimentos').upload(foto_path,state.photo,{contentType:'image/jpeg',upsert:false});
        if(error)throw error;
      }
      const {data:novo,error}=await supabase.from('atendimentos').insert({
        animal_nome,tutor:tutor||null,especie,raca,servico_id,agendado,horario_agendado,
        manejo,porte,pelagem,adicionais,
        observacao:byId('entryObs').value.trim()||null,foto_path
      }).select('id').single();
      if(error)throw error;
      registroCriado=true;
      // Planejamento é opcional e sua falha não apaga o animal já cadastrado.
      try{
      const planned=[...document.querySelectorAll('#entryEtapasPrevistas [data-v23-planned]')];
      if(planned.length){
        const {data:created,error:stagesError}=await supabase.from('atendimento_etapas')
          .select('id,tipo,ordem,adicional_id').eq('atendimento_id',novo.id);
        if(stagesError)throw stagesError;
        for(const stage of created||[]){
          const key=stage.tipo==='principal'?'principal:'+stage.ordem:'adicional:'+stage.adicional_id;
          const checkboxes=planned.filter(el=>el.dataset.v23Planned===key&&el.checked);
          if(!checkboxes.length)continue;
          const {error:planError}=await supabase.rpc('planejar_etapa_v23',{
            p_etapa_id:stage.id,p_profissionais:checkboxes.map(x=>x.value)});
          if(planError)throw planError;
        }
      }
      }catch(planErr){
        notify('Animal registrado, mas alguns responsáveis previstos não foram salvos: '+planErr.message,'error');
      }
      byId('entryForm').reset();renderEntryBreeds();renderEntryAdditionalList();
      window.dispatchEvent(new Event('bolhas:entrada-reset'));state.photo=null;updatePhotoPreview();updateSchedule();
      byId('obsCounter').textContent='0';notify('Entrada registrada e enviada à fila.','success');
      await refresh();
    }catch(err){
      if(foto_path&&!registroCriado)await supabase.storage.from('fotos-atendimentos').remove([foto_path]);
      notify((registroCriado?'Animal registrado; falha posterior: ':'Não foi possível registrar: ')+err.message,'error');
    }finally{setLoading(false);}
  });
  byId('waitingList').addEventListener('click',async e=>{
    const choice=e.target.closest('[data-professional-choice]');
    if(choice){
      const id=choice.dataset.professionalChoice;
      const picker=choice.closest('[data-professional-picker]');
      const select=picker?.querySelector('select[data-assume-select]');
      const label=picker?.querySelector('[data-professional-label]');
      if(!select||!label)return;
      select.value=choice.dataset.professionalId;
      label.innerHTML='<span class="professional-code professional-selected-code">'+esc(choice.dataset.professionalCode)+'</span>'
        +'<span>'+esc(choice.dataset.professionalName)+'</span>';
      picker.querySelectorAll('[role="option"]').forEach(item=>
        item.setAttribute('aria-selected',String(item===choice)));
      closeProfessionalPickers();
      picker.querySelector('[data-professional-toggle]')?.focus();
      return;
    }
    const toggle=e.target.closest('[data-professional-toggle]');
    if(toggle){
      const id=toggle.dataset.professionalToggle;
      const picker=toggle.closest('[data-professional-picker]');
      const menu=picker.querySelector('.professional-menu');
      const nextOpen=menu.hidden;
      closeProfessionalPickers();
      menu.hidden=!nextOpen;
      toggle.setAttribute('aria-expanded',String(nextOpen));
      if(nextOpen)menu.querySelector('[role="option"][aria-selected="true"],[role="option"]')?.focus();
      return;
    }
    const button=e.target.closest('[data-assume]');if(!button)return;
    const id=button.dataset.assume;
    const select=byId('waitingList').querySelector('select[data-assume-select="'+id+'"]');
    if(!select?.value){notify('Selecione o profissional antes de iniciar.','error');return;}
    await runRpc('iniciar_atendimento',{p_atendimento_id:id,p_profissional_id:select.value});
  });
  byId('waitingList').addEventListener('keydown',e=>{
    const option=e.target.closest('[data-professional-choice]');
    const toggle=e.target.closest('[data-professional-toggle]');
    if(e.key==='Escape' && (option || toggle)){
      const picker=e.target.closest('[data-professional-picker]');
      closeProfessionalPickers();
      picker?.querySelector('[data-professional-toggle]')?.focus();
    }
    if(option && (e.key==='ArrowDown'||e.key==='ArrowUp')){
      e.preventDefault();
      const options=[...option.closest('.professional-menu').querySelectorAll('[role="option"]')];
      const index=options.indexOf(option);
      options[(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length]?.focus();
    }
  });
  document.addEventListener('click',e=>{
    if(!e.target.closest('.professional-picker'))closeProfessionalPickers();
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

// Compartilhamento interno do cliente autenticado com o calendário administrativo.
export {supabase, state, notify, esc, today, refresh};
