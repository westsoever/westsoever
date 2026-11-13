const t = document.getElementById('menu-toggle');
t.onclick = () => { const o = t.classList.toggle('open'); document.getElementById('primary').classList.toggle('showing', o); t.setAttribute('aria-expanded', o); };
