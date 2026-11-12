# MURILO ROQUE PRO: site e área do cliente

**Código do projeto:** WEB-0002 · **Domínio:** [muriloroque.pro](https://muriloroque.pro) · **Situação:** em lançamento

Site de desenvolvedor Python com área do cliente (cadastro, projetos, faturas, chamados e arquivos), instalável como app no iPhone, Android e tablet.

## Estrutura

```
site/                  Site estático (HTML, CSS, JS, PWA)
aws/template.yaml      Infraestrutura: S3 + CloudFront + certificado + Route 53, Cognito, API Gateway, Lambda, DynamoDB
aws/backend/app.py     API da área do cliente (Lambda em Python)
aws/admin.py           Administração: projetos, faturas, chamados e arquivos dos clientes
aws/deploy.sh          Publicação (usado pelo GitHub Actions e pelo CloudShell)
aws/conectar-github.sh Conexão GitHub → AWS (rodar uma vez)
.github/workflows/     Publicação automática a cada mudança na branch main
```

## Publicação

Toda mudança enviada para a `main` em `site/` ou `aws/` é publicada sozinha pelo GitHub Actions (2 a 3 minutos).
Para rodar uma ação à mão: **Actions → Publicar site → Run workflow** e escolha `publicar`, `site`, `zona` ou `verificar`.

Primeira configuração e uso do dia a dia: [`aws/PUBLICAR-NA-AWS.md`](aws/PUBLICAR-NA-AWS.md).

## Rodar no computador

```bash
cd site && python -m http.server 8000
```

Abra http://localhost:8000. Localmente a área do cliente roda em modo demonstração (dados de exemplo no navegador).

## Segurança

Não há senhas nem chaves neste repositório. O GitHub entra na AWS por OIDC, com uma permissão que só aceita a branch `main` deste repositório e só mexe nos recursos do site (`mrpro-*`). Os IDs do Cognito e o endereço da API que aparecem no site publicado são públicos por natureza.
