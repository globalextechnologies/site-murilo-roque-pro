(async () => {
  const A = window.MRPAuth;
  const $ = s => document.querySelector(s);
  const paineis = { entrar: $('#painel-entrar'), cadastro: $('#painel-cadastro'), recuperar: $('#painel-recuperar'), confirmar: $('#painel-confirmar') };
  let pendente = { email: '', senha: '' };  // usado para entrar direto depois de confirmar o e-mail
  const tabs = { entrar: $('#tab-entrar'), cadastro: $('#tab-cadastro') };
  const seg = $('.seg');

  if (A.modo === 'demo') $('#demo-note').hidden = false;

  function ir(modo, foco = true) {
    if (modo === 'recuperar') { $('#form-recuperar').hidden = false; $('#form-redefinir').hidden = true; $('#rec-sub').textContent = 'Informe seu e-mail e enviaremos um código para criar uma nova senha.'; }
    Object.entries(paineis).forEach(([k, el]) => el.hidden = k !== modo);
    Object.entries(tabs).forEach(([k, el]) => el.setAttribute('aria-selected', String(k === modo)));
    seg.hidden = !(modo in tabs);
    seg.dataset.ativo = modo;
    const url = new URL(location.href);
    modo === 'entrar' ? url.searchParams.delete('modo') : url.searchParams.set('modo', modo);
    history.replaceState(null, '', url);
    if (foco) paineis[modo].querySelector('input')?.focus({ preventScroll: true });
  }
  tabs.entrar.addEventListener('click', () => ir('entrar'));
  tabs.cadastro.addEventListener('click', () => ir('cadastro'));
  seg.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const m = seg.dataset.ativo === 'entrar' ? 'cadastro' : 'entrar'; ir(m); tabs[m].focus(); } });
  document.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => ir(b.dataset.ir)));

  const modoInicial = new URLSearchParams(location.search).get('modo');

  // Já logado? vai direto para o painel
  try { if (await A.getUser()) { location.replace('painel.html'); return; } } catch {}
  ir(['entrar', 'cadastro', 'recuperar'].includes(modoInicial) ? modoInicial : 'entrar', false);

  function irConfirmar(email, senha) {
    pendente = { email, senha };
    $('#conf-email').textContent = email;
    ir('confirmar');
  }

  // Mostrar/ocultar senha
  document.querySelectorAll('.pw-toggle').forEach(b => b.addEventListener('click', () => {
    const i = b.previousElementSibling; const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha'); b.classList.toggle('on', show);
  }));

  // Força da senha
  const meter = $('.meter');
  $('#r-senha').addEventListener('input', e => {
    const v = e.target.value; let s = 0;
    if (v.length >= 8) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) s++;
    meter.dataset.n = v ? s : 0;
  });

  // Máscaras simples
  const soDig = v => v.replace(/\D/g, '');
  $('#r-tel').addEventListener('input', e => {
    const d = soDig(e.target.value).slice(0, 11);
    e.target.value = d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3') : d.replace(/(\d{0,2})(\d{0,4})(\d{0,4})/, (m, a, b, c) => (a ? `(${a}` : '') + (a.length === 2 ? ') ' : '') + b + (c ? `-${c}` : ''));
  });
  $('#r-doc').addEventListener('input', e => {
    const d = soDig(e.target.value).slice(0, 14);
    e.target.value = d.length <= 11
      ? d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      : d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  });

  $('#ver-termos').addEventListener('click', e => { e.preventDefault(); $('#termos').showModal(); });

  // Helpers de formulário
  const emailOk = v => /^\S+@\S+\.\S+$/.test(v.trim());
  function marcar(campo, ruim) { campo.setAttribute('aria-invalid', String(ruim)); return ruim; }
  async function enviar(form, fn) {
    const err = form.querySelector('.form-error'); const btn = form.querySelector('button[type=submit]');
    err.textContent = '';
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Aguarde…';
    try { await fn(); }
    catch (e) { err.textContent = e instanceof A.AuthError ? e.message : 'Algo deu errado. Verifique sua conexão e tente de novo.'; }
    finally { btn.disabled = false; btn.textContent = txt; }
  }

  $('#form-entrar').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target;
    const em = $('#l-email'), pw = $('#l-senha');
    const bad = [marcar(em, !emailOk(em.value)), marcar(pw, !pw.value)].some(Boolean);
    if (bad) { f.querySelector('.form-error').textContent = 'Informe seu e-mail e sua senha.'; return; }
    enviar(f, async () => {
      try { await A.signIn(em.value, pw.value); location.href = 'painel.html'; }
      catch (x) {
        if (A.PrecisaConfirmar && x instanceof A.PrecisaConfirmar) {
          await A.resendCode(em.value).catch(() => {});
          irConfirmar(em.value.trim().toLowerCase(), pw.value);
          $('#form-confirmar .form-ok').textContent = 'Sua conta ainda não foi confirmada. Enviamos um novo código.';
          return;
        }
        throw x;
      }
    });
  });

  $('#form-cadastro').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target;
    const nome = $('#r-nome'), em = $('#r-email'), tel = $('#r-tel'), pw = $('#r-senha'), termos = $('#r-termos');
    const erros = [];
    if (marcar(nome, nome.value.trim().split(/\s+/).length < 2)) erros.push('nome e sobrenome');
    if (marcar(em, !emailOk(em.value))) erros.push('um e-mail válido');
    if (marcar(tel, soDig(tel.value).length < 10)) erros.push('WhatsApp com DDD');
    if (marcar(pw, pw.value.length < 8)) erros.push('senha com pelo menos 8 caracteres');
    if (!termos.checked) erros.push('aceite dos termos');
    if (erros.length) { f.querySelector('.form-error').textContent = 'Falta preencher: ' + erros.join(', ') + '.'; return; }
    enviar(f, async () => {
      const r = await A.signUp({ nome: nome.value.trim(), email: em.value, telefone: tel.value, empresa: $('#r-empresa').value.trim(), documento: $('#r-doc').value, senha: pw.value });
      if (r?.precisaConfirmar) { irConfirmar(r.email, pw.value); return; }
      location.href = 'painel.html?bemvindo=1';
    });
  });

  // Confirmação do e-mail com o código de 6 dígitos
  $('#c-codigo').addEventListener('input', e => { e.target.value = soDig(e.target.value).slice(0, 6); });
  $('#form-confirmar').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target; const cod = $('#c-codigo');
    f.querySelector('.form-ok').textContent = '';
    if (marcar(cod, cod.value.length !== 6)) { f.querySelector('.form-error').textContent = 'Digite o código de 6 dígitos que chegou no seu e-mail.'; return; }
    enviar(f, async () => {
      await A.confirmSignUp(pendente.email, cod.value);
      if (pendente.senha) { await A.signIn(pendente.email, pendente.senha); location.href = 'painel.html?bemvindo=1'; return; }
      ir('entrar'); $('#l-email').value = pendente.email;
      $('#form-entrar .form-error').textContent = '';
    });
  });
  $('#reenviar').addEventListener('click', async e => {
    const f = $('#form-confirmar'); const b = e.currentTarget; b.disabled = true;
    f.querySelector('.form-error').textContent = ''; f.querySelector('.form-ok').textContent = '';
    try { await A.resendCode(pendente.email); f.querySelector('.form-ok').textContent = 'Enviamos um novo código.'; }
    catch (x) { f.querySelector('.form-error').textContent = x.message; }
    finally { setTimeout(() => { b.disabled = false; }, 30000); }
  });

  // Recuperação de senha: e-mail -> código + nova senha
  let emailRec = '';
  $('#form-recuperar').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target; const em = $('#f-email');
    if (marcar(em, !emailOk(em.value))) { f.querySelector('.form-error').textContent = 'Informe um e-mail válido.'; return; }
    enviar(f, async () => {
      await A.resetPassword(em.value);
      if (!A.usaCodigo) {
        f.querySelector('.form-ok').textContent = 'No modo demonstração não enviamos e-mails. Com a AWS ativa, o código chega em instantes.';
        return;
      }
      emailRec = em.value.trim().toLowerCase();
      f.hidden = true; $('#form-redefinir').hidden = false;
      $('#rec-sub').textContent = `Se houver uma conta com ${emailRec}, o código chega em instantes. Confira também o spam.`;
      $('#rd-codigo').focus();
    });
  });
  $('#rd-codigo').addEventListener('input', e => { e.target.value = soDig(e.target.value).slice(0, 6); });
  $('#form-redefinir').addEventListener('submit', e => {
    e.preventDefault(); const f = e.target; const cod = $('#rd-codigo'), pw = $('#rd-senha');
    const erros = [];
    if (marcar(cod, cod.value.length !== 6)) erros.push('o código de 6 dígitos');
    if (marcar(pw, pw.value.length < 8)) erros.push('uma senha com pelo menos 8 caracteres');
    if (erros.length) { f.querySelector('.form-error').textContent = 'Informe ' + erros.join(' e ') + '.'; return; }
    enviar(f, async () => {
      await A.confirmReset(emailRec, cod.value, pw.value);
      await A.signIn(emailRec, pw.value);
      location.href = 'painel.html';
    });
  });
})();
