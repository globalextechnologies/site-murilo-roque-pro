"""
API da área do cliente MURILO ROQUE PRO (AWS Lambda + API Gateway HTTP API).

O API Gateway já valida o login (token do Cognito) antes de chamar esta função,
então aqui o cliente é identificado pelo "sub" do token e só enxerga os próprios dados.

Modelo no DynamoDB (tabela única):
    pk = "CLIENTE#<sub>"
    sk = "PROJETO#<id>" | "FATURA#<id>" | "CHAMADO#<id>" | "ARQUIVO#<id>"
"""
import json
import os
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

TABELA = os.environ.get("TABELA", "")
BUCKET_ARQUIVOS = os.environ.get("BUCKET_ARQUIVOS", "")

RECURSOS = {
    "projetos": ("PROJETO#", "atualizado"),
    "faturas": ("FATURA#", "vencimento"),
    "chamados": ("CHAMADO#", "criado"),
    "arquivos": ("ARQUIVO#", "data"),
}
PRIORIDADES = {"baixa", "normal", "alta", "urgente"}
BRT = timezone(timedelta(hours=-3))

_tabela = None
_s3 = None


def tabela():
    global _tabela
    if _tabela is None:
        import boto3
        _tabela = boto3.resource("dynamodb").Table(TABELA)
    return _tabela


def s3():
    global _s3
    if _s3 is None:
        import boto3
        from botocore.config import Config
        _s3 = boto3.client("s3", config=Config(signature_version="s3v4"))
    return _s3


def _limpa(valor):
    """Converte Decimal do DynamoDB em int/float para virar JSON."""
    if isinstance(valor, list):
        return [_limpa(v) for v in valor]
    if isinstance(valor, dict):
        return {k: _limpa(v) for k, v in valor.items()}
    if isinstance(valor, Decimal):
        return int(valor) if valor == valor.to_integral_value() else float(valor)
    return valor


def resposta(status, corpo):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json; charset=utf-8", "cache-control": "no-store"},
        "body": json.dumps(corpo, ensure_ascii=False),
    }


def erro(status, mensagem):
    return resposta(status, {"erro": mensagem})


def cliente_id(evento):
    try:
        return evento["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
    except (KeyError, TypeError):
        return None


def listar(sub, recurso):
    prefixo, ordem = RECURSOS[recurso]
    from boto3.dynamodb.conditions import Key

    itens, inicio = [], None
    while True:
        args = {"KeyConditionExpression": Key("pk").eq(f"CLIENTE#{sub}") & Key("sk").begins_with(prefixo)}
        if inicio:
            args["ExclusiveStartKey"] = inicio
        r = tabela().query(**args)
        itens.extend(r.get("Items", []))
        inicio = r.get("LastEvaluatedKey")
        if not inicio:
            break

    saida = []
    for item in itens:
        item = _limpa(item)
        item.pop("pk", None)
        item.pop("sk", None)
        item.pop("cliente_id", None)
        if recurso == "arquivos":
            caminho = item.pop("caminho", None)
            item["url"] = "#"
            if caminho and caminho.startswith(f"clientes/{sub}/"):
                item["url"] = s3().generate_presigned_url(
                    "get_object",
                    Params={"Bucket": BUCKET_ARQUIVOS, "Key": caminho,
                            "ResponseContentDisposition": f'attachment; filename="{os.path.basename(caminho)}"'},
                    ExpiresIn=900,
                )
        saida.append(item)

    saida.sort(key=lambda i: str(i.get(ordem, "")), reverse=True)
    return saida


def abrir_chamado(sub, corpo_bruto, base64=False):
    try:
        if base64:
            import base64 as b64
            corpo_bruto = b64.b64decode(corpo_bruto).decode("utf-8")
        dados = json.loads(corpo_bruto or "{}")
    except (ValueError, UnicodeDecodeError):
        return erro(400, "Envie os dados do chamado em JSON.")

    assunto = str(dados.get("assunto", "")).strip()[:140]
    descricao = str(dados.get("descricao", "")).strip()[:4000]
    prioridade = str(dados.get("prioridade", "normal")).strip()
    if not assunto or not descricao:
        return erro(400, "Preencha o assunto e a descrição.")
    if prioridade not in PRIORIDADES:
        prioridade = "normal"

    cid = uuid.uuid4().hex[:12]
    item = {
        "pk": f"CLIENTE#{sub}",
        "sk": f"CHAMADO#{cid}",
        "id": cid,
        "assunto": assunto,
        "descricao": descricao,
        "prioridade": prioridade,
        "status": "aberto",
        "criado": datetime.now(BRT).date().isoformat(),
        "respostas": [],
    }
    tabela().put_item(Item=item)
    publico = {k: v for k, v in item.items() if k not in ("pk", "sk")}
    return resposta(201, publico)


def handler(evento, contexto=None):
    sub = cliente_id(evento)
    if not sub:
        return erro(401, "Faça login para continuar.")

    rota = evento.get("routeKey", "")
    try:
        if rota == "POST /chamados":
            return abrir_chamado(sub, evento.get("body"), evento.get("isBase64Encoded", False))
        if rota == "GET /{recurso}":
            recurso = (evento.get("pathParameters") or {}).get("recurso", "")
            if recurso not in RECURSOS:
                return erro(404, "Recurso não encontrado.")
            return resposta(200, listar(sub, recurso))
        return erro(404, "Rota não encontrada.")
    except Exception as e:  # registra no CloudWatch sem expor detalhes ao cliente
        print(json.dumps({"erro": repr(e), "rota": rota}))
        return erro(500, "Não foi possível concluir agora. Tente de novo em instantes.")
