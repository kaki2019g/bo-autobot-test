(() => {
  const head = document.head;
  if (head) {
    // gtagスクリプトを挿入する。
    const gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src =
      "https://www.googletagmanager.com/gtag/js?id=G-J2TLPK5HQH";
    head.appendChild(gtagScript);
  }

  window.dataLayer = window.dataLayer || [];
  // gtagを初期化する。
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", "G-J2TLPK5HQH");

  // Google Tag Managerを読み込む。
  (function(w, d, s, l, i) {
    w[l] = w[l] || [];
    w[l].push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    const f = d.getElementsByTagName(s)[0];
    const j = d.createElement(s);
    const dl = l !== "dataLayer" ? "&l=" + l : "";
    j.async = true;
    j.src = "https://www.googletagmanager.com/gtm.js?id=" + i + dl;
    f.parentNode.insertBefore(j, f);
  })(window, document, "script", "dataLayer", "GTM-PQ8S3354");
})();
