-- V2.7.2 | Auditoria detalhada vinculada à retenção do atendimento.
-- Fechamentos agregados por data não armazenam nome do pet nem tutor.
alter table public.financeiro_auditoria
 add constraint financeiro_auditoria_atendimento_fk
 foreign key(atendimento_id) references public.atendimentos(id) on delete cascade;
