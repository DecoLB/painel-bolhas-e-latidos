import {supabase,state,notify,esc,today,refresh} from './app.js?v=230';

// V2.3: atividades e executores, sem preços nas telas operacionais.
const $=id=>document.getElementById(id);
const money=c=>(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const dateSao=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
const timeSao=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'});
const day=v=>v?dateSao.format(new Date(v)):'';
const hour=v=>v?timeSao.format(new Date(v)):'—';
const local=v=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(v)).replace(' ','T'):'';
const localISO=v=>v?new Date(v+ '-03:00').toISOString():null;
const staffName=id=>state.professionals.find(p=>p.id===id)?.nome||'Profissional indisponível';
const petName=id=>state.attendances.find(a=>a.id===id)?.animal_nome||'Animal não encontrado';
const serviceName=id=>state.services.find(s=>s.id===id)?.nome||'Serviço não informado';
const findPet=id=>state.attendances.find(a=>a.id===id);
const participants=(stageId,papel)=>state.etapaProfissionais.filter(p=>p.etapa_id===stageId&&p.papel===papel).map(p=>p.profissional_id);
const names=arr=>arr?.length?arr.map(staffName).join(', '):'A definir';
const profiles=()=>state.professionals.filter(p=>p.ativo);
const canOperate=()=>Boolean(state.role)&&!$('appShell').hidden;
const mainPhoto=a=>{
 const img=state.images.get(a?.foto_path);
 return img?.url&&img.expires>Date.now()?
 '<img loading="lazy" src="'+esc(img.url)+'" alt="Foto do animal '+esc(a.animal_nome)+'">':
 '<span aria-hidden="true">✦</span>';
};
let working=false;
const stageSpecs=()=>{
 const svc=state.services.find(s=>s.id===$('entryService').value)?.nome||'';
 if(!svc)return [];
 const lower=svc.toLocaleLowerCase('pt-BR');
 const main=lower.includes('banho')&&lower.includes('tosa')?
  [{key:'principal:1',name:'Banho'},
    {key:'principal:2',name:lower.includes('máquina')||lower.includes('maquina')?'Tosa na Máquina':lower.includes('tesoura')?'Tosa na Tesoura':lower.includes('higi')?'Tosa Higiênica':'Tosa'}]:
  [{key:'principal:1',name:svc}];
 const extras=[...$('entryAdditionalList').querySelectorAll('input[type=checkbox]:checked')];
 return [...main,...extras.map(e=>({key:'adicional:'+e.value,
   name:state.additionalCatalog.find(x=>x.id===e.value)?.nome||'Adicional'}))];
};
function staffChoices(key,checked){
 return profiles().map(p=>'<label class="v23-person"><input type="checkbox" value="'+esc(p.id)+'" data-v23-planned="'+esc(key)+'"'
   +(checked.includes(p.id)?' checked':'')+'><span>'+esc(p.sigla)+' · '+esc(p.nome)+'</span></label>').join('');
}
function renderEntryPlan(){
 const el=$('entryEtapasPrevistas');if(!el)return;
 const selected=new Map();
 for(const input of el.querySelectorAll('input[data-v23-planned]:checked')){
  const a=selected.get(input.dataset.v23Planned)||[];a.push(input.value);selected.set(input.dataset.v23Planned,a);
 }
 const specs=stageSpecs();
 el.innerHTML=specs.length?specs.map(x=>
  '<div class="v23-plan-item"><strong>'+esc(x.name)+'</strong>'
  +'<div class="v23-person-grid">'+staffChoices(x.key,selected.get(x.key)||[])+'</div></div>').join(''):
  '<p class="v23-muted">Escolha o serviço principal para visualizar as atividades previstas.</p>';
}
function roster(stage,role){
 const own=participants(stage.id,role);
 const choices=profiles();
 const existing=role==='em_execucao'?
 state.etapaProfissionais.filter(x=>x.etapa_id===stage.id&&x.papel===role).map(x=>x.profissional_id):[];
 // Um profissional que foi desativado ainda pode ser confirmado como executor real.
 const keep=[...new Set([...existing,...own])].filter(id=>!choices.some(p=>p.id===id));
 return [...choices.map(p=>({id:p.id,name:p.sigla+' · '+p.nome})),
  ...keep.map(id=>({id,name:staffName(id)+' (inativo)'}))].map(p=>
  '<label class="v23-person"><input type="checkbox" data-v23-executor value="'+esc(p.id)+'"'
  +(own.includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span></label>').join('');
}
function activityCard(stage){
 const a=findPet(stage.atendimento_id);if(!a)return '';
 const waiting=stage.status==='aguardando';
 const planned=participants(stage.id,'previsto');
 const running=participants(stage.id,'em_execucao');
 const role=waiting?'previsto':'em_execucao';
 return '<article class="v23-task-card v23-'+(waiting?'waiting':'active')+'">'
   +'<div class="v23-task-photo">'+mainPhoto(a)+'</div>'
   +'<div class="v23-task-body">'
   +'<div class="v23-task-top"><strong>'+esc(a.animal_nome)+'</strong>'
   +'<span class="v23-status '+(waiting?'v23-status-wait':'v23-status-active')+'">'+(waiting?'Aguardando atividade':'Em execução')+'</span></div>'
   +'<div class="v23-task-service"><b>Atividade:</b> '+esc(stage.nome)
   +' <small>('+esc(stage.tipo==='principal'?'Serviço principal':'Adicional')+')</small></div>'
   +'<div><b>Contratado:</b> '+esc(serviceName(a.servico_id))+'</div>'
   +'<div><b>Previsto:</b> '+esc(names(planned))+'</div>'
   +(!waiting?'<div><b>Em execução:</b> '+esc(names(running))+' · Início '+esc(hour(stage.iniciado_em))+'</div>':'')
   +'<div class="v23-choose-executors"><strong>'+(waiting?'Quem iniciará esta atividade?':'Confirme quem realmente executou:')+'</strong>'
   +'<div class="v23-person-grid">'+roster(stage,waiting?'previsto':'em_execucao')+'</div></div>'
   +'<button type="button" class="btn btn-primary" data-v23-'+(waiting?'start':'finish')+'="'+esc(stage.id)+'">'
   +(waiting?'Iniciar atividade':'Confirmar executores e finalizar')+'</button>'
   +'</div></article>';
}
function tvGroup(stage,active){
 const a=findPet(stage.atendimento_id);if(!a)return '';
 const ids=participants(stage.id,active?'em_execucao':'previsto');
 return '<article class="v23-tv-card '+(active?'v23-tv-on':'v23-tv-off')+'">'
   +'<div class="v23-tv-photo">'+mainPhoto(a)+'</div>'
   +'<div class="v23-tv-description"><strong>'+esc(a.animal_nome)+'</strong>'
   +'<div><b>Atividade:</b> '+esc(stage.nome)+'</div>'
   +'<div><b>'+(active?'Executando':'Previsto')+':</b> '+esc(names(ids))+'</div>'
   +'<small>'+esc(active?'Em execução desde '+hour(stage.iniciado_em):'Aguardando desde '+hour(a.criado_em))+'</small>'
   +'</div></article>';
}
function renderQueues(){
 if(!canOperate())return;
 const waiting=state.etapas.filter(e=>e.status==='aguardando'),active=state.etapas.filter(e=>e.status==='em_execucao');
 const waitRoot=$('v23WaitingTasks'),runRoot=$('v23ActiveTasks'),
  tw=$('v23TvWaiting'),ta=$('v23TvActive');
 if(!waitRoot||!runRoot||!tw||!ta)return;
 waitRoot.innerHTML=waiting.map(activityCard).join('');
 runRoot.innerHTML=active.map(activityCard).join('');
 tw.innerHTML=waiting.map(x=>tvGroup(x,false)).join('');
 ta.innerHTML=active.map(x=>tvGroup(x,true)).join('');
 const legacyIds=new Set(state.etapas.map(x=>x.atendimento_id));
 const legacyW=state.attendances.filter(x=>x.status==='aguardando'&&!legacyIds.has(x.id)).length;
 const legacyA=state.attendances.filter(x=>x.status==='em_execucao'&&!legacyIds.has(x.id)).length;
 if(!waiting.length&&!legacyW){
   waitRoot.innerHTML='<div class="empty">Nenhuma atividade aguardando.</div>';
   tw.innerHTML='<div class="empty">Nenhum animal aguardando.</div>';
 }
 if(!active.length&&!legacyA){
   runRoot.innerHTML='<div class="empty">Nenhuma atividade em execução.</div>';
   ta.innerHTML='<div class="empty">Nenhum atendimento em execução.</div>';
 }
 $('waitingCount').textContent=String(waiting.length+legacyW);
 $('activeCount').textContent=String(active.length+legacyA);
 $('tvWaitingCount').textContent=String(waiting.length+legacyW);
 $('tvActiveCount').textContent=String(active.length+legacyA);
 const max=Math.max(waiting.length+legacyW,active.length+legacyA);
 $('tvGrid').dataset.density=max<=1?'single':max<=4?'few':'many';
}
async function operate(action,button){
 if(working)return;
 const id=button.getAttribute('data-v23-'+action);
 const root=button.closest('.v23-task-card');
 const professionals=[...root.querySelectorAll('input[data-v23-executor]:checked')].map(x=>x.value);
 if(!professionals.length){notify('Selecione pelo menos um profissional para esta atividade.','error');return;}
 if(action==='finish'&&!window.confirm('Confirmar que '+names(professionals)+' executou esta atividade e finalizá-la?'))return;
 working=true;button.disabled=true;
 try{
  const fn=action==='start'?'iniciar_etapa_v23':'finalizar_etapa_v23';
  const {error}=await supabase.rpc(fn,{p_etapa_id:id,p_profissionais:professionals});
  if(error)throw error;
  notify(action==='start'?'Atividade iniciada.':'Etapa concluída e executores confirmados.','success');
  await refresh();
  if(state.role==='admin')await loadAdmin();
 }catch(e){notify('Não foi possível executar a atividade: '+e.message,'error');await refresh();}
 finally{working=false;button.disabled=false;}
}
for(const container of ['waitingList','activeList']){
 $(container).addEventListener('click',async e=>{
  const start=e.target.closest('[data-v23-start]'),finish=e.target.closest('[data-v23-finish]');
  if(start)await operate('start',start);
  if(finish)await operate('finish',finish);
 });
}
$('entryService').addEventListener('change',renderEntryPlan);
$('entryAdditionalList').addEventListener('change',renderEntryPlan);
window.addEventListener('bolhas:entrada-reset',()=>renderEntryPlan());

let finVals=[],finRates=[],conferences=[],audit=[],loadingAdmin=false;
const isAdmin=()=>state.role==='admin'&&!$('appShell').hidden;
const valuesById=id=>finVals.find(v=>v.etapa_id===id);
const shares=id=>finRates.filter(r=>r.etapa_id===id);
const reviewed=id=>conferences.find(c=>c.atendimento_id===id);
async function loadAdmin(){
 if(!isAdmin()||loadingAdmin)return;
 loadingAdmin=true;
 try{
  const [v,r,c,a]=await Promise.all([
   supabase.from('etapa_valores').select('*').limit(3500),
   supabase.from('etapa_rateios').select('*').limit(8500),
   supabase.from('fichas_conferencia').select('*').limit(3500),
   supabase.from('etapa_auditoria').select('*').order('registrado_em',{ascending:false}).limit(400)
  ]);
  for(const result of [v,r,c,a])if(result.error)throw result.error;
  finVals=v.data||[];finRates=r.data||[];conferences=c.data||[];audit=a.data||[];
  renderAudit();renderProduction();
 }catch(e){notify('Falha na conferência: '+e.message,'error');}
 finally{loadingAdmin=false;}
}
function stageStaffChecklist(stage,role='confirmado'){
 const current=participants(stage.id,role);
 const extras=current.filter(id=>!profiles().some(p=>p.id===id));
 return [...profiles().map(p=>({id:p.id,name:p.nome})),...extras.map(id=>({id,name:staffName(id)}))]
  .map(p=>'<label class="v23-person"><input data-v23-correct-executor type="checkbox" value="'+esc(p.id)+'"'
   +(current.includes(p.id)?' checked':'')+'><span>'+esc(p.name)+'</span></label>').join('');
}
function auditStage(stage){
 const v=valuesById(stage.id);const done=stage.status==='concluido',current=participants(stage.id,'confirmado');
 const rs=shares(stage.id);
 return '<article class="v23-stage-audit" data-v23-stage="'+esc(stage.id)+'">'
 +'<header><strong>'+esc(stage.nome)+'</strong><span class="v23-status">'+esc(done?'Concluído':stage.status==='em_execucao'?'Em execução':'Aguardando')+'</span></header>'
 +'<div class="v23-stage-meta"><span><b>Previsto:</b> '+esc(names(participants(stage.id,'previsto')))+'</span>'
 +'<span><b>Confirmado:</b> '+esc(names(current))+'</span>'
 +'<span><b>Início/fim:</b> '+esc(hour(stage.iniciado_em))+' / '+esc(hour(stage.concluido_em))+'</span>'
 +'<span><b>Peso no pacote:</b> '+esc(stage.tipo==='principal'?(v?.peso_pacote??'—')+'%':'Adicional independente')+'</span>'
 +'<span><b>Valor associado:</b> '+esc(v?.valor_centavos!=null?money(v.valor_centavos):'Sob consulta')+'</span>'
 +'</div>'
 +(rs.length?'<div class="v23-share-lines"><b>Rateio por executor:</b> '+rs.map(s=>
    '<span>'+esc(staffName(s.profissional_id))+': '+s.percentual+'% · '+esc(s.valor_centavos!=null?money(s.valor_centavos):'Sob consulta')+'</span>').join('')+'</div>':'')
 +(done?'<details class="v23-correct-form"><summary>Corrigir registro (Administrador)</summary>'
  +'<div class="v23-correct-grid">'
  +'<label>Início real <input data-v23-start-time type="datetime-local" step="1" value="'+esc(local(stage.iniciado_em))+'"></label>'
  +'<label>Fim real <input data-v23-end-time type="datetime-local" step="1" value="'+esc(local(stage.concluido_em))+'"></label>'
  +(stage.tipo==='principal'?'<label>Percentual desta etapa no pacote <input data-v23-weight type="number" min="0" max="100" value="'+esc(v?.peso_pacote??100)+'"></label>':'')
  +'</div><div class="v23-edit-executors"><b>Executores reais:</b><div class="v23-person-grid">'
  +stageStaffChecklist(stage)+'</div></div>'
  +'<label>Justificativa da correção <textarea data-v23-justification maxlength="500" rows="2" placeholder="Conforme ficha física, responsável correto..."></textarea></label>'
  +'<button type="button" class="btn btn-primary" data-v23-correct="'+esc(stage.id)+'">Registrar correção auditada</button>'
  +(rs.length>1?'<hr><div class="v23-rate-box"><b>Distribuição entre executores (%)</b>'
    +'<div class="v23-rate-inputs">'+rs.map(s=>'<label>'+esc(staffName(s.profissional_id))
    +'<input type="number" min="0" max="100" step="1" data-v23-rate-prof="'+esc(s.profissional_id)+'" value="'+s.percentual+'"></label>').join('')+'</div>'
    +'<label>Justificativa do rateio <input data-v23-rate-reason maxlength="500" placeholder="Rateio conforme ficha diária"></label>'
    +'<button type="button" class="btn btn-outline" data-v23-rate="'+esc(stage.id)+'">Salvar rateio</button></div>':'')
  +'</details>':'')
 +'</article>';
}
function auditCard(a){
 const stages=state.etapas.filter(x=>x.atendimento_id===a.id);
 const done=stages.length>0&&stages.every(x=>x.status==='concluido');
 const check=reviewed(a.id);
 const vals=stages.map(x=>valuesById(x.id)).filter(Boolean);
 const totalKnown=vals.reduce((sum,v)=>sum+(v.valor_centavos||0),0);
 const partial=vals.some(v=>v.cobertura!=='completo');
 return '<article class="v23-audit-card">'
  +'<header><div><h3>'+esc(a.animal_nome)+'</h3>'
  +'<p>'+esc(serviceName(a.servico_id))+' · '+esc(hour(a.criado_em))+' · '+stages.length+' atividades</p></div>'
  +'<span class="v23-status '+(check?'v23-status-reviewed':done?'v23-status-pending':'')+'">'
  +esc(check?'Ficha conferida':done?'Pendente de conferência':'Em andamento')+'</span></header>'
  +'<div class="v23-total"><b>Referência estimada:</b> '+esc(vals.some(v=>v.valor_centavos!=null)?money(totalKnown)+(partial?' · parcial':''):'Sob consulta')+'</div>'
  +stages.map(auditStage).join('')
  +(done&&!check?'<button type="button" data-v23-confirm-card="'+esc(a.id)+'" class="btn btn-primary">Conferir ficha do animal</button>':'')
  +(check?'<p class="v23-muted">Conferida em '+esc(hour(check.conferido_em))+' · Correções posteriores reabrem a conferência.</p>':'')
  +'</article>';
}
function renderAudit(){
 if(!isAdmin())return;
 const date=$('v23AuditDate').value||today();
 const selected=state.attendances.filter(a=>state.etapas.some(e=>e.atendimento_id===a.id)
   &&(day(a.criado_em)===date||day(a.concluido_em)===date));
 const pending=selected.filter(a=>a.status==='concluido'&&!reviewed(a.id)).length,
  confirmed=selected.filter(a=>!!reviewed(a.id)).length;
 $('v23AuditStats').innerHTML='<div><b>'+selected.length+'</b><span>Fichas na data</span></div>'
  +'<div><b>'+pending+'</b><span>Aguardando conferência</span></div>'
  +'<div><b>'+confirmed+'</b><span>Conferidas</span></div>';
 $('v23AuditCards').innerHTML=selected.length?selected.map(auditCard).join(''):
  '<div class="empty">Nenhuma ficha com etapas registrada na data selecionada.</div>';
 const ids=new Set(selected.map(a=>a.id));
 const logs=audit.filter(x=>ids.has(x.atendimento_id));
 $('v23AuditHistory').innerHTML=logs.length?logs.map(x=>
  '<details class="v23-log"><summary><b>'+esc(x.evento)+'</b> · '
  +esc(new Date(x.registrado_em).toLocaleString('pt-BR'))+' · '
  +esc(x.justificativa)+'</summary>'
  +'<div><b>Antes</b><pre>'+esc(JSON.stringify(x.anterior,null,2))+'</pre></div>'
  +'<div><b>Depois</b><pre>'+esc(JSON.stringify(x.posterior,null,2))+'</pre></div></details>').join(''):
  '<p class="v23-muted">Sem correções ou conferências registradas para a data.</p>';
}
function renderProduction(){
 if(!isAdmin())return;
 const root=$('v23Production');
 const mode=$('prodPeriod').value,end=mode==='custom'?$('prodEndDate').value:today();
 const start=mode==='1'?today():mode==='custom'?$('prodStartDate').value:(()=>{
  const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-6);return d.toISOString().slice(0,10);
 })();
 const profFilter=$('prodProfessional').value,serviceFilter=$('prodService').value,
   coverageFilter=$('prodCoverage').value;
 const chosen=state.attendances.filter(a=>a.status==='concluido'&&a.concluido_em
   &&day(a.concluido_em)>=start&&day(a.concluido_em)<=end
   &&(!serviceFilter||a.servico_id===serviceFilter));
 const ids=new Set(chosen.map(a=>a.id));
 const stages=state.etapas.filter(s=>ids.has(s.atendimento_id)&&s.status==='concluido'
   &&(!coverageFilter||valuesById(s.id)?.cobertura===coverageFilter));
 const rows=[];
 for(const stage of stages){
  const val=valuesById(stage.id);
  for(const share of shares(stage.id)){
   if(profFilter&&share.profissional_id!==profFilter)continue;
   rows.push({
   nome:staffName(share.profissional_id),pet:petName(stage.atendimento_id),
   etapa:stage.nome,participacao:share.percentual,valor:share.valor_centavos,
   cobertura:val?.cobertura||'pendente'
  });
  }
 }
 const totals=new Map();
 for(const r of rows){
  const row=totals.get(r.nome)||{nome:r.nome,quantidade:0,total:0,completos:0};
  row.quantidade++;
  if(r.cobertura==='completo'&&r.valor!=null){row.total+=r.valor;row.completos++;}
  totals.set(r.nome,row);
 }
 const summary=[...totals.values()].sort((a,b)=>b.total-a.total);
 root.innerHTML='<div class="v23-summary-list">'+(summary.length?summary.map(x=>
  '<div><strong>'+esc(x.nome)+'</strong><span>'+x.quantidade+' atividades · '
  +x.completos+' com preço fechado · <b>'+money(x.total)+'</b></span></div>').join(''):
  '<p class="v23-muted">Sem execuções por atividade para os filtros selecionados.</p>')+'</div>'
  +'<div class="table-scroll"><table class="prod-table v23-prod-table"><thead><tr>'
  +'<th>Pet</th><th>Atividade</th><th>Executor</th><th>Participação</th><th>Referência</th><th>Cobertura</th>'
  +'</tr></thead><tbody>'+(rows.length?rows.map(x=>
   '<tr><td>'+esc(x.pet)+'</td><td>'+esc(x.etapa)+'</td><td>'+esc(x.nome)+'</td><td>'+x.participacao+'%</td>'
   +'<td>'+esc(x.valor!=null?money(x.valor):'Sob consulta')+'</td><td>'+esc(x.cobertura)+'</td></tr>').join(''):
   '<tr><td colspan="6">Ainda sem atividades concluídas.</td></tr>')+'</tbody></table></div>';
}
async function withAdminRpc(fn,args,message){
 if(!isAdmin()||working)return;
 working=true;
 try{
  const {error}=await supabase.rpc(fn,args);
  if(error)throw error;
  notify(message,'success');
  await refresh();
  await loadAdmin();
 }catch(e){notify('Não foi possível registrar a alteração: '+e.message,'error');}
 finally{working=false;}
}
$('v23AuditCards').addEventListener('click',async e=>{
 const review=e.target.closest('[data-v23-confirm-card]');
 if(review){
  if(!window.confirm('Confirmar conferência da ficha física deste animal?'))return;
  await withAdminRpc('conferir_ficha_v23',{p_atendimento_id:review.dataset.v23ConfirmCard},'Ficha conferida pelo Administrador.');
  return;
 }
 const corr=e.target.closest('[data-v23-correct]'),rate=e.target.closest('[data-v23-rate]');
 if(!corr&&!rate)return;
 const stageId=corr?.dataset.v23Correct||rate.dataset.v23Rate;
 const box=e.target.closest('[data-v23-stage]');
 if(corr){
  const actual=[...box.querySelectorAll('input[data-v23-correct-executor]:checked')].map(x=>x.value);
  const reason=box.querySelector('[data-v23-justification]').value.trim();
  const start=box.querySelector('[data-v23-start-time]').value,end=box.querySelector('[data-v23-end-time]').value;
  const weight=box.querySelector('[data-v23-weight]')?.value||'100';
  if(!start||!end||reason.length<8||!actual.length){
   notify('Informe os executores, horários e a justificativa de pelo menos 8 caracteres.','error');return;
  }
  await withAdminRpc('corrigir_etapa_v23',{
   p_etapa_id:stageId,p_profissionais:actual,p_inicio:localISO(start),
   p_fim:localISO(end),p_peso:Number(weight),p_justificativa:reason
  },'Correção registrada com trilha de auditoria.');
 }else{
  const distribution=[...box.querySelectorAll('[data-v23-rate-prof]')].map(x=>({
    profissional_id:x.dataset.v23RateProf,percentual:Number(x.value)
  }));
  const reason=box.querySelector('[data-v23-rate-reason]').value.trim();
  if(reason.length<8||distribution.reduce((s,x)=>s+x.percentual,0)!==100){
   notify('Rateio deve somar 100% e conter justificativa com pelo menos 8 caracteres.','error');return;
  }
  await withAdminRpc('ajustar_rateio_v23',{
   p_etapa_id:stageId,p_distribuicao:distribution,p_justificativa:reason
  },'Rateio ajustado com registro de auditoria.');
 }
});
$('v23AuditDate').value=today();$('v23AuditDate').max=today();
$('v23AuditDate').addEventListener('change',renderAudit);
for(const id of ['prodPeriod','prodStartDate','prodEndDate','prodProfessional','prodService','prodCoverage'])
 $(id).addEventListener('change',renderProduction);
$('v23AuditRefresh').addEventListener('click',loadAdmin);
$('v23Print').addEventListener('click',()=>{
 document.body.classList.add('v23-print-fichas');
 const done=()=>{document.body.classList.remove('v23-print-fichas');window.removeEventListener('afterprint',done);};
 window.addEventListener('afterprint',done);window.print();
});
document.querySelectorAll('[data-admin-tab="conferencia"],[data-admin-tab="producao"]').forEach(button=>
 button.addEventListener('click',()=>{if(isAdmin())loadAdmin();}));
window.addEventListener('bolhas:authenticated',()=>{renderEntryPlan();renderQueues();if(isAdmin())loadAdmin();});
window.addEventListener('bolhas:refreshed',()=>{
 renderEntryPlan();renderQueues();
 if(isAdmin()&&!loadingAdmin)loadAdmin();
});
renderEntryPlan();
