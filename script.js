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

  /* ---------------------------------------------------- cookie consent */
  /* Nothing on this site sets a cookie except the Google map on the contact
     page, so consent is asked for that and nothing else. The map stays
     unloaded until it is given, which is the whole point of asking. */
  var CONSENT_KEY = 'cp-consent';

  function readConsent() {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  }
  function writeConsent(value) {
    try { window.localStorage.setItem(CONSENT_KEY, value); } catch (e) {}
  }

  var mapHost = document.querySelector('[data-map]');

  function loadMap() {
    if (!mapHost || mapHost.getAttribute('data-loaded') === 'true') return;
    var frame = document.createElement('iframe');
    frame.title = mapHost.getAttribute('data-map-title') || 'Map';
    frame.src = mapHost.getAttribute('data-map-src');
    frame.loading = 'lazy';
    frame.referrerPolicy = 'no-referrer-when-downgrade';
    mapHost.appendChild(frame);
    mapHost.setAttribute('data-loaded', 'true');
  }

  /* Loading the map by hand is its own consent, for this page view only. */
  var mapButton = document.querySelector('[data-map-load]');
  if (mapButton) mapButton.addEventListener('click', loadMap);

  function showConsentBar() {
    var bar = document.createElement('div');
    bar.className = 'cookiebar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<p class="cookiebar__text">We only use cookies to show the Google map on our contact page. ' +
      'Nothing here follows you around the web. <a href="privacy.html">Privacy policy</a></p>' +
      '<div class="cookiebar__actions">' +
        '<button type="button" class="cookiebar__btn cookiebar__btn--quiet" data-consent="none">Decline</button>' +
        '<button type="button" class="cookiebar__btn" data-consent="all">Accept all</button>' +
      '</div>';
    document.body.appendChild(bar);

    requestAnimationFrame(function () { bar.setAttribute('data-in', 'true'); });

    bar.addEventListener('click', function (e) {
      var choice = e.target.getAttribute && e.target.getAttribute('data-consent');
      if (!choice) return;
      writeConsent(choice);
      bar.removeAttribute('data-in');
      setTimeout(function () { bar.remove(); }, 260);
      if (choice === 'all') loadMap();
    });
  }

  var stored = readConsent();
  if (stored === 'all') loadMap();
  else if (stored !== 'none') showConsentBar();

  /* ------------------------------------------------------- enquiry form */
  var form = document.getElementById('enquiry-form');
  if (!form) return;

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
        setStatus('error', err.message + ' Please call 01733 308000 or email enquiries@rhoward.co.uk.');
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = original;
      });
  });
})();
