// Values are only readable after the whole source snapshot has been validated.
export async function generationKeys(manifest,settings) {
  const keys={};
  for(const stage of manifest.stages) {
    const input=JSON.stringify({schema:manifest.schema,mode:manifest.mode,id:stage.id,
      revision:stage.revision,parents:stage.parents.map(id=>keys[id]),
      settings:stage.parameters.map(name=>[name,settings[name]??null])});
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input));
    keys[stage.id]=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  }
  return keys;
}

export async function openGenerationStore() {
  if(!globalThis.indexedDB)return null;
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('msmp-generation',1);
    request.onupgradeneeded=()=>{for(const name of ['data','meta','sessions'])request.result.createObjectStore(name);};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('Generation cache database is busy'));
  });
  db.onversionchange=()=>db.close();
  const completed=tx=>new Promise((resolve,reject)=>{
    tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||Error('Cache transaction aborted'));
  });
  return {
    async read(slot,key) {
      const tx=db.transaction(['meta','data','sessions'],'readonly'),done=completed(tx);let value;
      const meta=tx.objectStore('meta').get(slot);
      meta.onsuccess=()=>{
        const row=meta.result;if(!row||row.key!==key)return;
        const session=tx.objectStore('sessions').get(row.session);
        session.onsuccess=()=>{
          if(!session.result?.valid)return;
          const data=tx.objectStore('data').get(slot);data.onsuccess=()=>{value=data.result;};
        };
      };
      await done;return value;
    },
    async write(slot,key,value,session) {
      const tx=db.transaction(['meta','data'],'readwrite'),done=completed(tx);
      tx.objectStore('data').put(value,slot);
      tx.objectStore('meta').put({key,session},slot);await done;
    },
    async commit(session) {
      const tx=db.transaction(['meta','sessions'],'readwrite'),done=completed(tx);
      tx.objectStore('sessions').put({valid:true,time:Date.now()},session);
      const meta=tx.objectStore('meta').getAll(),sessions=tx.objectStore('sessions').openCursor();
      const live=new Set([session]);meta.onsuccess=()=>meta.result.forEach(row=>live.add(row.session));
      sessions.onsuccess=()=>{
        const cursor=sessions.result;if(!cursor)return;
        if(!live.has(cursor.key)&&cursor.value.time<Date.now()-86400000)cursor.delete();
        cursor.continue();
      };
      await done;
    },
    async abort(session) {
      const tx=db.transaction(['meta','data','sessions'],'readwrite'),done=completed(tx);
      tx.objectStore('sessions').delete(session);
      const cursor=tx.objectStore('meta').openCursor();
      cursor.onsuccess=()=>{
        const row=cursor.result;if(!row)return;
        if(row.value.session===session){tx.objectStore('data').delete(row.key);row.delete();}
        row.continue();
      };await done;
    },
    close(){db.close();},
  };
}

export class GenerationCache {
  constructor(manifest,keys,store,{force=false,progress=()=>{}}={}) {
    this.manifest=manifest;this.keys=keys;this.store=store;this.force=force;this.progress=progress;
    this.session=crypto.randomUUID();this.pending=new Map();this.timings=[];
  }
  async storage(action) {
    if(!this.store)return;
    try{return await action(this.store);}catch(error){
      console.warn('Generation cache unavailable; continuing without it',error);this.store.close?.();this.store=null;
    }
  }
  get(id,builders) {
    if(this.pending.has(id))return this.pending.get(id);
    const work=this.load(id,builders);this.pending.set(id,work);return work;
  }
  async load(id,builders) {
    const stage=this.manifest.stages.find(s=>s.id===id),slot=`${this.manifest.mode}:${id}`;
    const timing={id,hit:false,readMs:0,computeMs:0,writeMs:0};this.timings.push(timing);
    let started=performance.now();
    const saved=this.force?undefined:await this.storage(store=>store.read(slot,this.keys[id]));
    timing.readMs=performance.now()-started;
    if(saved!==undefined){timing.hit=true;this.progress(`Etape reutilisee : ${id}`);return saved;}
    const builder=builders[id];builder.prepare?.();
    const values=await Promise.all(stage.parents.map(parent=>this.get(parent,builders)));
    const parents=Object.fromEntries(stage.parents.map((parent,i)=>[parent,values[i]]));
    started=performance.now();const value=await builder.compute(parents);timing.computeMs=performance.now()-started;
    started=performance.now();await this.storage(store=>store.write(slot,this.keys[id],value,this.session));
    timing.writeMs=performance.now()-started;return value;
  }
  async commit(){await this.storage(store=>store.commit(this.session));}
  async abort(){await this.storage(store=>store.abort(this.session));}
  close(){this.store?.close();}
}
