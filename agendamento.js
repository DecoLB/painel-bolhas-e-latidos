const byId=id=>document.getElementById(id);
const base=window.BOLHAS_CONFIG?.SUPABASE_URL;
const endpoint=base?base.replace(/\/$/,"")+"/functions/v1/solicitar-agendamento":null;
const timezone="America/Sao_Paulo";
const dateIso=()=>new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:timezone}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const pretty=iso=>new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric",weekday:"long"}).format(new Date(iso+"T12:00:00Z"));
const weekday=iso=>new Intl.DateTimeFormat("pt-BR",{weekday:"short",timeZone:"UTC"}).format(new Date(iso+"T12:00:00Z")).replace(".","");
const dateLabel=iso=>iso.slice(8,10)+"/"+iso.slice(5,7);
const isSunday=iso=>/^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(iso+"T12:00:00Z").getUTCDay()===0;
let racas=[],adicionais=[];
let estimateToken=0,estimateTimer=null;
const checkExtras=()=>[...document.querySelectorAll('#bookingAdditionalList input[type="checkbox"]:checked')].map(x=>x.value);
function updateIncluded(){
  const label=byId('servicoPet').selectedOptions[0]?.textContent.toLowerCase()||'';
  byId('includedNotice').hidden=!(label.includes('banho')||label.includes('tosa'));
}
const money=cents=>(cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function scheduleEstimate(){
  clearTimeout(estimateTimer);
  // A prévia básica aparece ao escolher serviço/porte/pelagem; transporte só a ajusta.
  const required=['especiePet','portePet','pelagemPet','servicoPet'];
  if(required.some(id=>!byId(id).value)){
    ++estimateToken;
    byId('estimateTotal').textContent='Selecione serviço, pelagem e transporte';
    byId('estimateInfo').textContent='A prévia será calculada automaticamente.';
    return;
  }
  const token=++estimateToken;
  byId('estimateTotal').textContent='Calculando estimativa...';
  estimateTimer=setTimeout(async()=>{
    try{
      const body={
        acao:'estimar',especie:byId('especiePet').value,porte:byId('portePet').value,
        pelagem:byId('pelagemPet').value,servico_id:byId('servicoPet').value,
        transporte_bolhas:byId('transporteBolhas').value==='sim',
        adicionais:checkExtras()
      };
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      const result=await response.json();
      if(token!==estimateToken)return;
      if(!response.ok)throw Error(result.erro||'Estimativa indisponível');
      byId('estimateTotal').textContent=result.sob_consulta
        ? (result.tem_parcial?'Estimativa parcial: '+money(result.total_estimado_centavos):'Valor sob consulta')
        : 'Total estimado: '+money(result.total_estimado_centavos);
      byId('estimateInfo').textContent=(result.sob_consulta
        ? 'Há itens ou condições sem preço final definido. A equipe confirmará o valor completo.'
        : 'Estimativa para o conjunto de serviços selecionados.')
        +(byId('transporteBolhas').value===''?' Informe se precisará de transporte; isso pode alterar a estimativa.':'');
    }catch(e){
      if(token!==estimateToken)return;
      byId('estimateTotal').textContent='Estimativa indisponível';
      byId('estimateInfo').textContent='O valor será confirmado pela equipe.';
    }
  },250);
}
const addressIds=["cep","rua","numero","complemento","bairro","cidade","uf"];
const requiredAddressIds=["cep","rua","numero","cidade","uf"];
function updateSpecies(){
  const specie=byId("especiePet").value,select=byId("racaPet");
  select.innerHTML='<option value="">Selecione a raça</option>';
  if(specie==="gato"){
    select.innerHTML='<option value="Gato/Felino">Gato/Felino</option>';
    select.value="Gato/Felino";select.disabled=true;
    byId("racaMessage").textContent="Gato/Felino identificado automaticamente.";
  }else if(specie==="cachorro"){
    select.disabled=false;
    for(const item of racas.filter(r=>r.especie==="cachorro")){
      const opt=document.createElement("option");opt.value=item.nome;opt.textContent=item.nome;select.append(opt);
    }
    byId("racaMessage").textContent="Selecione uma das raças cadastradas.";
  }else{
    select.disabled=true;byId("racaMessage").textContent="Selecione primeiro a espécie do pet.";
  }
}
function updateTransport(){
  const mode=byId("transporteBolhas").value;
  const show=mode==="sim";
  byId("transportAddressSection").hidden=!show;
  byId("transportMessage").textContent=show?
    "Informe o endereço de coleta do pet para o transporte do Bolhas & Latidos.":
    mode==="nao"?"Sem transporte do Bolhas & Latidos: o transporte é por conta do tutor.":
    "Selecione uma opção para informar como o pet chegará ao atendimento.";
  for(const id of addressIds){
    const field=byId(id);field.disabled=!show;field.required=show&&requiredAddressIds.includes(id);
    if(!show)field.value="";
  }
  if(!show){++cepLoad;byId("cepMessage").textContent="Ao digitar 8 números, buscaremos o endereço.";}
}
byId("especiePet").addEventListener("change",()=>{updateSpecies();scheduleEstimate();});
byId("transporteBolhas").addEventListener("change",()=>{updateTransport();scheduleEstimate();});
function error(message){byId("publicError").textContent=message;byId("publicError").hidden=false;byId("publicError").scrollIntoView({behavior:"smooth",block:"nearest"});}
function clearError(){byId("publicError").hidden=true;}
function renderCalendar(){
  const today=dateIso(), min=addDays(today,1), max=addDays(today,30);
  const previous=byId("desiredDate").value;
  byId("calendarRange").innerHTML="";
  for(let n=1;n<=30;n++){
    const iso=addDays(today,n);
    if(isSunday(iso))continue; // D+1 a D+30 permanece fixo; domingos não entram no calendário.
    const b=document.createElement("button");b.type="button";b.className="calendar-day";
    b.setAttribute("aria-pressed",String(iso===previous));
    b.setAttribute("aria-label",pretty(iso));
    const d=document.createElement("strong");d.textContent=dateLabel(iso);
    const w=document.createElement("small");w.textContent=weekday(iso);
    b.append(d,w);
    b.addEventListener("click",()=>{
      byId("desiredDate").value=iso;
      for(const c of byId("calendarRange").querySelectorAll("button"))c.setAttribute("aria-pressed",String(c===b));
      byId("selectedDay").textContent="Data desejada: "+pretty(iso);
    });
    byId("calendarRange").append(b);
  }
  if(previous<min || previous>max || isSunday(previous)){
    byId("desiredDate").value="";
    byId("selectedDay").textContent="Nenhuma data selecionada.";
  }
}
async function loadServices(){
  const select=byId("servicoPet");
  if(!endpoint){select.innerHTML='<option value="">Agendamento indisponível</option>';error("Serviço de agendamento não configurado.");return;}
  try{
    const res=await fetch(endpoint,{method:"GET",cache:"no-store"});
    const data=await res.json();
    if(!res.ok || !Array.isArray(data.servicos)||!Array.isArray(data.racas)||!Array.isArray(data.adicionais))throw Error(data.erro||"Não foi possível consultar os serviços e raças.");
    racas=data.racas;adicionais=data.adicionais;updateSpecies();
    const extraList=byId('bookingAdditionalList');
    extraList.innerHTML='';
    for(const additional of adicionais){
      const label=document.createElement('label');label.className='extra-item';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.value=additional.id;
      checkbox.addEventListener('change',scheduleEstimate);
      const span=document.createElement('span');span.textContent=additional.nome;
      label.append(checkbox,span);extraList.append(label);
    }
    select.innerHTML='<option value="">Selecione o serviço</option>';
    for(const s of data.servicos){
      const o=document.createElement("option");o.value=s.id;o.textContent=s.nome;select.append(o);
    }
    if(data.servicos.length===0)throw Error("Nenhum serviço disponível para agendamento.");
    updateIncluded();scheduleEstimate();
  }catch(e){error(e.message||"Não foi possível carregar os serviços.");select.innerHTML='<option value="">Serviços indisponíveis</option>';}
}
let cepLoad=0;
async function lookupCep(){
  const cep=byId("cep").value.replace(/\D/g,"").slice(0,8);
  if(cep.length!==8 || byId("transporteBolhas").value!=="sim")return;
  const current=++cepLoad;
  const msg=byId("cepMessage");msg.textContent="Consultando CEP...";
  try{
    const response=await fetch("https://viacep.com.br/ws/"+cep+"/json/",{cache:"no-store"});
    if(!response.ok)throw Error("CEP não localizado.");
    const result=await response.json();
    if(current!==cepLoad)return;
    if(result.erro)throw Error("CEP não encontrado. Confira os números.");
    byId("rua").value=result.logradouro||"";
    byId("bairro").value=result.bairro||"";
    byId("cidade").value=result.localidade||"";
    byId("uf").value=result.uf||"";
    msg.textContent="Endereço preenchido. Confirme rua, número e complemento.";
    byId(result.logradouro?"numero":"rua").focus();
  }catch(e){if(current!==cepLoad)return;msg.textContent=e.message+" Você pode preencher manualmente."; }
}
function values(){
  const transport=byId("transporteBolhas").value==="sim";
  return {tutor_nome:byId("tutorNome").value.trim(),pet_nome:byId("petNome").value.trim(),
    especie:byId("especiePet").value,
    raca:byId("especiePet").value==="gato"?"Gato/Felino":byId("racaPet").value,
    porte:byId("portePet").value,pelagem:byId("pelagemPet").value,
    servico_id:byId("servicoPet").value,adicionais:checkExtras(),data_desejada:byId("desiredDate").value,
    transporte_bolhas:transport,
    cep:transport?byId("cep").value.replace(/\D/g,""):null,
    rua:transport?byId("rua").value.trim():null,numero:transport?byId("numero").value.trim():null,
    complemento:transport?byId("complemento").value.trim():null,
    bairro:transport?byId("bairro").value.trim():null,
    cidade:transport?byId("cidade").value.trim():null,
    uf:transport?byId("uf").value.trim().toUpperCase():null,website:byId("website").value};
}
byId("cep").addEventListener("input",()=>{
  const v=byId("cep").value.replace(/\D/g,"").slice(0,8);
  byId("cep").value=v.length>5?v.slice(0,5)+"-"+v.slice(5):v;
  if(v.length===8)lookupCep(); else byId("cepMessage").textContent="Digite o CEP completo para buscar o endereço.";
});
byId("bookingForm").addEventListener("submit",async event=>{
  event.preventDefault();clearError();
  const iso=byId("desiredDate").value,hoje=dateIso();
  if(!iso || iso<addDays(hoje,1) || iso>addDays(hoje,30) || isSunday(iso)){
    error("Selecione uma data de segunda a sábado, entre amanhã e os próximos 30 dias. Não há atendimento aos domingos.");return;
  }
  if(!byId("bookingForm").reportValidity())return;
  if(!byId('pelagemPet').value){error('Selecione o tipo de pelagem.');return;}
  if(!byId("especiePet").value || (byId("especiePet").value==="cachorro"&&!byId("racaPet").value)){
    error("Selecione a espécie e a raça do pet.");return;
  }
  if(!["sim","nao"].includes(byId("transporteBolhas").value)){
    error("Informe se precisa de transporte do Bolhas & Latidos.");return;
  }
  const button=byId("sendBooking");button.disabled=true;button.textContent="Enviando solicitação...";
  try{
    const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values())});
    const data=await res.json();
    if(!res.ok||!data.ok)throw Error(data.erro||"Não foi possível enviar a solicitação.");
    byId("requestCard").hidden=true;byId("bookingSuccess").hidden=false;byId("bookingSuccess").scrollIntoView({behavior:"smooth",block:"start"});
  }catch(e){error(e.message||"Não foi possível enviar a solicitação.");}
  finally{button.disabled=false;button.textContent="Enviar solicitação de agendamento";}
});
byId("newBooking").addEventListener("click",()=>{
  byId("bookingForm").reset();byId("desiredDate").value="";renderCalendar();updateSpecies();updateTransport();updateIncluded();scheduleEstimate();
  byId("bookingSuccess").hidden=true;byId("requestCard").hidden=false;clearError();
  byId("requestCard").scrollIntoView({behavior:"smooth",block:"start"});
});
for(const id of ['portePet','pelagemPet','servicoPet']){
  byId(id).addEventListener('change',()=>{updateIncluded();scheduleEstimate();});
}
renderCalendar();
updateTransport();
updateSpecies();
loadServices();
scheduleEstimate();
