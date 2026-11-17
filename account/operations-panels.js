/** Scope-local Operations mounts in the top-level Account page. No embedded login or tokens in messages.
 * Independent signed server catalogs are authoritative; tab facts merely expose entry points.
 * Pending, preview and unknown writes lock sibling actions. Existing Operations protocol unchanged. */
(function(g){'use strict';
 function init(o){const mounts={},proof=o.liff;let stopped=false;
  const busy=()=>Object.values(mounts).some(m=>m.busy());
  function activate(key){if(stopped||!['company','platform'].includes(key))return;
   if(!mounts[key])mounts[key]=g.TlhOperations.init({view:key==='company'?'COMPANY':'PLATFORM',prefix:key+'-ops-',frameName:key+'OperationsFrame',liff:proof,autoLoad:false,embedded:true,blocked:()=>!!o.blocked?.()||Object.entries(mounts).some(([k,m])=>k!==key&&m.busy()),onState:o.onState});
   mounts[key].load();
  }
  function invalidate(){for(const m of Object.values(mounts))m.invalidate();}
  g.addEventListener('pagehide',()=>{stopped=true;});return Object.freeze({activate,busy,invalidate});
 }
 g.TlhAccountOperations=Object.freeze({init});
})(window);
