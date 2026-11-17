/** Reviewed legacy entry points only, not registry permissions or instance routing.
 * Service metadata cannot supply URLs. Each app verifies the current account and
 * selected workplace independently; no scope, identity or token goes in the URL. */
(function(g){'use strict';g.TlhAccountServiceLaunchers=Object.freeze([
 Object.freeze({serviceId:'inventory',path:'/software/inventory/'}),
 Object.freeze({serviceId:'worktime',path:'/software/worktime/'})
]);})(globalThis);
