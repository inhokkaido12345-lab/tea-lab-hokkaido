/** Demo adapter only; all states are synthetic. Never distribute this as an auth adapter. */
(function(){'use strict';let menu;
 const $=id=>document.getElementById(id),names={account:'TLHアカウント',inventory:'在庫',worktime:'勤怠'};
 function setup(){menu?.destroy();const current=$('demo-current').value;$('demo-app-name').textContent=names[current];
  menu=window.TlhAppMenu.mount($('app-menu-slot'),{currentApp:current,
   beforeNavigate(app){$('demo-destination').textContent=$('demo-saving').checked?'保存結果が未確認のため移動を止めました。':'試作で選択：'+app.title+' ｜ '+app.path;return false;},
   blockedMessage:'この試作では移動を止めています。選択した入口は元の画面に表示します。'
  });update();
 }
 function update(){const examples={unknown:{},both:{inventory:'available',worktime:'available'},'inventory-only':{inventory:'available',worktime:'unavailable'},none:{inventory:'unavailable',worktime:'unavailable'}};menu.setAccessHints(examples[$('demo-scenario').value]);}
 $('demo-current').addEventListener('change',setup);$('demo-scenario').addEventListener('change',update);setup();
})();
