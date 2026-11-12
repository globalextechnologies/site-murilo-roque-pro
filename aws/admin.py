#!/usr/bin/env python3
"""
Administração da área do cliente MURILO ROQUE PRO.
Rode no AWS CloudShell (já tem Python e boto3), dentro da pasta aws/:

  python3 admin.py clientes
  python3 admin.py ver ana@empresa.com
  python3 admin.py projeto ana@empresa.com --nome "Robô de conciliação" --tipo Automação --etapa 2 --progresso 30 --previsao 2026-12-20
  python3 admin.py projeto ana@empresa.com --id ab12cd34 --etapa 3 --progresso 70 --notas "Leitura dos extratos pronta"
  python3 admin.py fatura ana@empresa.com --numero 0152 --descricao "Parcela 1 de 3" --valor 1450 --vencimento 2026-12-05 --pix "000201..."
  python3 admin.py fatura-paga ana@empresa.com --id ef56gh78
  python3 admin.py chamados                      # todos os chamados em aberto
  python3 admin.py responder ana@empresa.com --id 9a8b7c6d --texto "Resolvido, pode testar." --status resolvido
  python3 admin.py arquivo ana@empresa.com ./contrato.pdf --nome "Contrato de prestação de serviços.pdf"
  python3 admin.py remover ana@empresa.com --tipo projeto --id ab12cd34
"""
import argparse
import os
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key

STACK = os.environ.get("STACK", "mrpro")
REGIAO = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "us-east-1"))
ETAPAS = ["Conversa", "Proposta", "Desenvolvimento", "Entrega e suporte"]
AUTOR = os.environ.get("AUTOR", "Murilo Roque")
BRT = timezone(timedelta(hours=-3))
TIPOS = {"projeto": "PROJETO#", "fatura": "FATURA#", "chamado": "CHAMADO#", "arquivo": "ARQUIVO#"}


def saidas():
    cf = boto3.client("cloudformation", region_name=REGIAO)
    pilha = cf.describe_stacks(StackName=STACK)["Stacks"][0]
    return {o["OutputKey"]: o["OutputValue"] for o in pilha.get("Outputs", [])}


OUT = saidas()
cognito = boto3.client("cognito-idp", region_name=REGIAO)
tabela = boto3.resource("dynamodb", region_name=REGIAO).Table(OUT["Tabela"])
s3 = boto3.client("s3", region_name=REGIAO)


def hoje():
    return datetime.now(BRT).date().isoformat()


def atributos(u):
    return {a["Name"]: a["Value"] for a in u.get("Attributes", u.get("UserAttributes", []))}


def sub_do_email(email):
    r = cognito.list_users(UserPoolId=OUT["UserPoolId"], Filter=f'email = "{email.strip().lower()}"', Limit=1)
    if not r["Users"]:
        sys.exit(f"Nenhum cliente com o e-mail {email}. Veja a lista com: python3 admin.py clientes")
    return atributos(r["Users"][0])["sub"]


def pk(email):
    return f"CLIENTE#{sub_do_email(email)}"


def itens(chave, prefixo=""):
    cond = Key("pk").eq(chave) & Key("sk").begins_with(prefixo) if prefixo else Key("pk").eq(chave)
    saida, inicio = [], None
    while True:
        args = {"KeyConditionExpression": cond}
        if inicio:
            args["ExclusiveStartKey"] = inicio
        r = tabela.query(**args)
        saida.extend(r.get("Items", []))
        inicio = r.get("LastEvaluatedKey")
        if not inicio:
            return saida


def brl(v):
    return f"R$ {Decimal(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ---------------- comandos ----------------
def cmd_clientes(a):
    token = None
    print(f"{'E-MAIL':38} {'NOME':28} {'SITUAÇÃO':14} CRIADO")
    while True:
        args = {"UserPoolId": OUT["UserPoolId"], "Limit": 60}
        if token:
            args["PaginationToken"] = token
        r = cognito.list_users(**args)
        for u in r["Users"]:
            at = atributos(u)
            situacao = {"CONFIRMED": "ativo", "UNCONFIRMED": "sem confirmar"}.get(u["UserStatus"], u["UserStatus"].lower())
            print(f"{at.get('email', ''):38} {at.get('name', '')[:28]:28} {situacao:14} {u['UserCreateDate']:%d/%m/%Y}")
        token = r.get("PaginationToken")
        if not token:
            break


def cmd_ver(a):
    chave = pk(a.email)
    todos = itens(chave)
    if not todos:
        print("Nada cadastrado ainda para este cliente.")
    for i in sorted(todos, key=lambda x: x["sk"]):
        tipo, iid = i["sk"].split("#", 1)
        if tipo == "PROJETO":
            print(f"[projeto  {iid}] {i['nome']} | etapa {i.get('etapa')}/4 | {i.get('progresso')}% | previsão {i.get('previsao', '-')}")
        elif tipo == "FATURA":
            print(f"[fatura   {iid}] nº {i['numero']} | {brl(i['valor'])} | vence {i['vencimento']} | {i['status']}")
        elif tipo == "CHAMADO":
            print(f"[chamado  {iid}] {i['assunto']} | {i['status']} | {len(i.get('respostas', []))} resposta(s)")
        elif tipo == "ARQUIVO":
            print(f"[arquivo  {iid}] {i['nome']} | {i.get('data')}")


def cmd_projeto(a):
    chave = pk(a.email)
    if a.id:
        campos = {k: v for k, v in {
            "nome": a.nome, "tipo": a.tipo, "etapa": a.etapa, "progresso": a.progresso,
            "previsao": a.previsao, "notas": a.notas}.items() if v is not None}
        if not campos:
            sys.exit("Informe pelo menos um campo para atualizar.")
        campos["atualizado"] = hoje()
        expr = "SET " + ", ".join(f"#{k} = :{k}" for k in campos)
        tabela.update_item(
            Key={"pk": chave, "sk": f"PROJETO#{a.id}"},
            UpdateExpression=expr,
            ExpressionAttributeNames={f"#{k}": k for k in campos},
            ExpressionAttributeValues={f":{k}": v for k, v in campos.items()},
            ConditionExpression=Attr("pk").exists(),
        )
        print(f"Projeto {a.id} atualizado.")
        return
    if not a.nome:
        sys.exit("Para criar um projeto, informe --nome.")
    pid = uuid.uuid4().hex[:8]
    tabela.put_item(Item={
        "pk": chave, "sk": f"PROJETO#{pid}", "id": pid,
        "nome": a.nome, "tipo": a.tipo or "Sistema", "etapa": a.etapa or 1, "etapas": ETAPAS,
        "progresso": a.progresso or 0, "previsao": a.previsao or "", "atualizado": hoje(), "notas": a.notas or "",
    })
    print(f"Projeto criado: {pid}")


def cmd_fatura(a):
    fid = uuid.uuid4().hex[:8]
    item = {
        "pk": pk(a.email), "sk": f"FATURA#{fid}", "id": fid,
        "numero": a.numero, "descricao": a.descricao, "valor": Decimal(str(a.valor)),
        "vencimento": a.vencimento, "status": "aberta",
    }
    if a.pix:
        item["pix"] = a.pix
    if a.boleto:
        item["boleto_url"] = a.boleto
    tabela.put_item(Item=item)
    print(f"Fatura criada: {fid} ({brl(a.valor)}, vence {a.vencimento})")


def cmd_fatura_paga(a):
    tabela.update_item(Key={"pk": pk(a.email), "sk": f"FATURA#{a.id}"}, UpdateExpression="SET #s = :s",
                       ExpressionAttributeNames={"#s": "status"}, ExpressionAttributeValues={":s": "paga"},
                       ConditionExpression=Attr("pk").exists())
    print(f"Fatura {a.id} marcada como paga.")


def cmd_chamados(a):
    if a.email:
        alvo = [(a.email, i) for i in itens(pk(a.email), "CHAMADO#")]
    else:
        alvo = []
        abertos, inicio = [], None
        while True:
            args = {"FilterExpression": Attr("sk").begins_with("CHAMADO#") & Attr("status").ne("resolvido")}
            if inicio:
                args["ExclusiveStartKey"] = inicio
            r = tabela.scan(**args)
            abertos.extend(r.get("Items", []))
            inicio = r.get("LastEvaluatedKey")
            if not inicio:
                break
        emails = {}
        for i in abertos:
            sub = i["pk"].split("#", 1)[1]
            if sub not in emails:
                u = cognito.list_users(UserPoolId=OUT["UserPoolId"], Filter=f'sub = "{sub}"', Limit=1)["Users"]
                emails[sub] = atributos(u[0]).get("email", sub) if u else sub
            alvo.append((emails[sub], i))
    if not alvo:
        print("Nenhum chamado em aberto.")
    for email, i in sorted(alvo, key=lambda x: x[1].get("criado", ""), reverse=True):
        print(f"{i.get('criado')} | {email} | id {i['id']} | {i['prioridade']} | {i['status']}\n   {i['assunto']}: {i.get('descricao', '')}\n")


def cmd_responder(a):
    resp = {"autor": AUTOR, "data": hoje(), "texto": a.texto}
    tabela.update_item(
        Key={"pk": pk(a.email), "sk": f"CHAMADO#{a.id}"},
        UpdateExpression="SET respostas = list_append(if_not_exists(respostas, :vazio), :r), #s = :s",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":r": [resp], ":vazio": [], ":s": a.status},
        ConditionExpression=Attr("pk").exists(),
    )
    print(f"Resposta registrada. Situação do chamado: {a.status}")


def cmd_arquivo(a):
    if not os.path.isfile(a.caminho):
        sys.exit(f"Arquivo não encontrado: {a.caminho}")
    sub = sub_do_email(a.email)
    nome = a.nome or os.path.basename(a.caminho)
    chave_s3 = f"clientes/{sub}/{uuid.uuid4().hex[:6]}-{os.path.basename(a.caminho)}"
    s3.upload_file(a.caminho, OUT["ArquivosBucket"], chave_s3)
    tam = os.path.getsize(a.caminho)
    tamanho = f"{tam / 1024:.0f} KB" if tam < 1024 * 1024 else f"{tam / 1024 / 1024:.1f} MB".replace(".", ",")
    aid = uuid.uuid4().hex[:8]
    tabela.put_item(Item={"pk": f"CLIENTE#{sub}", "sk": f"ARQUIVO#{aid}", "id": aid, "nome": nome,
                          "tamanho": tamanho, "data": hoje(), "caminho": chave_s3})
    print(f"Arquivo enviado: {nome} ({tamanho})")


def cmd_remover(a):
    tabela.delete_item(Key={"pk": pk(a.email), "sk": f"{TIPOS[a.tipo]}{a.id}"})
    print(f"{a.tipo.capitalize()} {a.id} removido.")


def main():
    p = argparse.ArgumentParser(description="Administração da área do cliente MURILO ROQUE PRO")
    sp = p.add_subparsers(dest="cmd", required=True)

    sp.add_parser("clientes", help="lista os clientes cadastrados").set_defaults(f=cmd_clientes)

    s = sp.add_parser("ver", help="mostra tudo de um cliente"); s.add_argument("email"); s.set_defaults(f=cmd_ver)

    s = sp.add_parser("projeto", help="cria ou atualiza (--id) um projeto")
    s.add_argument("email"); s.add_argument("--id"); s.add_argument("--nome"); s.add_argument("--tipo")
    s.add_argument("--etapa", type=int, choices=[1, 2, 3, 4]); s.add_argument("--progresso", type=int)
    s.add_argument("--previsao", help="AAAA-MM-DD"); s.add_argument("--notas"); s.set_defaults(f=cmd_projeto)

    s = sp.add_parser("fatura", help="cria uma fatura")
    s.add_argument("email"); s.add_argument("--numero", required=True); s.add_argument("--descricao", required=True)
    s.add_argument("--valor", type=float, required=True); s.add_argument("--vencimento", required=True, help="AAAA-MM-DD")
    s.add_argument("--pix"); s.add_argument("--boleto"); s.set_defaults(f=cmd_fatura)

    s = sp.add_parser("fatura-paga", help="marca uma fatura como paga")
    s.add_argument("email"); s.add_argument("--id", required=True); s.set_defaults(f=cmd_fatura_paga)

    s = sp.add_parser("chamados", help="lista chamados (todos em aberto, ou de um cliente)")
    s.add_argument("email", nargs="?"); s.set_defaults(f=cmd_chamados)

    s = sp.add_parser("responder", help="responde um chamado")
    s.add_argument("email"); s.add_argument("--id", required=True); s.add_argument("--texto", required=True)
    s.add_argument("--status", default="respondido", choices=["em_analise", "respondido", "resolvido"]); s.set_defaults(f=cmd_responder)

    s = sp.add_parser("arquivo", help="envia um arquivo para o cliente")
    s.add_argument("email"); s.add_argument("caminho"); s.add_argument("--nome"); s.set_defaults(f=cmd_arquivo)

    s = sp.add_parser("remover", help="remove um item")
    s.add_argument("email"); s.add_argument("--tipo", required=True, choices=list(TIPOS)); s.add_argument("--id", required=True)
    s.set_defaults(f=cmd_remover)

    a = p.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
