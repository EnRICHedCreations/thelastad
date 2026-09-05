(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const txt = (s) => ($(s)?.textContent || '').trim();
  let lastRemaining = null;
  let lastName = '';
  let toastTimer;

  function toast(message) {
    let el = $('.viral-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'viral-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  async function share(text) {
    const data = { title: 'The Last Ad', text, url: location.origin + '/' };
    try {
      if (navigator.share) return await navigator.share(data);
      await navigator.clipboard.writeText(`${text} ${data.url}`);
      toast('Link copied. Bring reinforcements.');
    } catch (e) {
      if (e?.name !== 'AbortError') toast('Copy the URL and send it to someone dangerous.');
    }
  }

  function clearLaunchUI() {
    $('.viral-rail')?.remove();
    $('.viral-moment')?.remove();
    document.body.classList.remove('viral-danger', 'viral-critical');
  }

  function mountRail() {
    if ($('.viral-rail') || !$('.home')) return;
    const rail = document.createElement('div');
    rail.className = 'viral-rail';
    rail.innerHTML = `<div class="viral-cell viral-live"><i></i><span>Live now</span><strong class="viral-name">—</strong></div><div class="viral-cell viral-actions"><span>Life remaining</span><strong>—</strong></div><div class="viral-cell viral-ended"><span>The graveyard</span><strong>OPEN</strong></div><button class="viral-share" type="button">Summon the internet ↗</button>`;
    const header = $('.header');
    if (header) header.insertAdjacentElement('afterend', rail); else document.body.prepend(rail);
    $('.viral-share', rail)?.addEventListener('click', () => share(`${lastName || 'An ad'} is alive on The Last Ad. ${lastRemaining ?? ''} actions remain. Help decide when it dies.`));
  }

  function mountMoment() {
    if ($('.viral-moment') || !$('.home')) return;
    const queue = $('.queue-strip');
    if (!queue) return;
    const block = document.createElement('section');
    block.className = 'viral-moment';
    block.innerHTML = `<div class="viral-moment-inner"><div class="viral-moment-copy"><span class="viral-kicker">Make it a group decision</span><strong>The faster you share it, the shorter this ad lives.</strong></div><div class="viral-moment-actions"><button class="viral-mini viral-copy" type="button">Copy kill link</button><button class="viral-mini viral-native" type="button">Challenge a friend ↗</button></div></div>`;
    queue.insertAdjacentElement('beforebegin', block);
    $('.viral-copy', block)?.addEventListener('click', async () => {
      const text = `${lastName || 'This ad'} has ${lastRemaining ?? 'a few'} actions left on The Last Ad. Help end it: ${location.origin}/`;
      try { await navigator.clipboard.writeText(text); toast('Kill link copied.'); } catch { toast('Copy this page URL to share.'); }
    });
    $('.viral-native', block)?.addEventListener('click', () => share(`I took one life off ${lastName || 'this ad'}. Your turn. ${lastRemaining ?? ''} actions remain.`));
  }

  function sync() {
    if (!$('.home')) { clearLaunchUI(); return; }
    mountRail(); mountMoment();
    const counter = $('.counter');
    const raw = counter?.textContent?.replace(/\D/g, '');
    const remaining = raw === undefined || raw === '' ? null : Number(raw);
    const name = txt('.ad-brand');
    if (Number.isFinite(remaining)) lastRemaining = remaining;
    if (name) lastName = name;
    const rail = $('.viral-rail');
    if (rail) {
      const n = $('.viral-name', rail); const a = $('.viral-actions strong', rail);
      if (n) n.textContent = lastName || 'ON AIR';
      if (a) a.textContent = lastRemaining == null ? '—' : String(lastRemaining).padStart(3, '0');
    }
    document.body.classList.toggle('viral-danger', lastRemaining != null && lastRemaining <= 100);
    document.body.classList.toggle('viral-critical', lastRemaining != null && lastRemaining <= 25);
    if (lastName && lastRemaining != null) document.title = `${String(lastRemaining).padStart(3,'0')} left — ${lastName} | The Last Ad`;
  }

  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; sync(); }); };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  addEventListener('popstate', schedule);
  schedule();
})();
