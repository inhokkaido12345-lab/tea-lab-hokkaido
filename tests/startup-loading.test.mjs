/** Startup ordering regression. No real LINE, browser, network or data. */
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
test('home renders its body before loading scripts while retaining LIFF/controller/bootstrap order',()=>{
  const html=fs.readFileSync(new URL('../workforce/index.html',import.meta.url),'utf8');
  const head=html.slice(0,html.indexOf('</head>')),start=html.indexOf('<script>');
  assert.doesNotMatch(head,/<script[^>]+src=/);
  const scripts=[...html.matchAll(/<script\b([^>]*)src="([^"]+)"[^>]*><\/script>/g)];
  assert.ok(scripts.length>=15);
  for(const script of scripts){assert.ok(script.index>html.indexOf('</main>')&&script.index<start);assert.doesNotMatch(script[0],/\b(?:async|defer)\b/);}
  assert.match(scripts[0][2],/^https:\/\/static\.line-scdn\.net\/liff\//);
  assert.ok(html.indexOf('src="auto-read.js')<html.indexOf('src="layout.js'));
  assert.ok(html.indexOf('src="schedule-view.js')<html.indexOf('src="schedule.js'));
});
