// Small enhancements; every page works without this file.
(function () {
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
    var parts = preview.querySelectorAll('[data-for]');
    var x = 0, y = 0, tx = 0, ty = 0, frame = 0;
    var follow = function () {
      x += (tx - x) * 0.18;
      y += (ty - y) * 0.18;
      preview.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
      frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.5 ? requestAnimationFrame(follow) : 0;
    };
    window.addEventListener('mousemove', function (e) {
      tx = Math.min(e.clientX + 40, window.innerWidth - 320);
      ty = Math.max(e.clientY - 160, 60);
      if (reduceMotion) { x = tx; y = ty; }
      if (!frame) frame = requestAnimationFrame(follow);
    }, { passive: true });
    Array.prototype.forEach.call(document.querySelectorAll('[data-preview]'), function (row) {
      row.addEventListener('mouseenter', function () {
        if (!preview.classList.contains('on')) { x = tx; y = ty; }
        Array.prototype.forEach.call(parts, function (p) {
          p.hidden = p.getAttribute('data-for') !== row.getAttribute('data-preview');
        });
        preview.classList.add('on');
      });
      row.addEventListener('mouseleave', function () { preview.classList.remove('on'); });
    });
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
      setTimeout(function () { button.textContent = original; }, 1600);
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
