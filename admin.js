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


  /* ----------------------------------------------------------- vacancies */

  var vEditor = document.getElementById('vacancy-editor');
  var vCurrent = null;
  var tab = 'articles';

  function vField(id) { return document.getElementById(id); }

  function switchTab(next) {
    tab = next;
    Array.prototype.forEach.call(document.querySelectorAll('.admin-tab'), function (b) {
      b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === next));
    });
    var articlesTab = next === 'articles';
    document.getElementById('manager-label').textContent = articlesTab ? 'Article manager' : 'Vacancy manager';
    document.getElementById('manager-title').textContent = articlesTab ? 'Your articles' : 'Your vacancies';
    document.getElementById('new-article').hidden = !articlesTab;
    document.getElementById('new-vacancy').hidden = articlesTab;
    editor.hidden = true; vEditor.hidden = true;
    current = null; vCurrent = null;
    load();
  }

  Array.prototype.forEach.call(document.querySelectorAll('.admin-tab'), function (b) {
    b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
  });

  function loadVacancies() {
    return api('GET', '/api/admin/vacancies').then(function (data) {
      var list = data.vacancies || [];
      if (!list.length) {
        listEl.innerHTML = '<p class="form-note">No vacancies yet. The careers page shows a "no vacancies" note until you post one.</p>';
        return;
      }
      listEl.innerHTML = list.map(function (v) {
        return '<button type="button" class="admin-item">' +
                 '<span class="admin-item__title"></span>' +
                 '<span class="admin-item__meta">' + (v.posted || '') + ' · ' + v.employmentType +
                   (v.published ? '' : ' · not advertised') + '</span>' +
               '</button>';
      }).join('');
      Array.prototype.forEach.call(listEl.querySelectorAll('.admin-item'), function (btn, i) {
        btn.querySelector('.admin-item__title').textContent = list[i].title;
        btn.addEventListener('click', function () { editVacancy(list[i]); });
      });
    }).catch(function (err) {
      if (/sign in/i.test(err.message)) { show('gate'); return; }
      listEl.innerHTML = '<p class="form-note">' + err.message + '</p>';
    });
  }

  function editVacancy(v) {
    vCurrent = v || null;
    vEditor.hidden = false;
    vField('v-title').value = v ? v.title : '';
    vField('v-type').value = v ? v.employmentType : 'Full time';
    vField('v-location').value = v ? (v.location || '') : 'Peterborough';
    vField('v-salary').value = v ? (v.salary || '') : '';
    vField('v-summary').value = v ? (v.summary || '') : '';
    vField('v-body').value = v ? v.body : '';
    vField('v-posted').value = v ? v.posted : new Date().toISOString().slice(0, 10);
    vField('v-closes').value = v ? (v.closes || '') : '';
    vField('v-published').checked = v ? !!v.published : true;
    document.getElementById('v-delete').hidden = !v;
    status(document.getElementById('vacancy-status'), '', '');
    vField('v-title').focus();
  }

  document.getElementById('new-vacancy').addEventListener('click', function () { editVacancy(null); });
  document.getElementById('v-cancel').addEventListener('click', function () {
    vEditor.hidden = true; vCurrent = null;
  });

  vEditor.addEventListener('submit', function (e) {
    e.preventDefault();
    var el = document.getElementById('vacancy-status');
    var payload = {
      title: vField('v-title').value,
      employmentType: vField('v-type').value,
      location: vField('v-location').value,
      salary: vField('v-salary').value,
      summary: vField('v-summary').value,
      body: vField('v-body').value,
      posted: vField('v-posted').value,
      closes: vField('v-closes').value,
      published: vField('v-published').checked
    };
    status(el, '', 'Saving…');
    var req = vCurrent
      ? api('PUT', '/api/admin/vacancies/' + vCurrent.id, payload)
      : api('POST', '/api/admin/vacancies', payload);

    req.then(function (data) {
      vCurrent = data.vacancy;
      document.getElementById('v-delete').hidden = false;
      status(el, 'ok', payload.published
        ? 'Saved and advertised on the careers page.'
        : 'Saved. Not advertised until you tick the box.');
      return loadVacancies();
    }).catch(function (err) { status(el, 'error', err.message); });
  });

  document.getElementById('v-delete').addEventListener('click', function () {
    if (!vCurrent) return;
    if (!window.confirm('Delete "' + vCurrent.title + '"? This cannot be undone.')) return;
    api('DELETE', '/api/admin/vacancies/' + vCurrent.id).then(function () {
      vEditor.hidden = true; vCurrent = null;
      return loadVacancies();
    }).catch(function (err) {
      status(document.getElementById('vacancy-status'), 'error', err.message);
    });
  });

  /* --------------------------------------------------------------- list */

  function load() {
    if (tab === 'vacancies') return loadVacancies();
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

  var gallery = document.getElementById('gallery');
  var headerImage = '';

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

    headerImage = a ? (a.image || '') : '';
    loadGallery();

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
      image: headerImage,
      published: document.getElementById('published').checked
    };
    status(el, '', 'Saving…');
    var req = current
      ? api('PUT', '/api/admin/articles/' + current.id, payload)
      : api('POST', '/api/admin/articles', payload);

    req.then(function (data) {
      current = data.article;
      headerImage = data.article.image || '';
      document.getElementById('delete').hidden = false;
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

  /* -------------------------------------------------------------- images */

  /* Shrink in the browser first. A phone photograph is often 6MB and four
     thousand pixels wide; nothing on the page needs more than 1600. */
  function downscale(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read that file.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('That file is not an image we can read.')); };
        img.onload = function () {
          var max = 1600;
          var scale = Math.min(1, max / Math.max(img.width, img.height));
          if (scale === 1 && reader.result.length < 1.2e6) return resolve(reader.result);
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function drawGallery(list) {
    if (!list.length) {
      gallery.innerHTML = '<p class="form-note">No pictures yet.</p>';
      return;
    }
    gallery.innerHTML = list.map(function (u) {
      var isHeader = u.url === headerImage;
      return '<figure class="admin-thumb' + (isHeader ? ' is-header' : '') + '" data-url="' + u.url + '">' +
               '<img src="' + u.url + '" alt="" loading="lazy">' +
               '<figcaption>' +
                 '<button type="button" data-act="header">' + (isHeader ? 'Header ✓' : 'Header') + '</button>' +
                 '<button type="button" data-act="insert">Insert</button>' +
               '</figcaption>' +
             '</figure>';
    }).join('');
  }

  function loadGallery() {
    return api('GET', '/api/admin/uploads').then(function (d) { drawGallery(d.uploads || []); })
      .catch(function () { gallery.innerHTML = ''; });
  }

  gallery.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var url = btn.closest('.admin-thumb').getAttribute('data-url');

    if (btn.getAttribute('data-act') === 'header') {
      headerImage = headerImage === url ? '' : url;
      loadGallery();
      status(document.getElementById('editor-status'), '',
             headerImage ? 'Header picture set. Save to apply it.' : 'Header picture cleared. Save to apply it.');
      return;
    }

    var ta = document.getElementById('body');
    var at = ta.selectionStart || ta.value.length;
    var snippet = '\n\n[image: ' + url + ' | ]\n\n';
    ta.value = ta.value.slice(0, at) + snippet + ta.value.slice(at);
    ta.focus();
    /* Land the cursor after the pipe so a caption can be typed straight away. */
    var caret = at + snippet.indexOf('| ') + 2;
    ta.setSelectionRange(caret, caret);
  });

  document.getElementById('image').addEventListener('change', function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    if (!files.length) return;
    var el = document.getElementById('editor-status');
    status(el, '', 'Adding ' + files.length + (files.length === 1 ? ' picture…' : ' pictures…'));

    files.reduce(function (chain, file) {
      return chain.then(function () {
        return downscale(file)
          .then(function (dataUrl) { return api('POST', '/api/admin/uploads', { image: dataUrl }); })
          .then(function (d) { if (!headerImage) headerImage = d.url; });
      });
    }, Promise.resolve())
      .then(function () {
        status(el, 'ok', 'Pictures added.');
        return loadGallery();
      })
      .catch(function (err) { status(el, 'error', err.message); })
      .finally(function () { e.target.value = ''; });
  });
})();
