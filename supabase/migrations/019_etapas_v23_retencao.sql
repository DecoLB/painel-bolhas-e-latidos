-- V2.3: permite somente a limpeza automática por cascata após retenção.
-- Usuários não têm GRANT DELETE nem política DELETE na trilha imutável.
drop trigger if exists audit_v23_imutavel on public.etapa_auditoria;
create trigger audit_v23_imutavel before update on public.etapa_auditoria
for each row execute function app_private.bloquear_mutacao_auditoria_v23();
