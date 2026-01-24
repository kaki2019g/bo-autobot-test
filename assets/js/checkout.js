(function() {
  // 支払い方法の選択と確認画面への遷移を制御する。
  var form = document.querySelector(".woocommerce-checkout");
  if (!form) {
    return;
  }

  // URLパラメータに応じて商品情報を切り替える。
  var productCatalog = {
    default: {
      id: "bo-autobot",
      name: "BO-AutoBot",
      amount: 20000,
      title: "購入手続き"
    },
    demo: {
      id: "bo-autobot-demo",
      name: "BO-AutoBot デモ版",
      amount: 10000,
      title: "購入手続き（デモ版）"
    }
  };
  var params = new URLSearchParams(window.location.search);
  var productKey = params.get("product");
  var product = productCatalog[productKey] || productCatalog.default;
  var titleEl = document.getElementById("checkout-title");
  if (titleEl) {
    titleEl.textContent = product.title;
  }
  document.title = product.title;
  var idInput = form.querySelector('input[name="product_id"]');
  var nameInput = form.querySelector('input[name="product_name"]');
  var amountInput = form.querySelector('input[name="amount"]');
  if (idInput) {
    idInput.value = product.id;
  }
  if (nameInput) {
    nameInput.value = product.name;
  }
  if (amountInput) {
    amountInput.value = String(product.amount);
  }
  var nameNodes = document.querySelectorAll("[data-checkout-product-name]");
  nameNodes.forEach(function(node) {
    node.textContent = product.name;
  });
  var amountText = "¥" + Number(product.amount).toLocaleString("ja-JP");
  var amountNodes = document.querySelectorAll("[data-checkout-amount]");
  amountNodes.forEach(function(node) {
    node.textContent = amountText;
  });

  var bankItem = form.querySelector(".payment_method_bacs");
  var bankInput = form.querySelector("#payment_method_bacs");
  var paypalInput = form.querySelector("#payment_method_card");
  var message = document.getElementById("checkout-message");
  var defaultPayment = form.getAttribute("data-default-payment");

  // 画面上のメッセージ表示を切り替える。
  function showMessage(text, isError) {
    if (!message) {
      return;
    }
    message.textContent = text;
    message.classList.toggle("is-error", !!isError);
  }

  if (bankInput) {
    bankInput.disabled = false;
    bankInput.removeAttribute("aria-disabled");
    if (bankItem) {
      bankItem.classList.remove("is-disabled");
    }
    if (defaultPayment === "bank_transfer") {
      bankInput.checked = true;
    }
  }

  if (paypalInput && defaultPayment === "paypal") {
    paypalInput.checked = true;
  }

  // フォームの入力をpayload形式にまとめる。
  function buildPayload() {
    var data = new FormData(form);
    var payload = {};
    data.forEach(function(value, key) {
      payload[key] = value;
    });
    return payload;
  }

  // セッションストレージへの保存を行う。
  function saveOrderData(storageKey, payload) {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
      return true;
    } catch (err) {
      return false;
    }
  }

  // 確認画面へ遷移する。
  function goToConfirmPage(path) {
    if (typeof window.withBasePath === "function") {
      window.location.href = window.withBasePath(path);
      return;
    }
    window.location.href = new URL(path, window.location.href).toString();
  }

  form.addEventListener("submit", function(event) {
    var selected = form.querySelector('input[name="payment_method"]:checked');
    if (!selected) {
      showMessage("支払い方法を選択してください。", true);
      event.preventDefault();
      return;
    }

    if (!form.reportValidity()) {
      event.preventDefault();
      return;
    }

    if (selected.value === "bank_transfer") {
      event.preventDefault();
      // 銀行振込の確認画面へ遷移する。
      var payload = buildPayload();
      payload.payment_method = "bank_transfer";

      if (!saveOrderData("bankOrderData", payload)) {
        showMessage("ブラウザの設定により注文内容の確認画面へ進めません。", true);
        return;
      }

      showMessage("");
      goToConfirmPage("/payment/bank/payment-bank-confirm.html");
      return;
    }

    if (selected.value === "paypal") {
      event.preventDefault();
      // PayPalの確認画面へ遷移する。
      var paypalPayload = buildPayload();
      paypalPayload.payment_method = "paypal";
      paypalPayload.source = "paypal_confirm";
      if (!paypalPayload.action) {
        paypalPayload.action = "create_order";
      }

      if (!saveOrderData("paypalOrderData", paypalPayload)) {
        showMessage("ブラウザの設定により注文内容の確認画面へ進めません。", true);
        return;
      }

      showMessage("");
      goToConfirmPage("/payment/paypal/payment-paypal-confirm.html");
    }
  });
})();
