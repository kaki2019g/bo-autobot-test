// メンテナンス: 商品画像モーダルの開閉制御（クリック/背景/ESCに対応）
document.addEventListener("DOMContentLoaded", function () {
  var triggers = document.querySelectorAll("[data-item-image]");
  var modal = document.querySelector(".p-item-image-modal");

  if (!modal || triggers.length === 0) {
    return;
  }

  var modalImage = modal.querySelector("[data-modal-image]");
  var closeButtons = modal.querySelectorAll("[data-modal-close]");

  var openModal = function (img) {
    if (modalImage && img) {
      modalImage.src = img.src;
      modalImage.alt = img.alt || "商品画像";
    }
    modal.classList.add("is-open");
    document.body.classList.add("is-modal-open");
    modal.setAttribute("aria-hidden", "false");
  };

  var closeModal = function () {
    modal.classList.remove("is-open");
    document.body.classList.remove("is-modal-open");
    modal.setAttribute("aria-hidden", "true");
  };

  triggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      var img = trigger.querySelector("img");
      openModal(img);
    });
  });

  closeButtons.forEach(function (button) {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
});
