// ヘッダーの高さ分だけコンテンツを下げる
$(function () {
  const updateOffset = () => {
    const height = $("#js-header").outerHeight() || 0;
    $("main").css("margin-top", height);
  };
  updateOffset();
  $(window).on("resize orientationchange", updateOffset);
});

// SPメニューの開閉トグル
$(function () {
  const hum = $("#js-menu-trigger, .close");
  const nav = $(".sp-nav");
  hum.on("click", function () {
    nav.toggleClass("toggle");
    hum.toggleClass("active");
  });
});

//アコーディオンをクリックした時の動作
$(function () {
  // タイトルをクリックすると
  $(".js-accordion-title").on("click", function () {
    // クリックした次の要素を開閉
    $(this).next().slideToggle(300);
    // タイトルにopenクラスを付け外しして矢印の向きを変更
    $(this).toggleClass("open", 300);
  });
});

// スクロール位置に応じてフェードインさせる
$(function () {
  $(window).scroll(function () {
    $(".js-fade").each(function () {
      var pos = $(this).offset().top;
      var scroll = $(window).scrollTop();
      var windowHeight = $(window).height();
      if (scroll > pos - windowHeight + 100) {
        $(this).addClass("scroll");
      }
    });
  });
});
// $(function () {
//   $(".wpcf7-select").on("change", function () {
//     //セレクトボックスで選択された値を取得
//     const selected = $(".wpcf7-select").val();

//     if (
//       selected === "お手元のサインツールが本システムに対応しているか知りたい"
//     ) {
//       $(".display").slideDown();
//     } else {
//       $(".display").slideUp();
//     }
//   });
// });
$(function () {
  // セレクトの選択肢に応じて表示エリアを切り替える
  $(".wpcf7-select").on("change", function () {
    //セレクトボックスで選択された値を取得
    const selected = $(".wpcf7-select").val();

    if (
      selected === "お手元のサインツールが本システムに対応しているか知りたい"
    ) {
      $(".display").show();
    } else {
      $(".display").hide();
    }
  });
});
