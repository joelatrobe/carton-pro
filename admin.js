/* Carton-Pro — article manager.
 *
 * Talks to /api/admin/*. Every write carries the X-CP-Admin header, which a
 * cross-site form cannot set; that plus the SameSite cookie is the CSRF
 * guard. Nothing here trusts the browser: the server re-validates the lot.
 */

(function () {
  'use strict';

  var gate = document.getElementById('gate');
  var manager = document.getElementById('manager');
  var listEl = document.getElementById('list');
  var editor = document.getElementById('editor');
  var signout = document.getElementById('signout');
  var current = null;

  function api(method, url, body) {
    return fetch(url, {
      method: method,
      headers: body
        ? { 'Content-Type': 'application/json', 'X-CP-Admin': '1' }
        : { 'X-CP-Admin': '1' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) throw new Error(data.error || 'Something went wrong.');
        return data;
      });
    });
  }

  function status(el, state, message) {
    el.setAttribute('data-state', state);
    el.textContent = message;
  }

  function show(which) {
    gate.hidden = which !== 'gate';
    manager.hidden = which !== 'manager';
    signout.hidden = which !== 'manager';
  }

  /* ------------------------------------------------------------- sign in */

  fetch('/api/admin/session').then(function (r) { return r.json(); }).then(function (s) {
    if (!s.configured) {
      show('gate');
      document.getElementById('gate-note').textContent =
        'No admin password has been set on the server yet. Ask your developer to set ADMIN_PASSWORD_HASH.';
      document.getElementById('login-form').hidden = true;
      return;
    }
    if (s.signedIn) { show('manager'); load(); } else { show('gate'); }
  });

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var el = document.getElementById('login-status');
    status(el, '', 'Checking…');
    api('POST', '/api/admin/login', { password: document.getElementById('password').value })
      .then(function () {
        document.getElementById('password').value = '';
        status(el, '', '');
        show('manager');
        load();
      })
      .catch(function (err) { status(el, 'error', err.message); });
  });

  signout.addEventListener('click', function () {
    api('POST', '/api/admin/logout', {}).then(function () { location.reload(); });
  });

  /* --------------------------------------------------------------- list */

  function load() {
    return api('GET', '/api/admin/articles').then(function (data) {
      var list = data.articles || [];
      if (!list.length) {
        listEl.innerHTML = '<p class="form-note">No articles yet. Write the first one.</p>';
        return;
      }
      listEl.innerHTML = list.map(function (a) {
        return '<button type="button" class="admin-item" data-id="' + a.id + '">' +
                 '<span class="admin-item__title"></span>' +
                 '<span class="admin-item__meta">' + (a.date || '') +
                   (a.published ? '' : ' · hidden') + '</span>' +
               '</button>';
      }).join('');
      /* Titles are set as text, never as markup. */
      Array.prototype.forEach.call(listEl.querySelectorAll('.admin-item'), function (btn, i) {
        btn.querySelector('.admin-item__title').textContent = list[i].title;
        btn.addEventListener('click', function () { edit(list[i]); });
      });
    }).catch(function (err) {
      if (/sign in/i.test(err.message)) { show('gate'); return; }
      listEl.innerHTML = '<p class="form-note">' + err.message + '</p>';
    });
  }

  /* ------------------------------------------------------------- editor */

  function edit(a) {
    current = a || null;
    editor.hidden = false;
    document.getElementById('title').value = a ? a.title : '';
    document.getElementById('standfirst').value = a ? (a.standfirst || '') : '';
    document.getElementById('body').value = a ? a.body : '';
    document.getElementById('imageAlt').value = a ? (a.imageAlt || '') : '';
    document.getElementById('date').value = a ? a.date : new Date().toISOString().slice(0, 10);
    document.getElementById('published').checked = a ? !!a.published : true;
    document.getElementById('delete').hidden = !a;
    document.getElementById('image').disabled = !a;

    var prev = document.getElementById('image-preview');
    if (a && a.image) { prev.src = a.image; prev.hidden = false; } else { prev.removeAttribute('src'); prev.hidden = true; }

    status(document.getElementById('editor-status'), '', '');
    document.getElementById('title').focus();
  }

  document.getElementById('new-article').addEventListener('click', function () { edit(null); });
  document.getElementById('cancel').addEventListener('click', function () {
    editor.hidden = true; current = null;
  });

  editor.addEventListener('submit', function (e) {
    e.preventDefault();
    var el = document.getElementById('editor-status');
    var payload = {
      title: document.getElementById('title').value,
      standfirst: document.getElementById('standfirst').value,
      body: document.getElementById('body').value,
      imageAlt: document.getElementById('imageAlt').value,
      date: document.getElementById('date').value,
      published: document.getElementById('published').checked
    };
    status(el, '', 'Saving…');
    var req = current
      ? api('PUT', '/api/admin/articles/' + current.id, payload)
      : api('POST', '/api/admin/articles', payload);

    req.then(function (data) {
      current = data.article;
      document.getElementById('delete').hidden = false;
      document.getElementById('image').disabled = false;
      status(el, 'ok', 'Saved. It is live at /articles/' + data.article.slug);
      return load();
    }).catch(function (err) { status(el, 'error', err.message); });
  });

  document.getElementById('delete').addEventListener('click', function () {
    if (!current) return;
    if (!window.confirm('Delete "' + current.title + '"? This cannot be undone.')) return;
    api('DELETE', '/api/admin/articles/' + current.id).then(function () {
      editor.hidden = true; current = null;
      return load();
    }).catch(function (err) {
      status(document.getElementById('editor-status'), 'error', err.message);
    });
  });

  /* -------------------------------------------------------------- image */

  document.getElementById('image').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file || !current) return;
    var el = document.getElementById('editor-status');

    if (file.size > 4.5 * 1024 * 1024) {
      status(el, 'error', 'That image is over 4.5MB. Please shrink it first.');
      e.target.value = '';
      return;
    }

    status(el, '', 'Uploading the image…');
    var reader = new FileReader();
    reader.onload = function () {
      api('POST', '/api/admin/articles/' + current.id + '/image', { image: reader.result })
        .then(function (data) {
          var prev = document.getElementById('image-preview');
          prev.src = data.image + '?v=' + Date.now();
          prev.hidden = false;
          current.image = data.image;
          status(el, 'ok', 'Image added.');
        })
        .catch(function (err) { status(el, 'error', err.message); })
        .finally(function () { e.target.value = ''; });
    };
    reader.readAsDataURL(file);
  });
})();
