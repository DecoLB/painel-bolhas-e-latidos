// Supabase Edge Function: retencao-7-dias
// Agendada no Supabase Cron. Exige x-cron-secret; nunca exponha service_role no frontend.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("Method not allowed", { status:405 });
  const expected=Deno.env.get("CRON_SECRET");
  if(!expected || req.headers.get("x-cron-secret") !== expected)
    return new Response("Unauthorized",{status:401});
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url || !key) return new Response("Missing server configuration",{status:500});
  const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
  try {
    const {data:cutoff,error:cutoffError}=await db.rpc("retention_cutoff");
    if(cutoffError || !cutoff) throw cutoffError || new Error("Missing retention cutoff");
    let removed=0, photos=0, batches=0;
    for(let batch=0;batch<20;batch++){
      const {data:expired,error}=await db.from("atendimentos")
        .select("id,foto_path").eq("status","concluido")
        .lt("criado_em",cutoff).order("criado_em",{ascending:true}).limit(100);
      if(error)throw error;
      if(!expired?.length)break;
      const paths=[...new Set(expired.map(x=>x.foto_path).filter(Boolean))] as string[];
      if(paths.length){
        const {error:storageError}=await db.storage.from("fotos-atendimentos").remove(paths);
        if(storageError) throw storageError;
        photos+=paths.length;
      }
      const ids=expired.map(x=>x.id);
      const {error:deleteError}=await db.from("atendimentos").delete().in("id",ids);
      if(deleteError)throw deleteError;
      removed+=ids.length;batches++;
    }
    // Não remover registros em execução ou aguardando, mesmo se ultrapassarem sete dias.
    return Response.json({ok:true,cutoff,removed,photos,batches});
  } catch(error) {
    console.error("Falha na limpeza:",error);
    return Response.json({ok:false,error:String(error)},{status:500});
  }
});
