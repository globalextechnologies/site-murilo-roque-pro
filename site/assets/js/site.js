(() => {
  const topbar = document.querySelector('.topbar');
  const menuBtn = document.querySelector('.menu-btn');
  const nav = document.getElementById('menu');

  const onScroll = () => topbar.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const closeMenu = () => { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', 'Abrir menu'); };
  menuBtn?.addEventListener('click', () => {
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  nav?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });

  // Botões que já escolhem o assunto do formulário
  document.querySelectorAll('[data-assunto]').forEach(el => el.addEventListener('click', () => {
    const sel = document.getElementById('c-assunto');
    if (sel) sel.value = el.dataset.assunto;
  }));

  const ano = document.getElementById('ano');
  if (ano) ano.textContent = new Date().getFullYear();

  // Formulário de contato: abre o e-mail já preenchido (troque por um endpoint quando tiver backend)
  const form = document.getElementById('form-contato');
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const note = form.querySelector('.form-note');
    let ok = true;
    form.querySelectorAll('[required]').forEach(f => {
      const bad = !f.value.trim() || (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(f.value));
      f.setAttribute('aria-invalid', String(bad));
      if (bad) ok = false;
    });
    if (!ok) { note.style.color = 'var(--warn)'; note.textContent = 'Preencha nome, e-mail válido e mensagem para enviar.'; return; }
    const d = Object.fromEntries(new FormData(form));
    const body = `Nome: ${d.nome}\nE-mail: ${d.email}\nWhatsApp: ${d.telefone || '-'}\n\n${d.mensagem}`;
    const to = (window.MRP_CONFIG && window.MRP_CONFIG.emailContato) || 'contato@muriloroque.pro';
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(d.assunto)}&body=${encodeURIComponent(body)}`;
    note.style.color = 'var(--ok)';
    note.textContent = 'Abrimos o seu aplicativo de e-mail com a mensagem pronta. É só enviar.';
  });
})();
