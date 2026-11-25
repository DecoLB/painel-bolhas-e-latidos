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
    const {data,error}=await db.from("servicos").select("id,nome").eq("ativo",true).order("nome");
    if(error) return respond({erro:"Não foi possível carregar os serviços."},503);
    return respond({servicos:data||[]});
  }

  let input:Record<string,unknown>;
  try {
    if(Number(req.headers.get("content-length")||"0")>14000) return respond({erro:"Dados muito extensos."},413);
    const raw=await req.text();
    if(raw.length>14000) return respond({erro:"Dados muito extensos."},413);
    input=JSON.parse(raw);
    if(!input || typeof input!=="object" || Array.isArray(input)) throw Error();
  }catch{return respond({erro:"Dados inválidos."},400);}

  // Campo invisível honeypot: bots costumam preencher.
  if(input.website) return respond({ok:true,mensagem:"Solicitação recebida para análise."},202);

  const tutor_nome=text(input.tutor_nome,120), pet_nome=text(input.pet_nome,120);
  const porte=text(input.porte,7), servico_id=text(input.servico_id,36);
  const data_desejada=text(input.data_desejada,10);
  const cep=text(input.cep,9).replace(/\D/g,"");
  const rua=text(input.rua,180),numero=text(input.numero,20);
  const complemento=text(input.complemento,180);
  const bairro=text(input.bairro,120),cidade=text(input.cidade,120),uf=text(input.uf,2).toUpperCase();
  const hoje=brazilToday(), minimo=plusDays(hoje,1), maximo=plusDays(hoje,30);
  const shortNames = tutor_nome.length>=2 && tutor_nome.length<=120 && pet_nome.length>=2 && pet_nome.length<=120;
  if(!shortNames || !["pequeno","medio","grande"].includes(porte) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(servico_id) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(data_desejada) || data_desejada<minimo || data_desejada>maximo ||
    !/^\d{8}$/.test(cep) || !rua || rua.length>180 || !numero || numero.length>20 ||
    complemento.length>180 || bairro.length>120 || !cidade || cidade.length>120 || !/^[A-Z]{2}$/.test(uf)){
    return respond({erro:"Confira os campos e escolha uma data entre amanhã e 30 dias à frente."},400);
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

  const {error}=await db.from("solicitacoes_agendamento").insert({
    tutor_nome,pet_nome,porte,servico_id,data_desejada,cep,rua,numero,
    complemento:complemento||null,bairro:bairro||null,cidade,uf,status:"pendente"
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
