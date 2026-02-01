(function() {
  // メンテナンス: クーポンコードを確認画面に反映し、空欄時は非表示にする
  // セッションデータを読み込み、PayPal注文作成の送信処理を行う。
  var form = document.querySelector('form.wpcf7-form');
  if (!form) {
    return;
  }
  var error = document.getElementById('payment-error');
  var raw = null;
  var data = null;
  try {
    raw = sessionStorage.getItem('paypalOrderData');
    data = raw ? JSON.parse(raw) : null;
  } catch (err) {
    data = null;
  }
  // 必須項目の存在を確認する。
  var required = ['billing_first_name', 'billing_last_name', 'billing_email', 'product_name', 'amount', 'currency'];
  var isValid = data && required.every(function(key) {
    return data[key];
  });
  if (!isValid && error) {
    error.textContent = '注文情報が見つかりませんでした。購入手続きからやり直してください。';
  }
  var fields = [
    'action',
    'product_id',
    'product_name',
    'amount',
    'currency',
    'payment_method',
    'billing_first_name',
    'billing_last_name',
    'billing_email',
    'order_comments',
    'coupon_code',
    'source'
  ];
  fields.forEach(function(name) {
    var value = data && data[name] ? data[name] : '';
    if (name === 'payment_method' && !value) {
      value = 'paypal';
    }
    if (name === 'source' && !value) {
      value = 'paypal_confirm';
    }
    if (name === 'action' && !value) {
      value = 'create_order';
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
  var couponRow = document.querySelector('[data-row="coupon-code"]');
  if (couponRow) {
    var code = data && data.coupon_code ? data.coupon_code : '';
    couponRow.style.display = code ? '' : 'none';
  }
  // 顧客名の表示整形。
  var lastName = data && data.billing_last_name ? data.billing_last_name : '';
  var firstName = data && data.billing_first_name ? data.billing_first_name : '';
  var nameCell = document.querySelector('[data-field="customer-name"]');
  if (nameCell) {
    nameCell.textContent = (lastName + ' ' + firstName).trim();
  }
  var amountCell = document.querySelector('[data-field="amount"]');
  var amountValue = data && data.amount ? data.amount : '';
  if (amountCell && amountValue) {
    var amountNumber = Number(amountValue);
    if (!isNaN(amountNumber)) {
      amountCell.textContent = '¥' + amountNumber.toLocaleString('ja-JP');
    }
  }
  // 備考欄が空の場合はプレースホルダ表示にする。
  var notesCell = document.querySelector('[data-field="order_comments"]');
  if (notesCell && !(data && data.order_comments)) {
    notesCell.textContent = '（未入力）';
  }
  // 戻るボタンの遷移を整える。
  var backButton = document.getElementById('back-button');
  if (backButton) {
    backButton.addEventListener('click', function() {
      if (history.length > 1) {
        history.back();
      } else {
        // GitHub Pagesのベースパスを考慮して戻り先URLを解決する。
        var backPath = '/checkout/checkout.html';
        var backUrl = typeof window.withBasePath === 'function'
          ? window.withBasePath(backPath)
          : new URL(backPath, window.location.href).toString();
        window.location.href = backUrl;
      }
    });
  }
  var submitButton = form.querySelector('button[type="submit"]');
  if (!isValid && submitButton) {
    submitButton.disabled = true;
  }
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    if (!isValid) {
      return;
    }
    if (form.dataset.submitting === 'true') {
      return;
    }
    form.dataset.submitting = 'true';
    // 送信中表示に切り替える。
    var loading = document.getElementById('payment-loading');
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
    }).then(function(result) {
      // PayPalの承認URLに遷移する。
      if (!result || !result.ok || !result.approval_url) {
        throw new Error('Request failed');
      }
      try {
        sessionStorage.removeItem('paypalOrderData');
      } catch (err) {
      }
      window.location.href = result.approval_url;
    }).catch(function() {
      if (error) {
        error.textContent = 'PayPal決済の準備に失敗しました。時間をおいて再度お試しください。';
      }
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
