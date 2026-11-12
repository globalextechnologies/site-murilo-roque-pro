(async () => {
  const A = window.MRPAuth;
  const CFG = window.MRP_CONFIG || {};
  const $ = s => document.querySelector(s);
  const view = $('#view');

  let user;
  try { user = await A.getUser(); } catch { user = null; }
  if (!user) { location.replace('acesso.html'); return; }

  $('#boot').remove();
  $('#app').hidden = false;
  if (A.modo === 'demo') $('#demo-banner').hidden = false;

  // ---------- utilidades ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const brl = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const data = s => s ? new Date(s + (String(s).length === 10 ? 'T12:00:00' : '')).toLocaleDateString('pt-BR') : '';
  const primeiroNome = () => (user.nome || user.email).split(' ')[0];
  const iniciais = () => (user.nome || user.email).split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
  const hoje = new Date().toISOString().slice(0, 10);
  const statusFatura = f => f.status === 'paga' ? ['Paga', 'ok'] : f.vencimento < hoje ? ['Vencida', 'bad'] : ['Em aberto', 'due'];
  const statusChamado = { aberto: ['Aberto', 'info'], em_analise: ['Em análise', 'due'], respondido: ['Respondido', 'info'], resolvido: ['Resolvido', 'ok'] };
  const prioridade = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };

  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2800);
  }
  const sheet = $('#sheet');
  function abrirSheet(html) {
    $('#sheet-body').innerHTML = `<button class="sheet-close" aria-label="Fechar">×</button>${html}`;
    $('#sheet-body .sheet-close').onclick = () => sheet.close();
    sheet.showModal();
  }
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

  $('#avatar').textContent = iniciais();
  const wa = $('#whats');
  wa.href = `https://wa.me/${CFG.whatsapp || ''}?text=${encodeURIComponent('Olá! Sou cliente (' + (user.nome || user.email) + ') e preciso de ajuda.')}`;
  document.querySelectorAll('.sair').forEach(b => b.addEventListener('click', sair));
  async function sair() { await A.signOut(); location.href = 'acesso.html'; }

  const vazio = (titulo, texto, acao = '') => `<div class="empty"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg><h3>${titulo}</h3><p class="muted">${texto}</p>${acao}</div>`;
  const erro = () => vazio('Não conseguimos carregar agora', 'Verifique sua conexão e atualize a página.', '<button class="btn btn-ghost" onclick="location.reload()">Atualizar página</button>');

  function projetoCard(p) {
    const etapas = p.etapas || ['Conversa', 'Proposta', 'Desenvolvimento', 'Entrega e suporte'];
    return `<article class="card proj">
      <div class="proj-head"><div><span class="pill neutral">${esc(p.tipo)}</span><h3>${esc(p.nome)}</h3></div><strong class="pct">${p.progresso}%</strong></div>
      <div class="bar" role="progressbar" aria-valuenow="${p.progresso}" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso"><i style="width:${p.progresso}%"></i></div>
      <ol class="track">${etapas.map((e, i) => `<li class="${i + 1 < p.etapa ? 'done' : i + 1 === p.etapa ? 'now' : ''}"><span></span>${esc(e)}</li>`).join('')}</ol>
      ${p.notas ? `<p class="muted note">${esc(p.notas)}</p>` : ''}
      <p class="meta">Atualizado em ${data(p.atualizado)}${p.progresso < 100 ? `. Previsão de entrega: ${data(p.previsao)}` : ''}</p>
    </article>`;
  }
  function faturaRow(f) {
    const [rot, cls] = statusFatura(f);
    return `<button class="row" data-fatura="${esc(f.id)}">
      <div class="row-main"><strong>Fatura ${esc(f.numero)}</strong><span class="muted">${esc(f.descricao)}</span></div>
      <div class="row-side"><strong>${brl(f.valor)}</strong><span class="pill ${cls}">${rot}${f.status !== 'paga' ? ' · ' + data(f.vencimento) : ''}</span></div>
    </button>`;
  }
  function chamadoRow(c) {
    const [rot, cls] = statusChamado[c.status] || ['Aberto', 'info'];
    return `<button class="row" data-chamado="${esc(c.id)}">
      <div class="row-main"><strong>${esc(c.assunto)}</strong><span class="muted">Aberto em ${data(c.criado)}. Prioridade ${prioridade[c.prioridade] || 'Normal'}</span></div>
      <div class="row-side"><span class="pill ${cls}">${rot}</span></div>
    </button>`;
  }

  let cache = {};
  async function carregar(t) { if (!cache[t]) cache[t] = await A.list(t); return cache[t]; }

  // ---------- telas ----------
  const telas = {
    async inicio() {
      const [proj, fat, cham] = await Promise.all([carregar('projetos'), carregar('faturas'), carregar('chamados')]);
      const ativos = proj.filter(p => p.progresso < 100);
      const abertas = fat.filter(f => f.status !== 'paga');
      const chamAbertos = cham.filter(c => c.status !== 'resolvido');
      const prox = abertas.sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
      return `
        <section class="hello">
          <h2>Olá, ${esc(primeiroNome())}</h2>
          <p class="muted">${ativos.length ? `Você tem ${ativos.length} projeto${ativos.length > 1 ? 's' : ''} em andamento.` : 'Nenhum projeto em andamento no momento.'}</p>
        </section>
        <section class="stats">
          <a href="#/projetos" class="stat"><span>Projetos ativos</span><strong>${ativos.length}</strong></a>
          <a href="#/faturas" class="stat"><span>Faturas em aberto</span><strong>${abertas.length}</strong><small>${prox ? brl(prox.valor) + ' vence ' + data(prox.vencimento) : 'Tudo em dia'}</small></a>
          <a href="#/suporte" class="stat"><span>Chamados abertos</span><strong>${chamAbertos.length}</strong></a>
        </section>
        <section class="block">
          <div class="block-head"><h2>Em andamento</h2><a href="#/projetos">Ver todos</a></div>
          ${ativos.length ? ativos.slice(0, 2).map(projetoCard).join('') : vazio('Nenhum projeto ativo', 'Quando eu iniciar um projeto com você, o andamento aparece aqui.', `<a class="btn btn-signal" href="index.html#contato">Pedir um orçamento</a>`)}
        </section>
        <section class="block">
          <div class="block-head"><h2>Atalhos</h2></div>
          <div class="quick">
            <a href="#/suporte?novo=1" class="q"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>Abrir chamado</a>
            <a href="#/faturas" class="q"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/></svg>Minhas faturas</a>
            <a href="#/arquivos" class="q"><svg viewBox="0 0 24 24"><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>Arquivos e contratos</a>
            <a href="${wa.href}" target="_blank" rel="noopener" class="q"><svg viewBox="0 0 24 24"><path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/></svg>WhatsApp</a>
          </div>
        </section>`;
    },
    async projetos() {
      const proj = await carregar('projetos');
      return proj.length ? `<div class="stack">${proj.map(projetoCard).join('')}</div>` : vazio('Nenhum projeto ainda', 'Quando eu iniciar um projeto com você, ele aparece aqui com cada etapa.', `<a class="btn btn-signal" href="index.html#contato">Pedir um orçamento</a>`);
    },
    async faturas() {
      const fat = await carregar('faturas');
      if (!fat.length) return vazio('Nenhuma fatura', 'Suas cobranças aparecem aqui assim que forem emitidas.');
      const aberto = fat.filter(f => f.status !== 'paga').reduce((s, f) => s + Number(f.valor), 0);
      return `<div class="summary"><span class="muted">Total em aberto</span><strong>${brl(aberto)}</strong></div>
        <div class="list">${fat.map(faturaRow).join('')}</div>`;
    },
    async suporte(params) {
      const cham = await carregar('chamados');
      setTimeout(() => { if (params.get('novo')) novoChamado(); }, 0);
      return `<div class="block-head"><p class="muted">Abra um chamado e acompanhe a resposta por aqui.</p><button class="btn btn-signal" id="novo-chamado">Abrir chamado</button></div>
        ${cham.length ? `<div class="list">${cham.map(chamadoRow).join('')}</div>` : vazio('Nenhum chamado aberto', 'Precisa de ajuda com algo? Abra um chamado e eu respondo por aqui.')}`;
    },
    async arquivos() {
      const arq = await carregar('arquivos');
      return arq.length ? `<div class="list">${arq.map(a => `<a class="row" href="${esc(a.url || '#')}" ${a.url && a.url !== '#' ? 'target="_blank" rel="noopener"' : 'data-demo-file'}>
          <div class="row-main"><strong>${esc(a.nome)}</strong><span class="muted">${esc(a.tamanho || '')}${a.tamanho ? ', ' : ''}enviado em ${data(a.data)}</span></div>
          <div class="row-side"><span class="dl"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>Baixar</span></div></a>`).join('')}</div>`
        : vazio('Nenhum arquivo ainda', 'Contratos, propostas e manuais que eu compartilhar com você aparecem aqui.');
    },
    async conta() {
      return `<form class="card form" id="form-perfil" novalidate>
          <h2>Seus dados</h2>
          <div class="field"><label for="p-nome">Nome completo</label><input class="input" id="p-nome" value="${esc(user.nome)}" autocomplete="name"></div>
          <div class="field"><label for="p-email">E-mail</label><input class="input" id="p-email" value="${esc(user.email)}" disabled><span class="hint">Para trocar o e-mail, fale com o suporte.</span></div>
          <div class="grid-2">
            <div class="field"><label for="p-tel">WhatsApp</label><input class="input" id="p-tel" type="tel" value="${esc(user.telefone)}" autocomplete="tel"></div>
            <div class="field"><label for="p-doc">CPF ou CNPJ</label><input class="input" id="p-doc" value="${esc(user.documento)}" inputmode="numeric"></div>
          </div>
          <div class="field"><label for="p-emp">Empresa</label><input class="input" id="p-emp" value="${esc(user.empresa)}" autocomplete="organization"></div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-signal" type="submit">Salvar dados</button>
        </form>
        <form class="card form" id="form-senha" novalidate>
          <h2>Alterar senha</h2>
          <div class="field"><label for="s-atual">Senha atual</label><input class="input" id="s-atual" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="s-nova">Nova senha</label><input class="input" id="s-nova" type="password" autocomplete="new-password" minlength="8"><span class="hint">Mínimo de 8 caracteres.</span></div>
          <p class="form-error" role="alert"></p>
          <button class="btn btn-ghost" type="submit">Alterar senha</button>
        </form>
        <div class="card">
          <h2>Use como aplicativo</h2>
          <p class="muted"><b>iPhone e iPad:</b> no Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.<br><b>Android:</b> no Chrome, toque em ⋮ e em “Instalar app”.</p>
          <button class="btn btn-ghost" id="instalar" hidden>Instalar aplicativo</button>
        </div>
        <div class="card row-links">
          <a href="#/arquivos" class="row"><div class="row-main"><strong>Arquivos e contratos</strong></div></a>
          <a href="index.html" class="row"><div class="row-main"><strong>Ir para o site</strong></div></a>
          <button class="row sair"><div class="row-main"><strong class="danger">Sair da conta</strong></div></button>
        </div>`;
    }
  };
  const titulos = { inicio: 'Início', projetos: 'Projetos', faturas: 'Faturas', suporte: 'Suporte', arquivos: 'Arquivos', conta: 'Minha conta' };

  // ---------- interações por tela ----------
  function ligar(nome) {
    view.querySelectorAll('[data-fatura]').forEach(b => b.addEventListener('click', () => detalheFatura(b.dataset.fatura)));
    view.querySelectorAll('[data-chamado]').forEach(b => b.addEventListener('click', () => detalheChamado(b.dataset.chamado)));
    view.querySelectorAll('[data-demo-file]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toast('Arquivo de exemplo. Com a AWS ativa, o download é real.'); }));
    view.querySelectorAll('.sair').forEach(b => b.addEventListener('click', sair));
    $('#novo-chamado')?.addEventListener('click', novoChamado);

    if (nome === 'conta') {
      const instalar = window.__mrpInstall;
      $('#form-perfil').addEventListener('submit', async e => {
        e.preventDefault();
        const err = e.target.querySelector('.form-error'); err.textContent = '';
        const nomeV = $('#p-nome').value.trim();
        if (nomeV.split(/\s+/).length < 2) { err.textContent = 'Informe nome e sobrenome.'; return; }
        try { user = await A.updateProfile({ nome: nomeV, telefone: $('#p-tel').value, documento: $('#p-doc').value, empresa: $('#p-emp').value.trim() }); $('#avatar').textContent = iniciais(); toast('Dados salvos.'); }
        catch (x) { err.textContent = x.message || 'Não foi possível salvar. Tente de novo.'; }
      });
      $('#form-senha').addEventListener('submit', async e => {
        e.preventDefault();
        const err = e.target.querySelector('.form-error'); err.textContent = '';
        const nova = $('#s-nova').value;
        if (!$('#s-atual').value) { err.textContent = 'Informe a sua senha atual.'; return; }
        if (nova.length < 8) { err.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.'; return; }
        try { await A.changePassword($('#s-atual')?.value, nova); e.target.reset(); toast('Senha alterada.'); }
        catch (x) { err.textContent = x.message || 'Não foi possível alterar a senha.'; }
      });
    }
  }

  async function detalheFatura(id) {
    const f = (await carregar('faturas')).find(x => String(x.id) === id); if (!f) return;
    const [rot, cls] = statusFatura(f);
    const pix = f.pix || (A.modo === 'demo' ? '00020126580014BR.GOV.BCB.PIX0136exemplo-chave-pix-mrpro5204000053039865802BR' : '');
    abrirSheet(`<h2>Fatura ${esc(f.numero)}</h2>
      <p class="muted">${esc(f.descricao)}</p>
      <dl class="dl-grid">
        <div><dt>Valor</dt><dd>${brl(f.valor)}</dd></div>
        <div><dt>Vencimento</dt><dd>${data(f.vencimento)}</dd></div>
        <div><dt>Situação</dt><dd><span class="pill ${cls}">${rot}</span></dd></div>
      </dl>
      ${f.status !== 'paga' && pix ? `<div class="field"><label for="pix">Pix copia e cola</label><textarea class="input mono" id="pix" readonly rows="3">${esc(pix)}</textarea></div>
      <div class="sheet-actions"><button class="btn btn-signal" id="copiar-pix">Copiar código Pix</button>${f.boleto_url ? `<a class="btn btn-ghost" href="${esc(f.boleto_url)}" target="_blank" rel="noopener">Abrir boleto</a>` : ''}</div>`
      : `<div class="sheet-actions"><button class="btn btn-ghost" onclick="window.print()">Imprimir comprovante</button></div>`}`);
    $('#copiar-pix')?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(pix); toast('Código Pix copiado.'); } catch { $('#pix').select(); toast('Selecione e copie o código.'); }
    });
  }

  async function detalheChamado(id) {
    const c = (await carregar('chamados')).find(x => String(x.id) === id); if (!c) return;
    const [rot, cls] = statusChamado[c.status] || ['Aberto', 'info'];
    const resp = c.respostas || [];
    abrirSheet(`<h2>${esc(c.assunto)}</h2>
      <p class="meta"><span class="pill ${cls}">${rot}</span> Aberto em ${data(c.criado)}</p>
      <div class="thread">
        <div class="msg me"><b>Você</b><p>${esc(c.descricao)}</p></div>
        ${resp.map(r => `<div class="msg"><b>${esc(r.autor)}</b><span class="muted">${data(r.data)}</span><p>${esc(r.texto)}</p></div>`).join('')}
        ${resp.length ? '' : '<p class="muted">Ainda sem resposta. Você recebe um aviso por e-mail quando eu responder.</p>'}
      </div>`);
  }

  function novoChamado() {
    abrirSheet(`<h2>Abrir chamado</h2>
      <form class="form" id="form-chamado" novalidate>
        <div class="field"><label for="ch-assunto">Assunto</label><input class="input" id="ch-assunto" placeholder="Ex.: incluir um novo banco no robô" required></div>
        <div class="field"><label for="ch-prio">Prioridade</label><select class="input" id="ch-prio"><option value="baixa">Baixa</option><option value="normal" selected>Normal</option><option value="alta">Alta</option><option value="urgente">Urgente: algo parou de funcionar</option></select></div>
        <div class="field"><label for="ch-desc">Descreva o que precisa</label><textarea class="input" id="ch-desc" required></textarea></div>
        <p class="form-error" role="alert"></p>
        <button class="btn btn-signal btn-block" type="submit">Enviar chamado</button>
      </form>`);
    $('#ch-assunto').focus();
    $('#form-chamado').addEventListener('submit', async e => {
      e.preventDefault();
      const err = e.target.querySelector('.form-error');
      const assunto = $('#ch-assunto').value.trim(), descricao = $('#ch-desc').value.trim();
      if (!assunto || !descricao) { err.textContent = 'Preencha o assunto e a descrição.'; return; }
      const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await A.createTicket({ assunto, prioridade: $('#ch-prio').value, descricao });
        delete cache.chamados; sheet.close(); toast('Chamado enviado.');
        if (location.hash.startsWith('#/suporte')) location.hash = '#/suporte'; else location.hash = '#/suporte';
        render();
      } catch (x) { err.textContent = x.message; btn.disabled = false; }
    });
  }

  // ---------- roteador ----------
  async function render() {
    const [rota, qs] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?');
    const nome = telas[rota] ? rota : 'inicio';
    document.querySelectorAll('[data-v]').forEach(a => a.dataset.v === nome ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    $('#titulo').textContent = titulos[nome];
    document.title = `${titulos[nome]} | MURILO ROQUE PRO`;
    view.dataset.tela = nome;
    view.innerHTML = '<div class="loading"><i></i><i></i><i></i></div>';
    try { view.innerHTML = await telas[nome](new URLSearchParams(qs)); }
    catch { view.innerHTML = erro(); }
    ligar(nome);
    window.scrollTo(0, 0);
    if (window.__mrpInstallReady) { const b = $('#instalar'); if (b) b.hidden = false; }
  }
  window.addEventListener('hashchange', render);
  await render();

  if (new URLSearchParams(location.search).get('bemvindo')) {
    toast(`Conta criada. Boas-vindas, ${primeiroNome()}!`);
    history.replaceState(null, '', 'painel.html' + location.hash);
  }
})();
