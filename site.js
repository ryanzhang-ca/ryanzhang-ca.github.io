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

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Number the items in each pop-in group so CSS can start them one after another.
  Array.prototype.forEach.call(document.querySelectorAll('.stagger, .card-stats'), function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) { child.style.setProperty('--i', i); });
  });

  // Count a number like "$78K+" or "1,100+" up from zero. Screen readers get the
  // final value straight away; the moving digits are hidden from them.
  function countUp(el) {
    var text = el.textContent.trim();
    var m = text.match(/^(\D*)([\d,]+)(.*)$/);
    if (!m || reduceMotion) return;
    var target = parseInt(m[2].replace(/,/g, ''), 10);
    var commas = m[2].indexOf(',') > -1;
    var format = function (v) { return m[1] + (commas ? v.toLocaleString('en-US') : String(v)) + m[3]; };
    // Reserve the final width so the line doesn't shuffle while digits are added.
    var range = document.createRange();
    range.selectNodeContents(el);
    var width = Math.ceil(range.getBoundingClientRect().width);
    var shown = document.createElement('span');
    shown.className = 'count';
    shown.setAttribute('aria-hidden', 'true');
    shown.style.minWidth = width + 'px';
    shown.textContent = format(0);
    var spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = text;
    el.textContent = '';
    el.appendChild(shown);
    el.appendChild(spoken);
    // Count over 1.6 s, easing out, starting the moment this number's own
    // pop-in actually begins (with a timer as a backstop).
    var started = false;
    function begin() {
      if (started) return;
      started = true;
      var start = 0;
      requestAnimationFrame(function step(now) {
        if (!start) start = now;
        var t = Math.min((now - start) / 1600, 1);
        var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        shown.textContent = format(Math.round(target * eased));
        if (t < 1) requestAnimationFrame(step);
      });
    }
    var item = el.closest('.stagger > *, .card-stats > *');
    var delay = item ? parseFloat(getComputedStyle(item).transitionDelay) * 1000 || 0 : 150;
    if (item) {
      item.addEventListener('transitionstart', function onStart(e) {
        if (e.target !== item) return;
        item.removeEventListener('transitionstart', onStart);
        begin();
      });
      setTimeout(begin, delay + 400);
    } else {
      setTimeout(begin, delay);
    }
    // If the browser stops drawing frames (a hidden tab), still land on the real number.
    setTimeout(function () { shown.textContent = text; }, delay + 2600);
  }

  // Bring content in as it scrolls into view, once.
  var items = document.querySelectorAll('.reveal');
  function show(el) {
    el.classList.add('in');
    Array.prototype.forEach.call(el.querySelectorAll('[data-count]'), countUp);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { show(entry.target); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
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
