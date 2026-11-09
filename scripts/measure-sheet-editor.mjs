/**
 * 責務: 架空25人×31日の返信で、非表示編集DOMの削減量を再現する（実通信/保存なし）。
 * 呼出先: tests/helpers/schedule-bulk-harness.mjs→現役controller/Model。削除影響は計測入口だけ。
 * 概念: 不要なDOM/イベントの遅延生成。実GAS通信や実打刻の秒数を測る道具ではない。
 * 魔改造: 人数/月はfixtureを変更。両モードを残し、削減のため署名検査を迂回しない。
 * 検証: node scripts/measure-sheet-editor.mjs。件数以外の社員情報やtokenを出力しない。
 */
import assert from 'node:assert/strict';
import {scheduleBulkHarness,bulkSnapshot} from '../tests/helpers/schedule-bulk-harness.mjs';
const walk=node=>[node,...node.children.flatMap(walk)];
async function measure(sheet){
  const h=scheduleBulkHarness(),snapshot=bulkSnapshot(25,'2026-12');
  h.n('month').value='2026-12';if(sheet)for(const half of Object.values(snapshot.halves))half.inputMode='SHEET';
  await h.api.load();await h.reply(h.sent[0],snapshot);
  const cells=walk(h.n('rows')).filter(node=>node.tagName==='textarea');
  return {editorCells:cells.length,cellListeners:cells.reduce((n,cell)=>n+Object.keys(cell.events).length,0),requests:h.sent.length};
}
const legacy=await measure(false),sheet=await measure(true);
assert.equal(legacy.editorCells,775);assert.equal(legacy.cellListeners,2325);
assert.equal(sheet.editorCells,0);assert.equal(sheet.cellListeners,0);assert.equal(sheet.requests,1);
console.log(JSON.stringify({fixture:'25 fictional employees / December',legacy,sheet,liveNetwork:false}));
