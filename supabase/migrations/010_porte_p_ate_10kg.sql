-- V2.1.1: escopo formal da tabela recebida (somente cães P, até 10 kg).
-- As demais faixas e raças especiais NÃO têm preços inferidos.
alter table public.precos_adicionais
  add column if not exists faixa_aplicacao varchar(40) not null
  default 'cachorro_P_ate_10kg'
  check (faixa_aplicacao = 'cachorro_P_ate_10kg');
comment on column public.precos_adicionais.faixa_aplicacao is
  'Tabela recebida exclusivamente para cães de porte P (peso até 10 kg). M/G e raças especiais dependem de tabelas próprias.';
