/** 架空データだけでPNGの文字幅計算回数を測る。Google/ブラウザ/原簿へ接続しない。
 * node scripts/measure-shift-png.mjs [人数]。実端末の秒数ではなく、重複計算の比較用。
 * drawPngと同じ公開matrixを使い、描画文字のdigestで表示内容の変化を検出する。 */
import {createHash} from 'node:crypto';
import {scheduleUiHarness} from '../tests/helpers/schedule-harness.mjs';
const employees=Number(process.argv[2]||12);if(!Number.isInteger(employees)||employees<1||employees>50)throw Error('人数は1〜50');
const h=scheduleUiHarness(),s={...h.snapshot(),phase:'PUBLISHED',publishedAt:'2026-11-01T00:00:00Z',plans:[]};
for(let e=0;e<employees;e++)for(let d=1;d<=30;d++){
 const day='2026-11-'+String(d).padStart(2,'0'),off=(e+d)%4===0;
 s.plans.push({employeeCode:'DEMO'+String(e).padStart(3,'0'),employeeName:'架空社員'+e,day,periods:off?[]:[{breakMinutes:60}],workIntervals:off?[]:[{startAtUtc:day+'T00:00:00Z',endAtUtc:day+'T09:00:00Z'}],plannedMinutes:off?0:480,leaveType:off?'PUBLIC_OFF':'NONE',publicNote:d===11?'会議13〜':''});
}
let measurements=0;const texts=[],ctx={measureText(s){measurements++;return{width:[...s].length*7};},scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(s){texts.push(s);}};
const canvas={width:0,height:0,getContext:()=>ctx};h.window.TlhScheduleReport.drawPng(canvas,h.window.TlhScheduleReport.build(s));
console.log(JSON.stringify({employees,days:30,measureTextCalls:measurements,width:canvas.width,height:canvas.height,textDigest:createHash('sha256').update(JSON.stringify(texts)).digest('hex'),fakeDataOnly:true}));
