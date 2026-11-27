import {supabase,state,notify,esc} from './app.js?v=270';
const $=id=>document.getElementById(id);
const brl=c=>c==null?'':(c/100).toFixed(2);
const cents=s=>s===''?null:Math.round(Number(s)*100);
const valid=s=>s===''||(Number.isFinite(Number(s))&&Number(s)>=0&&Number(s)<=1000000);
const own=()=>state.role==='admin'&&!$('appShell').hidden;
let groups=[],breeds=[],servicePrices=[],extraPrices=[],manejos=[],veterinary=[],busy=false;
const labelMode={fixo:'Fixo',a_partir:'A partir de',sob_consulta:'Sob consulta'};
const modeOptions=selected=>Object.entries(labelMode).map(([id,label])=>
 '<option value="'+id+'"'+(id===selected?' selected':'')+'>'+label+'</option>').join('');
const options=(arr,key='codigo',label='nome')=>arr.map(x=>
 '<option value="'+esc(x[key])+'">'+esc(x[label])+'</option>').join('');

async function load(){
 if(!own()||busy)return;
 busy=true;
 try{
  const [g,b,s,e,m,v]=await Promise.all([
   supabase.from('grupos_precificacao').select('*').order('ordem'),
   supabase.from('racas_grupos_precificacao').select('raca,grupo_codigo').order('raca'),
   supabase.from('precos_servicos_grupos').select('*'),
   supabase.from('precos_adicionais_grupos').select('*'),
   supabase.from('precos_manejo_grupos').select('*'),
   supabase.from('catalogo_veterinario').select('*').order('categoria').order('nome')
  ]);
  for(const x of [g,b,s,e,m,v])if(x.error)throw x.error;
  groups=g.data||[];breeds=b.data||[];servicePrices=s.data||[];
  extraPrices=e.data||[];manejos=m.data||[];veterinary=v.data||[];
  const specials=groups.filter(x=>x.criterio!=='porte');
  const extraGroups=groups.filter(x=>x.codigo!=='porte_p');
  for(const [id,arr] of [['specialPriceGroup',specials],['extraPriceGroup',extraGroups],['manejoPriceGroup',groups]]){
   const node=$(id),current=node.value;
   node.innerHTML=options(arr);
   if(arr.some(x=>x.codigo===current))node.value=current;
  }
  const serviceSel=$('specialPriceService'),current=serviceSel.value;
  serviceSel.innerHTML=options(state.services.filter(x=>x.ativo),'id','nome');
  if(state.services.some(x=>x.id===current))serviceSel.value=current;
  renderAll();
 }catch(err){notify('Falha ao carregar as tabelas de precificação: '+err.message,'error');}
 finally{busy=false;}
}
function renderAll(){renderSpecial();renderExtras();renderManejo();renderVeterinary();}
function renderSpecial(){
 const group=$('specialPriceGroup').value,service=$('specialPriceService').value;
 const current=servicePrices.find(x=>x.grupo_codigo===group&&x.servico_id===service);
 $('specialPriceValue').value=brl(current?.valor_centavos);
 const names=breeds.filter(x=>x.grupo_codigo===group).map(x=>x.raca);
 $('specialPriceBreeds').textContent=group==='felino'
   ?'Espécie: Gato/Felino. Não depende de porte ou pelagem.'
   :'Raças associadas: '+names.join(' · ')+'. O preço independe de porte e pelagem.';
 const rows=state.services.filter(s=>s.ativo).map(s=>{
  const rate=servicePrices.find(x=>x.grupo_codigo===group&&x.servico_id===s.id);
  return '<tr><td>'+esc(s.nome)+'</td><td class="v24-money">'
   +(rate?.valor_centavos!=null?(rate.valor_centavos/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):
    '<span class="v24-not-defined">Sem preço nesta tabela</span>')+'</td></tr>';
 }).join('');
 $('specialPriceTable').innerHTML=rows;
}
function renderExtras(){
 const group=$('extraPriceGroup').value;
 $('extraGroupTable').innerHTML=state.additionalCatalog.map(a=>{
  const record=extraPrices.find(p=>p.grupo_codigo===group&&p.adicional_id===a.id);
  const defined=Boolean(record);
  return '<tr data-v24-extra="'+esc(a.id)+'"><td>'+esc(a.nome)+
   '<small class="v24-subtle">'+(defined?'Preço cadastrado':'Não previsto nesta tabela')+'</small></td>'+
   '<td><select data-v24-extra-mode>'+modeOptions(record?.modalidade||'sob_consulta')+'</select></td>'+
   '<td><input type="number" data-v24-extra-value min="0" step="0.01" value="'+esc(brl(record?.valor_centavos))+
   '" placeholder="Sob consulta"></td>'+
   '<td><button type="button" class="btn btn-outline" data-v24-save-extra>Salvar</button></td></tr>';
 }).join('');
}
function renderManejo(){
 const group=$('manejoPriceGroup').value;
 for(const name of ['ansioso','agressivo','idoso']){
  const record=manejos.find(x=>x.grupo_codigo===group&&x.manejo===name);
  $('manejoPrice'+name[0].toUpperCase()+name.slice(1)).value=brl(record?.valor_centavos);
 }
}
function renderVeterinary(){
 $('v24VetTable').innerHTML=veterinary.map(x=>
  '<tr data-v24-vet="'+esc(x.id)+'"><td><b>'+esc(x.categoria)+'</b></td>'+
  '<td>'+esc(x.nome)+'<small class="v24-subtle">'+esc(x.observacao||'')+'</small></td>'+
  '<td><select data-v24-vet-mode>'+modeOptions(x.modalidade)+'</select></td>'+
  '<td><input type="number" min="0" step="0.01" data-v24-vet-value value="'+esc(brl(x.valor_centavos))+'" placeholder="Sob consulta"></td>'+
  '<td><button type="button" class="btn btn-outline" data-v24-save-vet>Salvar</button></td></tr>'
 ).join('');
}
const perform=async(fn,success)=>{
 if(!own()||busy)return;
 busy=true;
 try{await fn();notify(success,'success');}
 catch(e){notify('Não foi possível salvar: '+e.message,'error');}
 finally{busy=false;await load();}
};
$('specialPriceGroup').addEventListener('change',renderSpecial);
$('specialPriceService').addEventListener('change',renderSpecial);
$('extraPriceGroup').addEventListener('change',renderExtras);
$('manejoPriceGroup').addEventListener('change',renderManejo);
$('specialPriceForm').addEventListener('submit',e=>{
 e.preventDefault();
 const group=$('specialPriceGroup').value,servico_id=$('specialPriceService').value;
 const raw=$('specialPriceValue').value;
 if(!valid(raw)){notify('Informe um valor monetário válido.','error');return;}
 const existing=servicePrices.some(x=>x.grupo_codigo===group&&x.servico_id===servico_id);
 if(raw===''&&existing&&!confirm('Remover o preço desta combinação? Ela ficará sob consulta.'))return;
 perform(async()=>{
  const operation=raw===''?
    supabase.from('precos_servicos_grupos').delete().eq('grupo_codigo',group).eq('servico_id',servico_id):
    supabase.from('precos_servicos_grupos').upsert({grupo_codigo:group,servico_id,valor_centavos:cents(raw)});
  const {error}=await operation;if(error)throw error;
 },'Preço especial atualizado. A prévia pública utilizará esta tabela por raça.');
});
$('extraGroupTable').addEventListener('click',e=>{
 const button=e.target.closest('[data-v24-save-extra]');if(!button)return;
 const row=button.closest('[data-v24-extra]'),group=$('extraPriceGroup').value;
 const adicional_id=row.dataset.v24Extra,modalidade=row.querySelector('[data-v24-extra-mode]').value;
 const raw=row.querySelector('[data-v24-extra-value]').value;
 if(!valid(raw)||(modalidade!=='sob_consulta'&&raw==='')){
  notify('Informe o preço quando a modalidade for fixa ou a partir de.','error');return;
 }
 perform(async()=>{
  const {error}=await supabase.from('precos_adicionais_grupos').upsert({
   grupo_codigo:group,adicional_id,modalidade,valor_centavos:cents(raw),
   observacao:modalidade==='a_partir'?'Preço mínimo a confirmar':modalidade==='sob_consulta'?'Valor final a consultar':null
  });if(error)throw error;
 },'Preço do adicional atualizado para esta categoria.');
});
$('manejoPriceForm').addEventListener('submit',e=>{
 e.preventDefault();const grupo_codigo=$('manejoPriceGroup').value;
 const rows=['ansioso','agressivo','idoso'].map(manejo=>({
  grupo_codigo,manejo,valor_centavos:cents($('manejoPrice'+manejo[0].toUpperCase()+manejo.slice(1)).value)
 }));
 if(rows.some(x=>x.valor_centavos==null||!valid(String(x.valor_centavos/100)))){
  notify('Preencha os três valores de manejo.','error');return;
 }
 perform(async()=>{
  const {error}=await supabase.from('precos_manejo_grupos').upsert(rows);if(error)throw error;
 },'Referências de manejo atualizadas, sem alterar a regra informativa.');
});
$('v24VetTable').addEventListener('click',e=>{
 const button=e.target.closest('[data-v24-save-vet]');if(!button)return;
 const row=button.closest('[data-v24-vet]'),id=row.dataset.v24Vet;
 const modalidade=row.querySelector('[data-v24-vet-mode]').value,raw=row.querySelector('[data-v24-vet-value]').value;
 if(!valid(raw)||(modalidade!=='sob_consulta'&&raw==='')){
  notify('Informe um valor válido para este procedimento.','error');return;
 }
 perform(async()=>{
  const {error}=await supabase.from('catalogo_veterinario').update({
   modalidade,valor_centavos:cents(raw),atualizado_em:new Date().toISOString()
  }).eq('id',id);
  if(error)throw error;
 },'Preço veterinário atualizado. Não interfere no agendamento de banho e tosa.');
});
$('v24Reload').addEventListener('click',load);
document.querySelectorAll('[data-admin-tab="servicos"]').forEach(el=>
 el.addEventListener('click',()=>queueMicrotask(load)));
window.addEventListener('bolhas:authenticated',()=>{if(own())load();});
window.addEventListener('bolhas:catalog-changed',()=>{if(own())load();});
