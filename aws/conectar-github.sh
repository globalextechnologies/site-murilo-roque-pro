#!/usr/bin/env bash
# =====================================================================
#  Conecta o GitHub à sua conta AWS para publicar o site sozinho.
#  Rode UMA VEZ no AWS CloudShell:   bash conectar-github.sh
#
#  O que ele cria (sem senha nem chave guardada em lugar nenhum):
#   - o "provedor OIDC" do GitHub na sua conta (se ainda não existir);
#   - a permissão (IAM role) "mrpro-github-publicar", que SÓ aceita a branch
#     main do repositório abaixo e SÓ mexe nos recursos do site (nomes mrpro-*).
# =====================================================================
set -euo pipefail

REPO="${REPO:-globalextechnologies/site-murilo-roque-pro}"
ROLE="mrpro-github-publicar"
CONTA="$(aws sts get-caller-identity --query Account --output text)"
PROVEDOR="arn:aws:iam::${CONTA}:oidc-provider/token.actions.githubusercontent.com"

echo "Conta AWS: $CONTA"
echo "Repositório: $REPO"
echo

# 1) Provedor OIDC do GitHub
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVEDOR" >/dev/null 2>&1; then
  echo "Provedor do GitHub já existe na conta."
else
  aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
  echo "Provedor do GitHub criado."
fi

# 2) Quem pode usar a permissão: só a branch main deste repositório
CONFIANCA=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "$PROVEDOR" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike": { "token.actions.githubusercontent.com:sub": "repo:${REPO}:ref:refs/heads/main" }
    }
  }]
}
JSON
)

# 3) O que a permissão pode fazer: só o necessário para o site
POLITICA=$(cat <<JSON
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Pilhas", "Effect": "Allow", "Action": "cloudformation:*", "Resource": "*" },
    { "Sid": "SiteEDominio", "Effect": "Allow",
      "Action": ["cloudfront:*", "acm:*", "route53:*", "cognito-idp:*", "apigateway:*"], "Resource": "*" },
    { "Sid": "Buckets", "Effect": "Allow", "Action": "s3:*",
      "Resource": ["arn:aws:s3:::mrpro-*", "arn:aws:s3:::mrpro-*/*",
                   "arn:aws:s3:::aws-sam-cli-managed-default-*", "arn:aws:s3:::aws-sam-cli-managed-default-*/*"] },
    { "Sid": "Banco", "Effect": "Allow", "Action": "dynamodb:*",
      "Resource": ["arn:aws:dynamodb:*:${CONTA}:table/mrpro-*", "arn:aws:dynamodb:*:${CONTA}:table/mrpro-*/*"] },
    { "Sid": "Funcao", "Effect": "Allow", "Action": "lambda:*",
      "Resource": "arn:aws:lambda:*:${CONTA}:function:mrpro-*" },
    { "Sid": "Logs", "Effect": "Allow", "Action": "logs:*",
      "Resource": ["arn:aws:logs:*:${CONTA}:log-group:/aws/lambda/mrpro-*", "arn:aws:logs:*:${CONTA}:log-group:/aws/lambda/mrpro-*:*"] },
    { "Sid": "LogsListar", "Effect": "Allow", "Action": "logs:DescribeLogGroups", "Resource": "*" },
    { "Sid": "PapeisDoSite", "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:PassRole", "iam:TagRole", "iam:UntagRole",
                 "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
                 "iam:GetRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies", "iam:UpdateAssumeRolePolicy"],
      "Resource": "arn:aws:iam::${CONTA}:role/mrpro-*" }
  ]
}
JSON
)

if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document "$CONFIANCA"
  echo "Permissão $ROLE atualizada."
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document "$CONFIANCA" \
    --description "GitHub Actions publica o site muriloroque.pro" --max-session-duration 3600 \
    --tags Key=projeto,Value=muriloroque-pro >/dev/null
  echo "Permissão $ROLE criada."
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name publicar-site --policy-document "$POLITICA"

ARN="arn:aws:iam::${CONTA}:role/${ROLE}"
echo
printf '\033[32m%s\033[0m\n' "Pronto! Copie este código e mande para o Claude (ou cole no GitHub):"
echo
echo "    $ARN"
echo
echo "No GitHub: repositório > Settings > Secrets and variables > Actions > aba Variables >"
echo "New repository variable  ->  Nome: AWS_ROLE_ARN   Valor: o código acima"
