import {supabase,state,notify,esc,today} from './app.js?v=270';

const $=id=>document.getElementById(id);
const admin=()=>state.role==='admin'&&!$('appShell').hidden;
const visible=()=>admin()&&!$('admin-financeiro').hidden&&!$('page-admin').hidden;
const money=c=>Number.isFinite(c)?(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const moneyEdit=c=>Number.isInteger(c)?(c/100).toFixed(2):'';
const cents=v=>String(v??'').trim()===''?null:Math.round(Number(String(v).trim().replace(',','.'))*100);
const valid=v=>v===null||(Number.isInteger(v)&&v>=0&&v<=100000000);
const day=v=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)):'';
const hour=v=>v?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(v)):'—';
const parcel=r=>r?.pacote_pre_pago===true?'Sim':r?.pacote_pre_pago===false?'Não':'Não informado';
const componentAmount=i=>i.valor_corrigido_centavos??i.valor_referencia_centavos;
const billAmount=i=>i.coberto_pacote===true?0:i.coberto_pacote===false?
 (i.valor_cobrado_centavos??componentAmount(i)):null;
const stateFin={date:null,pets:[],items:[],payments:[],paymentsDay:[],checks:[],closing:null,audit:[],
 selected:null,loading:false,started:false};
const types={principal:'Serviço principal',adicional:'Serviço adicional',transporte:'Transporte'};
const methods={dinheiro:'Dinheiro',debito:'Cartão de débito',credito:'Cartão de crédito',pix:'PIX',outro:'Outro'};
const statusName={pendente:'Pendente',em_conferencia:'Em conferência',fechado:'Fechado'};
const approved=()=>stateFin.closing?.status==='fechado';
const cashFor=petId=>stateFin.payments.filter(p=>p.atendimento_id===petId&&p.status==='confirmado')
  .reduce((sum,p)=>sum+p.valor_centavos,0);
const filteredPets=()=>stateFin.pets.filter(p=>{
 const v=$('fin27View')?.value||'todos';
 return v==='todos'||(v==='sim'&&p.pacote_pre_pago===true)||
  (v==='nao'&&p.pacote_pre_pago===false)||(v==='unknown'&&p.pacote_pre_pago==null);
});
const itemsFor=petId=>stateFin.items.filter(i=>i.atendimento_id===petId)
 .sort((a,b)=>(a.tipo==='principal'?0:a.tipo==='adicional'?1:2)-
  (b.tipo==='principal'?0:b.tipo==='adicional'?1:2));
const dueFor=petId=>{
 const parts=itemsFor(petId),due=parts.map(billAmount);
 return {value:due.filter(x=>Number.isInteger(x)).reduce((a,b)=>a+b,0),
   unresolved:due.some(x=>x===null),parts:parts.length};
};
const refFor=petId=>{
 const a=itemsFor(petId).map(componentAmount);
 return {value:a.filter(x=>Number.isInteger(x)).reduce((a,b)=>a+b,0),
  unresolved:a.some(x=>x===null)};
};
const isReviewed=id=>stateFin.checks.some(x=>x.atendimento_id===id);
const responsible=petId=>{
 const all=state.etapas.filter(e=>e.atendimento_id===petId);
 const names=new Set(all.flatMap(e=>state.etapaProfissionais.filter(p=>
  p.etapa_id===e.id&&(p.papel==='confirmado'||p.papel==='em_execucao'))
  .map(p=>state.professionals.find(x=>x.id===p.profissional_id)?.nome||'Profissional não identificado')));
 if(!names.size){
  const pet=stateFin.pets.find(p=>p.id===petId);
  if(pet?.profissional_id)names.add(state.professionals.find(p=>p.id===pet.profissional_id)?.nome||'Não identificado');
 }
 return [...names].join(', ')||'Não identificado';
};
const serviceName=id=>state.services.find(s=>s.id===id)?.nome||'Serviço';
const msg=(text,kind='')=>{
 const el=$('fin27Message');el.textContent=text;el.dataset.kind=kind;
};
const err=e=>{msg(e?.message||String(e),'error');notify(e?.message||String(e),'error');};
const reason=()=>prompt('Justificativa obrigatória (8 a 500 caracteres):')?.trim()||'';
const checkReason=r=>r.length>=8&&r.length<=500;
function toCurrentDatetime(){
 const now=new Date(),pad=n=>String(n).padStart(2,'0');
 return now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate())+
 'T'+pad(now.getHours())+':'+pad(now.getMinutes());
}
const chunks=arr=>{const result=[];for(let i=0;i<arr.length;i+=80)result.push(arr.slice(i,i+80));return result;};
async function getBatch(table,ids){
 if(!ids.length)return [];
 const result=[];
 for(const group of chunks(ids)){
  const {data,error}=await supabase.from(table).select('*').in('atendimento_id',group);
  if(error)throw error;
  result.push(...(data||[]));
 }
 return result;
}
async function load(finDate){
 if(!admin()||stateFin.loading)return;
 stateFin.loading=true;
 msg('Carregando registros e calculando os indicadores...', '');
 try{
  const target=finDate||$('fin27Date').value||today();
  stateFin.date=target;
  const {error:preparedError}=await supabase.rpc('financeiro_preparar_dia',{p_dia:target});
  if(preparedError)throw preparedError;
  // Não inferir recebimentos a partir do valor dos serviços: somente lançamentos confirmados.
  const pets=state.attendances.filter(a=>a.status==='concluido'&&day(a.concluido_em)===target)
    .sort((a,b)=>String(a.criado_em).localeCompare(String(b.criado_em)));
  const ids=pets.map(p=>p.id);
  const [items,payments,checks,closing,audit,allPayments]=await Promise.all([
    getBatch('financeiro_itens',ids),
    getBatch('financeiro_pagamentos',ids),
    getBatch('financeiro_conferencias',ids),
    supabase.from('financeiro_fechamentos').select('*').eq('dia',target).maybeSingle(),
    supabase.from('financeiro_auditoria').select('*').eq('dia',target).order('registrado_em',{ascending:false}).limit(250),
    supabase.from('financeiro_pagamentos').select('*').gte('recebido_em',target+'T00:00:00-03:00')
      .lt('recebido_em',nextDay(target)+'T00:00:00-03:00')
  ]);
  for(const r of [closing,audit,allPayments])if(r.error)throw r.error;
  stateFin.pets=pets;stateFin.items=items;stateFin.payments=payments;stateFin.checks=checks;
  stateFin.closing=closing.data;stateFin.audit=audit.data||[];stateFin.paymentsDay=allPayments.data||[];
  if(stateFin.selected&&!pets.some(p=>p.id===stateFin.selected))stateFin.selected=null;
  render();
  msg('Dados carregados. Valores sem confirmação continuam identificados como pendentes.','success');
 }catch(e){err(e);}
 finally{stateFin.loading=false;}
}
function nextDay(date){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
}
function stats(pets=stateFin.pets,onlySelectionReceipts=false){
 let prod=0,prodUnknown=false,covered=0,due=0,dueUnknown=false,pending=0;
 let transport=0,transportUnknown=false,confirmed=0;
 for(const pet of pets){
  const items=itemsFor(pet.id),ref=refFor(pet.id),charge=dueFor(pet.id);
  prod+=ref.value;prodUnknown ||=ref.unresolved;
  due+=charge.value;dueUnknown ||=charge.unresolved;
  const paid=cashFor(pet.id);
  pending+=Math.max(0,charge.value-paid);
  if(isReviewed(pet.id))confirmed++;
  for(const item of items){
   const val=componentAmount(item);
   if(item.coberto_pacote===true&&val!==null)covered+=val;
   if(item.tipo==='transporte'){transport+=(val||0);transportUnknown ||= val===null;}
  }
 }
 const selection=new Set(pets.map(p=>p.id));
 const receivedToday=stateFin.paymentsDay.filter(p=>p.status==='confirmado'&&
   (!onlySelectionReceipts||selection.has(p.atendimento_id)))
  .reduce((a,p)=>a+p.valor_centavos,0);
 return {prod,prodUnknown,covered,due,dueUnknown,pending,transport,transportUnknown,
   confirmed,receivedToday,count:pets.length,
   packageCount:pets.filter(p=>p.pacote_pre_pago===true).length};
}
function render(){
 if(!admin())return;
 const s=stats();
 const cells=[
 ['Atendimentos concluídos',String(s.count),'Na data selecionada'],
 ['Produção + transporte',money(s.prod)+(s.prodUnknown?'*':''),'Referência comercial; valor desconhecido não é zero'],
 ['Coberto por pacote',money(s.covered),'Utilização de plano já pago, sem novo recebimento'],
 ['Cobrança prevista',money(s.due)+(s.dueUnknown?'*':''),'Referência dos itens não cobertos'],
 ['Recebido nesta data',money(s.receivedToday),'Somente pagamentos registrados e confirmados'],
 ['Pendente dos atendimentos',money(s.pending)+(s.dueUnknown?'*':''),'Cobrança prevista menos pagamentos registrados'],
 ['Transporte previsto',money(s.transport)+(s.transportUnknown?'*':''),'Componente separado dos serviços'],
 ['Fichas financeiras conferidas',s.confirmed+'/'+s.count,'Conferências administrativas']
 ];
 $('fin27Kpis').innerHTML=cells.map(c=>
 '<article class="fin27-kpi"><small>'+esc(c[0])+'</small><strong>'+esc(c[1])+
 '</strong><span>'+esc(c[2])+'</span></article>').join('');
 const current=stateFin.closing?.status||'pendente';
 $('fin27Status').innerHTML='<span class="fin27-pill" data-state="'+esc(current)+'">'+
 esc(statusName[current]||current)+'</span> · '+s.packageCount+' utilização(ões) de pacote'+
 (s.dueUnknown||s.prodUnknown?' · <strong>Há valores não definidos</strong>':'');
 $('fin27Start').disabled=current==='fechado';
 $('fin27Close').disabled=current==='fechado'||!s.count;
 const filtered=filteredPets();
 $('fin27Rows').innerHTML=filtered.length?filtered.map(p=>{
  const amount=refFor(p.id),charge=dueFor(p.id),paid=cashFor(p.id);
  const pendente=charge.unresolved?'A conferir':money(Math.max(0,charge.value-paid));
  const covered=itemsFor(p.id).filter(i=>i.coberto_pacote===true)
   .reduce((sum,i)=>sum+(componentAmount(i)||0),0);
  const badge=isReviewed(p.id)?'<span class="fin27-tag good">Conferido</span>':
    '<span class="fin27-tag">Pendente</span>';
  return '<tr><td><strong>'+esc(p.animal_nome)+'</strong><small>'+esc(p.tutor||'Tutor não informado')+'</small></td>'+
   '<td>'+esc(serviceName(p.servico_id))+'</td><td>'+esc(responsible(p.id))+'</td>'+
   '<td>'+esc(parcel(p))+'</td><td>'+esc(money(amount.value)+(amount.unresolved?'*':''))+'</td>'+
   '<td>'+esc(money(covered))+'</td><td>'+esc(money(charge.value)+(charge.unresolved?'*':''))+
    '<small>Saldo: '+esc(pendente)+'</small></td><td>'+esc(money(paid))+'</td>'+
   '<td>'+badge+'<br><button type="button" data-fin27-pet="'+esc(p.id)+'">Conferir</button></td></tr>';
 }).join(''):'<tr><td colspan="9">Nenhum atendimento disponível para o filtro selecionado.</td></tr>';
 renderDetail();
 renderAudit();
}
function renderDetail(){
 const pet=stateFin.pets.find(p=>p.id===stateFin.selected);
 const panel=$('fin27Detail');panel.hidden=!pet;
 if(!pet)return;
 const components=itemsFor(pet.id);
 const rows=components.map(i=>
  '<tr data-fin27-item="'+esc(i.id)+'"><td><b>'+esc(types[i.tipo]||i.tipo)+'</b><br>'+esc(i.descricao)+'</td>'+
  '<td>'+esc(money(i.valor_referencia_centavos))+'</td>'+
  '<td><input aria-label="Referência corrigida de '+esc(i.descricao)+'" type="number" step=".01" min="0" data-fin27-corrected placeholder="Original" value="'+esc(moneyEdit(i.valor_corrigido_centavos))+'"></td>'+
  '<td><select data-fin27-covered aria-label="Cobertura por pacote">'+
  '<option value=""'+(i.coberto_pacote===null?' selected':'')+'>Não definido</option>'+
  '<option value="sim"'+(i.coberto_pacote===true?' selected':'')+'>Sim</option>'+
  '<option value="nao"'+(i.coberto_pacote===false?' selected':'')+'>Não</option></select></td>'+
  '<td><input aria-label="Cobrança confirmada de '+esc(i.descricao)+'" type="number" min="0" step=".01" data-fin27-charged placeholder="Valor de referência" value="'+esc(moneyEdit(i.valor_cobrado_centavos))+'"></td>'+
  '<td><b>'+esc(money(billAmount(i)))+'</b></td>'+
  '<td><button class="btn btn-outline" type="button" data-fin27-save="'+esc(i.id)+'">Salvar</button></td></tr>').join('');
 const payments=stateFin.payments.filter(p=>p.atendimento_id===pet.id);
 const mapPayments=payments.map(p=>'<tr><td>'+esc(hour(p.recebido_em))+'</td>'+
   '<td>'+esc(methods[p.meio]||p.meio)+'</td><td>'+esc(money(p.valor_centavos))+'</td>'+
   '<td><span class="fin27-tag '+(p.status==='confirmado'?'good':'bad')+'">'+esc(p.status)+'</span></td>'+
   '<td>'+(p.status==='confirmado'?'<button data-fin27-cancel="'+esc(p.id)+'" type="button">Cancelar com auditoria</button>':'—')+'</td></tr>').join('');
 panel.innerHTML='<div class="fin27-detail-info"><div><h3>'+esc(pet.animal_nome)+'</h3>'+
 '<span>'+esc(serviceName(pet.servico_id))+' · '+esc(pet.raca||'Raça não informada')+'</span></div>'+
 '<div><b>Tutor:</b> '+esc(pet.tutor||'Não informado')+'</div>'+
 '<div><b>Pacote pré-pago:</b> '+esc(parcel(pet))+'</div>'+
 '<div><b>Profissionais:</b> '+esc(responsible(pet.id))+'</div></div>'+
 '<div class="fin27-edit-row"><label>Corrigir pacote pré-pago (somente se o lançamento estava incorreto)'+
 '<select id="fin27Package"><option value="">Manter como está</option>'+
 '<option value="sim">Sim</option><option value="nao">Não</option></select></label>'+
 '<button class="btn btn-outline" type="button" id="fin27PackageSave">Corrigir indicação do pacote</button>'+
 '</div><p class="fin27-note">O indicador de pacote não altera automaticamente itens já conferidos. Informe separadamente a cobertura de cada componente. Transporte e adicionais não são considerados cobertos por padrão.</p>'+
 '<h4>Composição dos valores</h4><div class="table-scroll"><table class="fin27-components">'+
 '<thead><tr><th>Componente</th><th>Referência original</th><th>Referência corrigida (R$)</th>'+
 '<th>Coberto por pacote?</th><th>Cobrança confirmada (R$)</th><th>Previsto</th><th>Revisão</th></tr></thead>'+
 '<tbody>'+(rows||'<tr><td colspan="7">Nenhum componente registrado.</td></tr>')+'</tbody></table></div>'+
 '<div class="fin27-component-actions"><button class="btn btn-outline" type="button" id="fin27AddTransport">Incluir transporte não lançado</button>'+
 '<button class="btn btn-primary" type="button" id="fin27Review">Confirmar conferência financeira</button></div>'+
 '<h4>Recebimentos registrados (não presumidos)</h4>'+
 '<div class="table-scroll"><table class="fin27-payments"><thead><tr><th>Data/hora</th><th>Forma</th>'+
 '<th>Valor recebido</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+
 (mapPayments||'<tr><td colspan="5">Nenhum recebimento registrado.</td></tr>')+'</tbody></table></div>'+
 '<div class="fin27-edit-row no-print"><label>Meio de pagamento<select id="fin27PaymentMethod">'+
 Object.entries(methods).map(([key,label])=>'<option value="'+key+'">'+esc(label)+'</option>').join('')+
 '</select></label><label>Valor efetivamente recebido (R$)<input id="fin27PaymentValue" type="number" min=".01" step=".01" placeholder="0,00"></label>'+
 '<label>Recebido em<input id="fin27PaymentAt" type="datetime-local" value="'+esc(toCurrentDatetime())+'"></label>'+
 '<button class="btn btn-primary" id="fin27PaymentSave" type="button">Registrar recebimento</button></div>'+
 '<label class="fin27-reason-label"><b>Justificativa da operação financeira (obrigatória para salvar, cancelar ou conferir)</b>'+
 '<textarea id="fin27Reason" rows="2" maxlength="500" placeholder="Ex.: conferência da ficha física, recibo apresentado, correção solicitada pelo cliente..."></textarea></label>'+
 '<p class="fin27-help">Correções exigem justificativa de 8 a 500 caracteres e criam trilha de auditoria. Valores de referência originais permanecem disponíveis.</p>';
}
function renderAudit(){
 const logs=stateFin.audit;
 $('fin27Audit').innerHTML=logs.length?logs.map(a=>
 '<tr><td>'+esc(hour(a.registrado_em))+'</td><td><b>'+esc(a.evento)+'</b><small>'+esc(a.entidade)+'</small></td>'+
 '<td>'+esc(a.justificativa)+'</td><td>'+esc(a.atendimento_id||a.dia||'Fechamento')+
 '</td></tr><tr class="fin27-audit-detail"><td colspan="4"><details><summary>Ver registro anterior e posterior</summary>'+
 '<div class="fin27-audit-diff"><div><b>Anterior</b><pre>'+esc(JSON.stringify(a.anterior||{},null,2))+
 '</pre></div><div><b>Posterior</b><pre>'+esc(JSON.stringify(a.posterior||{},null,2))+
 '</pre></div></div></details></td></tr>').join(''):
 '<tr><td colspan="4">Nenhuma alteração financeira registrada nesta data.</td></tr>';
}
async function action(rpc,args,success){
 if(!admin()||stateFin.loading)return;
 try{
  const {error}=await supabase.rpc(rpc,args);
  if(error)throw error;
  notify(success,'success');await load(stateFin.date);
 }catch(e){err(e);}
}
const justification=()=>{
 const r=$('fin27Reason')?.value?.trim()||'';
 if(!checkReason(r)){msg('Informe justificativa de 8 a 500 caracteres para a alteração.','error');return null;}
 return r;
};
document.addEventListener('click',async e=>{
 if(!visible())return;
 const pet=e.target.closest('[data-fin27-pet]');
 if(pet){stateFin.selected=pet.dataset.fin27Pet;renderDetail();$('fin27Detail').scrollIntoView({behavior:'smooth',block:'start'});return;}
 const save=e.target.closest('[data-fin27-save]');
 if(save){
  const r=justification();if(!r)return;
  const row=save.closest('[data-fin27-item]');
  const corr=cents(row.querySelector('[data-fin27-corrected]').value);
  const charged=cents(row.querySelector('[data-fin27-charged]').value);
  const cover=row.querySelector('[data-fin27-covered]').value;
  if(!valid(corr)||!valid(charged)){msg('Valor inválido: utilize números positivos ou deixe o campo vazio.','error');return;}
  if(cover==='sim'&&charged>0){msg('Item coberto por pacote não pode gerar cobrança positiva.','error');return;}
  await action('financeiro_salvar_item',{
   p_id:save.dataset.fin27Save,p_corrigido:corr,p_cobrado:charged,
   p_coberto:cover==='sim'?true:cover==='nao'?false:null,p_justificativa:r
  },'Componente atualizado e auditado.');
  return;
 }
 if(e.target.id==='fin27Review'){
  const r=justification();if(!r)return;
  await action('financeiro_conferir',{p_atendimento:stateFin.selected,p_justificativa:r},'Ficha financeira conferida.');
  return;
 }
 if(e.target.id==='fin27PackageSave'){
  const r=justification(),value=$('fin27Package').value;if(!r)return;
  if(!['sim','nao'].includes(value)){msg('Escolha Sim ou Não para corrigir o pacote.','error');return;}
  await action('corrigir_pacote_pre_pago',{
   p_atendimento_id:stateFin.selected,p_pacote_pre_pago:value==='sim',p_justificativa:r
  },'Indicador de pacote corrigido com auditoria. Revise a cobertura dos itens.');
  return;
 }
 if(e.target.id==='fin27AddTransport'){
  const r=justification();if(!r)return;
  await action('financeiro_adicionar_transporte',{
   p_atendimento:stateFin.selected,p_justificativa:r
  },'Linha de transporte incluída com auditoria.');
  return;
 }
 if(e.target.id==='fin27PaymentSave'){
  const r=justification();if(!r)return;
  const v=cents($('fin27PaymentValue').value),at=$('fin27PaymentAt').value;
  if(!v||v<=0||!valid(v)||!at){msg('Informe valor positivo e data de recebimento.','error');return;}
  await action('financeiro_registrar_pagamento',{
   p_atendimento:stateFin.selected,p_valor:v,p_meio:$('fin27PaymentMethod').value,
   p_recebido_em:new Date(at).toISOString(),p_justificativa:r
  },'Recebimento confirmado e auditado.');
  return;
 }
 const cancel=e.target.closest('[data-fin27-cancel]');
 if(cancel){
  const r=justification();if(!r)return;
  if(!confirm('Cancelar este lançamento de pagamento? O histórico será preservado.'))return;
  await action('financeiro_cancelar_pagamento',{p_id:cancel.dataset.fin27Cancel,p_justificativa:r},
    'Pagamento cancelado com histórico.');
 }
});
function toCsv(){
 const pets=filteredPets(),s=stats(pets,true),rows=[
 ['Pet','Tutor','Serviço','Profissionais','Pacote','Componente','Referência original',
  'Referência corrigida','Coberto por pacote','Cobrança confirmada','Previsto','Recebido atendimento','Conferência']
 ];
 for(const p of pets){
  const got=itemsFor(p.id);
  for(const [index,i] of got.entries())rows.push([
   p.animal_nome,p.tutor||'',serviceName(p.servico_id),responsible(p.id),parcel(p),
   i.descricao,formatCsvAmount(i.valor_referencia_centavos),formatCsvAmount(i.valor_corrigido_centavos),
   i.coberto_pacote===null?'Não definido':i.coberto_pacote?'Sim':'Não',
   formatCsvAmount(i.valor_cobrado_centavos),formatCsvAmount(billAmount(i)),
   index===0?formatCsvAmount(cashFor(p.id)):'',isReviewed(p.id)?'Conferido':'Pendente'
  ]);
 }
 rows.push(['TOTAL DA VISÃO','', '', '', '', '',formatCsvAmount(s.prod),'','','',
  formatCsvAmount(s.due),formatCsvAmount(pets.reduce((acc,p)=>acc+cashFor(p.id),0)),'']);
 rows.push(['RECEBIDO NA DATA PARA A VISÃO','', '', '', '', '','','','','','',
  formatCsvAmount(s.receivedToday),'']);
 const csv='\ufeff'+rows.map(r=>r.map(x=>{
  const raw=String(x??'');
  // Evitar que um nome de pet digitado como fórmula execute ao abrir no Excel.
  const safe=/^\s*[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
 }).join(';')).join('\r\n');
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
 link.download='bolhas-fechamento-'+stateFin.date+'.csv';document.body.appendChild(link);
 link.click();link.remove();URL.revokeObjectURL(url);
}
const formatCsvAmount=v=>Number.isInteger(v)?(v/100).toFixed(2).replace('.',','):'';
function printReport(){
 if(!admin())return;
 const sheet=$('financePrintSheet'),pets=filteredPets(),selectedView=$('fin27View').selectedOptions[0]?.textContent||'Mapa completo',
 s=stats(pets,true),allowedIds=new Set(pets.map(p=>p.id));
 const tableRows=pets.flatMap(p=>itemsFor(p.id).map((i,index)=>
 '<tr><td>'+esc(p.animal_nome)+'</td><td>'+esc(serviceName(p.servico_id))+'</td>'+
 '<td>'+esc(responsible(p.id))+'</td><td>'+esc(parcel(p))+'</td>'+
 '<td>'+esc(i.descricao)+'</td><td>'+esc(money(componentAmount(i)))+'</td>'+
 '<td>'+esc(i.coberto_pacote===null?'Não definido':i.coberto_pacote?'Sim':'Não')+'</td>'+
 '<td>'+esc(money(billAmount(i)))+'</td>'+
 '<td>'+esc(index===0?money(cashFor(p.id)):'—')+'</td>'+
 '<td>'+esc(isReviewed(p.id)?'Conferido':'Pendente')+'</td></tr>')).join('');
 const payments=stateFin.paymentsDay.filter(p=>p.status==='confirmado'&&allowedIds.has(p.atendimento_id));
 const paidRows=payments.map(p=>
  '<tr><td>'+esc(hour(p.recebido_em))+'</td>'+
  '<td>'+esc(stateFin.pets.find(x=>x.id===p.atendimento_id)?.animal_nome||'Atendimento de outra data')+'</td>'+
  '<td>'+esc(methods[p.meio]||p.meio)+'</td><td>'+esc(money(p.valor_centavos))+'</td></tr>').join('');
 sheet.innerHTML='<header class="fin27-print-head"><div><img src="./assets/logo.webp" alt="Bolhas & Latidos"><h1>Mapa diário e fechamento financeiro</h1>'+
  '<p>Data: '+esc(stateFin.date)+' · Status: '+esc(statusName[stateFin.closing?.status]||'Pendente')+
  ' · '+s.count+' atendimento(s) · '+esc(selectedView)+'</p></div><div><b>Bolhas &amp; Latidos</b><p>Relatório exclusivo do Administrador</p></div></header>'+
  '<table><thead><tr>'+['Pet','Serviço','Executor(es)','Pacote','Componente','Valor integral','Coberto','Previsto','Recebido no atendimento','Conferência']
    .map(x=>'<th>'+esc(x)+'</th>').join('')+'</tr></thead><tbody>'+
  (tableRows||'<tr><td colspan="10">Sem atendimentos concluídos.</td></tr>')+'</tbody></table>'+
  '<p class="fin27-print-totals"><b>Produção e transporte:</b> '+esc(money(s.prod))+
  ' · <b>Pacotes utilizados (referência):</b> '+esc(money(s.covered))+
  ' · <b>Cobrança prevista:</b> '+esc(money(s.due))+
  ' · <b>Recebido na data:</b> '+esc(money(s.receivedToday))+
  ' · <b>Pendente dos atendimentos:</b> '+esc(money(s.pending))+'</p>'+
  '<h2 style="font-size:11pt">Recebimentos efetivamente registrados na data</h2>'+
  '<table><thead><tr><th>Data/hora</th><th>Pet</th><th>Meio</th><th>Valor confirmado</th></tr></thead><tbody>'+
  (paidRows||'<tr><td colspan="4">Nenhum pagamento registrado.</td></tr>')+'</tbody></table>'+
  '<p class="fin27-print-note">Os valores dos produtos não são repasses, comissões ou receitas duplicadas. Itens sem preço ou cobertura confirmada permanecem pendentes. Pagamentos podem pertencer a atendimentos de dias anteriores.</p>'+
  '<footer><span>Versão 2.7.0</span><span>Desenvolvido por SUMMIT ADVISORY TECNOLOGIA E INFORMÁTICA LTDA</span></footer>';
 sheet.hidden=false;document.body.classList.add('print-finance');window.print();
}
function cleanPrint(){document.body.classList.remove('print-finance');$('financePrintSheet').hidden=true;}
window.addEventListener('afterprint',cleanPrint);
$('fin27Date').value=today();
$('fin27Date').addEventListener('change',()=>load($('fin27Date').value));
$('fin27View').addEventListener('change',render);
$('fin27Reload').addEventListener('click',()=>load($('fin27Date').value));
$('fin27Csv').addEventListener('click',()=>{if(admin())toCsv()});
$('fin27Print').addEventListener('click',printReport);
$('fin27Start').addEventListener('click',async()=>{
 if(!admin())return;
 const r=reason();if(!checkReason(r))return;
 await action('financeiro_definir_fechamento',{
  p_dia:stateFin.date,p_status:'em_conferencia',p_justificativa:r
 },'Conferência diária iniciada.');
});
$('fin27Close').addEventListener('click',async()=>{
 if(!admin())return;
 const r=reason();if(!checkReason(r))return;
 if(!confirm('Concluir o fechamento desta data? Correções futuras reabrirão o dia com auditoria.'))return;
 await action('financeiro_definir_fechamento',{
  p_dia:stateFin.date,p_status:'fechado',p_justificativa:r
 },'Fechamento do dia confirmado com auditoria.');
});
document.querySelectorAll('[data-admin-tab="financeiro"]').forEach(button=>button.addEventListener('click',()=>{
 if(admin())load($('fin27Date').value);
}));
window.addEventListener('bolhas:authenticated',()=>{
 if(admin()&&!stateFin.started){stateFin.started=true;if(visible())load(today());}
});
