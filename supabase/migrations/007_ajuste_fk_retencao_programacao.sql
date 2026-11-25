-- V1.6.1: manter histórico do estado de entrada mesmo quando o atendimento
-- operacional for eliminado após sete dias (ON DELETE SET NULL).
alter table public.programacao
  drop constraint decisao_programacao_consistente;
alter table public.programacao
  add constraint decisao_programacao_consistente check (
    (status='programado' and atendimento_id is null and motivo_recusa is null
     and justificativa_outro is null and registrado_em is null)
    or
    (status='entrada_realizada' and motivo_recusa is null
     and justificativa_outro is null and registrado_em is not null)
    or
    (status='recusado' and atendimento_id is null and registrado_em is not null
     and motivo_recusa in ('tutor_cancelou','nao_compareceu','coleta_nao_realizada','outro')
     and ((motivo_recusa='outro' and length(btrim(coalesce(justificativa_outro,''))) between 1 and 200)
      or (motivo_recusa<>'outro' and justificativa_outro is null)))
  );
-- O registro de entrada sempre nasce com atendimento_id; após a política de
-- retenção de atendimentos, o vínculo pode ser limpo sem travar o cron.
