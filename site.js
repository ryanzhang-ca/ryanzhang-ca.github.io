// Small enhancements; every page works without this file.
(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Theme toggle. The <head> script applies a saved choice before first paint.
  var toggle = document.querySelector('[data-theme-toggle]');
  function currentTheme() {
    var chosen = root.getAttribute('data-theme');
    if (chosen) return chosen;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function labelToggle() {
    var label = currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
  }
  if (toggle) {
    labelToggle();
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('rz-theme', next); } catch (e) {}
      labelToggle();
    });
  }

  // Hairline under the nav once the page scrolls.
  var nav = document.querySelector('.site-nav');
  if (nav) {
    var markScrolled = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', markScrolled, { passive: true });
    markScrolled();
  }

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
    function copied() {
      button.textContent = 'Copied';
      button.classList.add('is-copied');
      setTimeout(function () {
        button.textContent = original;
        button.classList.remove('is-copied');
      }, 1600);
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

  // Fade sections in as they scroll into view. Anything already on screen is
  // marked visible first, so nothing above the fold flickers.
  var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (items.length && !reduceMotion && 'IntersectionObserver' in window) {
    var fold = window.innerHeight * 0.92;
    items.forEach(function (el) {
      if (el.getBoundingClientRect().top < fold) el.classList.add('is-visible');
    });
    root.classList.add('js-reveal');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach(function (el) {
      if (!el.classList.contains('is-visible')) observer.observe(el);
    });
  }
})();
