/** Public navigation catalog, never a tenant catalog or authorization source.
 * Caller: app-menu.js. Add future apps here; do not add company/store IDs or token URLs.
 * Removing an entry removes its launcher only; direct URLs and server checks still exist.
 * Concept: a registry separates stable destinations from UI layout and access hints.
 * Edit: add an id/title/description/mark/path; planned entries have no path.
 * Test: tests/app-menu.test.mjs plus qa/app-menu-browser.cjs. No runtime network needed.
 */
(function(global){'use strict';
 const entries=[
  {id:'account',title:'TLHアカウント',description:'登録・所属・権限の確認',mark:'ID',path:'/account/'},
  {id:'inventory',title:'在庫',description:'在庫・発注・入荷',mark:'在庫',path:'/software/inventory/'},
  {id:'worktime',title:'勤怠',description:'打刻・勤務記録・シフト',mark:'勤怠',path:'/software/worktime/'},
  {id:'pos',title:'POS',description:'会計・売上管理',mark:'POS',path:null}
 ];
 function validate(list){
  if(!Array.isArray(list)||!list.length)throw Error('APP_CATALOG_REQUIRED');
  const ids=new Set();return Object.freeze(list.map(entry=>{
   if(!entry||typeof entry!=='object'||!/^\w[\w-]{0,39}$/.test(entry.id)||ids.has(entry.id)||
    !['title','description','mark'].every(k=>typeof entry[k]==='string'&&entry[k].length>0&&entry[k].length<=100))throw Error('APP_CATALOG_INVALID');
   ids.add(entry.id);
   // Forbid schemes, queries, fragments, encoded paths and dot segments: a public app root only.
   if(entry.path!==null&&(typeof entry.path!=='string'||!/^\/(?:[a-z0-9-]+\/)+$/.test(entry.path)))throw Error('APP_PATH_INVALID');
   return Object.freeze({id:entry.id,title:entry.title,description:entry.description,mark:entry.mark,path:entry.path});
  }));
 }
 global.TlhAppCatalog=Object.freeze({entries:validate(entries),validate});
})(window);
