/**
 * シフトの表示専用計算。calendar/report→日別索引とJST時刻表記。
 * DOM/通信/保存/認可を持たない。予定実働はサーバー値を使い、ここで再計算しない。
 * 削除影響: シフト閲覧と印刷の表示が停止する。保存済み予定や原打刻は残る。
 * 一般化: 表示に使う索引を1回だけ作り、日ごとに全件を検索し直さない。
 * 魔改造: 日付キー・翌日表記の変更はカレンダー/印刷/CSVとテストを同期する。
 * 境界: 入力は署名/DTO検査済み。戻り値を公開範囲の判断や権限の根拠に使わない。
 */
(function(global){
  'use strict';

  /** 元の順序とオブジェクトを保持する一時索引。取得し直したら必ず作り直す。 */
  function groupByDay(rows){
    const result=new Map();
    for(const row of rows){
      const day=row.day;
      if(!result.has(day))result.set(day,[]);
      result.get(day).push(row);
    }
    return result;
  }

  /** UTCを日本時間へ表示するだけ。サーバーが確定した区間の境界や実働値を変更しない。 */
  function workText(intervals,day,separator='、'){
    const local=value=>new Date(Date.parse(value)+32400000).toISOString();
    return intervals.map(interval=>{
      const start=local(interval.startAtUtc),end=local(interval.endAtUtc);
      return start.slice(11,16)+'–'+end.slice(11,16)+(end.slice(0,10)!==day?'（翌日）':'');
    }).join(separator);
  }

  global.TlhScheduleView=Object.freeze({groupByDay,workText});
})(window);
