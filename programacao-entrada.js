import {supabase,state,notify,esc,today,refresh} from './app.js?v=200';

const byId=id=>document.getElementById(id);
const plusDays=(iso,n)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const pretty=iso=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'UTC'}).format(new Date(iso+'T12:00:00Z'));
const labels={tutor_cancelou:'Tutor cancelou',nao_compareceu:'Não compareceu',coleta_nao_realizada:'Coleta não realizada',outro:'Outro'};
const porteLabels={pequeno:'Pequeno',medio:'Médio',grande:'Grande'};
const speciesLabel=r=>r.especie==='gato'?'Gato':r.especie==='cachorro'?'Cachorro':'Não informada';
const breedLabel=r=>r.raca||'Não informada';
const transportLabel=r=>r.transporte_bolhas===true?'Sim · Bolhas & Latidos':r.transporte_bolhas===false?'Não · Tutor':'Não informado';
const serviceName=id=>state.services.find(s=>s.id===id)?.nome||'Serviço cadastrado';
let bookings=[],busy=false,refreshing=false;

function permitted(){return state.role==='admin'||state.role==='operacional'}
function datePicker(){
  const el=byId('programacaoEntradaData');
  const t=today(),max=plusDays(t,30);
  el.min=t;el.max=max;
  if(!el.value || el.value<t || el.value>max)el.value=t;
  return el.value;
}
function addressOf(r){
  if(r.transporte_bolhas===false)return 'Não solicitado · transporte por conta do tutor';
  if(!r.rua&&!r.cep)return 'Não informado';
  return [r.rua+(r.numero?', '+r.numero:''),r.complemento,r.bairro,
    (r.cidade||'')+(r.uf?' / '+r.uf:''),r.cep?'CEP '+r.cep.slice(0,5)+'-'+r.cep.slice(5):'']
    .filter(Boolean).join(' · ');
}
async function loadBookings(){
  if(!permitted() || refreshing || busy)return;
  refreshing=true;
  const day=datePicker();
  try{
    const {data,error}=await supabase.rpc('listar_programacao_entrada_v2',{p_data:day});
    if(error)throw error;
    if(byId('programacaoEntradaData').value!==day)return;
    bookings=data||[];
    render(day);
  }catch(e){
    byId('programacaoEntradaList').innerHTML='<div class="empty">Não foi possível carregar a programação.</div>';
    notify('Programação: '+e.message,'error');
  }finally{refreshing=false;}
}
function render(day=datePicker()){
  const current=day===today();
  const summary=bookings.reduce((a,b)=>{a[b.status]=(a[b.status]||0)+1;return a;},{});
  byId('preentradaNotice').textContent=
    (current?'Hoje · ':'Prévia futura · ')+pretty(day)+
    ' · '+(summary.programado||0)+' aguardando entrada, '+
    (summary.entrada_realizada||0)+' entrada(s) confirmada(s), '+
    (summary.recusado||0)+' recusa(s).'+
    (current?' Confira a chegada e registre a decisão no cartão.':' Ações liberadas somente no dia.');
  if(!bookings.length){
    byId('programacaoEntradaList').innerHTML=
      '<div class="empty">Nenhum agendamento aprovado para esta data.</div>';
    return;
  }
  byId('programacaoEntradaList').innerHTML=bookings.map(r=>{
    let badge='';
    const tone=r.status==='recusado'?'danger':'success';
    const statusText=r.status==='programado'?'Aprovado · Pré-cadastrado':r.status==='entrada_realizada'?'Entrada confirmada':'Recusado';
    badge='<span class="tag farol-tag status-'+tone+'"><span class="farol-dot" aria-hidden="true"></span>'+statusText+'</span>';
    let footer='';
    if(r.status==='programado' && current){
      footer='<div class="preentrada-actions">'+
        '<button type="button" class="btn btn-primary" data-checkin="'+esc(r.programacao_id)+'">✓ Dar entrada</button>'+
        '<button type="button" class="btn btn-danger" data-open-reject="'+esc(r.programacao_id)+'">Recusar atendimento</button>'+
        '</div><div class="reject-form" data-reject-form="'+esc(r.programacao_id)+'" hidden>'+
        '<label>Justificativa da recusa <b>*</b></label>'+
        '<select data-reject-reason="'+esc(r.programacao_id)+'"><option value="">Selecione o motivo</option>'+
        '<option value="tutor_cancelou">Tutor cancelou</option>'+
        '<option value="nao_compareceu">Não compareceu</option>'+
        '<option value="coleta_nao_realizada">Coleta não realizada</option>'+
        '<option value="outro">Outro</option></select>'+
        '<div data-reject-other="'+esc(r.programacao_id)+'" hidden>'+
        '<label>Detalhe da justificativa <b>*</b> <small>(até 200 caracteres)</small></label>'+
        '<textarea rows="3" maxlength="200" data-reject-note="'+esc(r.programacao_id)+'" placeholder="Descreva o motivo"></textarea>'+
        '<small class="counter"><span data-reject-length="'+esc(r.programacao_id)+'">0</span>/200</small></div>'+
        '<div class="preentrada-actions">'+
        '<button type="button" class="btn btn-danger" data-confirm-reject="'+esc(r.programacao_id)+'">Confirmar recusa</button>'+
        '<button type="button" class="btn btn-outline" data-close-reject="'+esc(r.programacao_id)+'">Voltar</button>'+
        '</div></div>';
    }else if(r.status==='programado'){
      footer='<div class="preentrada-info">Pré-cadastro disponível para conferência. Entrada e recusa liberadas em '+esc(pretty(day))+'.</div>';
    }else if(r.status==='entrada_realizada'){
      footer='<div class="preentrada-info">Entrada realizada. Animal enviado para a fila do prestador.</div>';
    }else{
      footer='<div class="preentrada-info"><strong>Recusa:</strong> '+esc(labels[r.motivo_recusa]||'Outro')+
        (r.justificativa_outro?' · '+esc(r.justificativa_outro):'')+'</div>';
    }
    return '<article class="preentrada-card farol-card farol-'+tone+'">'+
      '<div class="preentrada-card-head"><strong>'+esc(r.pet_nome)+'</strong>'+badge+'</div>'+
      '<div class="preentrada-detail"><b>Tutor:</b> '+esc(r.tutor_nome)+'</div>'+
      '<div class="preentrada-detail"><b>Porte:</b> '+esc(porteLabels[r.porte]||r.porte)+' · <b>Serviço:</b> '+esc(serviceName(r.servico_id))+'</div>'+
      '<div class="preentrada-detail"><b>Espécie:</b> '+esc(speciesLabel(r))+' · <b>Raça:</b> '+esc(breedLabel(r))+'</div>'+
      '<div class="preentrada-detail"><b>Transporte:</b> '+esc(transportLabel(r))+'</div>'+
      '<div class="preentrada-detail"><b>Data:</b> '+esc(pretty(day))+'</div>'+
      '<div class="preentrada-detail"><b>Endereço:</b> '+esc(addressOf(r))+'</div>'+footer+'</article>';
  }).join('');
}
async function checkin(id){
  if(busy || datePicker()!==today())return notify('A entrada somente pode ser registrada na data agendada.','error');
  const r=bookings.find(x=>x.programacao_id===id);
  if(!r || r.status!=='programado')return;
  if(!confirm('Confirmar a chegada de '+r.pet_nome+' e enviar para a fila de espera?'))return;
  busy=true;
  try{
    const {error}=await supabase.rpc('registrar_entrada_programada',{p_programacao_id:id});
    if(error)throw error;
    notify('Entrada confirmada: '+r.pet_nome+' já está na fila de espera.','success');
    await refresh();
  }catch(e){notify('Não foi possível registrar a entrada: '+e.message,'error');}
  finally{busy=false;await loadBookings();}
}
async function reject(id){
  if(busy || datePicker()!==today())return notify('A recusa operacional só pode ser registrada no dia agendado.','error');
  const r=bookings.find(x=>x.programacao_id===id);
  if(!r || r.status!=='programado')return;
  const root=byId('programacaoEntradaList');
  const select=root.querySelector('[data-reject-reason="'+id+'"]');
  const motive=select?.value||'';
  const detail=root.querySelector('[data-reject-note="'+id+'"]')?.value.trim()||'';
  if(!labels[motive])return notify('Selecione a justificativa da recusa.','error');
  if(motive==='outro' && (!detail||detail.length>200))
    return notify('Descreva a justificativa Outro (até 200 caracteres).','error');
  if(!confirm('Recusar o atendimento programado de '+r.pet_nome+'? A justificativa ficará registrada.'))return;
  busy=true;
  try{
    const {error}=await supabase.rpc('recusar_entrada_programada',{
      p_programacao_id:id,p_motivo:motive,p_outro:motive==='outro'?detail:null
    });
    if(error)throw error;
    notify('Recusa registrada com justificativa.','success');
  }catch(e){notify('Não foi possível registrar a recusa: '+e.message,'error');}
  finally{busy=false;await loadBookings();}
}
const container=byId('programacaoEntradaList');
container.addEventListener('click',event=>{
  const check=event.target.closest('[data-checkin]');
  if(check)return checkin(check.dataset.checkin);
  const open=event.target.closest('[data-open-reject]');
  const close=event.target.closest('[data-close-reject]');
  if(open || close){
    const id=open?.dataset.openReject||close.dataset.closeReject;
    const form=container.querySelector('[data-reject-form="'+id+'"]');
    if(form)form.hidden=Boolean(close);
    return;
  }
  const rejectBtn=event.target.closest('[data-confirm-reject]');
  if(rejectBtn)reject(rejectBtn.dataset.confirmReject);
});
container.addEventListener('change',event=>{
  const sel=event.target.closest('[data-reject-reason]');
  if(!sel)return;
  const id=sel.dataset.rejectReason;
  const other=container.querySelector('[data-reject-other="'+id+'"]');
  if(other)other.hidden=sel.value!=='outro';
});
container.addEventListener('input',event=>{
  const txt=event.target.closest('[data-reject-note]');
  if(!txt)return;
  const counter=container.querySelector('[data-reject-length="'+txt.dataset.rejectNote+'"]');
  if(counter)counter.textContent=String(txt.value.length);
});
byId('programacaoEntradaData').addEventListener('change',()=>{datePicker();loadBookings();});
document.querySelectorAll('[data-page="entrada"]').forEach(button=>
  button.addEventListener('click',()=>queueMicrotask(()=>{if(permitted())loadBookings();}))
);
window.addEventListener('bolhas:authenticated',()=>{if(permitted())loadBookings();});
supabase?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){bookings=[];byId('programacaoEntradaList').innerHTML='';}});
setInterval(()=>{if(permitted() && !byId('page-entrada').hidden)loadBookings();},30000);
datePicker();
if(permitted() && !byId("page-entrada").hidden)loadBookings();
