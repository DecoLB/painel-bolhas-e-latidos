import {supabase,state,esc,today,notify} from './app.js?v=260';

// Impressão somente a partir do perfil administrativo: os dados financeiros não são públicos.
const el=id=>document.getElementById(id);
const formatDate=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'});
const formatTime=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const formatStamp=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
const day=v=>v?new Intl.DateTimeFormat('sv-SE',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)):'';
const hour=v=>v?formatTime.format(new Date(v)):'—';
const dateText=v=>v?formatDate.format(new Date(v+'T12:00:00-03:00')):'—';
const duration=(start,end)=>{
 if(!start||!end)return '—';
 const mins=Math.max(0,Math.round((new Date(end)-new Date(start))/60000));
 return mins>=60?Math.floor(mins/60)+'h '+String(mins%60).padStart(2,'0')+'m':mins+' min';
};
const money=c=>Number.isInteger(c)?(c/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Sob consulta';
const service=id=>state.services.find(s=>s.id===id)?.nome||'Serviço não cadastrado';
const professional=id=>state.professionals.find(p=>p.id===id)?.nome||'Não identificado';
const extra=ids=>(ids||[]).map(id=>state.additionalCatalog.find(a=>a.id===id)?.nome||'Adicional não cadastrado').join(', ')||'Nenhum';
const canPrint=()=>state.role==='admin'&&!el('appShell').hidden;
const status=r=>({aguardando:'Aguardando',em_execucao:'Em execução',concluido:'Concluído'}[r.status]||r.status||'—');
const packageLabel=r=>r?.pacote_pre_pago===true?'Sim':r?.pacote_pre_pago===false?'Não':'Não informado';
const execs=pet=>{
 const steps=state.etapas.filter(e=>e.atendimento_id===pet.id);
 if(!steps.length)return pet.profissional_id?professional(pet.profissional_id):'Não atribuído';
 const unique=new Set(steps.flatMap(e=>state.etapaProfissionais.filter(p=>
  p.etapa_id===e.id&&(p.papel==='confirmado'||p.papel==='em_execucao')).map(p=>p.profissional_id)));
 return unique.size?[...unique].map(professional).join(', '):'Não atribuído';
};
const simple=(val)=>'<span>'+esc(val??'—')+'</span>';
const cell=(primary,secondary)=>'<strong>'+esc(primary??'—')+'</strong>'
 +(secondary?'<small>'+esc(secondary)+'</small>':'');
const printHead=(title,date,count)=>
 '<table class="print-report-head" aria-label="Cabeçalho da impressão"><tbody><tr>'+
 '<td class="print-report-brand"><img src="./assets/logo.webp" alt=""><strong>Bolhas &amp; Latidos</strong></td>'+
 '<td><h1>'+esc(title)+'</h1><span>Data de referência: '+esc(dateText(date))+'</span></td>'+
 '<td class="print-report-count"><b>'+count+' registro(s)</b><small>Impresso em '+esc(formatStamp.format(new Date()))+'</small></td>'+
 '</tr></tbody></table>';
const printFooter=()=>
 '<footer class="print-report-footer"><span>Versão 2.6.0</span><span>Desenvolvido por SUMMIT ADVISORY TECNOLOGIA E INFORMÁTICA LTDA</span></footer>';
const tableHeader=names=>'<thead><tr>'+names.map(n=>'<th scope="col">'+esc(n)+'</th>').join('')+'</tr></thead>';
const printNow=(mode,html)=>{
 const target=el(mode==='print-daily'?'dailyPrintSheet':'auditPrintSheet');
 if(!target)return notify('Modelo de impressão indisponível.','error');
 target.innerHTML=html;target.hidden=false;
 document.body.classList.remove('print-daily','v23-print-fichas','print-schedule');
 document.body.classList.add(mode);
 window.print();
};
function cleanPrint(){
 document.body.classList.remove('print-daily','v23-print-fichas');
 for(const id of ['dailyPrintSheet','auditPrintSheet']){
  const node=el(id);if(node){node.hidden=true;node.replaceChildren();}
 }
}
window.addEventListener('afterprint',cleanPrint);
window.matchMedia?.('print')?.addEventListener?.('change',event=>{if(!event.matches)cleanPrint();});

function dailyReport(){
 if(!canPrint())return;
 const date=el('reportDate').value||today();
 const records=state.attendances.filter(p=>day(p.criado_em)===date||day(p.concluido_em)===date)
  .sort((a,b)=>String(a.criado_em||'').localeCompare(String(b.criado_em||'')));
 const rows=records.map((r,i)=>{
  const breed=r.especie==='gato'?'Gato/Felino':r.raca||'Não informada';
  const species=r.especie==='gato'?'Gato':r.especie==='cachorro'?'Cachorro':'Não informada';
  const transport=r.transporte_bolhas===true?'Bolhas & Latidos':r.transporte_bolhas===false?'Tutor':'Não informado';
  const handling={nao_se_aplica:'Não se aplica',ansioso:'Ansioso',agressivo:'Agressivo',idoso:'Idoso'}[r.manejo]||'Não informado';
  return '<tr><td>'+cell((i+1)+'. '+r.animal_nome,r.tutor_nome?'Tutor: '+r.tutor_nome:'')+'</td>'
   +'<td>'+cell(species,breed)+'</td>'
   +'<td>'+simple(packageLabel(r))+'</td>'
   +'<td>'+cell(service(r.servico_id),'Adicionais: '+extra(r.adicionais))+'</td>'
   +'<td>'+cell(handling,'Transporte: '+transport)+'</td>'
   +'<td>'+simple(execs(r))+'</td>'
   +'<td class="print-time">'+simple(hour(r.criado_em))+'</td>'
   +'<td class="print-time">'+cell(hour(r.iniciado_em),'Fim: '+hour(r.concluido_em))+'</td>'
   +'<td class="print-time">'+cell(duration(r.criado_em,r.iniciado_em),'Exec.: '+duration(r.iniciado_em,r.concluido_em))+'</td>'
   +'<td>'+simple(status(r))+'</td></tr>';
 }).join('');
 const empty='<tr><td colspan="10" class="print-empty">Nenhum atendimento registrado nesta data.</td></tr>';
 const html=printHead('Relatório diário de atendimentos',date,records.length)
  +'<table class="print-data-table print-daily-table">'+tableHeader([
   'Pet / tutor','Espécie / raça','Pacote pré-pago','Serviço / adicionais','Manejo / transporte','Executores','Entrada','Início / fim','Espera / execução','Situação'])
  +'<tbody>'+(rows||empty)+'</tbody></table>'
  +'<p class="print-report-note">Horários em São Paulo. Serviços compostos aparecem como um único atendimento; os profissionais foram identificados nas atividades registradas.</p>'
  +printFooter();
 printNow('print-daily',html);
}
const chunks=(arr,n=100)=>Array.from({length:Math.ceil(arr.length/n)},(_,i)=>arr.slice(i*n,(i+1)*n));
async function readRows(table,columns,key,ids){
 const out=[];
 for(const group of chunks(ids)){
  const {data,error}=await supabase.from(table).select(columns).in(key,group);
  if(error)throw error;
  out.push(...(data||[]));
 }
 return out;
}
let printingAudit=false;
async function auditReport(){
 if(!canPrint()||printingAudit)return;
 printingAudit=true;
 try{
  const date=el('v23AuditDate').value||today();
  const pets=state.attendances.filter(p=>state.etapas.some(e=>e.atendimento_id===p.id)
     &&(day(p.criado_em)===date||day(p.concluido_em)===date))
     .sort((a,b)=>String(a.criado_em||'').localeCompare(String(b.criado_em||'')));
  const idList=pets.map(p=>p.id);
  const steps=state.etapas.filter(e=>idList.includes(e.atendimento_id));
  const [values,snapshots,conferences]=await Promise.all([
   steps.length?readRows('etapa_valores','etapa_id,valor_centavos','etapa_id',steps.map(e=>e.id)):[],
   idList.length?readRows('producao_valores','atendimento_id,valor_base_centavos,valor_referencia_centavos,cobertura','atendimento_id',idList):[],
   idList.length?readRows('fichas_conferencia','atendimento_id,conferido_em','atendimento_id',idList):[]
  ]);
  const stepPrices=new Map(values.map(x=>[x.etapa_id,x.valor_centavos]));
  const petPrices=new Map(snapshots.map(x=>[x.atendimento_id,x]));
  const confirmed=new Set(conferences.map(x=>x.atendimento_id));
  const tableRows=[];
  for(const pet of pets){
   const parts=steps.filter(s=>s.atendimento_id===pet.id).sort((a,b)=>a.ordem-b.ordem);
   const snapshot=petPrices.get(pet.id);
   let idx=0;
   const current=parts.map(stage=>{
    const who=state.etapaProfissionais.filter(p=>p.etapa_id===stage.id&&p.papel==='confirmado')
      .map(p=>professional(p.profissional_id));
    const price=stage.tipo==='principal'?snapshot?.valor_base_centavos:stepPrices.get(stage.id);
    return '<tr><td>'+cell((++idx===1?pet.animal_nome:pet.animal_nome),
      (pet.raca||'')+' · Pacote pré-pago: '+packageLabel(pet))+'</td>'
     +'<td>'+simple(stage.tipo==='principal'?service(pet.servico_id):stage.nome)+'</td>'
     +'<td>'+simple(stage.nome)+'</td>'
     +'<td>'+simple(who.join(', ')||'Não confirmado')+'</td>'
     +'<td class="print-time">'+simple(hour(stage.iniciado_em))+'</td>'
     +'<td class="print-time">'+simple(hour(stage.concluido_em))+'</td>'
     +'<td class="print-money">'+simple(price==null?'Sob consulta':money(price))+'</td>'
     +'<td>'+cell(status(stage),confirmed.has(pet.id)?'Ficha conferida':'Pendente de conferência')+'</td></tr>';
   }).join('');
   const total=snapshot?.valor_referencia_centavos;
   tableRows.push('<tbody class="print-pet-group">'+current+
    '<tr class="print-subtotal"><td colspan="6">Valor único do atendimento — '+esc(pet.animal_nome)+'</td>'
    +'<td class="print-money">'+esc(total==null?'Sob consulta':money(total))+'</td>'
    +'<td>'+esc(snapshot?.cobertura==='completo'?'Preço fechado':'Estimativa parcial / consulta')+'</td></tr></tbody>');
  }
  const empty='<tbody><tr><td colspan="8" class="print-empty">Nenhuma ficha encontrada na data de referência.</td></tr></tbody>';
  const html=printHead('Conferência de fichas e atividades',date,pets.length)
   +'<table class="print-data-table print-audit-table">'+tableHeader([
    'Pet / raça','Produto contratado','Atividade realizada','Executor(es) confirmados','Início','Conclusão','Valor integral do produto','Status / ficha'])
   +(tableRows.join('')||empty)+'</table>'
   +'<p class="print-report-note">O valor integral do produto pode aparecer em várias atividades e para mais de um executor. Não somar as linhas: o valor único do atendimento consta após cada grupo de atividades. Esta impressão é exclusiva do Administrador.</p>'
   +printFooter();
  printNow('v23-print-fichas',html);
 }catch(e){notify('Não foi possível montar as fichas para impressão: '+(e.message||String(e)),'error');}
 finally{printingAudit=false;}
}
document.addEventListener('bolhas:print-daily',dailyReport);
document.addEventListener('bolhas:print-fichas',auditReport);
