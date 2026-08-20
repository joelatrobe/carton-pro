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
        setStatus('error', err.message + ' Please call 01733 308000 or email hello@rhoward.co.uk.');
      })
      .finally(function () {
        submit.disabled = false;
        submit.textContent = original;
      });
  });
})();
