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
    var s = { el: el, dirty: true, beats: [], chapters: [], layers: [], lights: [], onBeat: -1, onChapter: -1 };
    Array.prototype.forEach.call(el.querySelectorAll('.beat'), function (b) {
      var r = range(b, 0, 1);
      s.beats.push({ el: b, from: r[0], to: r[1], zoom: b.hasAttribute('data-zoom'), nums: scrubNums(b) });
    });
    Array.prototype.forEach.call(el.querySelectorAll('.chapter'), function (c) {
      var r = range(c, 0, 1);
      s.chapters.push({ el: c, from: r[0], to: r[1], nums: scrubNums(c) });
    });
    // Each part takes over halfway through the gap after the one before it,
    // so there is always exactly one on screen.
    [s.beats, s.chapters].forEach(function (list) {
      list.sort(function (a, b) { return a.from - b.from; });
      list.forEach(function (x, i) { x.at = i ? (list[i - 1].to + x.from) / 2 : -Infinity; });
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

  // Which part of a list is on at progress p. The CSS animates the change:
  // the old part slides out the way you are scrolling while the new one
  // slides in behind it, so the screen is never left empty.
  function current(list, p) {
    var on = 0;
    for (var i = 1; i < list.length; i++) if (p >= list[i].at) on = i;
    return on;
  }
  function mark(list, on) {
    list.forEach(function (x, i) {
      x.el.classList.toggle('is-on', i === on);
      x.el.classList.toggle('is-past', i < on);
    });
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

    var b0 = current(s.beats, p);
    if (b0 !== s.onBeat) { s.onBeat = b0; mark(s.beats, b0); }
    s.beats.forEach(function (b) {
      // A zoom beat grows a little as you scroll through it.
      if (b.zoom) b.el.style.scale = (1 + 0.06 * clamp01((p - b.from) / (b.to - b.from || 1))).toFixed(4);
      if (b.nums.length) countWith(b.nums, (p - b.from) / ((b.to - b.from) * 0.55));
    });

    var c0 = current(s.chapters, p);
    if (c0 !== s.onChapter) { s.onChapter = c0; mark(s.chapters, c0); }
    s.chapters.forEach(function (c) {
      if (c.nums.length) countWith(c.nums, (p - c.from) / ((c.to - c.from) * 0.5));
    });

    s.lights.forEach(function (h) {
      var k = clamp01((p - h.from) / (h.to - h.from || 1)) * h.parts.length;
      h.parts.forEach(function (el, i) {
        el.style.opacity = (0.22 + 0.78 * clamp01(k - i)).toFixed(3);
      });
    });

    // Canvases: redraw only when the picture would change. Every picture stays
    // drawn, so one is ready the moment its chapter fades in.
    s.layers.forEach(function (L) {
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
  // Back to top, the project name in a project's bar, section links. The page
  // really scrolls there, eased in and out. The long stretches where a scene
  // is pinned to the screen are skipped: the scene just swaps back to its
  // first part, so the trip takes as long as the page looks, not as long as
  // it is. Any wheel, touch, key or click hands control straight back to you.
  var glide = null;
  // Where each scene's stage is stuck to the screen, in page coordinates.
  function pinnedStretches() {
    var vh = window.innerHeight;
    return scenes.map(function (s) {
      var top = s.el.getBoundingClientRect().top + window.scrollY;
      return [top, top + Math.max(0, s.el.offsetHeight - vh)];
    }).filter(function (r) { return r[1] > r[0]; }).sort(function (a, b) { return a[0] - b[0]; });
  }
  // Distance as you see it: pinned stretches count for nothing.
  function seenAt(y, pins) {
    var v = y;
    pins.forEach(function (r) { v -= Math.max(0, Math.min(y, r[1]) - r[0]); });
    return v;
  }
  // Back from seen distance to a scroll position. Going up, a pinned stretch
  // lands at its top; going down, at its bottom.
  function scrollAt(v, pins, up) {
    var y = v;
    for (var i = 0; i < pins.length; i++) {
      if (y > pins[i][0] || (y === pins[i][0] && !up)) y += pins[i][1] - pins[i][0];
      else break;
    }
    return y;
  }
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
    stopGlide();
    var start = window.scrollY, pins = pinnedStretches(), up = y < start;
    var v0 = seenAt(start, pins), v1 = seenAt(y, pins), seen = v1 - v0;
    if (reduceMotion || document.hidden || Math.abs(seen) < 2) { instantScroll(y); land(); return; }
    var html = document.documentElement;
    var duration = Math.min(1500, 400 + Math.sqrt(Math.abs(seen)) * 14);
    var t0 = 0;
    glide = { before: html.style.scrollBehavior, raf: 0 };
    html.style.scrollBehavior = 'auto';                   // each step must land exactly
    var step = function (now) {
      if (!t0) t0 = now;
      var t = Math.min(1, (now - t0) / duration);
      window.scrollTo(0, t >= 1 ? y : Math.round(scrollAt(v0 + seen * easeInOut(t), pins, up)));
      scenes.forEach(renderScene);                        // draw this frame, not the next
      if (t < 1) { glide.raf = requestAnimationFrame(step); return; }
      stopGlide();
      land();
    };
    glide.raf = requestAnimationFrame(step);
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
      window.addEventListener(type, stopGlide, { passive: true });
    });
  }
  function stopGlide() {
    if (!glide) return;
    cancelAnimationFrame(glide.raf);
    document.documentElement.style.scrollBehavior = glide.before;
    glide = null;
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (type) {
      window.removeEventListener(type, stopGlide, { passive: true });
    });
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

  // ---------- Video clips ----------
  // Muted and looping, playing only while mostly on screen. The button pauses
  // it for good (until pressed again). With reduced motion it waits for a press.
  Array.prototype.forEach.call(document.querySelectorAll('.clip'), function (clip) {
    var video = clip.querySelector('video'), btn = clip.querySelector('.clip-btn');
    if (!video || !btn) return;
    video.removeAttribute('controls');
    btn.hidden = false;
    var held = reduceMotion, inView = false;
    function show() {
      var playing = !video.paused;
      clip.classList.toggle('is-paused', !playing);
      btn.setAttribute('aria-label', playing ? 'Pause video' : 'Play video');
    }
    function play() {
      video.preload = 'auto';
      var p = video.play();
      if (p && p.catch) p.catch(function () { show(); });
    }
    video.addEventListener('play', show);
    video.addEventListener('pause', show);
    btn.addEventListener('click', function () {
      if (video.paused) { held = false; play(); } else { held = true; video.pause(); }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !held) play(); else if (!inView) video.pause();
      }, { threshold: 0.5 }).observe(video);
    }
    show();
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
