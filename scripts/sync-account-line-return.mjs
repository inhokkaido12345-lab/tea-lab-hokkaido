// The fixed LIFF landing must carry the same current Account UI, not a second app.
// Keep normal Account paths absolute only in this generated callback. No credentials in either HTML.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const source=readFileSync(resolve(root,'account/index.html'),'utf8');
const callback=resolve(root,'software/worktime/inventory/auth/account-return/index.html');
const sdk='<script src="https://static.line-scdn.net/liff/edge/2/sdk.js" defer></script>';
const mask='<style>body[data-account-auth-return] > :not(#account-auth-shell),body:not([data-account-auth-return]) #account-auth-shell{display:none!important}</style>';
const shell='<section id="account-auth-shell"><h1>TLHアカウントのLINE本人確認</h1><p id="account-auth-status" role="status">LINEで本人確認しています…</p><a id="account-auth-back" href="/account/">元の画面へ戻る</a></section>';
const oldBroker=/<script src="\/software\/inventory\/employee-login\.js\?v=[a-f0-9]+" defer><\/script>\n/;
const driver=/^<script src="line-login\.js\?v=[a-f0-9]+" defer><\/script>$/m;
const body='<body class="account-category-shell">';
if(!oldBroker.test(source)||!driver.test(source)||source.split(body).length!==2||source.split('</head>').length!==2)throw Error('ACCOUNT_CALLBACK_BUILD_CONTRACT_CHANGED');
const result=source.replace(oldBroker,'')
 .replace(driver,entry=>sdk+'\n'+entry)
 .replace(/(src|href)="(?!\/|https?:|#)([^"]+)"/g,(_all,k,v)=>k+'="/account/'+(v==='./'?'':v)+'"')
 .replace('</head>',mask+'\n</head>')
 .replace(body,'<body class="account-category-shell" data-account-auth-return>'+shell);
if(process.argv.includes('--check')){
 if(readFileSync(callback,'utf8')!==result){console.error('Account LINE callback is stale. Run node scripts/sync-account-line-return.mjs.');process.exitCode=1;}
}else writeFileSync(process.argv.includes('--preview-output')?resolve(root,'delivery/account-line-production-callback.html'):callback,result);
