(function() {
  // セッションデータを読み込み、確認画面を構築して送信処理を行う。
  var doneUrl = new URL('contact-done.html', window.location.href).toString();
  var form = document.querySelector('form.wpcf7-form');
  if (!form) {
    return;
  }
  var error = document.getElementById('contact-error');
  var raw = null;
  var data = null;
  try {
    raw = sessionStorage.getItem('contactFormData');
    data = raw ? JSON.parse(raw) : null;
  } catch (err) {
    data = null;
  }
  // 必須項目の存在を確認する。
  var required = ['your-name', 'your-email', 'your-subject', 'your-message'];
  var isValid = data && required.every(function(key) {
    return data[key];
  });
  var fields = ['your-name', 'your-email', 'your-subject', 'signal-file-name', 'signal-file-data', 'your-message', 'source'];
  fields.forEach(function(name) {
    var value = data && data[name] ? data[name] : '';
    if (name === 'source' && !value) {
      value = 'contact';
    }
    var cell = document.querySelector('[data-field="' + name + '"]');
    if (cell) {
      cell.textContent = value;
    }
    var input = document.querySelector('input[type="hidden"][name="' + name + '"]');
    if (input) {
      input.value = value;
    }
  });
  // 戻るボタンの挙動を整える。
  var backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.addEventListener('click', function() {
      if (history.length > 1) {
        history.back();
      } else {
        window.location.href = new URL('contact.html', window.location.href).toString();
      }
    });
  }
  var signalRow = document.querySelector('[data-row="signal-file-name"]');
  if (signalRow && !(data && data['signal-file-name'])) {
    signalRow.style.display = 'none';
  }
  // 不足がある場合は送信を無効化する。
  var submitButton = form.querySelector('button[type="submit"]');
  if (!isValid && submitButton) {
    submitButton.disabled = true;
  }
  if (!isValid && error) {
    error.textContent = '入力内容が見つかりませんでした。お問い合わせフォームからやり直してください。';
  }
  form.setAttribute('action', doneUrl);
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (!isValid) {
      if (error) {
        error.textContent = '入力内容が見つかりませんでした。お問い合わせフォームからやり直してください。';
      }
      return;
    }
    if (form.dataset.submitting === 'true') {
      return;
    }
    form.dataset.submitting = 'true';
    // 送信中表示に切り替える。
    var loading = document.getElementById('contact-loading');
    if (loading) {
      loading.style.display = 'block';
    }
    var buttons = form.querySelectorAll('.wpcf7-submit');
    buttons.forEach(function(button) {
      button.disabled = true;
    });
    var endpoint = form.getAttribute('data-gas-endpoint');
    // GASのエンドポイントを検証する。
    if (!endpoint || endpoint.indexOf('script.google.com') === -1) {
      if (error) {
        error.textContent = '送信先の設定が未完了です。お手数ですがお問い合わせください。';
      }
      form.dataset.submitting = 'false';
      if (loading) {
        loading.style.display = 'none';
      }
      buttons.forEach(function(button) {
        button.disabled = false;
      });
      return;
    }
    var payload = new URLSearchParams(new FormData(form));
    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: payload.toString()
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Request failed');
      }
      return response.json();
    }).then(function() {
      // 送信成功時はセッションデータを破棄して完了画面へ遷移する。
      try {
        sessionStorage.removeItem('contactFormData');
      } catch (err) {
      }
      window.location.href = doneUrl;
    }).catch(function() {
      alert('送信に失敗しました。時間をおいて再度お試しください。');
      form.dataset.submitting = 'false';
      if (loading) {
        loading.style.display = 'none';
      }
      buttons.forEach(function(button) {
        button.disabled = false;
      });
    });
  });
})();
