/*
  Camada de autenticação e dados da área do cliente.
  Mesma interface nos dois modos (demo e aws), então as telas não mudam.
*/
(() => {
  const CFG = window.MRP_CONFIG || { modo: 'demo' };

  // ---------- utilidades ----------
  const store = {
    get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };
  const normEmail = e => String(e || '').trim().toLowerCase();
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

  async function hashSenha(senha, saltHex) {
    const enc = new TextEncoder();
    if (window.crypto?.subtle) {
      const key = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
      const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120000 }, key, 256);
      return toHex(bits);
    }
    // fallback simples (contextos sem WebCrypto) — apenas para o modo demo
    let h = 0; for (const c of saltHex + senha) h = (h * 31 + c.charCodeAt(0)) | 0; return 'x' + h;
  }
  const novoSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

  class AuthError extends Error {}

  // ---------- dados de exemplo (modo demo) ----------
  function seed() {
    const hoje = new Date();
    const d = n => { const x = new Date(hoje); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    return {
      projetos: [
        { id: uid(), nome: 'Robô de conciliação bancária', tipo: 'Automação', etapa: 3, etapas: ['Conversa', 'Proposta', 'Desenvolvimento', 'Entrega e suporte'], progresso: 68, previsao: d(18), atualizado: d(-1), notas: 'Leitura dos extratos do Itaú e do Sicoob pronta. Falta validar o arquivo de retorno do ERP.' },
        { id: uid(), nome: 'API de integração loja + ERP', tipo: 'API', etapa: 4, etapas: ['Conversa', 'Proposta', 'Desenvolvimento', 'Entrega e suporte'], progresso: 100, previsao: d(-40), atualizado: d(-6), notas: 'Em produção. Pedidos sincronizados a cada 5 minutos, com monitoramento e backup diário.' }
      ],
      faturas: [
        { id: uid(), numero: '0151', descricao: 'Robô de conciliação, parcela 2 de 3', valor: 1450, vencimento: d(8), status: 'aberta' },
        { id: uid(), numero: '0148', descricao: 'Servidor e manutenção da API, mensal', valor: 129.9, vencimento: d(-22), status: 'paga' },
        { id: uid(), numero: '0142', descricao: 'Robô de conciliação, parcela 1 de 3', valor: 1450, vencimento: d(-35), status: 'paga' }
      ],
      chamados: [
        { id: uid(), assunto: 'Incluir a conta do Banco Inter no robô', prioridade: 'normal', status: 'em_analise', criado: d(-2), descricao: 'Abrimos uma conta no Inter e precisamos que o robô leia esse extrato também.', respostas: [{ autor: 'Murilo Roque', data: d(-1), texto: 'Recebi o extrato de exemplo. Incluo na próxima entrega.' }] },
        { id: uid(), assunto: 'Pedido não apareceu no ERP', prioridade: 'baixa', status: 'resolvido', criado: d(-20), descricao: 'O pedido 10432 da loja não entrou no ERP.', respostas: [{ autor: 'Murilo Roque', data: d(-19), texto: 'O produto estava sem código no ERP. Ajustei a API para avisar quando isso acontecer e reenviei o pedido.' }] }
      ],
      arquivos: [
        { id: uid(), nome: 'Contrato de prestação de serviços.pdf', tamanho: '214 KB', data: d(-36), url: '#' },
        { id: uid(), nome: 'Proposta comercial - robô de conciliação.pdf', tamanho: '1,2 MB', data: d(-40), url: '#' },
        { id: uid(), nome: 'Documentação da API.pdf', tamanho: '640 KB', data: d(-19), url: '#' }
      ]
    };
  }

  // ---------- adaptador DEMO ----------
  const Demo = {
    modo: 'demo',
    async signUp({ nome, email, telefone, empresa, documento, senha }) {
      email = normEmail(email);
      const users = store.get('mrp_users', {});
      if (users[email]) throw new AuthError('Já existe uma conta com este e-mail. Entre ou recupere a senha.');
      const salt = novoSalt();
      users[email] = { perfil: { id: uid(), nome, email, telefone, empresa, documento, criado: new Date().toISOString() }, salt, hash: await hashSenha(senha, salt) };
      store.set('mrp_users', users);
      store.set('mrp_data_' + email, seed());
      store.set('mrp_session', { email, desde: Date.now() });
      return users[email].perfil;
    },
    async signIn(email, senha) {
      email = normEmail(email);
      const u = store.get('mrp_users', {})[email];
      if (!u || (await hashSenha(senha, u.salt)) !== u.hash) throw new AuthError('E-mail ou senha incorretos. Confira os dados e tente de novo.');
      store.set('mrp_session', { email, desde: Date.now() });
      return u.perfil;
    },
    async signOut() { store.del('mrp_session'); },
    async getUser() {
      const s = store.get('mrp_session');
      if (!s) return null;
      return store.get('mrp_users', {})[s.email]?.perfil || null;
    },
    async resetPassword(email) {
      // No modo demo não há envio de e-mail; a mensagem é a mesma para não revelar contas existentes.
      return true;
    },
    async updateProfile(dados) {
      const s = store.get('mrp_session'); const users = store.get('mrp_users', {});
      Object.assign(users[s.email].perfil, dados); store.set('mrp_users', users);
      return users[s.email].perfil;
    },
    async changePassword(atual, nova) {
      const s = store.get('mrp_session'); const users = store.get('mrp_users', {}); const u = users[s.email];
      if ((await hashSenha(atual, u.salt)) !== u.hash) throw new AuthError('A senha atual não confere.');
      u.salt = novoSalt(); u.hash = await hashSenha(nova, u.salt); store.set('mrp_users', users);
    },
    _data() { const s = store.get('mrp_session'); return { key: 'mrp_data_' + s.email, data: store.get('mrp_data_' + s.email, seed()) }; },
    async list(tabela) { return this._data().data[tabela] || []; },
    async createTicket({ assunto, prioridade, descricao }) {
      const { key, data } = this._data();
      const t = { id: uid(), assunto, prioridade, descricao, status: 'aberto', criado: new Date().toISOString().slice(0, 10), respostas: [] };
      data.chamados.unshift(t); store.set(key, data); return t;
    }
  };

  // ---------- adaptador AWS (Cognito + API Gateway + Lambda) ----------
  const COGNITO = `https://cognito-idp.${CFG.regiao}.amazonaws.com/`;
  const TOKENS = 'mrp_tokens';

  class PrecisaConfirmar extends AuthError {}

  const traduzAws = (tipo, msg) => ({
    NotAuthorizedException: /disabled/i.test(msg) ? 'Esta conta está desativada. Fale com o suporte.' : 'E-mail ou senha incorretos. Confira os dados e tente de novo.',
    UserNotFoundException: 'E-mail ou senha incorretos. Confira os dados e tente de novo.',
    UsernameExistsException: 'Já existe uma conta com este e-mail. Entre ou recupere a senha.',
    InvalidPasswordException: 'A senha precisa ter pelo menos 8 caracteres.',
    CodeMismatchException: 'Código incorreto. Confira o código que chegou no seu e-mail.',
    ExpiredCodeException: 'Este código expirou. Peça um novo código.',
    LimitExceededException: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    TooManyRequestsException: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    TooManyFailedAttemptsException: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
    CodeDeliveryFailureException: 'Não conseguimos enviar o e-mail com o código. Confira o endereço e tente de novo.',
    InvalidParameterException: /email/i.test(msg) ? 'Informe um e-mail válido.' : 'Confira os dados informados e tente de novo.'
  }[tipo] || 'Algo deu errado. Verifique sua conexão e tente de novo.');

  async function cognito(acao, corpo) {
    let r;
    try {
      r = await fetch(COGNITO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `AWSCognitoIdentityProviderService.${acao}` },
        body: JSON.stringify({ ClientId: CFG.userPoolClientId, ...corpo })
      });
    } catch { throw new AuthError('Sem conexão com o servidor. Verifique sua internet.'); }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      const tipo = String(dados.__type || '').split('#').pop();
      if (tipo === 'UserNotConfirmedException') throw new PrecisaConfirmar('Confirme seu e-mail com o código que enviamos.');
      throw new AuthError(traduzAws(tipo, dados.message || ''));
    }
    return dados;
  }
  // Para as chamadas com AccessToken, o ClientId é ignorado pelo Cognito, mas não atrapalha.

  const lerJwt = t => { try { return JSON.parse(decodeURIComponent(escape(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return {}; } };
  function salvarTokens(res, refreshAntigo) {
    const t = { access: res.AccessToken, id: res.IdToken, refresh: res.RefreshToken || refreshAntigo, expira: Date.now() + (res.ExpiresIn || 3600) * 1000 };
    store.set(TOKENS, t); return t;
  }
  async function tokens() {
    const t = store.get(TOKENS);
    if (!t) return null;
    if (Date.now() < t.expira - 60000) return t;
    try {
      const r = await cognito('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: t.refresh } });
      return salvarTokens(r.AuthenticationResult, t.refresh);
    } catch (e) {
      if (e.message.startsWith('Sem conexão')) throw e;
      store.del(TOKENS); return null;
    }
  }
  const perfilDoToken = t => {
    const c = lerJwt(t.id);
    return { id: c.sub, email: c.email, nome: c.name || '', telefone: c['custom:telefone'] || '', empresa: c['custom:empresa'] || '', documento: c['custom:documento'] || '' };
  };
  const attrs = d => Object.entries({ name: d.nome, 'custom:telefone': d.telefone, 'custom:empresa': d.empresa, 'custom:documento': d.documento })
    .filter(([, v]) => v !== undefined).map(([Name, Value]) => ({ Name, Value: String(Value ?? '') }));

  async function api(caminho, opcoes = {}) {
    const t = await tokens();
    if (!t) { location.href = 'acesso.html'; throw new AuthError('Sua sessão expirou. Entre de novo.'); }
    let r;
    try {
      r = await fetch(CFG.apiUrl.replace(/\/$/, '') + caminho, { ...opcoes, headers: { Authorization: `Bearer ${t.access}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) } });
    } catch { throw new AuthError('Sem conexão com o servidor. Verifique sua internet.'); }
    if (r.status === 401) { store.del(TOKENS); location.href = 'acesso.html'; throw new AuthError('Sua sessão expirou. Entre de novo.'); }
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new AuthError(dados.erro || 'Não foi possível concluir agora. Tente de novo.');
    return dados;
  }

  const Aws = {
    modo: 'aws',
    usaCodigo: true,
    async signUp({ nome, email, telefone, empresa, documento, senha }) {
      await cognito('SignUp', {
        Username: normEmail(email), Password: senha,
        UserAttributes: [{ Name: 'email', Value: normEmail(email) }, ...attrs({ nome, telefone, empresa, documento }).filter(a => a.Value)]
      });
      return { precisaConfirmar: true, email: normEmail(email) };
    },
    async confirmSignUp(email, codigo) {
      await cognito('ConfirmSignUp', { Username: normEmail(email), ConfirmationCode: String(codigo).trim() });
    },
    async resendCode(email) {
      await cognito('ResendConfirmationCode', { Username: normEmail(email) });
    },
    async signIn(email, senha) {
      const r = await cognito('InitiateAuth', { AuthFlow: 'USER_PASSWORD_AUTH', AuthParameters: { USERNAME: normEmail(email), PASSWORD: senha } });
      if (!r.AuthenticationResult) throw new AuthError('Não foi possível entrar com esta conta. Fale com o suporte.');
      return perfilDoToken(salvarTokens(r.AuthenticationResult));
    },
    async signOut() {
      const t = store.get(TOKENS);
      store.del(TOKENS);
      if (t?.refresh) { try { await cognito('RevokeToken', { Token: t.refresh }); } catch {} }
    },
    async getUser() { const t = await tokens(); return t ? perfilDoToken(t) : null; },
    async resetPassword(email) {
      await cognito('ForgotPassword', { Username: normEmail(email) });
      return true;
    },
    async confirmReset(email, codigo, nova) {
      await cognito('ConfirmForgotPassword', { Username: normEmail(email), ConfirmationCode: String(codigo).trim(), Password: nova });
    },
    async updateProfile(dados) {
      const t = await tokens();
      await cognito('UpdateUserAttributes', { AccessToken: t.access, UserAttributes: attrs(dados) });
      // força um token novo para refletir os dados atualizados
      const r = await cognito('InitiateAuth', { AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: t.refresh } });
      return perfilDoToken(salvarTokens(r.AuthenticationResult, t.refresh));
    },
    async changePassword(atual, nova) {
      const t = await tokens();
      try {
        await cognito('ChangePassword', { AccessToken: t.access, PreviousPassword: atual, ProposedPassword: nova });
      } catch (e) {
        if (/incorretos/.test(e.message)) throw new AuthError('A senha atual não confere.');
        throw e;
      }
    },
    async list(tabela) { return api('/' + tabela); },
    async createTicket(dados) { return api('/chamados', { method: 'POST', body: JSON.stringify(dados) }); }
  };

  const awsPronto = CFG.modo === 'aws' && CFG.regiao && CFG.userPoolClientId && CFG.apiUrl;
  window.MRPAuth = awsPronto ? Aws : Demo;
  window.MRPAuth.AuthError = AuthError;
  window.MRPAuth.PrecisaConfirmar = PrecisaConfirmar;
})();
