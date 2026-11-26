-- V2.4.0: preserva o preço explícito R$70 do Hotelzinho, sem inferir a diária ou permanência.
update public.precos_adicionais_grupos a set modalidade='fixo',
  observacao='Valor informado: R$ 70,00. Unidade/período não consta da tabela e deve ser confirmado antes da contratação.',
  atualizado_em=now()
from public.catalogo_adicionais c
where a.adicional_id=c.id and c.nome='Hotelzinho'
  and a.grupo_codigo='bernardo_samoieda_terra_bernese'
  and a.valor_centavos=7000;