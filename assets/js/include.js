(async () => {
  // GitHub Pages配信時のベースパスを判定する。
  const getBasePath = () => {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    if (hostname.endsWith("github.io")) {
      const parts = pathname.split("/").filter(Boolean);
      return parts.length ? `/${parts[0]}/` : "/";
    }
    return "/";
  };

  const basePath = getBasePath();
  // ルート始まりのパスをベースパスに合わせて補正する。
  const withBase = (path) => {
    if (path.startsWith("/")) {
      return basePath + path.slice(1);
    }
    return basePath + path;
  };
  window.withBasePath = withBase;

  // ヘッダー/フッターのHTMLを読み込んで挿入する。
  const inject = async (id, url) => {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) {
      throw new Error(`Failed to load ${url}`);
    }
    const html = await res.text();
    const target = document.getElementById(id);
    if (target) {
      target.innerHTML = html;
    }
  };

  await inject("site-header", withBase("header.html"));
  await inject("site-footer", withBase("footer.html"));

  // GASエンドポイントの環境切り替えを行う。
  const resolveGasEnv = async () => {
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

  const applyGasEndpoints = (env) => {
    const forms = document.querySelectorAll("form[data-gas-endpoint-test], form[data-gas-endpoint-prod]");
    forms.forEach((form) => {
      const endpoint = env === "test" ? form.dataset.gasEndpointTest : form.dataset.gasEndpointProd;
      if (!endpoint) {
        return;
      }
      form.setAttribute("data-gas-endpoint", endpoint);
      const action = form.getAttribute("action") || "";
      if (action.indexOf("script.google.com") !== -1) {
        form.setAttribute("action", endpoint);
      }
    });
  };

  const gasEnv = await resolveGasEnv();
  applyGasEndpoints(gasEnv);

  // テスト環境のみ全ページにバッジを表示する。
  const showEnvBadge = (env) => {
    if (env !== "test") {
      return;
    }
    const badge = document.createElement("div");
    badge.className = "env-badge env-badge--test";
    badge.textContent = "テスト環境";
    document.body.appendChild(badge);
  };

  showEnvBadge(gasEnv);

  // ルート参照のリンク/画像パスをベースパスへ置き換える。
  const updateRootLinks = () => {
    const nodes = document.querySelectorAll('[href^="/"], [src^="/"]');
    nodes.forEach((node) => {
      const attr = node.hasAttribute("href") ? "href" : "src";
      const value = node.getAttribute(attr);
      if (!value || value.startsWith("//")) {
        return;
      }
      node.setAttribute(attr, withBase(value));
    });
  };

  updateRootLinks();

  // 共通スクリプトを動的に読み込む。
  const script = document.createElement("script");
  script.src = withBase("assets/js/common.js");
  document.body.appendChild(script);
})().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
});
