/* Carton-Pro — navigation, sticky masthead, reveal on scroll, enquiry form */

(function () {
  'use strict';

  /* ------------------------------------------------------ sticky header */
  var masthead = document.querySelector('.masthead');
  if (masthead) {
    var setStuck = function () {
      masthead.setAttribute('data-stuck', String(window.scrollY > 40));
    };
    setStuck();
    window.addEventListener('scroll', setStuck, { passive: true });
  }

  /* -------------------------------------------------- mobile navigation */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('primary-nav');

  function closeNav() {
    if (!nav || !toggle) return;
    nav.setAttribute('data-open', 'false');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Menu';
    document.body.style.overflow = '';
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      if (open) {
        closeNav();
      } else {
        nav.setAttribute('data-open', 'true');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.textContent = 'Close';
        masthead.setAttribute('data-stuck', 'true');
        document.body.style.overflow = 'hidden';
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
        closeNav();
        toggle.focus();
      }
    });
  }

  /* ------------------------------------------------------ reveal blocks */
  /* Content is visible until <html class="js"> turns the reveal on, so every
     path out of here has to end with the copy on screen. */
  var reveals = document.querySelectorAll('.reveal');

  function revealAll() {
    Array.prototype.forEach.call(reveals, function (el) { el.classList.add('is-in'); });
  }

  if (!('IntersectionObserver' in window)) {
    revealAll();
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });

    Array.prototype.forEach.call(reveals, function (el) { io.observe(el); });

  }

  /* A bfcache restore does not re-run the observer. Nothing can be stuck
     hidden now, but marking everything seen keeps the state consistent. */
  window.addEventListener('pageshow', function (e) { if (e.persisted) revealAll(); });

  /* ------------------------------------------------------- enquiry form */
  var form = document.getElementById('enquiry-form');
  if (!form) return;

  /* Not every enquiry is a quote. Asking a question should not mean walking
     past two dropdowns about board and run length, so they step aside. */
  var typeInputs = form.querySelectorAll('input[name="enquiry_type"]');
  var messageField = document.getElementById('message');
  var messageLabel = form.querySelector('label[for="message"]');

  function applyMode() {
    var chosen = form.querySelector('input[name="enquiry_type"]:checked');
    var mode = chosen && chosen.value === 'General question' ? 'question' : 'quote';
    form.setAttribute('data-mode', mode);
    if (messageField) {
      messageField.placeholder = messageField.getAttribute('data-ph-' + mode) || messageField.placeholder;
    }
    if (messageLabel) {
      var text = messageLabel.getAttribute('data-label-' + mode);
      if (text) messageLabel.childNodes[0].nodeValue = text;
    }
  }

  Array.prototype.forEach.call(typeInputs, function (input) {
    input.addEventListener('change', applyMode);
  });
  applyMode();

  var status = document.getElementById('form-status');
  var submit = form.querySelector('button[type="submit"]');

  function setStatus(state, message) {
    if (!status) return;
    status.setAttribute('data-state', state);
    status.textContent = message;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Honeypot: silently accept and stop.
    if (form.querySelector('[name="company_website"]').value !== '') {
      setStatus('ok', 'Thank you. Your enquiry has been sent.');
      form.reset();
      return;
    }

    var data = {};
    new FormData(form).forEach(function (value, key) { data[key] = value; });
    if (form.getAttribute('data-mode') === 'question') {
      data.sector = '';
      data.quantity = '';
    }

    submit.disabled = true;
    var original = submit.textContent;
    submit.textContent = 'Sending';
    setStatus('', '');

    fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || 'Something went wrong.');
          return body;
        });
      })
      .then(function () {
        form.reset();
        setStatus('ok', 'Thank you. Your enquiry is with our team and we will come back to you within one working day.');
      })
      .catch(function (err) {
        setStatus('error', err.message + ' Please call 01733 308000 or email hello@cartonpro.co.uk.');
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = original;
      });
  });
})();

/* Gapless looping: two elements, never a visible seek.

   Chrome stalls for a second or two at the loop point where Safari does not.
   Its native loop performs a real seek back to zero and flushes the decoder,
   and rebuilding the pipeline is what you see. Nothing about the file avoids
   that as long as the browser is the one looping it.

   So it never loops. A second copy sits behind the first, rewound to zero.
   As the visible one reaches its last frame the two swap places, and the one
   that just finished rewinds while it is out of sight.

   Three things Chrome does shaped this version. A paused player it has not
   needed for a while gets its decoder released, so the first play() after a
   minute idle was itself a seek; the waiting copy is therefore warmed, played
   until playback begins and then paused, right after it is rewound and again
   a second and a half before it is needed. A video that is fully covered or
   at opacity 0 is not composited at all, so its frame callbacks never fire
   and revealing it costs several frames while a layer is built; the waiting
   copy therefore sits on top at 1% opacity, invisible but live, and the swap
   happens on the first frame it actually presents. And VLC's muxer had left
   the first frame out of the keyframe table, so every rewind to zero landed
   six seconds in; that was fixed in the files.

   Additive: the markup keeps autoplay, loop and preload, so with no JS this
   does nothing and the video loops as the browser sees fit.

   A band more than two screens down is held back until the reader is about a
   screen away. Autoplay otherwise starts the download on arrival, and on the
   about page that was most of 12MB for a film four screens below the fold. */
(function () {
  var videos = document.querySelectorAll('.media-band video[loop], video[loop][data-gapless]');
  if (!videos.length) return;
  var hasRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

  Array.prototype.forEach.call(videos, function (a) {
    if (!a.querySelector('source')) return;
    var band = a.closest('.media-band, .page-head') || a.parentNode;

    /* Header clips are hidden on phones, where the poster stands in. Take the
       source off so a hidden video cannot quietly download in the background. */
    if (window.getComputedStyle(a).display === 'none') {
      a.removeAttribute('autoplay');
      a.removeChild(a.querySelector('source'));
      a.load();
      return;
    }

    var far = 'IntersectionObserver' in window &&
      band.getBoundingClientRect().top > window.innerHeight * 2;
    if (!far) { start(a); return; }

    var source = a.querySelector('source');
    a.removeAttribute('autoplay');
    a.pause();
    a.removeChild(source);
    a.load();
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      a.appendChild(source);
      a.setAttribute('autoplay', '');
      a.load();
      start(a);
    }, { rootMargin: '100% 0px' });
    io.observe(band);
  });

  function start(a) {
    var b = a.cloneNode(true);
    b.removeAttribute('autoplay');
    a.removeAttribute('loop');
    b.removeAttribute('loop');
    a.preload = 'auto';
    b.preload = 'auto';
    var base = parseInt(window.getComputedStyle(a).zIndex, 10);
    if (isNaN(base)) base = 0;
    /* The visible copy underneath at full opacity, the waiting one on top at
       1%: painted and composited, so frame callbacks fire, but not seen. */
    function toFront(v) { v.style.zIndex = String(base); v.style.opacity = '1'; }
    function toBack(v)  { v.style.zIndex = String(base + 1); v.style.opacity = '0.01'; }
    toFront(a);
    toBack(b);
    a.parentNode.insertBefore(b, a.nextSibling);

    var front = a, back = b, switching = false, warmedForEnd = false, warmToken = null;

    function rewind(v, then) {
      v.pause();
      var seek = function () {
        var onSeeked = function () { v.removeEventListener('seeked', onSeeked); then(); };
        v.addEventListener('seeked', onSeeked);
        v.currentTime = 0;
      };
      if (v.readyState >= 1) seek(); else v.addEventListener('loadedmetadata', seek, { once: true });
    }

    /* Play until playback has actually begun, then pause. The decoder is
       then live and holding the opening frame, and a later play() resumes
       instead of rebuilding. Costs about a frame at the top of each loop.
       Gated on the playing event, not a frame callback: a covered video is
       not composited, so its frame callbacks arrive seconds late or never.
       If it turns out not to have started at the beginning, rewind again. */
    function warm(v) {
      var token = {};
      warmToken = token;
      var onPlaying = function () {
        v.removeEventListener('playing', onPlaying);
        if (warmToken !== token) return;   // a swap got here first
        v.pause();
        warmToken = null;
        if (v.currentTime > 0.5) rewind(v, function () { warm(v); });
      };
      v.addEventListener('playing', onPlaying);
      var p = v.play();
      if (p && p.catch) {
        p.catch(function () {
          v.removeEventListener('playing', onPlaying);
          if (warmToken === token) warmToken = null;
        });
      }
    }

    function arm(v) { rewind(v, function () { warm(v); }); }

    function swap() {
      if (switching) return;
      switching = true;
      warmToken = null;
      var incoming = back, outgoing = front, shown = false;
      var show = function () {
        if (shown) return;
        shown = true;
        toFront(incoming);
        toBack(outgoing);
        front = incoming; back = outgoing; warmedForEnd = false;
        setTimeout(function () { arm(back); switching = false; }, 150);
      };
      /* Reveal on the first frame the incoming copy presents after play(),
         so the outgoing copy is never replaced by a stale surface. */
      if (hasRVFC) incoming.requestVideoFrameCallback(function () { show(); });
      var p = incoming.play();
      if (p && p.then) {
        p.then(function () { if (!hasRVFC) show(); }).catch(function () { switching = false; });
      } else if (!hasRVFC) { show(); }
      setTimeout(show, 250);   // never leave the old copy frozen on screen
    }

    function onFrame(v, meta) {
      if (v !== front || !v.duration || !isFinite(v.duration)) return;
      var left = v.duration - meta.mediaTime;
      if (!warmedForEnd && left <= 1.5) { warmedForEnd = true; warm(back); }
      if (left <= 0.075) swap();
    }
    function loopFrames(v) {
      var cb = function (now, meta) { onFrame(v, meta); v.requestVideoFrameCallback(cb); };
      v.requestVideoFrameCallback(cb);
    }
    function onTime() {   // no rVFC: the older, coarser check
      var v = front;
      if (!v.duration || !isFinite(v.duration)) return;
      if (v.duration - v.currentTime <= 0.4) swap();
    }
    function onEnded() { if (this === front) swap(); }

    if (hasRVFC) { loopFrames(a); loopFrames(b); }
    else { a.addEventListener('timeupdate', onTime); b.addEventListener('timeupdate', onTime); }
    a.addEventListener('ended', onEnded);
    b.addEventListener('ended', onEnded);

    arm(b);
    var p0 = a.play();
    if (p0 && p0.catch) { p0.catch(function () {}); }
  }
})();
