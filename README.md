# Painel Bolhas & Latidos

MVP web para controle operacional de banho e tosa: entrada, fila de espera, execução, telão, administração e indicadores, sem informações financeiras.

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

## Retenção de 7 dias
A função `supabase/functions/retencao-7-dias/index.ts` implementa remoção de fotos e dados antigos; **não entra em funcionamento automaticamente só pelo commit**. Para ativar, implante a função, configure `CRON_SECRET` via secrets do Supabase, e agende uma chamada autenticada no Supabase Cron (por exemplo 03:10 UTC = 00:10 em Brasília). O SQL `supabase/retencao-cron-exemplo.sql` contém o exemplo, com segredos no Vault. Após publicar, execute uma chamada de teste controlada, verifique logs e confirme eliminação na Storage + banco. Registros ainda aguardando ou em execução ficam preservados até a conclusão; são exceções documentadas da regra de limpeza.

## Segurança
- Apenas administradores presentes em `public.app_admins` têm acesso aos dados.
- As demais telas não exigem contas de colaborador: usam a sessão administrativa no mesmo navegador/origem.
- Se precisar abrir em equipamentos separados, cada aparelho precisará de uma sessão liberada pelo administrador; *um login remoto não desbloqueia automaticamente outros navegadores*. Não publique links anônimos de acesso ao telão.
- Bucket de fotos privado, exibição por URL assinada e RLS em todas as tabelas.
- Para bloquear um aparelho, encerre sua sessão; a revogação instantânea em aparelhos diferentes exige um mecanismo de sessão gerenciada, não disponível neste MVP.

## Nota de escopo
Espécie e lote foram citados como possibilidades, mas não estão no formulário definitivo. Permanecem pendentes de validação.
