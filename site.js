// Small enhancements; every page works without this file.
(function () {
  // iOS Safari only shows :active press states once the page listens for touches.
  document.addEventListener('touchstart', function () {}, { passive: true });

  // Menu button on small screens.
  var bar = document.querySelector('.bar');
  var menuBtn = document.querySelector('.menu-btn');
  function setMenu(open) {
    bar.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Close' : 'Menu';
  }
  if (bar && menuBtn) {
    menuBtn.addEventListener('click', function () { setMenu(!bar.classList.contains('open')); });
    Array.prototype.forEach.call(bar.querySelectorAll('nav a'), function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
  }

  // Project index: float a preview of the hovered row beside the cursor.
  var preview = document.querySelector('.preview');
  var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (preview && canHover) {
    var W = 300, H = 225;   // the preview's fixed 4:3 frame (styles.css)
    var GAP = 40;           // space between the cursor and the frame
    var EDGE = 16;          // keep the frame this far inside the window
    var TAU = 84;           // follow time constant in ms: the old 0.18-per-frame feel at 60 Hz
    var parts = preview.querySelectorAll('[data-for]');
    var x = 0, y = 0, tx = 0, ty = 0, frame = 0, last = 0;
    var place = function () { preview.style.transform = 'translate(' + x + 'px, ' + y + 'px)'; };
    // Ease toward the cursor by elapsed time, not per frame, so it feels the
    // same on a 60 Hz and a 120 Hz screen.
    var follow = function (now) {
      var dt = last ? Math.min(now - last, 64) : 1000 / 60;
      last = now;
      var k = 1 - Math.exp(-dt / TAU);
      x += (tx - x) * k;
      y += (ty - y) * k;
      place();
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.5) {
        frame = requestAnimationFrame(follow);
      } else {
        frame = 0;
        last = 0;
      }
    };
    window.addEventListener('mousemove', function (e) {
      // Sit to the cursor's right; near the right edge, flip to its left so the
      // frame never slides under the cursor and covers the row being read.
      var flip = e.clientX + GAP + W > window.innerWidth - EDGE;
      tx = flip ? e.clientX - GAP - W : e.clientX + GAP;
      ty = Math.min(Math.max(e.clientY - H / 2, 60), window.innerHeight - H - EDGE);
      preview.classList.toggle('flip', flip);
      if (reduceMotion) { x = tx; y = ty; place(); return; }
      if (!frame) frame = requestAnimationFrame(follow);
    }, { passive: true });
    Array.prototype.forEach.call(document.querySelectorAll('[data-preview]'), function (row) {
      row.addEventListener('mouseenter', function () {
        // Appear where the cursor is now instead of gliding in from the last row.
        if (!preview.classList.contains('on')) { x = tx; y = ty; place(); }
        Array.prototype.forEach.call(parts, function (p) {
          p.hidden = p.getAttribute('data-for') !== row.getAttribute('data-preview');
        });
        preview.classList.add('on');
      });
      row.addEventListener('mouseleave', function () { preview.classList.remove('on'); });
    });
    // Scrolling can move a row out from under a still cursor without a mouseleave.
    window.addEventListener('scroll', function () { preview.classList.remove('on'); }, { passive: true });
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
