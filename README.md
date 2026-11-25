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
