// Small enhancements; every page works without this file.
(function () {
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // iOS Safari only shows :active press states once the page listens for touches.
  document.addEventListener('touchstart', function () {}, { passive: true });

  // ---------- Light / dark ----------
  // The head script already applied a saved choice before the first paint.
  var themeBtn = document.querySelector('.theme-btn');
  var systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  function currentTheme() {
    return root.getAttribute('data-theme') || (systemDark && systemDark.matches ? 'dark' : 'light');
  }
  function labelThemeBtn() {
    if (!themeBtn) return;
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    themeBtn.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', currentTheme() === 'dark' ? '#000000' : '#ffffff');
  }
  if (themeBtn) {
    labelThemeBtn();
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      // Ease the colours across instead of flashing the whole page.
      if (!reduceMotion) {
        root.classList.add('theme-anim');
        setTimeout(function () { root.classList.remove('theme-anim'); }, 400);
      }
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      labelThemeBtn();
      scenes.forEach(function (s) { s.dirty = true; });
      requestTick();
    });
    if (systemDark && systemDark.addEventListener) systemDark.addEventListener('change', labelThemeBtn);
  }

  // ---------- Menu on small screens ----------
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

  // ---------- Numbers ----------
  // Split "$78K+" or "1,100+" into prefix, number and suffix.
  function parseNumber(text) {
    var m = text.match(/^(\D*)([\d,]+)(.*)$/);
    if (!m) return null;
    var commas = m[2].indexOf(',') > -1;
    return {
      target: parseInt(m[2].replace(/,/g, ''), 10),
      format: function (v) { return m[1] + (commas ? v.toLocaleString('en-US') : String(v)) + m[3]; }
    };
  }
  // Swap an element's text for moving digits; screen readers keep the real value.
  function splitForCounting(el) {
    var text = el.textContent.trim();
    var n = parseNumber(text);
    if (!n) return null;
    var range = document.createRange();
    range.selectNodeContents(el);
    var width = Math.ceil(range.getBoundingClientRect().width);
    var shown = document.createElement('span');
    shown.className = 'count';
    shown.setAttribute('aria-hidden', 'true');
    if (width) shown.style.minWidth = width + 'px';
    shown.textContent = n.format(0);
    var spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = text;
    el.textContent = '';
    el.appendChild(shown);
    el.appendChild(spoken);
    return { shown: shown, n: n, text: text };
  }
  // Count up over 1.6 s when an element is revealed.
  function countUp(el) {
    if (reduceMotion) return;
    var c = splitForCounting(el);
    if (!c) return;
    var item = el.closest('.stagger > *, .card-stats > *');
    var delay = item ? parseFloat(getComputedStyle(item).transitionDelay) * 1000 || 0 : 150;
    var started = false;
    function begin() {
      if (started) return;
      started = true;
      var start = 0;
      requestAnimationFrame(function step(now) {
        if (!start) start = now;
        var t = Math.min((now - start) / 1600, 1);
        var eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        c.shown.textContent = c.n.format(Math.round(c.n.target * eased));
        if (t < 1) requestAnimationFrame(step);
      });
    }
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
    setTimeout(function () { c.shown.textContent = c.text; }, delay + 2600);
  }

  // ---------- Reveal and pop-in ----------
  Array.prototype.forEach.call(document.querySelectorAll('.stagger, .card-stats'), function (group) {
    Array.prototype.forEach.call(group.children, function (child, i) { child.style.setProperty('--i', i); });
  });
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

  // ---------- Scroll scenes ----------
  // Each .scene is a tall section whose stage is pinned to the screen. Its
  // progress (0 at the top, 1 when the stage is about to let go) drives:
  //  - a canvas: either a camera moving across one photo (data-camera:
  //    [progress, centreX, centreY, zoom] keyframes), or a frame sequence
  //    (data-frames="images/seq/name-{i}.jpg" data-frame-count="120"), the
  //    flip-book technique Apple uses for product animations;
  //  - text beats (data-from / data-to) that fade and slide with the scroll;
  //  - numbers inside a beat (data-scrub) that count as you scroll.
  var scenes = [];
  var sceneEls = document.querySelectorAll('.scene');
  if (sceneEls.length && !reduceMotion && window.requestAnimationFrame) {
    root.classList.add('scenes-on');
    Array.prototype.forEach.call(sceneEls, function (el) { scenes.push(makeScene(el)); });
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function makeScene(el) {
    var s = { el: el, dirty: true, lastKey: '', canvas: el.querySelector('canvas'), beats: [] };
    Array.prototype.forEach.call(el.querySelectorAll('.beat'), function (b) {
      var beat = { el: b, from: parseFloat(b.getAttribute('data-from')) || 0, to: parseFloat(b.getAttribute('data-to') || '1'), nums: [] };
      Array.prototype.forEach.call(b.querySelectorAll('[data-scrub]'), function (numEl) {
        var c = splitForCounting(numEl);
        if (c) beat.nums.push(c);
      });
      s.beats.push(beat);
    });
    if (s.canvas) {
      s.ctx = s.canvas.getContext('2d');
      s.camera = JSON.parse(s.canvas.getAttribute('data-camera') || '[[0,0.5,0.5,1],[1,0.5,0.5,1]]');
      var frames = s.canvas.getAttribute('data-frames');
      if (frames) {
        // Flip-book: preload every frame, draw the one that matches the scroll.
        var count = parseInt(s.canvas.getAttribute('data-frame-count'), 10) || 1;
        var pad = parseInt(s.canvas.getAttribute('data-frame-pad'), 10) || 4;
        s.frames = [];
        for (var i = 1; i <= count; i++) {
          var img = new Image();
          img.decoding = 'async';
          img.src = frames.replace('{i}', String(i).padStart(pad, '0'));
          img.onload = function () { s.dirty = true; requestTick(); };
          s.frames.push(img);
        }
      } else {
        s.img = new Image();
        s.img.decoding = 'async';
        s.img.onload = function () { s.dirty = true; requestTick(); };
        s.img.src = s.canvas.getAttribute('data-src');
      }
    }
    return s;
  }

  function sizeCanvas(s) {
    var c = s.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; s.dirty = true; }
  }

  function cameraAt(cam, p) {
    if (p <= cam[0][0]) return cam[0];
    for (var i = 1; i < cam.length; i++) {
      if (p <= cam[i][0]) {
        var a = cam[i - 1], b = cam[i];
        var t = easeInOut((p - a[0]) / (b[0] - a[0] || 1));
        return [p, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
      }
    }
    return cam[cam.length - 1];
  }

  // Draw an image filling the canvas ("cover"), centred on (cx, cy) and zoomed,
  // never showing past its edges.
  function drawCover(ctx, img, cw, ch, cx, cy, zoom) {
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return;
    var scale = Math.max(cw / iw, ch / ih) * Math.max(zoom, 1);
    var sw = cw / scale, sh = ch / scale;
    var sx = Math.min(Math.max(cx * iw - sw / 2, 0), iw - sw);
    var sy = Math.min(Math.max(cy * ih - sh / 2, 0), ih - sh);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
  }

  function renderScene(s) {
    var rect = s.el.getBoundingClientRect();
    var vh = window.innerHeight;
    if (rect.bottom < -vh || rect.top > vh * 2) return;     // far off screen
    var travel = rect.height - vh;
    var p = travel > 0 ? clamp01(-rect.top / travel) : 0;

    // Text beats: fade and slide in at "from", out at "to".
    var F = 0.07;
    s.beats.forEach(function (b) {
      var a = b.from <= 0 ? 1 : clamp01((p - b.from) / F);
      var z = b.to >= 1 ? 1 : clamp01((b.to - p) / F);
      a = easeInOut(a); z = easeInOut(z);
      var o = Math.min(a, z);
      var y = (1 - a) * 32 - (1 - z) * 32;
      b.el.style.opacity = o.toFixed(3);
      b.el.style.transform = 'translate3d(0,' + y.toFixed(1) + 'px,0)';
      b.el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
      b.el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
      if (b.nums.length) {
        var q = clamp01((p - b.from) / ((b.to - b.from) * 0.55));
        var eased = 1 - Math.pow(1 - q, 3);
        b.nums.forEach(function (c) { c.shown.textContent = c.n.format(Math.round(c.n.target * eased)); });
      }
    });

    // Canvas: redraw only when the picture would change.
    if (!s.canvas) return;
    sizeCanvas(s);
    var cw = s.canvas.width, ch = s.canvas.height;
    if (s.frames) {
      var idx = Math.min(s.frames.length - 1, Math.floor(p * s.frames.length));
      var key = 'f' + idx + ':' + cw + 'x' + ch;
      var frame = s.frames[idx];
      if ((key !== s.lastKey || s.dirty) && frame.complete && frame.naturalWidth) {
        s.ctx.clearRect(0, 0, cw, ch);
        drawCover(s.ctx, frame, cw, ch, 0.5, 0.5, 1);
        s.lastKey = key; s.dirty = false;
      }
    } else if (s.img && s.img.complete && s.img.naturalWidth) {
      var c = cameraAt(s.camera, p);
      var k = c[1].toFixed(4) + ',' + c[2].toFixed(4) + ',' + c[3].toFixed(4) + ':' + cw + 'x' + ch;
      if (k !== s.lastKey || s.dirty) {
        s.ctx.clearRect(0, 0, cw, ch);
        drawCover(s.ctx, s.img, cw, ch, c[1], c[2], c[3]);
        s.lastKey = k; s.dirty = false;
      }
    }
  }

  var ticking = false;
  function requestTick() {
    if (ticking || !scenes.length) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; scenes.forEach(renderScene); });
  }
  if (scenes.length) {
    window.addEventListener('scroll', requestTick, { passive: true });
    window.addEventListener('resize', function () { scenes.forEach(function (s) { s.dirty = true; }); requestTick(); });
    requestTick();
  }

  window.revealReady = true;

  // ---------- Copy-to-clipboard buttons ----------
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
