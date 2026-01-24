(() => {
  // キャンセル時に商品種別に応じて戻り先を調整する。
  const backLink = document.getElementById("paypal-cancel-link");
  if (backLink) {
    try {
      const raw = sessionStorage.getItem("paypalOrderData");
      const data = raw ? JSON.parse(raw) : null;
      if (data && data.product_id === "bo-autobot-demo") {
        // GitHub Pagesのベースパスを考慮して戻り先URLを解決する。
        const demoPath = "/checkout/checkout.html?product=demo";
        const demoUrl = typeof window.withBasePath === "function"
          ? window.withBasePath(demoPath)
          : new URL(demoPath, window.location.href).toString();
        backLink.setAttribute("href", demoUrl);
      }
    } catch (err) {
    }
  }

  // PayPalキャンセル時に注文ステータスをキャンセルへ更新する。
  const configEl = document.getElementById("paypal-cancel-config");
  if (!configEl) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const paypalOrderId = params.get("token") || params.get("paypal_order_id") || "";
  if (!paypalOrderId) {
    return;
  }

  const getBasePath = () => {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    if (hostname.endsWith("github.io")) {
      const parts = pathname.split("/").filter(Boolean);
      return parts.length ? `/${parts[0]}/` : "/";
    }
    return "/";
  };

  const withBase = (path) => {
    if (path.startsWith("/")) {
      return getBasePath() + path.slice(1);
    }
    return getBasePath() + path;
  };

  const resolveEnv = async () => {
    try {
      const res = await fetch(withBase("assets/config/gas-env.json"), { cache: "no-cache" });
      if (!res.ok) {
        return "prod";
      }
      const json = await res.json();
      return json && (json.env === "test" || json.env === "prod") ? json.env : "prod";
    } catch (err) {
      return "prod";
    }
  };

  const getEndpoint = (env) => {
    return env === "test" ? configEl.dataset.gasEndpointTest : configEl.dataset.gasEndpointProd;
  };

  resolveEnv().then((env) => {
    const endpoint = getEndpoint(env);
    if (!endpoint) {
      return;
    }
    const payload = new URLSearchParams();
    payload.set("action", "cancel_paypal");
    payload.set("paypal_order_id", paypalOrderId);
    payload.set("source", "paypal_cancel");
    fetch(endpoint, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: payload.toString()
    }).catch(() => {});
  });
})();
