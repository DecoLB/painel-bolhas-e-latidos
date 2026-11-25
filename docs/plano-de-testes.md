# Critérios de aceite — MVP Bolhas & Latidos

## Pré-requisitos
- [ ] Identificar o projeto correto no Supabase, aplicar SQL, criar admin e configurar config.js.
- [ ] Inserir arquivo original assets/logo.png; confirmar paleta com a marca.
- [ ] Confirmar GitHub Pages e login via HTTPS.

## Autenticação
- [ ] Usuário não autenticado não acessa as telas.
- [ ] Usuário Auth sem cadastro em app_admins é recusado.
- [ ] Usuário administrador acessa todas as quatro telas.
- [ ] Nova aba no mesmo navegador utiliza a mesma sessão; outra máquina não recebe acesso automaticamente.
- [ ] Logout bloqueia operações após expiração/revogação da sessão.

## Entrada
- [ ] Nome do animal, serviço e agendamento são obrigatórios.
- [ ] Agendado=Sim torna horário obrigatório; Não limpa o horário.
- [ ] Tutor, observação e foto são opcionais; observação limitada a 1000 caracteres.
- [ ] Foto por anexo e captura de webcam; permissões negadas dão mensagem.
- [ ] Inserção registra horário do servidor e aparece na fila em outras abas.

## Prestador
- [ ] Fila ordenada por data/hora de entrada (mais antigo primeiro).
- [ ] Agendados exibem selo e horário sem furar a ordem.
- [ ] Sem selecionar profissional não é possível iniciar.
- [ ] Atendimento iniciado mostra profissional e sai da espera.
- [ ] Duas tentativas simultâneas de iniciar o mesmo atendimento: apenas uma vence.
- [ ] Finalização registra horário e retira da execução.

## Administração
- [ ] Serviços ativos no cadastro aparecem no formulário; inativos não aparecem.
- [ ] Profissionais ativos aparecem na atribuição; inativos não aparecem.
- [ ] Inativação não apaga registros históricos.
- [ ] Indicadores de conclusão, espera, execução e ranking conferem com registros.
- [ ] Impressão diária inclui todos os atendimentos do dia e é legível em A4.

## Telão
- [ ] Mostra as duas filas em tempo real; tela cheia disponível.
- [ ] Foto exibida apenas com sessão autenticada; fallback quando foto ausente.
- [ ] Logo original aparece no login, cabeçalho e telão.

## Retenção de dados
- [ ] Agendamento funciona sem navegador ligado.
- [ ] Após a virada diária, somente sete dias do calendário de Brasília ficam ativos para concluídos.
- [ ] Fotos privadas são excluídas no Storage antes de remover seus atendimentos.
- [ ] Registros ainda em execução ou espera são preservados como exceção.
- [ ] Logs da função e cron monitorados; falha não causa exclusão parcial silenciosa.
- [ ] Dados em backups possuem política de retenção do provedor verificada.

## Pendências conhecidas
- Confirmar se o telão e as telas operacionais serão abertos em aparelhos distintos.
- Confirmar desenho definitivo para identificação de espécie e lote.
- Confirmar se haverá indicadores consolidados preservados após sete dias.
- Criar uma experiência de edição de cadastros além da inclusão e ativação/desativação, se necessário.
