/*
  Configuração do site MURILO ROQUE PRO
  ------------------------------------------------------------
  Modo "demo": contas e dados ficam só no navegador de quem testa (para ver o visual e o fluxo).
  Modo "aws":  contas reais (Amazon Cognito) e dados na AWS (API Gateway + Lambda + DynamoDB).

  Você não precisa editar os campos da AWS à mão: o script aws/deploy.sh reescreve
  este arquivo com os valores certos toda vez que publica o site.
*/
window.MRP_CONFIG = {
  modo: 'demo',
  regiao: '',            // ex.: 'us-east-1'
  userPoolClientId: '',  // id do app do Cognito (público por natureza)
  apiUrl: '',            // ex.: 'https://abc123.execute-api.us-east-1.amazonaws.com'
  emailContato: 'contato@muriloroque.pro',
  whatsapp: '5500000000000'  // DDI + DDD + número, só dígitos
};
