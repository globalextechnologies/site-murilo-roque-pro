#!/usr/bin/env bash
# =====================================================================
#  Publica o site MURILO ROQUE PRO na AWS.
#  Rode no AWS CloudShell, dentro da pasta aws/:
#
#    bash deploy.sh zona       Passo 1: cria a zona DNS na AWS e mostra os 4 nameservers
#                              que você vai colocar na Hostinger
#    bash deploy.sh verificar  Confere se a Hostinger já está apontando para a AWS
#    bash deploy.sh publicar   Passo 2: cria a infraestrutura e envia o site (10 a 20 min na 1ª vez)
#    bash deploy.sh site       Só reenvia os arquivos do site (use depois de editar textos)
# =====================================================================
set -euo pipefail

DOMINIO="${DOMINIO:-muriloroque.pro}"
STACK="${STACK:-mrpro}"
export AWS_REGION="us-east-1" AWS_DEFAULT_REGION="us-east-1"   # CloudFront exige o certificado em us-east-1
AQUI="$(cd "$(dirname "$0")" && pwd)"
SITE="$AQUI/../site"

verde() { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo() { printf '\033[33m%s\033[0m\n' "$*"; }
vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
# Resumo na página da execução do GitHub Actions (quando roda lá)
resumo() { if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then printf '%s\n' "$*" >> "$GITHUB_STEP_SUMMARY"; fi; }
pilha_existe() { aws cloudformation describe-stacks --stack-name "$STACK" >/dev/null 2>&1; }

zona_id() {
  aws route53 list-hosted-zones-by-name --dns-name "$DOMINIO." \
    --query "HostedZones[?Name=='$DOMINIO.'] | [0].Id" --output text | sed 's|/hostedzone/||'
}

nameservers() {
  aws route53 get-hosted-zone --id "$1" --query 'DelegationSet.NameServers' --output text | tr '\t' '\n'
}

# Copia para a AWS os registros de e-mail que já existem hoje (MX, SPF, DKIM, DMARC),
# para o e-mail @muriloroque.pro (se houver) continuar funcionando depois da troca.
copiar_email() {
  python3 - "$DOMINIO" "$1" <<'PY'
import json, subprocess, sys, urllib.request
dominio, zona = sys.argv[1], sys.argv[2]
def consulta(nome, tipo):
    try:
        with urllib.request.urlopen(f"https://dns.google/resolve?name={nome}&type={tipo}", timeout=10) as r:
            dados = json.load(r)
        return [a for a in dados.get("Answer", []) if a.get("type") == {"MX": 15, "TXT": 16, "CNAME": 5}[tipo]]
    except Exception:
        return []
mudancas = []
def adiciona(nome, tipo, valores, ttl=3600):
    if valores:
        mudancas.append({"Action": "UPSERT", "ResourceRecordSet": {
            "Name": nome, "Type": tipo, "TTL": ttl, "ResourceRecords": [{"Value": v} for v in valores]}})
mx = [a["data"] for a in consulta(dominio, "MX")]
adiciona(dominio, "MX", mx)
def txt(v):
    v = v.strip()
    if v.startswith('"'):
        return v
    v = v.replace('"', '\\"')
    return " ".join('"' + v[i:i + 250] + '"' for i in range(0, len(v), 250))  # Route 53: até 255 por trecho
adiciona(dominio, "TXT", [txt(a["data"]) for a in consulta(dominio, "TXT")])
adiciona(f"_dmarc.{dominio}", "TXT", [txt(a["data"]) for a in consulta(f"_dmarc.{dominio}", "TXT")])
for sub in ["hostingermail-a._domainkey", "hostingermail-b._domainkey", "hostingermail-c._domainkey",
            "hostingermail1._domainkey", "hostingermail2._domainkey", "default._domainkey",
            "autodiscover", "autoconfig", "mail", "webmail"]:
    nome = f"{sub}.{dominio}"
    cn = consulta(nome, "CNAME")
    if cn:
        adiciona(nome, "CNAME", [cn[0]["data"]])
    elif "_domainkey" in sub:
        adiciona(nome, "TXT", [txt(a["data"]) for a in consulta(nome, "TXT")])
if not mudancas:
    print("Nenhum registro de e-mail encontrado no domínio (tudo bem se você não usa e-mail @" + dominio + ").")
    sys.exit(0)
subprocess.run(["aws", "route53", "change-resource-record-sets", "--hosted-zone-id", zona,
                "--change-batch", json.dumps({"Comment": "Registros de e-mail copiados", "Changes": mudancas})],
               check=True, stdout=subprocess.DEVNULL)
print(f"Copiei {len(mudancas)} registro(s) de e-mail para a AWS:")
for m in mudancas:
    print("  -", m["ResourceRecordSet"]["Type"], m["ResourceRecordSet"]["Name"])
if mx:
    print("O e-mail @" + dominio + " continua funcionando onde está hoje (ex.: Hostinger).")
PY
}

delegado() {
  curl -s "https://dns.google/resolve?name=$DOMINIO&type=NS" | grep -q "awsdns"
}

cmd_zona() {
  local id
  id="$(zona_id)"
  if [[ "$id" == "None" || -z "$id" ]]; then
    aws route53 create-hosted-zone --name "$DOMINIO" --caller-reference "mrpro-$(date +%s)" \
      --hosted-zone-config Comment="Site MURILO ROQUE PRO" >/dev/null
    id="$(zona_id)"
    verde "Zona DNS criada na AWS para $DOMINIO."
  else
    verde "A zona DNS de $DOMINIO já existe na AWS."
  fi
  echo
  copiar_email "$id" || amarelo "Não consegui copiar os registros de e-mail automaticamente. Confira no guia."
  echo
  verde "Agora, na Hostinger, troque os nameservers do domínio por estes 4:"
  echo
  nameservers "$id" | sed 's/^/    /'
  echo
  echo "Depois rode:  bash deploy.sh verificar   (no GitHub: ação 'verificar')"
  resumo "## Nameservers para colocar na Hostinger"
  resumo ""
  resumo "Hostinger > Domínios > $DOMINIO > DNS / Nameservers > Alterar nameservers > personalizados:"
  resumo ""
  resumo '```'
  resumo "$(nameservers "$id")"
  resumo '```'
}

cmd_verificar() {
  if delegado; then
    verde "Pronto! $DOMINIO já aponta para a AWS. Pode rodar:  bash deploy.sh publicar"
    resumo "✅ $DOMINIO já aponta para a AWS. Pode publicar."
  else
    resumo "⏳ $DOMINIO ainda não aponta para a AWS. Tente de novo em 15 minutos."
    amarelo "Ainda não. A Hostinger pode levar de alguns minutos a algumas horas para propagar."
    echo "Nameservers que o mundo vê hoje:"
    curl -s "https://dns.google/resolve?name=$DOMINIO&type=NS" | python3 -c \
      'import sys,json; [print("    "+a["data"]) for a in json.load(sys.stdin).get("Answer",[])]' || true
    echo "Tente de novo em 15 minutos:  bash deploy.sh verificar"
  fi
}

saida() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}

cmd_site() {
  local bucket dist api cliente regiao build
  if ! pilha_existe; then
    vermelho "A infraestrutura ainda não foi criada. Rode primeiro:  bash deploy.sh publicar"; exit 1
  fi
  bucket="$(saida SiteBucket)"; dist="$(saida DistribuicaoId)"; api="$(saida ApiUrl)"
  cliente="$(saida UserPoolClientId)"; regiao="$(saida Regiao)"
  build="$(mktemp -d)"
  cp -r "$SITE/." "$build/"
  rm -f "$build/LEIA-ME.md"

  # Liga o modo AWS no config.js (mantém e-mail e WhatsApp que você configurou)
  python3 - "$build/assets/js/config.js" "$regiao" "$cliente" "$api" <<'PY'
import re, sys
caminho, regiao, cliente, api = sys.argv[1:]
s = open(caminho, encoding="utf-8").read()
for campo, valor in [("modo", "aws"), ("regiao", regiao), ("userPoolClientId", cliente), ("apiUrl", api)]:
    s, n = re.subn(rf"^(\s*{campo}:\s*)'[^']*'(?=,)", lambda m: f"{m.group(1)}'{valor}'", s, count=1, flags=re.M)
    if n != 1:
        sys.exit(f"Não encontrei o campo {campo} em config.js")
open(caminho, "w", encoding="utf-8").write(s)
PY
  # Versão nova do app a cada publicação (celulares baixam a atualização)
  sed -i "s/const VERSAO = '[^']*'/const VERSAO = 'mrp-$(date +%Y%m%d%H%M%S)'/" "$build/sw.js"

  echo "Enviando arquivos do site..."
  aws s3 sync "$build" "s3://$bucket" --delete --exclude "*.png" --exclude "manifest.webmanifest" \
    --cache-control "no-cache" --only-show-errors
  aws s3 sync "$build" "s3://$bucket" --exclude "*" --include "*.png" \
    --cache-control "public, max-age=604800" --only-show-errors
  aws s3 cp "$build/manifest.webmanifest" "s3://$bucket/manifest.webmanifest" \
    --content-type "application/manifest+json" --cache-control "no-cache" --only-show-errors
  aws cloudfront create-invalidation --distribution-id "$dist" --paths "/*" >/dev/null
  rm -rf "$build"
  echo
  verde "Site publicado: https://$DOMINIO"
  echo "Endereço provisório (funciona mesmo antes do DNS): $(saida CloudFrontUrl)"
  echo "As mudanças aparecem em 1 a 3 minutos."
  resumo "## ✅ Site publicado"
  resumo ""
  resumo "- Endereço: https://$DOMINIO"
  resumo "- Endereço provisório do CloudFront: $(saida CloudFrontUrl)"
}

cmd_publicar() {
  local id
  id="$(zona_id)"
  if [[ "$id" == "None" || -z "$id" ]]; then
    if [[ "${AUTOMATICO:-0}" == "1" ]]; then
      amarelo "Zona DNS ainda não criada; publicação automática ignorada."
      resumo "⏸️ Publicação ignorada: rode a ação **zona** primeiro (Actions > Publicar site > Run workflow)."
      exit 0
    fi
    vermelho "Rode primeiro:  bash deploy.sh zona"; exit 1
  fi
  # Na primeira vez, o certificado HTTPS só sai depois que a Hostinger apontar para a AWS
  if ! pilha_existe && ! delegado && [[ "${FORCAR:-0}" != "1" ]]; then
    if [[ "${AUTOMATICO:-0}" == "1" ]]; then
      amarelo "A Hostinger ainda não aponta para a AWS; publicação automática ignorada."
      resumo "⏸️ Publicação ignorada: $DOMINIO ainda não aponta para a AWS. Troque os nameservers na Hostinger e rode a ação **publicar**."
      exit 0
    fi
    vermelho "A Hostinger ainda não aponta para a AWS, e o certificado HTTPS só é emitido depois disso."
    echo "Confira com:  bash deploy.sh verificar"
    resumo "❌ $DOMINIO ainda não aponta para a AWS. Troque os nameservers na Hostinger e tente de novo."
    exit 1
  fi
  command -v sam >/dev/null || { amarelo "Instalando o AWS SAM CLI..."; pip3 install --user -q aws-sam-cli; export PATH="$HOME/.local/bin:$PATH"; }

  echo "Criando/atualizando a infraestrutura (na 1ª vez leva de 10 a 20 minutos)..."
  sam deploy \
    --template-file "$AQUI/template.yaml" \
    --stack-name "$STACK" \
    --region us-east-1 \
    --capabilities CAPABILITY_IAM \
    --resolve-s3 \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset \
    --parameter-overrides "Dominio=$DOMINIO" "HostedZoneId=$id" \
    --tags projeto=muriloroque-pro
  echo
  cmd_site
}

case "${1:-}" in
  zona) cmd_zona ;;
  verificar) cmd_verificar ;;
  publicar) cmd_publicar ;;
  site) cmd_site ;;
  *) sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
