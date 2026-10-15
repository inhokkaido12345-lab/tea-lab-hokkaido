/**
 * 【現役UI1】責務: 従業員/管理者の表示だけを切り替える。認証/権限/通信/保存を担当しない。
 * 構成: index.htmlのinit→tab click/矢印キー→新設data-workforce-pane wrapperのhidden。
 * 削除影響: 管理者側のpaneが開けなくなる。既存controllerの認可/保存やGASの実データは消えない。
 * 概念: presentation controller / separation of concerns / accessible tabs。
 * 初歩: paneは表示のまとまり。管理者tabを選んでも管理者権限は得られない。
 * 改造: tab/pane追加はinitのnamesとHTMLのaria-controls、layoutテスト、READMEを同期。
 * 境界: 既存section/ボタンのhidden/disabled、送信中のdraft/秘密/結果を変更しない。URL/保存/自動通信なし。
 * 検証: tests/layout.test.mjs→既存全UIテスト→Pages→LINEの画面切替と読取のみ。実打刻は試さない。
 */
(function(global) {
  'use strict';
  /**
   * 引数なし。対応tab/paneへ表示イベントを登録し、従業員側を初期選択する。
   * @return {undefined} DOMの表示だけを更新。sectionの表示許可は既存LIFF起動処理に任せる。
   * @throws {Error} 必須tab/pane欠落。HTMLを同時更新せずに配布してはならない。
   * tab移動で送信を再開/取消し/再認証しない理由は、固定retry情報と受付閉鎖を維持するため。
   */
  function init() {
    const names = ['employee', 'manager'];
    const tabs = names.map(name => document.getElementById(name + '-tab'));
    const panes = Array.from(document.querySelectorAll('[data-workforce-pane]'));
    if (tabs.some(tab => !tab) || names.some(name => !panes.some(pane => pane.dataset.workforcePane === name)) ||
        panes.some(pane => !names.includes(pane.dataset.workforcePane))) throw Error('WORKFORCE_LAYOUT_MISSING');
    function activate(name) {
      tabs.forEach((tab, index) => {
        const selected = names[index] === name;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      });
      panes.forEach(pane => { pane.hidden = pane.dataset.workforcePane !== name; });
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(names[index]));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
        activate(names[next]); tabs[next].focus();
      });
    });
    activate('employee');
  }
  global.TlhWorkforceLayout = Object.freeze({ init });
})(window);
