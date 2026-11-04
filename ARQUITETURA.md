# Planner Escolar Familiar — Arquitetura (v2.1.0)

Site estático (GitHub Pages) + Supabase (Auth, banco, função `dynamic-service` para IA).
Sem build: os scripts são carregados em ordem pelo `index.html`; tudo é global, por isso
o estado fica no objeto único `S` (`js/01-base.js`) e os nomes de função não se repetem.

## Onde fica cada coisa

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura das telas, modais e ordem dos scripts |
| `css/estilos.css` | Todo o visual (inclui estilos de planners, banner e usuários no fim) |
| `js/00-config.js` | Versão (`APP_VERSION`), chaves públicas do Supabase, rótulos de papéis, lista de abas |
| `js/01-base.js` | Utilidades (datas, `esc`, `toast`), estado `S`, cliente Supabase, `canEdit()` / `canManage()` |
| `js/02-planners.js` | Planners do usuário: carregar, seletor, banner, aplicar permissões na tela, criar planner |
| `js/03-registros.js` | Provas do planner atual: semana, agenda, lista, cadastro, edição, exclusão |
| `js/04-importar.js` | Importação por IA (PDF/foto) e backup JSON |
| `js/05-usuarios.js` | Aba Usuários: membros, convites, pausar/remover, renomear/excluir planner, visão geral do admin geral |
| `js/06-auth.js` | Login, cadastro, recuperar senha, `enterApp` (perfil, papel, planners) |
| `js/07-iniciar.js` | Abas (`setTab`), ligação dos botões e inicialização |
| `sw.js` | PWA/cache. Lista de arquivos e `planner-escolar-vX.Y.Z` precisam acompanhar a versão |
| `schema_v2.sql` | Tabelas, funções (RPC) e políticas de segurança (v2.0.0) |
| `schema_v2_1.sql` | Função `sp_all_users` (lista de todos os usuários, só administrador geral) |
| `scripts/verificar.py` | Revisão estática antes de publicar: `python3 scripts/verificar.py` |

## Modelo de acesso

- **Planner**: `school_planners` (`kind` = `marista` ou `generico`). Só existe um Marista.
- **Membros**: `school_planner_members` (`role` = `leitor`, `editor` ou `admin`; `active` permite pausar sem remover).
- **Convites**: `school_planner_invites` (por e-mail; aceitos no cadastro/primeiro login).
- **Administrador geral**: `school_app_admins`. Acesso total a todos os planners e gerencia os membros de todos.
- **Provas**: `school_planner_items.planner_id`. A leitura/escrita é decidida no banco (RLS) por `sp_role(planner_id)`.
- Escrita em planners/membros/convites só por funções `sp_*` (security definer); as tabelas não têm acesso direto.
- Administrador geral: a aba Usuários lista **todos os usuários cadastrados** (`sp_all_users`) com um seletor Sem acesso / Leitor / Editor por pessoa; admins de planner genérico continuam convidando por e-mail (não veem a lista de todos, por privacidade).
- No Marista só o administrador geral gerencia membros e o papel `admin` não é oferecido. Em planner genérico o dono (admin) gerencia, e o sistema impede ficar sem admin ativo.

## Regras de manutenção

1. Antes de publicar: `python3 scripts/verificar.py` (sintaxe, funções duplicadas, IDs, service worker, versão).
2. Ao mudar a versão: `APP_VERSION` em `js/00-config.js` **e** `CACHE` em `sw.js` (o script confere).
3. Arquivo novo em `js/`: incluir no `index.html` e na lista `F` do `sw.js`.
4. Nunca montar HTML com texto do usuário sem `esc()`.
5. Mudança no banco: sempre por SQL versionado (`schema_vX.sql`), revisado antes de rodar.

## Histórico
- **v2.1.0**: aba Usuários do administrador geral lista todos os usuários cadastrados com seletor de permissão (sem digitar e-mail). E-mail continua para quem ainda não tem conta.
- **v2.0.0**: planners (Marista e genéricos), permissões por usuário, convites, RLS, código separado em css/ e js/.
