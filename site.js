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
    if (meta) meta.setAttribute('content', currentTheme() === 'dark' ? '#060608' : '#fbfbfd');
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
  // progress p (0 at the top, 1 when the stage is about to let go) drives:
  //  - .beat: text that fades and slides in at data-from and out at data-to
  //    (data-zoom also scales it through the screen);
  //  - .chapter: a text layer plus a picture layer for one part of the scene.
  //    Pictures cross-fade into each other while the text slides;
  //  - canvases: a camera moving across one photo (data-camera keyframes of
  //    [progress, centreX, centreY, zoom], progress local to its chapter), or
  //    a flip-book frame sequence (data-frames="images/seq/name-{i}.jpg",
  //    data-frame-count), the technique Apple uses for product animations;
  //  - [data-words] / [data-rows]: words or list rows that light up in turn;
  //  - [data-scrub]: numbers that count as you scroll.
  var scenes = [];
  var sceneEls = document.querySelectorAll('.scene');
  if (sceneEls.length && !reduceMotion && window.requestAnimationFrame) {
    root.classList.add('scenes-on');
    Array.prototype.forEach.call(sceneEls, function (el) { scenes.push(makeScene(el)); });
  }

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function range(el, fallbackFrom, fallbackTo) {
    var f = el.getAttribute('data-from'), t = el.getAttribute('data-to');
    return [f === null ? fallbackFrom : parseFloat(f), t === null ? fallbackTo : parseFloat(t)];
  }
  function scrubNums(el) {
    var out = [];
    Array.prototype.forEach.call(el.querySelectorAll('[data-scrub]'), function (numEl) {
      var c = splitForCounting(numEl);
      if (c) out.push(c);
    });
    return out;
  }
  // Wrap each word of a plain-text element in a span so it can light up.
  function splitWords(el) {
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    return words.map(function (w, i) {
      var span = document.createElement('span');
      span.className = 'w';
      span.textContent = w;
      el.appendChild(span);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return span;
    });
  }

  function makeLayer(s, canvas, from, to) {
    var L = { canvas: canvas, ctx: canvas.getContext('2d'), from: from, to: to, lastKey: '',
              camera: JSON.parse(canvas.getAttribute('data-camera') || '[[0,0.5,0.5,1],[1,0.5,0.5,1]]') };
    var redraw = function () { s.dirty = true; requestTick(); };
    var frames = canvas.getAttribute('data-frames');
    if (frames) {
      // Flip-book: preload every frame, draw the one that matches the scroll.
      var count = parseInt(canvas.getAttribute('data-frame-count'), 10) || 1;
      var pad = parseInt(canvas.getAttribute('data-frame-pad'), 10) || 4;
      L.frames = [];
      for (var i = 1; i <= count; i++) {
        var img = new Image();
        img.decoding = 'async';
        img.onload = redraw;
        img.src = frames.replace('{i}', String(i).padStart(pad, '0'));
        L.frames.push(img);
      }
    } else {
      L.img = new Image();
      L.img.decoding = 'async';
      L.img.onload = redraw;
      L.img.src = canvas.getAttribute('data-src');
    }
    return L;
  }

  function makeScene(el) {
    var s = { el: el, dirty: true, beats: [], chapters: [], layers: [], lights: [] };
    Array.prototype.forEach.call(el.querySelectorAll('.beat'), function (b) {
      var r = range(b, 0, 1);
      s.beats.push({ el: b, from: r[0], to: r[1], zoom: b.hasAttribute('data-zoom'), nums: scrubNums(b) });
    });
    Array.prototype.forEach.call(el.querySelectorAll('.chapter'), function (c) {
      var r = range(c, 0, 1);
      s.chapters.push({ el: c, from: r[0], to: r[1], copy: c.querySelector('.chapter-copy'), media: c.querySelector('.chapter-media'), nums: scrubNums(c) });
    });
    Array.prototype.forEach.call(el.querySelectorAll('canvas'), function (cv) {
      var ch = cv.closest('.chapter');
      var r = ch ? range(ch, 0, 1) : [0, 1];
      s.layers.push(makeLayer(s, cv, r[0], r[1]));
    });
    Array.prototype.forEach.call(el.querySelectorAll('[data-words], [data-rows]'), function (h) {
      var r = range(h, 0, 1);
      var parts = h.hasAttribute('data-words') ? splitWords(h) : Array.prototype.slice.call(h.children);
      s.lights.push({ from: r[0], to: r[1], parts: parts });
    });
    return s;
  }

  function sizeCanvas(L) {
    var c = L.canvas, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; L.lastKey = ''; }
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

  // How far something has come in (a) and how far it has gone out (z), 0..1.
  function inOut(p, from, to, f) {
    var a = from <= 0 ? 1 : easeInOut(clamp01((p - from) / f));
    var z = to >= 1 ? 1 : easeInOut(clamp01((to - p) / f));
    return [a, z];
  }
  function setLayer(el, o, transform) {
    el.style.opacity = o.toFixed(3);
    if (transform !== undefined) el.style.transform = transform;
    el.style.visibility = o > 0.01 ? 'visible' : 'hidden';
    el.style.pointerEvents = o > 0.6 ? 'auto' : 'none';
  }
  function countWith(nums, q) {
    var eased = 1 - Math.pow(1 - clamp01(q), 3);
    nums.forEach(function (c) { c.shown.textContent = c.n.format(Math.round(c.n.target * eased)); });
  }

  function renderScene(s) {
    var rect = s.el.getBoundingClientRect();
    var vh = window.innerHeight;
    if (rect.bottom < -vh || rect.top > vh * 2) return;     // far off screen
    var travel = rect.height - vh;
    var p = travel > 0 ? clamp01(-rect.top / travel) : 0;

    s.beats.forEach(function (b) {
      var io = inOut(p, b.from, b.to, 0.07), a = io[0], z = io[1];
      var y = (1 - a) * 32 - (1 - z) * 32;
      var sc = b.zoom ? 1 - (1 - a) * 0.06 + (1 - z) * 0.08 : 1;
      setLayer(b.el, Math.min(a, z), 'translate3d(0,' + y.toFixed(1) + 'px,0) scale(' + sc.toFixed(4) + ')');
      if (b.nums.length) countWith(b.nums, (p - b.from) / ((b.to - b.from) * 0.55));
    });

    s.chapters.forEach(function (c) {
      // Text slides; the picture behind it cross-fades with its neighbours.
      var t = inOut(p, c.from, c.to, 0.05);
      var y = (1 - t[0]) * 40 - (1 - t[1]) * 40;
      var shown = false;
      if (c.copy) {
        setLayer(c.copy, Math.min(t[0], t[1]), 'translate3d(0,' + y.toFixed(1) + 'px,0)');
        shown = shown || Math.min(t[0], t[1]) > 0.01;
      }
      if (c.media) {
        var m = inOut(p, c.from - 0.02, c.to + 0.02, 0.04);
        setLayer(c.media, Math.min(m[0], m[1]));
        shown = shown || Math.min(m[0], m[1]) > 0.01;
      }
      c.el.style.visibility = shown ? 'visible' : 'hidden';
      if (c.nums.length) countWith(c.nums, (p - c.from) / ((c.to - c.from) * 0.5));
    });

    s.lights.forEach(function (h) {
      var k = clamp01((p - h.from) / (h.to - h.from || 1)) * h.parts.length;
      h.parts.forEach(function (el, i) {
        el.style.opacity = (0.22 + 0.78 * clamp01(k - i)).toFixed(3);
      });
    });

    // Canvases: redraw only when visible and when the picture would change.
    s.layers.forEach(function (L) {
      var holder = L.canvas.closest('.chapter-media');
      if (holder && holder.style.visibility === 'hidden') return;
      sizeCanvas(L);
      var cw = L.canvas.width, ch = L.canvas.height;
      var q = clamp01((p - L.from) / (L.to - L.from || 1));
      if (L.frames) {
        var idx = Math.min(L.frames.length - 1, Math.floor(q * L.frames.length));
        var frame = L.frames[idx], key = 'f' + idx + ':' + cw + 'x' + ch;
        if ((key !== L.lastKey || s.dirty) && frame.complete && frame.naturalWidth) {
          L.ctx.clearRect(0, 0, cw, ch);
          drawCover(L.ctx, frame, cw, ch, 0.5, 0.5, 1);
          L.lastKey = key;
        }
      } else if (L.img && L.img.complete && L.img.naturalWidth) {
        var c = cameraAt(L.camera, q);
        var k = c[1].toFixed(4) + ',' + c[2].toFixed(4) + ',' + c[3].toFixed(4) + ':' + cw + 'x' + ch;
        if (k !== L.lastKey || s.dirty) {
          L.ctx.clearRect(0, 0, cw, ch);
          drawCover(L.ctx, L.img, cw, ch, c[1], c[2], c[3]);
          L.lastKey = k;
        }
      }
    });
    s.dirty = false;
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

  // ---------- Jumps within a page ----------
  // Back to top, the project name in a project's bar, section links. A short
  // hop scrolls smoothly. A long one would scrub every pinned scene backwards
  // on the way, so the page fades out, moves, and fades back in instead.
  var fade = null;
  function samePage(a) {
    var strip = function (path) { return path.replace(/index\.html$/, ''); };
    return a.origin === location.origin && strip(a.pathname) === strip(location.pathname);
  }
  function instantScroll(y) {
    // 'instant' overrides the page's smooth scrolling; the style change is a
    // backstop for browsers that don't know that value yet.
    var html = document.documentElement, before = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    void getComputedStyle(html).scrollBehavior;
    try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); }
    html.style.scrollBehavior = before;
  }
  function jumpTo(y, target) {
    var land = function () {
      if (target) {
        // Move keyboard focus along with the view, as a normal link jump would.
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      } else if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    };
    var distance = Math.abs(window.scrollY - y);
    if (reduceMotion) { instantScroll(y); land(); return; }
    if (distance < window.innerHeight * 1.5) {
      window.scrollTo({ top: y, behavior: 'smooth' });
      land();
      return;
    }
    if (!fade) {
      fade = document.createElement('div');
      fade.className = 'page-fade';
      fade.setAttribute('aria-hidden', 'true');
      document.body.appendChild(fade);
      fade.getBoundingClientRect();                       // start from transparent
    }
    fade.classList.add('on');
    setTimeout(function () {
      instantScroll(y);
      scenes.forEach(function (s) { s.dirty = true; renderScene(s); });
      var revealed = false;
      var reveal = function () { if (revealed) return; revealed = true; fade.classList.remove('on'); land(); };
      // Fade back in once the new spot has been drawn (with a timer as a backstop).
      requestAnimationFrame(function () { requestAnimationFrame(reveal); });
      setTimeout(reveal, 150);
    }, 200);
  }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank' || !samePage(a)) return;
    var hash = a.hash;
    var target = hash && hash !== '#top' ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (hash && hash !== '#top' && !target) return;          // let the browser handle anything unusual
    e.preventDefault();
    var y = 0;
    if (target) {
      // A pinned scene starts exactly at its top; other sections leave room for the bar.
      var pad = target.classList.contains('scene') ? 0 : parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      y = Math.max(0, target.getBoundingClientRect().top + window.scrollY - pad);
    }
    if (location.hash !== (hash || '')) history.pushState(null, '', hash || location.pathname + location.search);
    jumpTo(y, target);
  });

  // ---------- Photo carousels ----------
  // The track is the browser's own scroll-snap strip, so swipes and trackpad
  // flicks keep their momentum. This only keeps the arrows, the dots and the
  // dimmed side cards in step with wherever the strip comes to rest.
  Array.prototype.forEach.call(document.querySelectorAll('.carousel'), function (c) {
    var track = c.querySelector('.carousel-track');
    var slides = Array.prototype.slice.call(track.querySelectorAll('.slide'));
    var dots = Array.prototype.slice.call(c.querySelectorAll('.dotnav button'));
    var prev = c.querySelector('.paddle[data-dir="-1"]');
    var next = c.querySelector('.paddle[data-dir="1"]');
    var status = c.querySelector('[aria-live]');
    var current = -1, aim = null, raf = 0;
    if (slides.length < 2) return;

    // How far slide i's centre sits from the middle of the strip.
    function offsetOf(i) {
      var t = track.getBoundingClientRect(), r = slides[i].getBoundingClientRect();
      return r.left + r.width / 2 - (t.left + track.clientWidth / 2);
    }
    function nearest() {
      var best = 0, bestD = Infinity;
      for (var i = 0; i < slides.length; i++) {
        var d = Math.abs(offsetOf(i));
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    }
    function setDisabled(btn, off, other) {
      if (off && document.activeElement === btn) other.focus();  // keep focus on a usable arrow
      btn.disabled = off;
    }
    function update() {
      raf = 0;
      var i = nearest();
      if (aim === i) aim = null;
      if (i === current) return;
      current = i;
      slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
      setDisabled(prev, i === 0, next);
      setDisabled(next, i === slides.length - 1, prev);
      if (status) status.textContent = 'Photo ' + (i + 1) + ' of ' + slides.length;
    }
    function go(i) {
      aim = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollBy({ left: offsetOf(aim), behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    // Quick repeated taps step from where the strip is heading, not where it is.
    function step(dir) { go((aim !== null ? aim : current) + dir); }

    prev.addEventListener('click', function () { step(-1); });
    next.addEventListener('click', function () { step(1); });
    dots.forEach(function (d, k) { d.addEventListener('click', function () { go(k); }); });
    slides.forEach(function (s, k) { s.addEventListener('click', function () { if (k !== current) go(k); }); });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); }
    });
    // A swipe or flick takes over from any arrow tap still in flight.
    ['pointerdown', 'wheel', 'touchstart'].forEach(function (type) {
      track.addEventListener(type, function () { aim = null; }, { passive: true });
    });
    track.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    track.addEventListener('scrollend', update);
    window.addEventListener('resize', function () { current = -1; update(); });

    c.classList.add('is-ready');
    update();
  });

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
