// Small enhancements; every page works without this file.
(function () {
  // iOS Safari only shows :active press states once the page listens for touches.
  document.addEventListener('touchstart', function () {}, { passive: true });

  // Menu button on small screens.
  var nav = document.querySelector('.nav');
  var menuBtn = document.querySelector('.menu-btn');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  if (nav && menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    Array.prototype.forEach.call(nav.querySelectorAll('nav a'), function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
    });
  }

  // Fade content up as it scrolls into view, once.
  var items = document.querySelectorAll('.reveal');
  function show(el) { el.classList.add('in'); }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { show(entry.target); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(items, show);
  }
  window.revealReady = true;

  // Copy-to-clipboard buttons.
  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(area);
    return ok;
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
    var original = button.textContent;
    var timer = 0;
    function copied() {
      button.textContent = 'Copied';
      // A second click restarts the countdown instead of being cut short by the first.
      clearTimeout(timer);
      timer = setTimeout(function () { button.textContent = original; }, 1600);
    }
    button.addEventListener('click', function () {
      var text = button.getAttribute('data-copy');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(copied, function () { if (fallbackCopy(text)) copied(); });
      } else if (fallbackCopy(text)) {
        copied();
      }
    });
  });
})();
