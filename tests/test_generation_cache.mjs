import assert from 'node:assert/strict';
import {GenerationCache,generationKeys} from '../generation_cache.js';

class SnapshotStore {
  data=new Map();valid=new Set();
  async read(slot,key){const row=this.data.get(slot);return row?.key===key&&this.valid.has(row.session)?structuredClone(row.value):undefined;}
  async write(slot,key,value,session){this.data.set(slot,{key,value:structuredClone(value),session});}
  async commit(session){this.valid.add(session);}
  async abort(session){for(const [slot,row] of this.data)if(row.session===session)this.data.delete(slot);}
}
const manifest={mode:'noise',schema:1,stages:[
  {id:'layout',revision:'layout-1',parameters:['seed'],parents:[]},
  {id:'population',revision:'population-1',parameters:['density'],parents:['layout']},
  {id:'final',revision:'accesses-1',parameters:[],parents:['population']},
]};
const settings={seed:42,density:6},calls={layout:0,population:0,final:0},store=new SnapshotStore();
const builders={
  layout:{compute(){calls.layout++;return {seed:42};}},
  population:{compute(){calls.population++;return {boxes:['wall','floor']};}},
  final:{compute({population}){calls.final++;population.boxes[0]='open door';return population;}},
};
async function run(version=manifest,options={}) {
  const cache=new GenerationCache(version,await generationKeys(version,settings),store,options);
  const result=await cache.get('final',builders);await cache.commit();return {cache,result};
}
const cold=await run();assert.deepEqual(calls,{layout:1,population:1,final:1});
const warm=await run();assert.deepEqual(warm.result,cold.result);assert(warm.cache.timings.every(t=>t.hit));
assert.deepEqual(calls,{layout:1,population:1,final:1},'A reload never executes cached generators');
const updated=structuredClone(manifest);updated.stages[2].revision='accesses-2';
const partial=await run(updated);assert.deepEqual(calls,{layout:1,population:1,final:2});
assert.deepEqual(partial.result,{boxes:['open door','floor']});
assert.deepEqual(await store.read('noise:population',partial.cache.keys.population),{boxes:['wall','floor']},
  'Final mesh cuts must never modify the cached original population');
await run(updated,{force:true});assert.deepEqual(calls,{layout:2,population:2,final:3});
const pending=new GenerationCache(manifest,await generationKeys(manifest,{...settings,seed:43}),store);
await pending.get('final',builders);
assert.equal(await store.read('noise:final',pending.keys.final),undefined,'Unvalidated runs are never reusable');
await pending.abort();assert.equal(await store.read('noise:final',pending.keys.final),undefined);
const densityKeys=await generationKeys(manifest,{...settings,density:7});
const baseKeys=await generationKeys(manifest,settings);
assert.equal(densityKeys.layout,baseKeys.layout);assert.notEqual(densityKeys.population,baseKeys.population);
console.log('Generation cache: identical warm results, dependency invalidation, immutable base meshes, force rebuild and uncommitted-run isolation OK');

assert.deepEqual(await generationKeys(manifest,{...settings,threads:4}),
  await generationKeys(manifest,{...settings,threads:8}),'Thread count reuses identical cached geometry');
