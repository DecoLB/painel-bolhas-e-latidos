import {supabase,state,notify,esc,today} from './app.js?v=250';

// O módulo só consulta valores após autenticação e reconhecimento como Administrador.
// RLS em public.producao_valores impede a leitura pelo perfil Operacional.
const $=id=>document.getElementById(id);
const currency=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const percent=value=>value.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:1})+'%';
const dFormat=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'});
const tFormat=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
const zero='';
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
const nextDay=(iso,delta=1)=>{const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);};
const minutes=(a,b)=>a&&b?Math.max(0,Math.round((Date.parse(b)-Date.parse(a))/60000)):null;
const mins=n=>n===null?'—':n>=60?Math.floor(n/60)+'h '+String(n%60).padStart(2,'0')+'m':n+' min';
const mean=arr=>arr.length?Math.round(arr.reduce((s,v)=>s+v,0)/arr.length):null;
const serviceName=id=>state.services.find(x=>x.id===id)?.nome||'Serviço não cadastrado';
const professionalName=id=>state.professionals.find(x=>x.id===id)?.nome||(id?'Profissional não encontrado':'Sem profissional');
const extraNames=ids=>(ids||[]).map(id=>state.additionalCatalog.find(x=>x.id===id)?.nome||'Adicional não identificado');
const moneyOrBlank=value=>Number.isInteger(value)?currency(value):'—';
const coverageLabel={
  completo:'Preço fechado',parcial:'Estimativa parcial',
  sob_consulta:'Sob consulta',sem_dados:'Dados insuficientes'
};
const coverageBadge={
  completo:'success',parcial:'warning',sob_consulta:'warning',sem_dados:'neutral'
};
let rows=[],shown=[],stageValues=new Map(),loading=false,loadVersion=0,loadTimer=null,loadedOnce=false;
const stagesOf=id=>state.etapas.filter(x=>x.atendimento_id===id);
const confirmedOn=id=>state.etapaProfissionais.filter(p=>p.etapa_id===id&&p.papel==='confirmado');
const executorsOf=r=>{
 const unique=new Set(stagesOf(r.id).flatMap(x=>confirmedOn(x.id).map(p=>p.profissional_id)));
 return unique.size?[...unique].map(professionalName).join(', '):professionalName(r.profissional_id);
};
async function fetchStageValues(attendances){
 const ids=new Set(attendances.map(a=>a.id)),stages=state.etapas.filter(e=>ids.has(e.atendimento_id));
 const result=new Map();
 for(let i=0;i<stages.length;i+=100){
  const {data,error}=await supabase.from('etapa_valores').select('etapa_id,valor_centavos')
   .in('etapa_id',stages.slice(i,i+100).map(e=>e.id));
  if(error)throw error;
  for(const row of data||[])result.set(row.etapa_id,row.valor_centavos);
 }
 return result;
}
function fullProductAttributions(attendances){
 const results=[];
 for(const r of attendances){
  const etapas=stagesOf(r.id).filter(e=>e.status==='concluido');
  if(!etapas.length){
   if(r.profissional_id&&Number.isInteger(r.finance.valor_referencia_centavos))
    results.push({name:professionalName(r.profissional_id),value:r.finance.valor_referencia_centavos});
   continue;
  }
  const visited=new Set();
  for(const e of etapas){
   const amount=e.tipo==='principal'?r.finance.valor_base_centavos:stageValues.get(e.id);
   if(!Number.isInteger(amount))continue;
   for(const staff of confirmedOn(e.id)){
    // Um pacote composto só é associado uma vez ao MESMO profissional.
    const productKey=e.tipo==='principal'?'main':e.id;
    const key=staff.profissional_id+'|'+productKey;
    if(visited.has(key))continue;
    visited.add(key);
    results.push({name:professionalName(staff.profissional_id),value:amount});
   }
  }
 }
 return results;
}
const inAdmin=()=>state.role==='admin'&&!$('appShell').hidden;
const isVisible=()=>inAdmin()&& !$('admin-producao').hidden&&!$('page-admin').hidden;
const note=(value,error=false)=>{const node=$('prodMessage');node.textContent=value;node.classList.toggle('prod-error',error);};
function syncOptions(){
  for(const [id,list] of [['prodProfessional',state.professionals],['prodService',state.services]]){
    const select=$(id),keep=select.value;
    select.innerHTML='<option value="">'+(id==='prodProfessional'?'Todos os profissionais':'Todos os serviços')+'</option>'+
      list.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.nome)+'</option>').join('');
    if(list.some(x=>x.id===keep))select.value=keep;
  }
}
function period(){
  const mode=$('prodPeriod').value,end=today();
  if(mode==='1')return {start:end,end};
  if(mode==='7')return {start:nextDay(end,-6),end};
  const start=$('prodStartDate').value,finish=$('prodEndDate').value;
  if(!validDate(start)||!validDate(finish)||start>finish||finish>today())
    throw new Error('Selecione um intervalo válido sem datas futuras.');
  if(nextDay(start,6)<finish)throw new Error('O intervalo personalizado deve ter no máximo 7 dias.');
  return {start,end:finish};
}
async function fetchAllCompleted(start,end){
  const result=[];
  const beginning=start+'T00:00:00-03:00',endExclusive=nextDay(end)+'T00:00:00-03:00';
  for(let page=0;page<20;page++){
    const from=page*250;
    const {data,error}=await supabase.from('atendimentos')
      .select('id,animal_nome,servico_id,profissional_id,especie,porte,pelagem,adicionais,criado_em,iniciado_em,concluido_em,status')
      .eq('status','concluido').gte('concluido_em',beginning).lt('concluido_em',endExclusive)
      .order('concluido_em',{ascending:false}).range(from,from+249);
    if(error)throw error;
    result.push(...(data||[]));
    if((data||[]).length<250)return {data:result,truncated:false};
  }
  return {data:result,truncated:true};
}
async function fetchSnapshots(attendances){
  const map=new Map();
  for(let i=0;i<attendances.length;i+=100){
    const ids=attendances.slice(i,i+100).map(x=>x.id);
    const {data,error}=await supabase.from('producao_valores')
      .select('atendimento_id,valor_base_centavos,valor_adicionais_centavos,valor_referencia_centavos,cobertura,observacao,origem,registrado_em')
      .in('atendimento_id',ids);
    if(error)throw error;
    for(const item of data||[])map.set(item.atendimento_id,item);
  }
  return map;
}
async function load(){
  if(!isVisible()||loading)return;
  loading=true;const version=++loadVersion;
  $('prodRefresh').disabled=true;
  try{
    const range=period();
    note('Consultando produção e valores autorizados...');
    syncOptions();
    const completed=await fetchAllCompleted(range.start,range.end);
    const snapshots=await fetchSnapshots(completed.data);
    const values=await fetchStageValues(completed.data);
    if(version!==loadVersion)return;
    stageValues=values;
    rows=completed.data.map(a=>({
      ...a,
      finance:snapshots.get(a.id)||{
        atendimento_id:a.id,cobertura:'sem_dados',
        valor_referencia_centavos:null,valor_base_centavos:null,
        valor_adicionais_centavos:0,origem:'retroativo',
        observacao:'Valor ainda não registrado para esta conclusão'
      }
    }));
    loadedOnce=true;
    render();
    note(completed.truncated?
      'Consulta limitada aos 5.000 registros mais recentes. Reduza o período para indicadores completos.':
      'Período: '+range.start.split('-').reverse().join('/')+' até '+range.end.split('-').reverse().join('/')+
      ' · '+rows.length+' atendimento(s) concluído(s) · valores restritos ao Administrador.');
  }catch(e){
    rows=[];shown=[];render();
    note('Não foi possível carregar a produção: '+(e?.message||String(e)),true);
  }finally{loading=false;$('prodRefresh').disabled=false;}
}
function listFilter(){
  const professional=$('prodProfessional').value,service=$('prodService').value,
    coverage=$('prodCoverage').value;
  return rows.filter(x=>(!professional||x.profissional_id===professional||
      stagesOf(x.id).some(e=>confirmedOn(e.id).some(p=>p.profissional_id===professional)))
    &&(!service||x.servico_id===service)
    &&(!coverage||x.finance.cobertura===coverage));
}
function group(data,key,value){
  const map=new Map();
  for(const row of data){
    const name=key(row),number=value(row);
    const item=map.get(name)||{name,count:0,value:0};
    item.count++;item.value+=number;
    map.set(name,item);
  }
  return [...map.values()];
}
function barChart(id,data,{valueKey='value',format=n=>String(n),empty='Sem registros neste período',limit=10}={}){
  const el=$(id);
  const list=data.filter(x=>Number.isFinite(x[valueKey]))
    .sort((a,b)=>b[valueKey]-a[valueKey]||a.name.localeCompare(b.name,'pt-BR'))
    .slice(0,limit);
  if(!list.length){el.innerHTML='<p class="prod-empty">'+esc(empty)+'</p>';return;}
  const max=Math.max(1,...list.map(x=>x[valueKey]));
  el.innerHTML=list.map(x=>{
    const width=Math.round(x[valueKey]/max*1000)/10;
    return '<div class="prod-bar-item"><span class="prod-bar-name" title="'+esc(x.name)+'">'+esc(x.name)+'</span>'
      +'<div class="prod-bar-track"><div class="prod-bar-fill" style="width:'+width+'%"></div></div>'
      +'<strong class="prod-bar-value">'+esc(format(x[valueKey]))+'</strong></div>';
  }).join('');
}
function set(id,val){$(id).textContent=val;}
function renderInsights(data,complete,unpriced,byProfValue,byProfVolume){
  const mapProfessional=[...byProfValue].sort((a,b)=>b.value-a.value);
  const allProfessional=[...byProfVolume].sort((a,b)=>b.value-a.value);
  const serviceVolume=group(data,r=>serviceName(r.servico_id),()=>1).sort((a,b)=>b.value-a.value);
  const noDim=data.filter(x=>!x.especie||!x.porte||!x.pelagem).length;
  const pricePartial=data.filter(x=>x.finance.cobertura==='parcial').length;
  const missing=data.filter(x=>x.finance.cobertura==='sob_consulta').length;
  const retros=data.filter(x=>x.finance.origem==='retroativo').length;
  const extrasTotal=data.reduce((sum,x)=>sum+(x.adicionais||[]).length,0);
  const notes=[
    ['Maior valor associado',mapProfessional.length?mapProfessional[0].name+' · '+currency(mapProfessional[0].value)+' em '+mapProfessional[0].count+' produto(s) com preço fechado.':'Ainda não há profissional com valor integralmente estimado.'],
    ['Maior volume de atendimento',allProfessional.length?allProfessional[0].name+' · '+allProfessional[0].count+' atendimento(s) concluído(s).':'Sem conclusões para comparar.'],
    ['Serviço mais executado',serviceVolume.length?serviceVolume[0].name+' · '+serviceVolume[0].value+' conclusão(ões).':'Sem serviços concluídos no período.'],
    ['Adicionais realizados',extrasTotal+' item(ns) adicional(is) associado(s) a atendimentos concluídos.'],
    ['Lacunas para precificação',noDim+' sem espécie/porte/pelagem; '+missing+' sem tabela aplicável; '+pricePartial+' com valores parciais.'],
    ['Histórico e rastreabilidade',retros+' conclusão(ões) retroativas. O valor registrado na conclusão não muda com ajustes futuros de tabela.']
  ];
  $('prodInsights').innerHTML=notes.map(([head,desc])=>'<div class="prod-insight">'
    +'<strong>'+esc(head)+'</strong><span>'+esc(desc)+'</span></div>').join('');
}
function renderDaily(data){
  const days=new Map();
  for(const r of data){
    const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.concluido_em));
    const item=days.get(day)||{day,n:0,priced:0,value:0};
    item.n++;
    if(r.finance.cobertura==='completo'&&Number.isInteger(r.finance.valor_referencia_centavos)){
      item.priced++;item.value+=r.finance.valor_referencia_centavos;
    }
    days.set(day,item);
  }
  const sorted=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day));
  if(!sorted.length){$('prodDaily').innerHTML='<p class="prod-empty">Nenhuma conclusão no período.</p>';return;}
  const max=Math.max(1,...sorted.map(x=>x.value));
  $('prodDaily').innerHTML=sorted.map(x=>'<div class="prod-day-row">'
    +'<strong>'+esc(x.day.slice(8)+'/'+x.day.slice(5,7))+'</strong>'
    +'<div class="prod-day-track"><div class="prod-day-fill" style="width:'+(x.value/max*100)+'%"></div></div>'
    +'<span>'+x.n+' concluído(s) · '+x.priced+' com preço fechado · <b>'+currency(x.value)+'</b></span></div>').join('');
}
function renderTable(data){
  if(!data.length){$('prodRows').innerHTML='<tr><td colspan="9">Sem atendimentos concluídos para os filtros aplicados.</td></tr>';return;}
  const cols=data.map(r=>{
    const f=r.finance,closed=f.cobertura==='completo';
    const value=Number.isInteger(f.valor_referencia_centavos)
      ?currency(f.valor_referencia_centavos)+(closed?'':' · parcial')
      :'Sob consulta';
    const date=dFormat.format(new Date(r.concluido_em))+' '+tFormat.format(new Date(r.concluido_em));
    const coverage=coverageLabel[f.cobertura]||'Sem dados';
    const badge='<span class="tag farol-tag status-'+(coverageBadge[f.cobertura]||'neutral')+'"><span class="farol-dot"></span>'+esc(coverage)+'</span>';
    const note=f.observacao?(f.observacao+' · '):'';
    return '<tr><td>'+esc(date)+'</td><td>'+esc(r.animal_nome)+'</td>'
      +'<td>'+esc(executorsOf(r))+'</td>'
      +'<td>'+esc(serviceName(r.servico_id))+'</td><td>'+esc(r.porte||'N/I')+' / '+esc(r.pelagem||'N/I')+'</td>'
      +'<td>'+esc(extraNames(r.adicionais).join(', ')||'Nenhum')+'</td>'
      +'<td>'+esc(mins(minutes(r.iniciado_em,r.concluido_em)))+'</td>'
      +'<td>'+badge+'<div class="prod-row-note">'+esc(note+(f.origem==='retroativo'?'Retroativo':'Capturado na conclusão'))+'</div></td>'
      +'<td class="prod-money">'+esc(value)+'</td></tr>';
  });
  $('prodRows').innerHTML=cols.join('');
}
function render(){
  shown=listFilter();
  const complete=shown.filter(x=>x.finance.cobertura==='completo'&&Number.isInteger(x.finance.valor_referencia_centavos));
  const unpriced=shown.filter(x=>x.finance.cobertura!=='completo');
  const selectedProfessional=$('prodProfessional').value;
  // O total do painel contabiliza cada atendimento uma única vez.
  // A seleção por profissional restringe os atendimentos exibidos, sem atribuir parcelas financeiras.
  const sum=complete.reduce((n,x)=>n+x.finance.valor_referencia_centavos,0);
  const partialSum=shown.filter(x=>x.finance.cobertura==='parcial'&&Number.isInteger(x.finance.valor_referencia_centavos))
    .reduce((n,x)=>n+x.finance.valor_referencia_centavos,0);
  const execution=shown.map(x=>minutes(x.iniciado_em,x.concluido_em)).filter(x=>x!==null);
  const waiting=shown.map(x=>minutes(x.criado_em,x.iniciado_em)).filter(x=>x!==null);
  const cycle=shown.map(x=>minutes(x.criado_em,x.concluido_em)).filter(x=>x!==null);
  set('prodTotal',currency(sum));set('prodCompleted',String(shown.length));
  set('prodTicket',complete.length?currency(Math.round(sum/complete.length)):'—');
  set('prodCoveragePct',shown.length?percent(100*complete.length/shown.length):'—');
  set('prodCoverageDetail',complete.length+' de '+shown.length+' conclusão(ões) com preço fechado');
  set('prodExecution',mins(mean(execution)));set('prodWait',mins(mean(waiting)));
  set('prodCycle',mins(mean(cycle)));
  set('prodPartial',currency(partialSum));set('prodUnpriced',String(unpriced.length));

  const legacyAll=shown.filter(r=>!stagesOf(r.id).length);
  const byProfValue=group(fullProductAttributions(complete),r=>r.name,r=>r.value);
  const shownIds=new Set(shown.map(r=>r.id));
  const v23ExecutorItems=state.etapas.filter(e=>e.status==='concluido'&&shownIds.has(e.atendimento_id))
    .flatMap(e=>confirmedOn(e.id).map(p=>({name:professionalName(p.profissional_id)})));
  const byProfVolume=group([...legacyAll.map(r=>({name:professionalName(r.profissional_id)})),
    ...v23ExecutorItems],r=>r.name,()=>1);
  const byServiceVolume=group(shown,r=>serviceName(r.servico_id),()=>1);
  const byServiceValue=group(complete,r=>serviceName(r.servico_id),r=>r.finance.valor_referencia_centavos);
  const extraCount=new Map();
  for(const r of shown)for(const name of extraNames(r.adicionais))extraCount.set(name,(extraCount.get(name)||0)+1);
  const byExtras=[...extraCount].map(([name,value])=>({name,value}));
  const byTime=new Map();
  for(const r of shown.filter(x=>!stagesOf(x.id).length)){
    const time=minutes(r.iniciado_em,r.concluido_em);
    if(time===null)continue;
    const key=professionalName(r.profissional_id),v=byTime.get(key)||{name:key,total:0,count:0};
    v.total+=time;v.count++;byTime.set(key,v);
  }
  for(const e of state.etapas.filter(x=>x.status==='concluido'&&shownIds.has(x.atendimento_id))){
    const time=minutes(e.iniciado_em,e.concluido_em);
    if(time===null)continue;
    for(const staff of confirmedOn(e.id)){
      const key=professionalName(staff.profissional_id),v=byTime.get(key)||{name:key,total:0,count:0};
      v.total+=time;v.count++;byTime.set(key,v);
    }
  }
  const averageTimes=[...byTime.values()].map(x=>({name:x.name,value:Math.round(x.total/x.count)}));
  barChart('prodProfessionalValue',byProfValue,{format:currency,empty:'Sem produção com preço fechado'});
  barChart('prodProfessionalVolume',byProfVolume,{});
  barChart('prodServiceVolume',byServiceVolume,{});
  barChart('prodServiceValue',byServiceValue,{format:currency,empty:'Sem serviços com preço fechado'});
  barChart('prodAdditionalVolume',byExtras,{empty:'Sem adicionais registrados'});
  barChart('prodProfessionalTime',averageTimes,{format:mins,empty:'Sem durações completas'});
  renderInsights(shown,complete,unpriced,byProfValue,byProfVolume);
  renderDaily(shown);renderTable(shown);
  $('prodCsv').disabled=!shown.length;
}
function exportCsv(){
  if(!inAdmin()||!shown.length)return;
  const headers=['Conclusão','Animal','Profissional','Serviço','Espécie','Porte','Pelagem','Adicionais','Espera (min)','Execução (min)','Cobertura','Estimativa em reais','Origem','Observação'];
  const safe=value=>{
    const s=String(value??'').replace(/^[=+@\-\t\r]/,"'$&");
    return '"'+s.replaceAll('"','""')+'"';
  };
  const items=shown.map(r=>{
    const f=r.finance;
    return [
      r.concluido_em,r.animal_nome,executorsOf(r),serviceName(r.servico_id),
      r.especie,r.porte,r.pelagem,extraNames(r.adicionais).join(' / '),
      minutes(r.criado_em,r.iniciado_em),minutes(r.iniciado_em,r.concluido_em),
      coverageLabel[f.cobertura],
      Number.isInteger(f.valor_referencia_centavos)?(f.valor_referencia_centavos/100).toFixed(2).replace('.',','):'',
      f.origem,f.observacao
    ].map(safe).join(';');
  });
  const blob=new Blob(['\uFEFF'+[headers.map(safe).join(';'),...items].join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='bolhas-producao-'+today()+'.csv';
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function planLoad(){
  if(!isVisible())return;
  clearTimeout(loadTimer);loadTimer=setTimeout(()=>{if(!loading)load();},200);
}
$('prodPeriod').addEventListener('change',()=>{
  const custom=$('prodPeriod').value==='custom';$('prodCustomDates').hidden=!custom;
  planLoad();
});
for(const id of ['prodStartDate','prodEndDate'])$(id).addEventListener('change',planLoad);
for(const id of ['prodProfessional','prodService','prodCoverage'])$(id).addEventListener('change',()=>{if(loadedOnce)render();});
$('prodRefresh').addEventListener('click',load);
$('prodCsv').addEventListener('click',exportCsv);
document.querySelectorAll('[data-admin-tab="producao"]').forEach(button=>button.addEventListener('click',()=>{
  syncOptions();planLoad();
}));
window.addEventListener('bolhas:authenticated',()=>{if(state.role==='admin'){syncOptions();if(isVisible())planLoad();}});
window.addEventListener('bolhas:refreshed',()=>{if(isVisible())planLoad();});
$('prodStartDate').value=nextDay(today(),-6);
$('prodEndDate').value=today();
$('prodStartDate').max=today();$('prodEndDate').max=today();
if(isVisible())planLoad();
