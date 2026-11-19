/** Local, bounded duration diagnostics only. No tokens, IDs, URLs, results or telemetry. */
(function(global){
 'use strict';
 const samples=[];
 global.TlhInventoryTiming=Object.freeze({
  start(stage){
   if(!['login','initial-read','refresh-read','render'].includes(stage))return ()=>{};
   const started=global.performance.now();let done=false;
   return ()=>{if(done)return;done=true;samples.push(Object.freeze({stage,durationMs:Math.round((global.performance.now()-started)*10)/10}));if(samples.length>20)samples.shift();};
  },
  snapshot:()=>samples.map(sample=>({...sample}))
 });
 global.addEventListener('pagehide',()=>{samples.length=0;});
})(window);
