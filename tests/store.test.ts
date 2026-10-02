import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
// @ts-ignore Server-side module intentionally uses native Node SQLite.
import { createStore } from '../server/store.mjs';
test('run survives SQLite connection restart and rebuild linkage',()=>{const dir=mkdtempSync(tmpdir()+'/outing-store-');const path=dir+'/runs.sqlite';let store=createStore(path);const run={runId:'a',timestamp:new Date().toISOString(),build:'test',parentRunId:null,status:'complete',request:{fixed:'19:00'}};store.save(run);store.close();store=createStore(path);assert.deepEqual(store.get('a'),run);store.save({...run,runId:'b',parentRunId:'a'});assert.equal(store.get('b').parentRunId,'a');store.close();rmSync(dir,{recursive:true});});
