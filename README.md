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
- **Pendente:** criação e associação da conta única operacional no Supabase Auth.

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
