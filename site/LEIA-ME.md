# Site MURILO ROQUE PRO

Site de desenvolvedor Python + área do cliente com cadastro e login. Funciona como aplicativo instalável (PWA) no iPhone, iPad, Android e computador.

## O que tem aqui

| Arquivo | O que é |
|---|---|
| `index.html` | Site (serviços, exemplo de automação, GLX PRO Account, processo, contato) |
| `acesso.html` | Entrar, criar conta (com código no e-mail) e recuperar senha |
| `painel.html` | Área do cliente: início, projetos, faturas, suporte, arquivos e conta |
| `manifest.webmanifest` + `sw.js` | Transformam o site em app instalável e mais rápido |
| `assets/js/config.js` | E-mail e WhatsApp de contato. Os campos da AWS são preenchidos sozinhos na publicação |

A infraestrutura (AWS) fica na pasta `../aws`. Para publicar, siga **`../aws/PUBLICAR-NA-AWS.md`**.

## Testar no computador

Na pasta do site, rode `python -m http.server 8000` e abra http://localhost:8000.
Localmente o site roda em modo demonstração: as contas e os dados de exemplo ficam só no navegador.

## Antes de publicar, troque

- WhatsApp e e-mail no `index.html` (seção Contato) e em `assets/js/config.js`.
- Texto dos termos de uso em `acesso.html`.
- Os números de exemplo da tela do GLX PRO Account, se quiser.
