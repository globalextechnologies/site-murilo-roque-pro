# Como colocar o muriloroque.pro no ar (AWS)

Tempo total: uns 30 minutos de trabalho seu, mais a espera da Hostinger propagar o DNS (de minutos a algumas horas).

## O que vai ser criado na sua conta AWS

| Parte | Serviço AWS |
|---|---|
| Site (arquivos) | S3 privado + CloudFront (servidores no mundo todo, inclusive no Brasil) |
| HTTPS (cadeado) | Certificate Manager, grátis e renovado sozinho |
| Domínio | Route 53 (a Hostinger continua sendo onde o domínio está registrado) |
| Login dos clientes | Amazon Cognito (cadastro, confirmação por código no e-mail, recuperar senha) |
| Área do cliente | API Gateway + Lambda em Python + DynamoDB |
| Arquivos dos clientes | S3 privado, com links de download que expiram em 15 minutos |

Tudo fica em `us-east-1` (Norte da Virgínia). É lá que o CloudFront exige o certificado, e o site abre rápido no Brasil porque o CloudFront entrega pelos servidores de São Paulo e do Rio.

**Custo esperado para um site pequeno:** US$ 0,50 por mês da zona DNS no Route 53. O resto costuma ficar dentro do nível gratuito ou em centavos, enquanto o tráfego for baixo. Para acompanhar, crie um alerta de orçamento (passo 6).

---

## Primeira configuração (uma vez só)

### 1. Conectar o GitHub à AWS
1. Entre no console da AWS (https://console.aws.amazon.com) e abra o **CloudShell** (ícone `>_` no topo).
2. Em **Actions → Upload file**, envie o arquivo `conectar-github.sh`.
3. Rode:
   ```bash
   bash conectar-github.sh
   ```
4. No fim aparece um código como `arn:aws:iam::123456789012:role/mrpro-github-publicar`. Mande para o Claude, ou cole você mesmo no arquivo `aws/aws-role-arn.txt` do repositório.

### 2. Criar a zona DNS
Acontece sozinho na primeira execução depois que o código do passo 1 entra no repositório. Também dá para rodar à mão: **Actions → Publicar site → Run workflow → ação `zona`**. A página da execução mostra **4 nameservers**. Os registros de e-mail que você já tem são copiados sozinhos, então um e-mail @muriloroque.pro na Hostinger continua funcionando.

### 3. Apontar o domínio na Hostinger
hPanel → **Domínios → muriloroque.pro → DNS / Nameservers → Alterar nameservers → personalizados**. Cole os 4 nameservers e salve.

Para saber se já propagou, rode a ação **`verificar`**. Costuma levar de 15 minutos a 2 horas.

### 4. Publicar
Rode a ação **`publicar`**. Na primeira vez leva de 10 a 20 minutos. Depois disso, toda mudança enviada para a `main` publica sozinha.

### 5. (Recomendado) Alerta de gastos
Console → **Billing and Cost Management → Budgets → Create budget**, com um orçamento mensal de US$ 5.

### Sem GitHub (alternativa pelo CloudShell)
Envie o projeto zipado (pastas `site/` e `aws/`) pelo CloudShell e rode, dentro de `aws/`: `bash deploy.sh zona`, depois `bash deploy.sh verificar` e, por fim, `bash deploy.sh publicar`.

---

## No dia a dia

### Editei textos ou imagens do site
Envie a mudança para a branch `main` (ou peça ao Claude). O GitHub publica sozinho em 2 a 3 minutos.

### Cadastrar projetos, faturas e responder chamados
Use o `admin.py` no CloudShell. Na primeira vez, envie o `admin.py` (Actions → Upload file). Depois é só rodar:

```bash
python3 admin.py clientes                                  # quem já se cadastrou
python3 admin.py ver cliente@empresa.com                   # tudo de um cliente

python3 admin.py projeto cliente@empresa.com --nome "Robô de conciliação" --tipo Automação --etapa 2 --progresso 30 --previsao 2026-12-20
python3 admin.py projeto cliente@empresa.com --id ID_DO_PROJETO --etapa 3 --progresso 70 --notas "Leitura dos extratos pronta"

python3 admin.py fatura cliente@empresa.com --numero 0152 --descricao "Parcela 1 de 3" --valor 1450 --vencimento 2026-12-05 --pix "CÓDIGO_PIX_COPIA_E_COLA"
python3 admin.py fatura-paga cliente@empresa.com --id ID_DA_FATURA

python3 admin.py chamados                                  # chamados em aberto de todos os clientes
python3 admin.py responder cliente@empresa.com --id ID_DO_CHAMADO --texto "Pronto, pode testar." --status resolvido

python3 admin.py arquivo cliente@empresa.com ./contrato.pdf --nome "Contrato de prestação de serviços.pdf"
```

Os IDs aparecem no `ver`. As etapas do projeto são: 1 Conversa, 2 Proposta, 3 Desenvolvimento, 4 Entrega e suporte.
Para enviar um PDF, primeiro faça upload dele no CloudShell (Actions → Upload file).

---

## Bom saber

- **E-mails de código:** no começo, o Cognito envia pelo remetente padrão da AWS (`no-reply@verificationemail.com`), com limite de 50 e-mails por dia. Dá e sobra no início. Quando crescer, dá para enviar pelo seu próprio endereço com o Amazon SES.
- **Segurança:** cada cliente só acessa os próprios dados (a API confere o login em toda chamada). Banco com backup contínuo (recuperação de qualquer ponto dos últimos 35 dias). Buckets privados.
- **Proteção contra exclusão acidental:** os clientes cadastrados, o banco e os buckets ficam guardados mesmo se a pilha da AWS for apagada.
- **Formulário de contato:** continua abrindo o e-mail de quem preenche. Dá para trocar por envio direto via Lambda + SES depois.
- **Algo deu errado no `publicar`?** Copie a mensagem de erro do CloudShell e me mande. Em CloudFormation → Stacks → `mrpro` → Events aparece o motivo detalhado.
