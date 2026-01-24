(function() {
  // 送信前に入力内容を保存し、確認画面へ遷移させる。
  var form = document.querySelector('form.wpcf7-form');
  if (!form) {
    return;
  }
  // サインツール選択時のアップロード欄を制御する。
  var subjectSelect = form.querySelector('[name="your-subject"]');
  var signalRow = document.getElementById('signal-upload-row');
  var signalInput = form.querySelector('[name="signal-file"]');
  var signalDisplay = signalRow ? signalRow.querySelector('.display') : null;
  var toggleSignalUpload = function() {
    var isTarget = subjectSelect && subjectSelect.value === 'お手元のサインツールが本システムに対応しているか知りたい';
    if (signalRow) {
      signalRow.style.display = isTarget ? '' : 'none';
    }
    if (signalDisplay) {
      signalDisplay.style.display = isTarget ? 'block' : 'none';
    }
    if (signalInput) {
      signalInput.required = !!isTarget;
    }
  };
  if (subjectSelect) {
    subjectSelect.addEventListener('change', toggleSignalUpload);
  }
  toggleSignalUpload();

  var confirmUrl = new URL('contact-confirm.html', window.location.href).toString();
  form.setAttribute('action', confirmUrl);
  form.addEventListener('submit', function(event) {
    if (!form.reportValidity()) {
      return;
    }
    event.preventDefault();
    var data = new FormData(form);
    var payload = {};
    data.forEach(function(value, key) {
      if (key === 'signal-file') {
        return;
      }
      payload[key] = value;
    });
    // 添付ファイルはBase64化してセッションに保存する（5MB上限）。
    if (signalInput && signalInput.files && signalInput.files[0]) {
      var file = signalInput.files[0];
      if (file.size > 5 * 1024 * 1024) {
        alert('ファイルサイズが5MBを超えています。');
        return;
      }
      var reader = new FileReader();
      reader.onload = function() {
        payload['signal-file-name'] = file.name;
        payload['signal-file-data'] = reader.result;
        try {
          sessionStorage.setItem('contactFormData', JSON.stringify(payload));
        } catch (err) {
          alert('ブラウザの設定により確認画面へ進めません。JavaScriptの設定をご確認ください。');
          return;
        }
        window.location.href = confirmUrl;
      };
      reader.readAsDataURL(file);
      return;
    }
    // 確認画面で表示するためセッションストレージへ保存する。
    try {
      sessionStorage.setItem('contactFormData', JSON.stringify(payload));
    } catch (err) {
      alert('ブラウザの設定により確認画面へ進めません。JavaScriptの設定をご確認ください。');
      return;
    }
    window.location.href = confirmUrl;
  });
})();
