import {supabase,state,notify,esc} from './app.js?v=220';
const byId=id=>document.getElementById(id);
const MONEY=Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
let prices=[],additionalPrices=[];
const coat=['curto','medio','longo'];
const cents=value=>value===''?null:Math.round(Number(value)*100);
const inputAmount=c=>c==null?'':(c/100).toFixed(2);
const isAdmin=()=>state.role==='admin';
const canSave=value=>value!=='' && Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1000000;
async function load(){
  if(!isAdmin()||!supabase)return;
  const [servicePrices,extraPrices]=await Promise.all([
    supabase.from('precos_servicos').select('servico_id,especie,porte,pelagem,valor_centavos'),
    supabase.from('precos_adicionais').select('adicional_id,valor_centavos,modalidade')
  ]);
  if(servicePrices.error||extraPrices.error){
    notify('Não foi possível consultar a tabela comercial.','error');return;
  }
  prices=servicePrices.data||[];additionalPrices=extraPrices.data||[];
  const select=byId('commercialService'),selected=select.value;
  select.innerHTML=state.services.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.nome)+'</option>').join('');
  if(state.services.some(s=>s.id===selected))select.value=selected;
  renderServicePrices();renderAdditionalPrices();
}
function renderServicePrices(){
  const id=byId('commercialService').value,
    especie=byId('commercialSpecies').value,porte=byId('commercialPorte').value;
  for(const p of coat){
    const row=prices.find(r=>r.servico_id===id && r.especie===especie && r.porte===porte && r.pelagem===p);
    byId('commercial'+p[0].toUpperCase()+p.slice(1)).value=inputAmount(row?.valor_centavos);
  }
}
function renderAdditionalPrices(){
  const node=byId('additionalAdminList');
  node.innerHTML=state.additionalCatalog.map(a=>{
    const price=additionalPrices.find(p=>p.adicional_id===a.id);
    const mode=price?.modalidade||'sob_consulta';
    const value=inputAmount(price?.valor_centavos);
    return '<article class="commercial-extra-row" data-addition="'+esc(a.id)+'">'
      +'<strong>'+esc(a.nome)+'</strong>'
      +'<label>Tipo<select data-extra-mode="'+esc(a.id)+'">'
      +['fixo','a_partir','sob_consulta'].map(opt=>'<option value="'+opt+'"'+(mode===opt?' selected':'')+'>'+
        ({fixo:'Fixo',a_partir:'A partir de',sob_consulta:'Sob consulta'})[opt]+'</option>').join('')
      +'</select></label>'
      +'<label>Valor (R$)<input type="number" min="0" max="1000000" step="0.01" data-extra-price="'+esc(a.id)+'" value="'+esc(value)+'" placeholder="Sem valor"></label>'
      +'<button type="button" class="btn btn-outline" data-extra-save="'+esc(a.id)+'">Salvar</button>'
      +'<button type="button" class="btn btn-outline" data-extra-toggle="'+esc(a.id)+'">'+(a.ativo?'Desativar':'Ativar')+'</button></article>';
  }).join('')||'<div class="empty">Nenhum adicional cadastrado</div>';
}
byId('commercialService').addEventListener('change',renderServicePrices);
byId('commercialSpecies').addEventListener('change',renderServicePrices);
byId('commercialPorte').addEventListener('change',renderServicePrices);
byId('servicePriceForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!isAdmin())return;
  const id=byId('commercialService').value,especie=byId('commercialSpecies').value,
    porte=byId('commercialPorte').value;
  const data=coat.map(p=>({pelagem:p,value:byId('commercial'+p[0].toUpperCase()+p.slice(1)).value}));
  if(data.some(x=>x.value!==''&&!canSave(x.value))){
    notify('Valores inválidos. Informe valores não negativos.','error');return;
  }
  try{
    const full=data.filter(x=>x.value!=='').map(x=>({servico_id:id,especie,porte,pelagem:x.pelagem,valor_centavos:cents(x.value)}));
    const removed=data.filter(x=>x.value==='').map(x=>x.pelagem);
    if(full.length){const {error}=await supabase.from('precos_servicos').upsert(full);if(error)throw error;}
    if(removed.length){
      const {error}=await supabase.from('precos_servicos').delete()
        .eq('servico_id',id).eq('especie',especie).eq('porte',porte).in('pelagem',removed);
      if(error)throw error;
    }
    notify('Tabela de preços atualizada. A prévia do tutor refletirá os novos valores.','success');
    await load();
  }catch(error){notify('Não foi possível salvar os preços: '+error.message,'error');}
});
byId('additionalForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!isAdmin())return;
  const nome=byId('additionalName').value.trim(),
    modalidade=byId('additionalMode').value,valor=byId('additionalPrice').value;
  if(!nome|| (modalidade!=='sob_consulta'&&!canSave(valor)) || (valor!==''&&!canSave(valor))){
    notify('Preencha os dados e o valor (quando aplicável).','error');return;
  }
  try{
    const {data,error}=await supabase.from('catalogo_adicionais').insert({nome}).select('id').single();
    if(error)throw error;
    const {error:priceErr}=await supabase.from('precos_adicionais').insert({
      adicional_id:data.id,modalidade,valor_centavos:valor===''?null:cents(valor)
    });
    if(priceErr)throw priceErr;
    byId('additionalForm').reset();
    notify('Serviço adicional cadastrado.','success');
    await refreshAndLoad();
  }catch(e){notify('Falha ao cadastrar adicional: '+e.message,'error');}
});
async function refreshAndLoad(){
  const {data,error}=await supabase.from('catalogo_adicionais').select('id,nome,ativo').order('nome');
  if(!error)state.additionalCatalog=data||[];
  await load();
}
byId('additionalAdminList').addEventListener('click',async e=>{
  if(!isAdmin())return;
  const save=e.target.closest('[data-extra-save]'),
    toggle=e.target.closest('[data-extra-toggle]');
  if(!save&&!toggle)return;
  const id=save?.dataset.extraSave||toggle.dataset.extraToggle;
  try{
    if(toggle){
      const extra=state.additionalCatalog.find(x=>x.id===id);
      if(!extra)return;
      const {error}=await supabase.from('catalogo_adicionais').update({ativo:!extra.ativo}).eq('id',id);
      if(error)throw error;
    }else{
      const row=e.target.closest('[data-addition]'),
        modalidade=row.querySelector('[data-extra-mode]').value,
        raw=row.querySelector('[data-extra-price]').value;
      if((modalidade!=='sob_consulta'&&!canSave(raw))||(raw!==''&&!canSave(raw))){
        notify('Informe um valor válido para este adicional.','error');return;
      }
      const {error}=await supabase.from('precos_adicionais').upsert({
        adicional_id:id,modalidade,valor_centavos:raw===''?null:cents(raw)
      });
      if(error)throw error;
    }
    notify('Catálogo de adicionais atualizado.','success');await refreshAndLoad();
  }catch(err){notify('Não foi possível alterar o adicional: '+err.message,'error');}
});
document.querySelectorAll('[data-admin-tab="servicos"]').forEach(btn=>
  btn.addEventListener('click',()=>queueMicrotask(load)));
window.addEventListener('bolhas:catalog-changed',load);
window.addEventListener('bolhas:authenticated',()=>{if(isAdmin())load();});
