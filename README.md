## V2.5.0 — Padronização de todas as impressões (26/11/2026)

**Impressões suportadas por três ações existentes:**
- Administrador → Visão gerencial → **Imprimir relatório diário**: gera planilha tabular com pet/tutor, espécie/raça, serviço/adicionais, manejo/transporte, executores, horários, durações e status. A data selecionada e o filtro atual do relatório são preservados.
- Administrador → Calendário → **Imprimir programação do dia**: conserva os agendamentos aprovados na data, situação de entrada/recusa, endereço e transporte, com cabeçalho e colunas padronizadas.
- Administrador → Conferência de fichas → **Imprimir fichas**: gera tabela de atividades por animal, executor(es) confirmado(s), horários, status de conferência e **valor integral do produto**, além de linha de **valor único do atendimento** (sem soma indevida de produto compartilhado).

**Layout**: A4 horizontal, margens de 9–11 mm, tabela com largura fixa adaptada à página, repetição do cabeçalho da tabela a cada folha, células com quebra de texto controlada, linhas e grupos de um mesmo animal não divididos quando a altura permitir, fonte compacta e legível, sem rolagem nem cortes laterais. Quando existem mais registros do que cabem fisicamente numa folha, o navegador cria páginas adicionais; nunca se promete imprimir todos os registros em uma única folha.

**Identificação**: logo, título, data de referência, quantidade de registros, data/hora de impressão e rodapé com **Versão 2.5.0 — Desenvolvido por SUMMIT ADVISORY TECNOLOGIA E INFORMÁTICA LTDA**.

**Segurança e rastreabilidade**: a impressão permanece acessível somente ao Administrador; dados monetários consultados via RLS apenas para esse perfil. Os relatórios não alteram atendimento, valores, retenção, calendário ou auditoria. A impressão financeira respeita a V2.4.1, sem qualquer comissão ou rateio. Na tabela de fichas, o mesmo produto pode aparecer em mais de uma atividade, mas o total do atendimento é mostrado uma única vez.

**Arquivos**: `impressao-v25.js`, `impressao-v25.css`, `app.js`, `etapas-v23.js`, `agendamento-admin.js` e `index.html`. Scripts que importam `app.js` foram alinhados na mesma versão `?v=250` para impedir inicialização duplicada do módulo após publicação.

**Homologação sugerida:** imprimir as três visões com 1, 10 e 30+ linhas; verificar Prévia de Impressão em A4 paisagem, o cabeçalho nas páginas seguintes, nenhuma linha partida ou coluna cortada e o rodapé; conferir inclusive uma ficha com Banho/Tosa executados por pessoas diferentes.

## V2.4.1 — Valor integral por produto executado (26/11/2026)

**Regra vigente:** não há cálculo nem sugestão de comissão ou divisão financeira. O Administrador consulta o preço cheio do **produto contratado**, vinculado às atividades executadas e a cada profissional confirmado.

- Se o produto comercial é **Banho com Tosa na Máquina** de R$ 180,00, e Ariana executa o Banho enquanto Rosana executa a Tosa, **cada atividade mostra o produto completo de R$ 180,00** como referência comercial. O sistema não cria artificialmente os preços de "Banho" e "Tosa" separados, pois a tabela informa somente o preço do pacote.
- A mesma pessoa pode executar Banho e Tosa; para o seu consolidado de **produtos associados**, o produto é contado **uma única vez por atendimento e profissional**, mesmo que tenha mais de uma atividade.
- Se profissionais diferentes participarem do mesmo produto, o preço comercial será visível como referência para cada um. **Os totais de produtos associados aos profissionais não são aditivos entre pessoas** e não podem ser confundidos com vendas ou recebimentos.
- **Valor geral do atendimento:** soma de produtos comerciais contratados e adicionais precificados uma única vez; não é obtido pela soma das linhas de atividade ou dos profissionais. Estimativas parciais são identificadas.
- **Adicionais:** cada item tem seu valor próprio da tabela comercial, atribuído integralmente aos executores confirmados. Valores sob consulta não são inventados.
- **Conferência de fichas:** permite corrigir quem executou o quê e horários, com justificativa e trilha de auditoria. Campos de percentual e controles de divisão monetária foram retirados da UI.
- **Banco de dados:** a função `app_private.distribuir_valores_v23` passou a registrar o preço cheio do produto principal em cada atividade, conservando o valor próprio de cada adicional. Não gera novas linhas em `etapa_rateios`. A RPC antiga `ajustar_rateio_v23` teve a permissão de execução revogada para usuários autenticados.
- **Preservação histórica:** não foram apagados registros anteriores, preços congelados nem eventos de auditoria. A nova UI deriva valores comerciais plenos dos snapshots e dos executores confirmados, inclusive para registros antigos, sem reinterpretar parcelas históricas como remuneração.
- **Segurança:** os valores continuam restritos ao Administrador. Prestadores, Operacional e Telão não recebem valores.
- **Testes:** integração com Golden Retriever, Banho + Tosa na Máquina (R$ 180,00), Hidratação (R$ 50,00), dois executores e duas atividades principais: referência integral em ambas as atividades, total único do atendimento R$ 230,00, nenhuma nova alocação monetária. Transação de teste revertida.
- Arquivos: `supabase/migrations/026_valor_integral_por_produto_sem_comissao.sql`, `etapas-v23.js`, `producao-admin.js`, `index.html`.

> As seções V2.3 e V2.4.0 a seguir permanecem como histórico de versões. Onde descrevem percentuais ou divisões de preço, essas regras foram **substituídas integralmente pela V2.4.1**.

## V2.4.0 — Precificação automática por raça, porte e felinos

**Fonte:** sete tabelas de banho/tosa e uma tabela veterinária fornecidas pelo cliente em 26/11/2026.

- Precedência para cães: **raça especial cadastrada > tabela geral P/M/G + pelagem**. Golden Retriever, Chow Chow, Fila Brasileiro, Lobo, Husky Siberiano, Pastor Belga, Pastor Alemão, Rottweiller (grafia do catálogo), Labrador, Border Collie, São Bernardo, Samoieda, Terra Nova e Bernese possuem vinculação explícita.
- **Lobo** e **Bernese** foram adicionados ao catálogo com a denominação exata do folheto, sem inferir sua classificação zoológica.
- Para gatos, a regra **Gato/Felino** usa preço único por serviço, independente de porte e pelagem.
- Cães não especiais continuam na tabela por porte P (até 10 kg), M (11 a 20 kg), G (21 a 40 kg) e pelagem curta/média/longa. P foi preservada sem alterações.
- Serviços **ausentes** na tabela específica **não herdam preços genéricos**. Mostram `Sob consulta`; não atribuir R$ 0,00.
- Novas tabelas de adicionais por M/G/grupos/felinos: preços fixos e `a_partir` calculados na prévia; `sob_consulta` não é somado automaticamente. TaxiDog (R$25 até 3 km, distância maior sob consulta) depende de confirmação e não é convertido em preço fechado sem quilometragem validada. Hotelzinho (R$70) é exclusivo do grupo São Bernardo/Samoieda/Terra Nova/Bernese, entra na prévia pelo valor fornecido e exige confirmação da unidade/período antes da contratação.
- A **Edge Function** `solicitar-agendamento` utiliza raça, espécie, porte e pelagem na estimativa: **somente devolve o total**, sem valores unitários, e valida a raça no cadastro. O formulário recalcula ao alterar a raça.
- O **snapshot gerencial** em `producao_valores` e o rateio das etapas utilizam o mesmo critério comercial. Os registros concluídos antes da implantação não são reprecificados.
- Manejo especial possui tabela comercial de referência por grupo, mas permanece **somente informativo e sem cobrança automática**, conforme regra operacional vigente.
- O catálogo de Vacinas, Consultas e Exames foi armazenado em **`catalogo_veterinario`**, restrito ao Administrador e com edição dos valores. **Não entra no agendamento público ou na fila operacional de banho/tosa** até definição formal desse processo.
- RLS: novas tabelas financeiras protegidas por vínculo em `app_admins`; Operacional sem preços e sem acesso à manutenção. A função pública usa credencial de serviço apenas no servidor, retornando somente a estimativa agregada.
- A retenção de sete dias e a governança de auditoria não foram alteradas.
- Migração: `supabase/migrations/023_precificacao_por_raca_porte_felinos.sql`. Código: `tabelas-v24.js`, `tabelas-v24.css`, `agendamento.js`, `supabase/functions/solicitar-agendamento/index.ts`.

### Cenários de homologação V2.4
1. SRD P + banho curto = R$70; SRD M + banho longo = R$100; SRD G + banho e tosa máquina longo = R$135.
2. Golden Retriever porte M + banho = R$130 (não R$80/90/100); Border Collie porte P + banho = R$120 (não R$70).
3. Felino + banho e tosa máquina = R$110 independente do porte.
4. Grupo São Bernardo + banho R$180 e Desembolo R$120 = estimativa R$300; Hotelzinho acrescenta R$70 por seleção, com confirmação necessária da unidade/período.
5. Ausência de tosa na máquina na tabela do grupo Pastor Alemão/Border Collie deve resultar em valor sob consulta, **sem fallback por porte**.
6. Conferir que o valor gravado na conclusão corresponde à tabela vigente e não é regravado ao editar tabela posteriormente.
7. Operacional não recebe preço por atividade ou no telão; as permissões de acesso financeiro só permitem Administrador.

## V2.3.1 — Agendamentos de segunda a sábado (26/11/2026)

- A janela de solicitação pública continua **de amanhã (D+1) até D+30 em dias corridos**. O calendário oculta os domingos sem ampliar a janela até 30 dias úteis.
- O formulário público rejeita datas de domingo mesmo que o campo oculto seja alterado manualmente.
- A Edge Function `solicitar-agendamento` impede novos domingos **antes de consumir a cota de solicitações**.
- Um trigger de banco bloqueia `INSERT` ou alteração de `data_desejada` para domingo, inclusive por chamadas diretas.
- O calendário administrativo também omite os domingos dentro da janela. Os pedidos anteriores aprovados para domingo são preservados e destacados como exceção para decisão humana, sem cancelamento automático.
- A impressão das programações preexistentes continua disponível, inclusive para conferir e tratar eventuais domingos anteriores à regra.
- Nenhuma alteração no fluxo operacional, cadastro, preço, perfis, fotos, transporte ou retenção.

## V2.3.0 — Produção por atividade, múltiplos prestadores e auditoria

### Novo fluxo
- **Entrada:** um serviço comercial composto de Banho + Tosa gera duas atividades; adicionais contratados geram atividades próprias. A equipe pode indicar um ou mais profissionais **previstos** por atividade (opcional). Nos agendamentos aprovados, essa indicação também está disponível no check-in do dia.
- **Prestador:** cada atividade pode ser iniciada por um ou vários profissionais. A finalização obriga a confirmar os **executores reais**; o mesmo profissional pode realizar todas ou somente parte das atividades. O animal só muda para `concluido` quando todas as atividades terminam.
- **Telão:** mostra atividades individuais pendentes e em execução, nomes dos responsáveis e fotografia quando existente, **sem valores**.
- **Administrador → Produção & Valores:** rankings por atividades e profissionais, valores estimados de referência e detalhamento por atividade/executor sem contar um pacote duas vezes. Filtragem por data, serviço, profissional e cobertura comercial.
- **Administrador → Conferência de fichas:** seleciona a data, imprime as fichas, confere o encerramento e pode corrigir executores, horários ou participação do serviço, mediante justificativa. Correções reabrem a ficha para nova conferência e são auditadas.
- **Rateio:** por padrão 50/50 entre Banho e Tosa no pacote. Para atividade com múltiplos executores, divisão igualitária (100% da atividade no total), ajustável pelo Administrador. Centavos residuais são conciliados para não duplicar o valor total.
- **Preço:** o valor comercial do serviço contratado continua no snapshot de `producao_valores` criado no encerramento. `etapa_valores` contém o valor associado à atividade; `etapa_rateios` associa a parcela aos executores. Estimativas parciais e preços sob consulta não são faturamento recebido.
- **Legado:** atendimentos anteriores à migração permanecem no fluxo antigo, sem atribuição retroativa de executores. Apenas entradas novas (manuais ou aprovadas pelo calendário) têm atividades V2.3 automaticamente.
- **Segurança:** tabelas operacionais sem valores acessíveis aos perfis Administrador/Operacional; `etapa_valores`, `etapa_rateios`, `fichas_conferencia` e `etapa_auditoria` apenas visíveis ao Administrador por RLS. Edição exclusivamente por RPCs com autorização verificada no banco.
- **Retenção:** vínculo `ON DELETE CASCADE` com `atendimentos` para que a exclusão após 7 dias alcance atividades, valores e auditoria. Conservar fichas impressas/exportadas antes da retenção.
- **Auditoria:** histórico de alterações com antes/depois e justificativa, impedindo UPDATE e escrita direta; ao corrigir pesos, são preservados snapshots de todas as etapas. O login Operacional compartilhado não comprova a identidade física de quem operou o clique; apenas os profissionais declarados.
- **Limite conhecido:** por enquanto a decomposição automática considera nomes contendo “Banho” e “Tosa” e os adicionais selecionados. Serviços futuros que exigirem decomposições diferentes precisam de revisão da regra; esta versão não inclui um configurador geral de etapas de catálogo.

### Homologação recomendada
1. Cadastrar cão P com **Banho com Tosa na Máquina** e um adicional, indicando Rosana para Banho, Ariana para Tosa e Eduarda para o adicional.
2. Prestador: verificar três atividades; iniciar separadamente, alternar o executor real no momento da conclusão e finalizar cada uma. Validar que o atendimento não encerra antes da última atividade.
3. Telão: verificar nomes e status de cada atividade, sem qualquer valor.
4. Administrador: verificar valores do pacote, rateio por atividade e por prestador, conferir a ficha e realizar uma correção justificada. Confirmar o evento de auditoria e a reabertura da conferência.
5. Perfil Operacional: confirmar que as tabelas financeiras não ficam acessíveis.
6. Testar entrada de agendamento aprovado no dia e preservação do fluxo anterior nos atendimentos antigos.

### Migrações V2.3
- `013_etapas_v23_operacao.sql`: atividades, participantes, fluxo e controles de acesso.
- `014_etapas_v23_financeiro_auditoria.sql`: snapshot de rateio, correção, conferência e auditoria.
- `015_etapas_v23_compatibilidade.sql`: compatibilidade dos estados com múltiplos executores.
- `016_etapas_v23_rateios_concorrencia.sql`: bloqueio concorrente do último serviço e preservação de percentuais manuais.
- `017_etapas_v23_tempo_consolidado.sql`: correção de tempos agregados.
- `018_etapas_v23_validacao_tempos.sql`: validação de horários da ficha.
- `019_etapas_v23_retencao.sql`: cascata da auditoria pela retenção.
- `020_etapas_v23_realtime.sql`: alterações operacionais em tempo real.
- `021_etapas_v23_auditoria_pacote.sql`: auditoria de todo o pacote.

## V2.2.0 — Produção e valores gerenciais (Administrador)

**Objetivo:** medir produção estimada, produtividade por profissional, mix de serviços, adicionais e eficiência de atendimento. O painel é exclusivamente administrativo; **não representa faturamento realizado, cobrança ou lucro**.

### Métricas e critérios

- Filtros por **hoje**, **últimos 7 dias** e **período personalizado de até 7 dias**, profissional, serviço e cobertura da precificação.
- KPIs: valor estimado dos atendimentos com preço fechado, total concluído, ticket médio estimado, cobertura de precificação, tempo médio de execução, espera média, subtotal parcial separado e quantidade sem preço integral.
- Rankings: **valor estimado associado ao profissional** (somente atendimentos completamente precificados), volume concluído por profissional, serviços mais executados, valor estimado por serviço principal, adicionais mais selecionados e tempo médio de execução por profissional.
- Evolução diária com rótulos de quantidades e valores. Tabela detalhada de auditoria e exportação **CSV** com os filtros aplicados.
- **Métrica de valor:** snapshot em `public.producao_valores` criado **no momento da conclusão** e mantido imutável quando o Administrador altera preços posteriores.
- **Preço completo**: tabela base aplicável e todos os adicionais com valores fixos, sem transporte sob consulta.
- **Parcial**: preço base existe, mas há valor "a partir de", serviço adicional sob consulta ou transporte a confirmar. Subtotal conhecido mostrado separadamente e **não entra no ranking de valores fechados**.
- **Sem tabela**: combinação sem preço aplicável (por exemplo M/G, gatos e raças especiais não classificadas). **Sem dados**: espécie, porte ou pelagem não informados.
- **Dados históricos:** concluídos anteriores à implantação recebem origem `retroativo`. Dados de porte/pelagem ausentes permanecem sem valor monetário atribuído; não há inferência retrospectiva. O controle financeiro está sujeito à retenção do atendimento: exclusão após 7 dias remove também o snapshot pelo relacionamento `ON DELETE CASCADE`.
- **Não há recebimentos cadastrados:** em nenhuma parte deve ser usado o nome "receita recebida", "faturamento realizado" ou "lucro" para estes totais.
- **Manejo**: informativo, sem cobrança inferida. Não extrapolar preços P para M/G, gatos ou raças especiais.
- **Entrada manual:** porte e pelagem obrigatórios para permitir precificação de futuros registros; histórico preservado.
- **Segurança:** tabela `producao_valores` protegida por RLS, leitura somente para `app_admins` e gravação automatizada via trigger privado. Nenhuma coluna de dinheiro foi adicionada a `atendimentos`, que é compartilhada com o Operacional. Perfis Operacionais não podem consultar a tabela financeira.
- **Migração:** `supabase/migrations/012_producao_valores_admin.sql`.
- **Arquivos:** `producao-admin.js`, `producao-v22.css`, `index.html` e `app.js`.

## Correção de permissão de entrada — 26/11/2026

- **Incidente:** `permission denied for table atendimentos` ao registrar animal.
- **Causa:** `authenticated` não possuía `INSERT` na tabela, apesar das políticas RLS permitirem Administrador e Operacional.
- **Correção:** concedido `INSERT` para `authenticated` e removidas as permissões de `anon` da tabela. As políticas RLS de `app_admins` e `app_operadores` foram preservadas.
- **Testes:** inserção simulada pelas duas contas Administrador e pelo Operacional passou; conta sem vínculo e inclusão indevida diretamente em execução foram bloqueadas. Todos os testes transacionais foram revertidos, sem dados fictícios.
- **Arquivo de referência:** `supabase/migrations/011_fix_registro_pet_permissoes.sql`. Ajuste da base já aplicado no Supabase.

## V2.1.1 — Escopo de aplicação da tabela recebida (26/11/2026)

- **Única classe com valores comprovados:** P = **cães com peso até 10 kg**. A tabela recebida de quatro serviços × três pelagens (12 valores) já estava vinculada à espécie `cachorro` e ao porte `pequeno`.
- **Serviços adicionais:** a tabela entregue de hidratação, tosa geral sem banho, antipulgas, desembolo, escovação dental e TaxiDog também é **exclusiva de cães P até 10 kg**. Este escopo agora é persistido na coluna `precos_adicionais.faixa_aplicacao` e conferido no cálculo server-side.
- **M/G, gatos e raças especiais:** permanecem com valores **sob consulta**, sem extrapolação da tabela P, até receber as tabelas próprias. Raças especiais ainda não têm lista de enquadramento definida; não classificá-las automaticamente.
- **Futuro:** ao receber as tabelas M/G e especiais, ampliar a modelagem de categorias e os cadastros correspondentes antes de liberar os novos preços.
- **Gestão e operação:** valores somente no Administrador; o Prestador e o Telão continuam sem valores financeiros. O tutor vê apenas a estimativa agregada sujeita à confirmação.
- **Implementação:** migração `supabase/migrations/010_porte_p_ate_10kg.sql`, Edge Function `solicitar-agendamento` com bloqueio de reutilização de adicionais P em outras categorias.

## V2.0 — Raça, espécie e transporte por solicitação

- **Agendamento público**: espécie obrigatória (Cachorro ou Gato); para cães, raça escolhida no catálogo; para gatos, **Gato/Felino** automático; porte e serviço continuam obrigatórios.
- **Transporte**: resposta obrigatória. **Sim** abre endereço para coleta (CEP com ViaCEP, rua, número, complemento, bairro, cidade, UF); **Não** avisa que o transporte é por conta do tutor, não pede e não armazena endereço.
- **Base**: tabela `catalogo_racas` contém 71 raças caninas fornecidas pelo cliente mais `Gato/Felino`. Os dados históricos permanecem com espécie/raça/transporte **não informados**, sem inferências ou sobrescritas.
- **Agendamento e recepção**: pedidos aprovados continuam pré-cadastrados; a RPC `listar_programacao_entrada_v2` retorna raça/espécie/transporte e preserva a RPC anterior; no dia, ao dar entrada, a transação copia os campos para `atendimentos` sem modificar a ordem da fila.
- **Operação**: Entrada, Prestador, Telão, calendário administrativo e ficha de impressão mostram raça; os atendimentos que solicitaram transporte são identificados.
- **Gestão**: relatório diário com espécie, raça e transporte, gráficos de atendimentos por espécie/raça e indicador de solicitações de transporte; não representa coletas realizadas.
- **Segurança**: catálogo de raças sob RLS (leitura apenas por contas autorizadas); API pública consulta a lista via Edge Function e valida raça/espécie/endereçamento no servidor. Sem chaves privadas no navegador.
- **Migração**: `supabase/migrations/008_especie_raca_transporte.sql`. Edge Function `supabase/functions/solicitar-agendamento/index.ts`.
- **Compatibilidade**: solicitações existentes e relatórios anteriores não perdem dados; o endereço histórico permanece quando o transporte ainda não estava sendo registrado.

# Painel Bolhas & Latidos

MVP web para controle operacional de banho e tosa: entrada, fila de espera, execução, telão, administração e indicadores, sem informações financeiras.

## Estado de implantação (25/11/2026)
- Supabase Bolhas e Latidos conectado: projeto `owvbaruywsmiiduqlrbj`.
- Migração inicial aplicada: tabelas, catálogo, RLS, Storage e RPCs.
- Administrador autorizado em `app_admins`. Separação V1.4 aplicada em `supabase/migrations/002_papeis_admin_operacional.sql`.
- `config.js` configurado com URL e chave **publicável** do projeto.
- GitHub Pages deve utilizar **GitHub Actions**; workflow próprio em `.github/workflows/pages.yml`.
- **Pendente:** adicionar `assets/Logo.jpeg` enviado pelo cliente; arquivo ainda não existe no GitHub.
- **Pendente:** concluir e testar agendamento seguro da limpeza automática e validar funcionamento ponta a ponta.
- Publicação GitHub Pages validada e homologação básica do fluxo Entrada → Prestador → Telão → Gerencial concluída.
- Conta operacional única criada e vinculada à tabela `app_operadores` (separada do administrador).

## V1.8 — Experiência visual, gerenciamento e créditos
- Login centralizado com logomarca, título e formulário equilibrados.
- Versão 1.8.0 e crédito **Desenvolvido por SUMMIT ADVISORY TECNOLOGIA E INFORMÁTICA LTDA** no login, rodapé do sistema, formulário público, telão em tela cheia e ficha impressa.
- Visão gerencial: entradas registradas, espera média entre serviços iniciados, equipe em atividade, agendamentos que deram entrada, curva de entradas/conclusões em 7 dias e leitura operacional dos dados reais.
- Prestador: seletor acessível personalizado com sigla destacada do nome e navegação por teclado, mantendo o identificador do profissional enviado à RPC existente.
- Telão: cartões horizontais compactos, foto íntegra à esquerda, informação em negrito e maior densidade por coluna, também na tela cheia.
- Hovers, transições discretas, estados de foco e suporte a movimento reduzido. Sem alteração de schema ou políticas RLS.

## V1.9.0 — Faróis de situação e estados acessíveis

- Aguardando / pendente / fila de espera → **amarelo**, situação que requer acompanhamento.
- Em execução / aprovado / programado / conexão ativa → **verde**, operação ativa ou confirmação.
- Recusado / cancelado / falha de conexão → **vermelho**, exceção operacional.
- Concluído / desativado / sem dados / sem avaliação → **cinza**, estado encerrado ou neutro.
- Etiquetas sempre contêm um texto e um ponto indicador, evitando comunicação por cor isolada.
- Na visão Administrador, métricas recebem faróis coerentes com seu significado, sem metas nem limiares inventados; indicadores zerados permanecem neutros.
- Relatório diário recebe badges com o estado por atendimento.
- Prestador e Telão têm borda lateral, tag textual e contadores com farol; o layout horizontal e a foto completa permanecem.
- Agenda e entrada pré-cadastrada sinalizam pendente, aprovado/programado e recusado; calendário utiliza as mesmas quatro cores.
- Conectividade informa conexão (verde), reconexão (amarelo) e falha (vermelho).
- Visual centralizado na folha `farol-v19.css`; sem modificação do banco, da autorização por perfil ou das regras de atendimento e agendamento.

## Tecnologias
- HTML, CSS e JavaScript sem build.
- Supabase Auth, Postgres, Realtime e Storage.
- Hospedagem estática no GitHub Pages.

## Primeira configuração
1. Execute o SQL de `supabase/migrations/001_painel_bolhas.sql` no **projeto Supabase Bolhas e Latidos** (não use outro projeto).
2. Crie um usuário administrador em Supabase Authentication > Users.
3. Cadastre o UID no SQL Editor: `insert into public.app_admins (user_id) values ('UUID_DO_USUARIO');`
4. Copie `config.example.js` para `config.js` e preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY. A chave publishable é pública; **nunca** coloque service_role/secret key no repositório.
5. Faça commit de `config.js` somente com a URL e a chave publicável. Ative GitHub Pages no branch `main`, pasta `/ (root)`.
6. Coloque a arte **original** do cliente em `assets/Logo.jpeg` (PNG transparente recomendado). Até essa etapa, o sistema exibe o nome da marca como fallback e cores provisórias.
7. Teste com o administrador autorizado: login, criação, captura de foto, início, finalização, atualização em outra aba e relatório.

## Acesso por perfil (V1.4)
- **Administrador:** usuário vinculado a `public.app_admins`, visualiza todas as telas e gerencia cadastros.
- **Operacional:** usuário único vinculado a `public.app_operadores`, visualiza somente Entrada, Prestador e Telão. Pode inserir atendimentos, carregar fotos e iniciar/finalizar serviços.
- O sistema não libera a conta apenas por ter um login válido no Supabase: é obrigatório pertencer a um dos perfis.
- Para cadastrar a conta operacional, crie uma nova conta em Supabase Authentication > Users, com e-mail distinto do administrador e senha forte; em seguida vincule o UID na tabela `app_operadores`.
- A tabela `app_operadores` permite no máximo **um usuário** por vez; não compartilhe a senha do administrador com os colaboradores.

## Agendamento público e calendário (V1.5)

**Link público para tutores:** https://decolb.github.io/painel-bolhas-e-latidos/agendamento.html

- Sem login: tutor, pet, porte, serviço cadastrado ativo, data D+1 até D+30, CEP com ViaCEP, rua, número, complemento, bairro, cidade e UF.
- O tutor recebe a confirmação **da solicitação** na tela, não a confirmação da reserva. Sem contato telefônico/e-mail no formulário (conforme escopo), a resposta posterior precisa ser organizada pela equipe fora do sistema.
- Endpoint `solicitar-agendamento`: GET retorna apenas serviços ativos; POST recebe pedido pendente com validação de dados, limite básico por origem/IP e sem exposição da service role.
- Administração: guia Calendário apresenta os 30 dias permitidos, com ícones de pedidos pendentes e aprovados. Aprovar grava o vínculo em `programacao` em transação atômica; recusar exclui a solicitação.
- Programar não equivale a registrar chegada: entrada presencial continua obrigatória para passar à fila operacional.
- Apenas a conta de administrador pode ler nomes e endereços dos tutores; usuário operacional e público não têm acesso aos dados de agendamentos.
- Retenção: solicitações futuras são conservadas até a data prevista e por mais 7 dias; pedido recusado é excluído imediatamente; `pg_cron` executa a limpeza diariamente às 00:10 de Brasília (03:10 UTC). Isso é uma exceção necessária à janela de 30 dias.
- **Limite de segurança:** o anti-spam atual é básico e não substitui CAPTCHA/Turnstile para grande exposição pública.
- Edge Function e migrações: `supabase/migrations/003_agendamentos_publicos.sql`, `supabase/migrations/004_limpeza_agendamentos_cron.sql` e `supabase/functions/solicitar-agendamento/index.ts`.

## V1.6 — Pré-entrada da programação aprovada e ficha diária

- **Solicitação aprovada:** aparece em Administração → Calendário e como **pré-cadastro** na Entrada. Não aparece no Prestador/Telão antes do registro de entrada.
- **Prévia futura:** a equipe escolhe a data em Entrada, de hoje até D+30, e visualiza pet, tutor, porte, serviço e endereço. Não pode movimentar agendamentos de dias futuros.
- **No dia programado:** funcionário autorizado clica em **Dar entrada**. A RPC cria um único atendimento `aguardando`, vincula a solicitação, copia todos os campos solicitados e registra a decisão. Não atribui automaticamente um prestador.
- **Recusa na data:** somente se a programação estiver `programado`. Justificativas obrigatórias: `tutor_cancelou`, `nao_compareceu`, `coleta_nao_realizada`, `outro`. Para `outro`, texto entre 1 e 200 caracteres. Recusas ficam disponíveis na programação para acompanhamento e impressão, sem criar atendimento.
- **Dois tipos distintos de recusa:** recusa de solicitação pendente pelo administrador elimina a solicitação; recusa operacional de programação já aprovada registra motivo, responsável e horário.
- **Impressão:** Administração → Calendário → escolher data de hoje até D+30 → **Imprimir programação do dia**. A ficha A4 contém pet, tutor, porte, serviço, endereço, estado da entrada e justificativa quando houver. Nunca inclui valores financeiros.
- **Segurança:** RLS conserva os pedidos pendentes exclusivos do administrador; uma RPC aprovada para administrador/operacional expõe apenas a programação já aprovada dentro da janela de hoje a D+30. Mutação somente por RPCs transacionais autenticadas com bloqueio de linha.
- **Retenção:** `atendimentos.agendamento_id` aponta à solicitação aprovada. Exclusões da política de sete dias removem o vínculo sem causar erro em `programacao`; a programação é apagada na rotina própria após a data+7.
- SQL: `supabase/migrations/006_checkin_programacao_e_recusa.sql` e `supabase/migrations/007_ajuste_fk_retencao_programacao.sql`.
- Testes: RPC de prévia operacional do agendamento real de 28/11, check-in e recusa sob transação revertida, bloqueio de check-in futuro, recusa com Outro, prevenção de check-in duplo e exclusão de atendimento após retenção.
- **Pendente:** confirmar a experiência no navegador e a impressão em A4 nos dispositivos reais; entrada e recusa do agendamento de 28/11 só poderão ser acionadas em 28/11 (horário de Brasília).

## Retenção de 7 dias
A função `supabase/functions/retencao-7-dias/index.ts` implementa remoção de fotos e dados antigos; **não entra em funcionamento automaticamente só pelo commit**. Para ativar, implante a função, configure `CRON_SECRET` via secrets do Supabase, e agende uma chamada autenticada no Supabase Cron (por exemplo 03:10 UTC = 00:10 em Brasília). O SQL `supabase/retencao-cron-exemplo.sql` contém o exemplo, com segredos no Vault. Após publicar, execute uma chamada de teste controlada, verifique logs e confirme eliminação na Storage + banco. Registros ainda aguardando ou em execução ficam preservados até a conclusão; são exceções documentadas da regra de limpeza.

## Segurança
- Apenas usuários em `app_admins` (administrador) ou em `app_operadores` (operacional) têm acesso, com políticas RLS diferentes.
- Usuário operacional compartilhado: os colaboradores utilizam um único acesso comum, mas não são individualmente autenticados; a identificação do executor depende da seleção feita no atendimento.
- Cada dispositivo precisa iniciar sessão; login feito em um aparelho não autoriza automaticamente outro. Não habilite acesso anônimo ao telão.
- Usuários operacionais não têm permissão para alterar os cadastros; as transições são feitas por funções controladas.
- Bucket de fotos privado, exibição por URL assinada e RLS em todas as tabelas.
- Para bloquear um aparelho, encerre sua sessão; a revogação instantânea em aparelhos diferentes exige um mecanismo de sessão gerenciada, não disponível neste MVP.

## Nota de escopo
Espécie e lote foram citados como possibilidades, mas não estão no formulário definitivo. Permanecem pendentes de validação.
