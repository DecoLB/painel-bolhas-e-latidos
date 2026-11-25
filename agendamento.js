const byId=id=>document.getElementById(id);
const base=window.BOLHAS_CONFIG?.SUPABASE_URL;
const endpoint=base?base.replace(/\/$/,"")+"/functions/v1/solicitar-agendamento":null;
const timezone="America/Sao_Paulo";
const dateIso=()=>new Intl.DateTimeFormat("sv-SE",{year:"numeric",month:"2-digit",day:"2-digit",timeZone:timezone}).format(new Date());
const addDays=(iso,n)=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const pretty=iso=>new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC",day:"2-digit",month:"long",year:"numeric",weekday:"long"}).format(new Date(iso+"T12:00:00Z"));
const weekday=iso=>new Intl.DateTimeFormat("pt-BR",{weekday:"short",timeZone:"UTC"}).format(new Date(iso+"T12:00:00Z")).replace(".","");
const dateLabel=iso=>iso.slice(8,10)+"/"+iso.slice(5,7);
function error(message){byId("publicError").textContent=message;byId("publicError").hidden=false;byId("publicError").scrollIntoView({behavior:"smooth",block:"nearest"});}
function clearError(){byId("publicError").hidden=true;}
function renderCalendar(){
  const today=dateIso(), min=addDays(today,1), max=addDays(today,30);
  const previous=byId("desiredDate").value;
  byId("calendarRange").innerHTML="";
  for(let n=1;n<=30;n++){
    const iso=addDays(today,n);
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
  if(previous<min || previous>max){byId("desiredDate").value="";byId("selectedDay").textContent="Nenhuma data selecionada.";}
}
async function loadServices(){
  const select=byId("servicoPet");
  if(!endpoint){select.innerHTML='<option value="">Agendamento indisponível</option>';error("Serviço de agendamento não configurado.");return;}
  try{
    const res=await fetch(endpoint,{method:"GET",cache:"no-store"});
    const data=await res.json();
    if(!res.ok || !Array.isArray(data.servicos))throw Error(data.erro||"Não foi possível consultar os serviços.");
    select.innerHTML='<option value="">Selecione o serviço</option>';
    for(const s of data.servicos){
      const o=document.createElement("option");o.value=s.id;o.textContent=s.nome;select.append(o);
    }
    if(data.servicos.length===0)throw Error("Nenhum serviço disponível para agendamento.");
  }catch(e){error(e.message||"Não foi possível carregar os serviços.");select.innerHTML='<option value="">Serviços indisponíveis</option>';}
}
let cepLoad=0;
async function lookupCep(){
  const cep=byId("cep").value.replace(/\D/g,"").slice(0,8);
  if(cep.length!==8)return;
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
  return {tutor_nome:byId("tutorNome").value.trim(),pet_nome:byId("petNome").value.trim(),
    porte:byId("portePet").value,servico_id:byId("servicoPet").value,data_desejada:byId("desiredDate").value,
    cep:byId("cep").value.replace(/\D/g,""),rua:byId("rua").value.trim(),numero:byId("numero").value.trim(),
    complemento:byId("complemento").value.trim(),bairro:byId("bairro").value.trim(),
    cidade:byId("cidade").value.trim(),uf:byId("uf").value.trim().toUpperCase(),website:byId("website").value};
}
byId("cep").addEventListener("input",()=>{
  const v=byId("cep").value.replace(/\D/g,"").slice(0,8);
  byId("cep").value=v.length>5?v.slice(0,5)+"-"+v.slice(5):v;
  if(v.length===8)lookupCep(); else byId("cepMessage").textContent="Digite o CEP completo para buscar o endereço.";
});
byId("bookingForm").addEventListener("submit",async event=>{
  event.preventDefault();clearError();
  const iso=byId("desiredDate").value,hoje=dateIso();
  if(!iso || iso<addDays(hoje,1) || iso>addDays(hoje,30)){error("Selecione uma data entre amanhã e os próximos 30 dias.");return;}
  if(!byId("bookingForm").reportValidity())return;
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
  byId("bookingForm").reset();byId("desiredDate").value="";renderCalendar();
  byId("bookingSuccess").hidden=true;byId("requestCard").hidden=false;clearError();
  byId("requestCard").scrollIntoView({behavior:"smooth",block:"start"});
});
renderCalendar();
loadServices();
