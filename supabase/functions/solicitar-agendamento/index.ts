// Solicitação pública de agendamento — sem login do tutor.
// Apenas ações GET (serviços ativos) e POST (nova solicitação pendente).
// O segredo de serviço permanece exclusivamente no ambiente da Edge Function.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const ALLOWED_ORIGIN = "https://decolb.github.io";
const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};
const respond = (data:unknown,status=200) => new Response(JSON.stringify(data),{
  status, headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
});
const text = (v:unknown,max:number) => typeof v === "string" ? v.trim().slice(0,max+1) : "";
const plusDays = (iso:string,days:number) => {
  const d = new Date(iso+"T12:00:00Z");
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
};
const brazilToday=()=>new Intl.DateTimeFormat("sv-SE",{
  year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Sao_Paulo"
}).format(new Date());
const hex = (bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");

Deno.serve(async (req:Request):Promise<Response>=>{
  const origin = req.headers.get("origin");
  if(origin && origin!==ALLOWED_ORIGIN) return respond({erro:"Origem não autorizada."},403);
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if(!["GET","POST"].includes(req.method)) return respond({erro:"Método não permitido."},405);
  const url=Deno.env.get("SUPABASE_URL");
  const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !secret) return respond({erro:"Serviço temporariamente indisponível."},503);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});

  if(req.method==="GET"){
    const [services,breeds,extras]=await Promise.all([
      db.from("servicos").select("id,nome").eq("ativo",true).order("nome"),
      db.from("catalogo_racas").select("especie,nome").order("nome"),
      db.from("catalogo_adicionais").select("id,nome").eq("ativo",true).order("nome")
    ]);
    if(services.error||breeds.error||extras.error)
      return respond({erro:"Não foi possível carregar os dados do formulário."},503);
    // Não enviar preços unitários ao navegador.
    return respond({servicos:services.data||[],racas:breeds.data||[],adicionais:extras.data||[]});
  }

  let input:Record<string,unknown>;
  try {
    if(Number(req.headers.get("content-length")||"0")>14000) return respond({erro:"Dados muito extensos."},413);
    const raw=await req.text();
    if(raw.length>14000) return respond({erro:"Dados muito extensos."},413);
    input=JSON.parse(raw);
    if(!input || typeof input!=="object" || Array.isArray(input)) throw Error();
  }catch{return respond({erro:"Dados inválidos."},400);}

  // Prévia de preço computada no servidor. Nunca devolve preços unitários.
  // Solicitações de orçamento não consomem a cota de pedidos de agendamento.
  const isEstimate=input.acao==="estimar";
  const validId=(id:unknown)=>typeof id==="string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const selExtras=input.adicionais;
  const selected=Array.isArray(selExtras)?selExtras:[];
  if(!Array.isArray(selExtras) || selected.length>12 ||
    selected.some(x=>!validId(x)) || new Set(selected).size!==selected.length){
    return respond({erro:"Seleção de serviços adicionais inválida."},400);
  }
  const coat=text(input.pelagem,8);
  if(!["curto","medio","longo"].includes(coat))return respond({erro:"Informe a pelagem do pet."},400);
  if(isEstimate){
    if(!["cachorro","gato"].includes(input.especie) ||
      !["pequeno","medio","grande"].includes(input.porte) ||
      !validId(input.servico_id) || typeof input.transporte_bolhas!=="boolean"){
      return respond({erro:"Escolha espécie, porte, serviço e transporte para calcular a estimativa."},400);
    }
    const [service,rate,availableExtras,extraRates]=await Promise.all([
      db.from("servicos").select("id").eq("id",input.servico_id).eq("ativo",true).maybeSingle(),
      db.from("precos_servicos").select("valor_centavos")
        .eq("servico_id",input.servico_id).eq("especie",input.especie)
        .eq("porte",input.porte).eq("pelagem",coat).maybeSingle(),
      db.from("catalogo_adicionais").select("id").eq("ativo",true).in("id",selected.length?selected:["00000000-0000-0000-0000-000000000000"]),
      db.from("precos_adicionais").select("adicional_id,valor_centavos,modalidade,faixa_aplicacao").in("adicional_id",selected.length?selected:["00000000-0000-0000-0000-000000000000"])
    ]);
    if(service.error||rate.error||availableExtras.error||extraRates.error)
      return respond({erro:"Não foi possível calcular a estimativa no momento."},503);
    if(!service.data || availableExtras.data?.length!==selected.length)
      return respond({erro:"Verifique os serviços selecionados."},400);
    let total=rate.data?.valor_centavos??0;
    let sob_consulta=!rate.data;
    let tem_minimo=false;
    // Todos os preços de adicionais recebidos pertencem exclusivamente à tabela P (cães até 10kg).
    // Mesmo que haja valor para um serviço principal futuro de M/G, não reutilizar adicionais de P.
    const tabelaP=input.especie==="cachorro" && input.porte==="pequeno";
    for(const id of selected){
      const item=extraRates.data?.find(x=>x.adicional_id===id);
      if(!tabelaP || !item || item.faixa_aplicacao!=="cachorro_P_ate_10kg" ||
        item.modalidade==="sob_consulta" || item.valor_centavos==null){
        sob_consulta=true;continue;
      }
      total+=item.valor_centavos;
      if(item.modalidade==="a_partir"){tem_minimo=true;sob_consulta=true;}
    }
    // Transporte é sempre conferido pela equipe: não inferir quilometragem nem tarifa.
    if(input.transporte_bolhas)sob_consulta=true;
    return respond({
      total_estimado_centavos:total,
      tem_parcial:total>0,
      sob_consulta,
      tem_minimo,
      aviso:"Os valores apresentados são uma prévia, que será confirmada quando entrarem em contato."
    });
  }
  if(input.acao && input.acao!=="solicitar")return respond({erro:"Operação inválida."},400);

  // Campo invisível honeypot: bots costumam preencher.
  if(input.website) return respond({ok:true,mensagem:"Solicitação recebida para análise."},202);

  const tutor_nome=text(input.tutor_nome,120), pet_nome=text(input.pet_nome,120);
  const porte=text(input.porte,7), servico_id=text(input.servico_id,36);
  const especie=text(input.especie,10),raca=text(input.raca,100);
  // Obrigatório no formulário novo. Somente 'true' requer endereço.
  const transporte_bolhas=input.transporte_bolhas;
  const data_desejada=text(input.data_desejada,10);
  const cep=text(input.cep,9).replace(/\D/g,"");
  const rua=text(input.rua,180),numero=text(input.numero,20);
  const complemento=text(input.complemento,180);
  const bairro=text(input.bairro,120),cidade=text(input.cidade,120),uf=text(input.uf,2).toUpperCase();
  const hoje=brazilToday(), minimo=plusDays(hoje,1), maximo=plusDays(hoje,30);
  const shortNames = tutor_nome.length>=2 && tutor_nome.length<=120 && pet_nome.length>=2 && pet_nome.length<=120;
  const endOk=/^\d{8}$/.test(cep) && rua.length>0 && rua.length<=180 &&
    numero.length>0 && numero.length<=20 && complemento.length<=180 &&
    bairro.length<=120 && cidade.length>0 && cidade.length<=120 &&
    /^[A-Z]{2}$/.test(uf);
  if(!shortNames || !["pequeno","medio","grande"].includes(porte) ||
    !["cachorro","gato"].includes(especie) ||
    !raca || (especie==="gato" && raca!=="Gato/Felino") ||
    typeof transporte_bolhas!=="boolean" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(servico_id) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data_desejada) || data_desejada<minimo || data_desejada>maximo ||
    (transporte_bolhas===true && !endOk)){
    return respond({erro:"Confira espécie, raça, transporte e data (entre amanhã e 30 dias). Para transporte do Bolhas, informe o endereço completo."},400);
  }

  // Proteção contra envios repetidos por IP (sem armazenar o IP em texto puro).
  const ip=(req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip") || "nao-identificado").slice(0,90);
  const fingerprint=hex(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(secret+":"+ip)));
  const {data:permitted,error:quotaError}=await db.rpc("reservar_cota_agendamento",{p_fingerprint:fingerprint});
  if(quotaError) {
    console.error("Falha na cota de agendamentos");
    return respond({erro:"Não foi possível processar o pedido. Tente novamente."},503);
  }
  if(!permitted) return respond({erro:"Limite temporário de solicitações atingido. Tente novamente mais tarde."},429);

  const {data:servico,error:lookupError}=await db.from("servicos").select("id")
    .eq("id",servico_id).eq("ativo",true).maybeSingle();
  if(lookupError || !servico) return respond({erro:"O serviço selecionado não está disponível."},400);
  const {data:validBreed,error:breedError}=await db.from("catalogo_racas")
    .select("nome").eq("especie",especie).eq("nome",raca).maybeSingle();
  if(breedError || !validBreed)return respond({erro:"A raça selecionada não está disponível."},400);

  const {error}=await db.from("solicitacoes_agendamento").insert({
    tutor_nome,pet_nome,porte,especie,raca,transporte_bolhas,servico_id,data_desejada,
    pelagem:coat,adicionais:selected,
    cep:transporte_bolhas?cep:null,rua:transporte_bolhas?rua:null,
    numero:transporte_bolhas?numero:null,
    complemento:transporte_bolhas?(complemento||null):null,
    bairro:transporte_bolhas?(bairro||null):null,
    cidade:transporte_bolhas?cidade:null,uf:transporte_bolhas?uf:null,
    status:"pendente"
  });
  if(error){
    console.error("Erro ao criar solicitação:",error.code);
    return respond({erro:"Não foi possível registrar a solicitação. Tente novamente."},503);
  }
  return respond({
    ok:true,
    mensagem:"Solicitação de agendamento enviada. Ela será analisada e respondida por um colaborador do Bolhas & Latidos."
  },202);
});
