import {supabase, state, notify, esc, today} from './app.js';

let solicitacoes=[], programados=new Set(), selectedDate=null, loading=false, channel=null;
const byId=id=>document.getElementById(id);
const plusDays=(iso,n)=>{
  const d=new Date(iso+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
};
const pretty=iso=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
const weekday=iso=>new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')).replace('.','');
const serviceName=id=>state.services.find(s=>s.id===id)?.nome||'Serviço indisponível';
const allowed=()=>state.role==='admin';
const ranges=()=>({start:plusDays(today(),1),end:plusDays(today(),30)});
const isVisible=()=>!byId('admin-agendamentos').hidden && !byId('page-admin').hidden;
const bookingUrl=()=>new URL('./agendamento.html',window.location.href).href;

async function loadBookings(){
  if(!allowed() || !supabase || loading)return;
  loading=true;
  try {
    const {start,end}=ranges();
    const [reqs, schedule]=await Promise.all([
      supabase.from('solicitacoes_agendamento').select('*')
        .gte('data_desejada',start).lte('data_desejada',end).order('data_desejada',{ascending:true}).limit(1000),
      supabase.from('programacao').select('solicitacao_id,data_programada')
        .gte('data_programada',start).lte('data_programada',end).limit(1000)
    ]);
    if(reqs.error) throw reqs.error;
    if(schedule.error)throw schedule.error;
    solicitacoes=reqs.data||[];
    programados=new Set((schedule.data||[]).map(r=>r.solicitacao_id));
    if(selectedDate && (selectedDate<start||selectedDate>end))selectedDate=null;
    render();
  }catch(err){notify('Erro ao consultar agendamentos: '+err.message,'error');}
  finally{loading=false;}
}
function render(){
  if(!allowed())return;
  const {start}=ranges();
  const pending=solicitacoes.filter(r=>r.status==='pendente');
  const approved=solicitacoes.filter(r=>r.status==='aprovado' && programados.has(r.id));
  byId('bookingPendingCount').textContent=pending.length;
  byId('bookingApprovedCount').textContent=approved.length;
  const tab=byId('bookingTabCount');
  tab.hidden=pending.length===0;
  tab.textContent=pending.length;

  let grid='';
  for(let i=0;i<30;i++){
    const iso=plusDays(start,i);
    const dayP=pending.filter(r=>r.data_desejada===iso).length;
    const dayA=approved.filter(r=>r.data_desejada===iso).length;
    const counts=(dayP?'<small aria-label="'+dayP+' aguardando aprovação">⏳ '+dayP+'</small>':'')
      +(dayA?'<small class="ok" aria-label="'+dayA+' aprovados">✓ '+dayA+'</small>':'');
    grid+='<button type="button" class="appointment-day'+(selectedDate===iso?' selected':'')
      +'" data-booking-day="'+iso+'" aria-pressed="'+(selectedDate===iso)+'" aria-label="'+esc(pretty(iso))+'">'
      +'<div><span class="weekday">'+esc(weekday(iso))+'</span><br><strong>'+esc(iso.slice(8,10)+'/'+iso.slice(5,7))+'</strong></div>'
      +'<div class="day-counts">'+counts+'</div></button>';
  }
  byId('bookingCalendar').innerHTML=grid;
  byId('bookingSelectedFilter').textContent=selectedDate
    ? 'Filtrado por '+pretty(selectedDate)+' · Clique novamente no dia para ver todos'
    : 'Todos os pedidos dos próximos 30 dias · Clique numa data para filtrar';
  const scopedPending=selectedDate?pending.filter(r=>r.data_desejada===selectedDate):pending;
  const scopedApproved=selectedDate?approved.filter(r=>r.data_desejada===selectedDate):approved;
  byId('bookingPendingList').innerHTML=scopedPending.length
    ? scopedPending.map(r=>card(r,true)).join('')
    : '<div class="booking-empty">Nenhuma solicitação pendente neste período.</div>';
  byId('bookingApprovedList').innerHTML=scopedApproved.length
    ? scopedApproved.map(r=>card(r,false)).join('')
    : '<div class="booking-empty">Nenhum atendimento aprovado neste período.</div>';
}
function card(r,pending){
  const size={pequeno:'Pequeno',medio:'Médio',grande:'Grande'}[r.porte]||r.porte;
  const address=[r.rua+', '+r.numero,r.complemento,r.bairro,
    r.cidade+' / '+r.uf,'CEP '+r.cep.slice(0,5)+'-'+r.cep.slice(5)].filter(Boolean).join(' · ');
  const actions=pending
    ? '<div class="booking-actions"><button type="button" class="btn btn-primary" data-approve-booking="'+esc(r.id)+'" aria-label="Aprovar '+esc(r.pet_nome)+'">✓ Aprovar</button>'
      +'<button type="button" class="btn btn-danger" data-reject-booking="'+esc(r.id)+'" aria-label="Recusar '+esc(r.pet_nome)+'">✕ Recusar</button></div>'
    : '<span class="tag done">✓ Programado</span>';
  return '<article class="booking-card">'
    +'<div class="booking-card-head"><strong>'+esc(r.pet_nome)+'</strong><span class="tag '+(pending?'warn':'done')+'">'+(pending?'⏳ Aguardando análise':'✓ Aprovado')+'</span></div>'
    +'<div class="booking-card-meta"><b>Tutor:</b> '+esc(r.tutor_nome)+'</div>'
    +'<div class="booking-card-meta"><b>Data:</b> '+esc(pretty(r.data_desejada))+' · <b>Porte:</b> '+esc(size)+'</div>'
    +'<div class="booking-card-meta"><b>Serviço:</b> '+esc(serviceName(r.servico_id))+'</div>'
    +'<div class="booking-card-meta"><b>Endereço:</b> '+esc(address)+'</div>'+actions+'</article>';
}
async function decide(id,decision){
  if(!allowed() || loading)return;
  const r=solicitacoes.find(x=>x.id===id && x.status==='pendente');
  if(!r)return notify('Essa solicitação já foi analisada ou não está disponível.','error');
  if(decision==='reject' && !window.confirm(
    'Recusar e excluir definitivamente a solicitação de '+r.pet_nome+'? Essa ação não pode ser desfeita.'
  )) return;
  const fn=decision==='approve'?'aprovar_solicitacao_agendamento':'recusar_solicitacao_agendamento';
  const {error}=await supabase.rpc(fn,{p_id:id});
  if(error) {notify('Não foi possível processar: '+error.message,'error');await loadBookings();return;}
  notify(decision==='approve'
    ? 'Solicitação aprovada e adicionada à programação.'
    : 'Solicitação recusada e excluída da base.','success');
  await loadBookings();
}
byId('bookingCalendar').addEventListener('click',event=>{
  if(!allowed())return;
  const button=event.target.closest('[data-booking-day]');
  if(!button)return;
  selectedDate=selectedDate===button.dataset.bookingDay?null:button.dataset.bookingDay;
  render();
});
byId('bookingPendingList').addEventListener('click',event=>{
  if(!allowed())return;
  const approve=event.target.closest('[data-approve-booking]');
  const reject=event.target.closest('[data-reject-booking]');
  if(approve)decide(approve.dataset.approveBooking,'approve');
  else if(reject)decide(reject.dataset.rejectBooking,'reject');
});
byId('copyBookingLink').addEventListener('click',async()=>{
  if(!allowed())return;
  try{await navigator.clipboard.writeText(bookingUrl());notify('Link público copiado para compartilhar com os tutores.','success');}
  catch{notify('Copie o endereço ao abrir o formulário público.','error');}
});
document.querySelectorAll('[data-admin-tab="agendamentos"]').forEach(button=>button.addEventListener('click',()=>{
  if(!allowed())return;
  loadBookings();
  if(!channel) {
    channel=supabase.channel('pedidos-agendamento-admin')
      .on('postgres_changes',{event:'*',schema:'public',table:'solicitacoes_agendamento'},()=>{
        if(allowed() && isVisible())loadBookings();
      }).subscribe();
  }
}));
supabase?.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'){
    solicitacoes=[];programados=new Set();selectedDate=null;
    if(channel){supabase.removeChannel(channel);channel=null;}
  }
});
setInterval(()=>{if(allowed() && isVisible())loadBookings();},45000);
