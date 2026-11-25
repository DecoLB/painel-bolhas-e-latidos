import {supabase,state,notify,esc,today} from './app.js';

let solicitacoes=[], programados=new Map(), selectedDate=null, loading=false, channel=null;
const byId=id=>document.getElementById(id);
const plusDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const pretty=iso=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
const longDate=iso=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
const weekday=iso=>new Intl.DateTimeFormat('pt-BR',{weekday:'short',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z')).replace('.','');
const serviceName=id=>state.services.find(s=>s.id===id)?.nome||'Serviço cadastrado';
const allowed=()=>state.role==='admin';
const ranges=()=>({start:plusDays(today(),1),end:plusDays(today(),30),current:today()});
const isVisible=()=>!byId('admin-agendamentos').hidden && !byId('page-admin').hidden;
const bookingUrl=()=>new URL('./agendamento.html',window.location.href).href;
const statusLabels={programado:'Aguardando entrada',entrada_realizada:'Entrada realizada',recusado:'Recusado na entrada'};
const reasonLabels={tutor_cancelou:'Tutor cancelou',nao_compareceu:'Não compareceu',coleta_nao_realizada:'Coleta não realizada',outro:'Outro'};
const sizeLabels={pequeno:'Pequeno',medio:'Médio',grande:'Grande'};
const addressOf=r=>[r.rua+', '+r.numero,r.complemento,r.bairro,r.cidade+' / '+r.uf,
  'CEP '+r.cep.slice(0,5)+'-'+r.cep.slice(5)].filter(Boolean).join(' · ');

function initPrintDate(){
  const select=byId('printBookingDate'),{current,end}=ranges();
  select.min=current;select.max=end;
  if(!select.value || select.value<current || select.value>end)select.value=current;
}
async function loadBookings(){
  if(!allowed()||!supabase||loading)return;
  loading=true;
  try {
    initPrintDate();
    const {current,start,end}=ranges();
    const [reqs,schedule]=await Promise.all([
      supabase.from('solicitacoes_agendamento').select('*')
        .gte('data_desejada',current).lte('data_desejada',end)
        .order('data_desejada',{ascending:true}).limit(1000),
      supabase.from('programacao').select('*')
        .gte('data_programada',current).lte('data_programada',end).limit(1000)
    ]);
    if(reqs.error)throw reqs.error;
    if(schedule.error)throw schedule.error;
    solicitacoes=reqs.data||[];
    programados=new Map((schedule.data||[]).map(r=>[r.solicitacao_id,r]));
    if(selectedDate && (selectedDate<start||selectedDate>end))selectedDate=null;
    render();
  }catch(e){notify('Erro ao consultar agendamentos: '+e.message,'error');}
  finally{loading=false;}
}
function render(){
  if(!allowed())return;
  const {start}=ranges();
  const pending=solicitacoes.filter(r=>r.status==='pendente');
  const approved=solicitacoes.filter(r=>r.status==='aprovado' && programados.has(r.id));
  byId('bookingPendingCount').textContent=pending.length;
  byId('bookingApprovedCount').textContent=approved.length;
  const tab=byId('bookingTabCount');tab.hidden=pending.length===0;tab.textContent=pending.length;

  let grid='';
  for(let i=0;i<30;i++){
    const iso=plusDays(start,i);
    const dayP=pending.filter(r=>r.data_desejada===iso).length;
    const dayA=approved.filter(r=>r.data_desejada===iso).length;
    const counts=(dayP?'<small aria-label="'+dayP+' aguardando aprovação">⏳ '+dayP+'</small>':'')
      +(dayA?'<small class="ok" aria-label="'+dayA+' aprovados">✓ '+dayA+'</small>':'');
    grid+='<button type="button" class="appointment-day'+(selectedDate===iso?' selected':'')
      +'" data-booking-day="'+iso+'" aria-pressed="'+(selectedDate===iso)+'" aria-label="'+esc(pretty(iso))+'">'
      +'<div><span class="weekday">'+esc(weekday(iso))+'</span><br><strong>'
      +esc(iso.slice(8,10)+'/'+iso.slice(5,7))+'</strong></div>'
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
  const prog=programados.get(r.id);
  const status=prog?.status||'programado';
  const stateLabel=pending?'⏳ Aguardando análise':status==='recusado'?'✕ Recusado':status==='entrada_realizada'?'✓ Entrada registrada':'✓ Aprovado';
  const badgeColor=pending?'warn':status==='recusado'?'off':'done';
  const actions=pending
    ? '<div class="booking-actions"><button type="button" class="btn btn-primary" data-approve-booking="'+esc(r.id)+'">✓ Aprovar</button>'
      +'<button type="button" class="btn btn-danger" data-reject-booking="'+esc(r.id)+'">✕ Recusar</button></div>'
    : '<div class="booking-status-foot"><span class="tag '+badgeColor+'">'+esc(statusLabels[status]||'Programado')+'</span>'
      +(status==='recusado'?'<small>Justificativa: '+esc(reasonLabels[prog.motivo_recusa]||'')+
        (prog.justificativa_outro?' · '+esc(prog.justificativa_outro):'')+'</small>':'')+'</div>';
  return '<article class="booking-card">'
    +'<div class="booking-card-head"><strong>'+esc(r.pet_nome)+'</strong><span class="tag '+badgeColor+'">'+stateLabel+'</span></div>'
    +'<div class="booking-card-meta"><b>Tutor:</b> '+esc(r.tutor_nome)+'</div>'
    +'<div class="booking-card-meta"><b>Data:</b> '+esc(pretty(r.data_desejada))+' · <b>Porte:</b> '+esc(sizeLabels[r.porte]||r.porte)+'</div>'
    +'<div class="booking-card-meta"><b>Serviço:</b> '+esc(serviceName(r.servico_id))+'</div>'
    +'<div class="booking-card-meta"><b>Endereço:</b> '+esc(addressOf(r))+'</div>'+actions+'</article>';
}
async function decide(id,decision){
  if(!allowed()||loading)return;
  const r=solicitacoes.find(x=>x.id===id && x.status==='pendente');
  if(!r)return notify('Essa solicitação já foi analisada ou não está disponível.','error');
  if(decision==='reject' && !window.confirm(
    'Recusar e excluir definitivamente a solicitação de '+r.pet_nome+'? Essa ação não pode ser desfeita.'
  ))return;
  const fn=decision==='approve'?'aprovar_solicitacao_agendamento':'recusar_solicitacao_agendamento';
  const {error}=await supabase.rpc(fn,{p_id:id});
  if(error){notify('Não foi possível processar: '+error.message,'error');await loadBookings();return;}
  notify(decision==='approve'
    ? 'Solicitação aprovada e adicionada à programação (pré-cadastro).'
    : 'Solicitação recusada e excluída da base.','success');
  await loadBookings();
}
function printSchedule(){
  if(!allowed())return;
  initPrintDate();
  const date=byId('printBookingDate').value;
  if(date<today() || date>plusDays(today(),30))return notify('Selecione uma data válida para impressão.','error');
  const list=solicitacoes.filter(r=>r.data_desejada===date && r.status==='aprovado' && programados.has(r.id));
  const counters={programado:0,entrada_realizada:0,recusado:0};
  for(const r of list){const status=programados.get(r.id).status;if(status in counters)counters[status]++;}
  const rows=list.map((r,i)=>{
    const prog=programados.get(r.id),st=prog.status;
    const status=esc(statusLabels[st]||'Programado')+(st==='recusado'
      ?'<div class="booking-print-reason">'+esc(reasonLabels[prog.motivo_recusa]||'')+
        (prog.justificativa_outro?' · '+esc(prog.justificativa_outro):'')+'</div>':'');
    return '<tr><td>'+(i+1)+'</td><td><b>'+esc(r.pet_nome)+'</b><div>'+esc(r.tutor_nome)+'</div></td>'
      +'<td>'+esc(sizeLabels[r.porte]||r.porte)+'</td>'
      +'<td>'+esc(serviceName(r.servico_id))+'</td>'
      +'<td>'+esc(addressOf(r))+'</td><td>'+status+'</td></tr>';
  }).join('');
  const sheet=byId('bookingPrintSheet');
  sheet.innerHTML='<header class="booking-print-header"><div><h1>Bolhas & Latidos</h1>'
    +'<h2>Ficha da programação do dia</h2><p>'+esc(longDate(date))+'</p></div>'
    +'<div class="booking-print-counts"><b>Total: '+list.length+'</b>'
    +'<span>Aguardando entrada: '+counters.programado+'</span>'
    +'<span>Entradas: '+counters.entrada_realizada+'</span>'
    +'<span>Recusados: '+counters.recusado+'</span></div></header>'
    +'<table class="booking-print-table"><thead><tr><th>#</th><th>Pet / Tutor</th>'
    +'<th>Porte</th><th>Serviço</th><th>Endereço</th><th>Situação</th></tr></thead>'
    +'<tbody>'+(rows||'<tr><td colspan="6">Nenhum agendamento aprovado nesta data.</td></tr>')+'</tbody></table>'
    +'<footer class="booking-print-footer">Versão 1.9.0 · Desenvolvido por SUMMIT ADVISORY TECNOLOGIA E INFORMÁTICA LTDA · Relatório de programação · Impresso em '
    +esc(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date()))
    +'</footer>';
  sheet.hidden=false;
  document.body.classList.add('print-schedule');
  window.print();
}
function cleanPrint(){
  byId('bookingPrintSheet').hidden=true;
  document.body.classList.remove('print-schedule');
}
window.addEventListener('afterprint',cleanPrint);
byId('printBookingSchedule').addEventListener('click',async()=>{
  if(!allowed())return;
  await loadBookings();
  printSchedule();
});
byId('bookingCalendar').addEventListener('click',event=>{
  if(!allowed())return;
  const button=event.target.closest('[data-booking-day]');
  if(!button)return;
  selectedDate=selectedDate===button.dataset.bookingDay?null:button.dataset.bookingDay;
  if(selectedDate)byId('printBookingDate').value=selectedDate;
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
  if(!channel){
    channel=supabase.channel('pedidos-agendamento-admin')
      .on('postgres_changes',{event:'*',schema:'public',table:'solicitacoes_agendamento'},()=>{
        if(allowed() && isVisible())loadBookings();
      }).subscribe();
  }
}));
supabase?.auth.onAuthStateChange(event=>{
  if(event==='SIGNED_OUT'){
    solicitacoes=[];programados=new Map();selectedDate=null;cleanPrint();
    if(channel){supabase.removeChannel(channel);channel=null;}
  }
});
initPrintDate();
setInterval(()=>{if(allowed() && isVisible())loadBookings();},45000);
