// A shared pool inside the coordinator worker; geometry stays independent of thread count.
export function generationWorkerCount(requested=4,hardware=globalThis.navigator?.hardwareConcurrency||8) {
  return Math.max(1,Math.min(8,Math.trunc(Number(requested))||4,Math.max(1,hardware-2)));
}

export class GenerationPool {
  constructor(count=4,revision='') {
    this.size=generationWorkerCount(count);this.queue=[];this.jobs=new Map();this.next=0;this.closed=false;
    try {
      this.workers=[];
      for(let i=0;i<this.size;i++){
        const worker=new Worker(new URL(`./generation_parallel_worker.js?revision=${encodeURIComponent(revision)}`,import.meta.url),{type:'module'});
        const slot={worker,busy:false};
        worker.onmessage=({data})=>{
          const job=this.jobs.get(data.id);if(!job)return;
          clearTimeout(job.timer);this.jobs.delete(data.id);slot.busy=false;
          if(data.error)job.reject(Error(data.error));else job.resolve(data.result);
          this.pump();
        };
        worker.onmessageerror=()=>this.close(Error('Echange de donnees impossible avec un worker'));
        worker.onerror=event=>this.close(Error(event.message||'Worker de generation indisponible'));
        this.workers.push(slot);
      }
    }catch(error){this.close(error);throw error;}
  }
  send(slot,job) {
    slot.busy=true;job.started=performance.now();this.jobs.set(job.id,job);
    job.timer=setTimeout(()=>this.close(Error(`La tache ${job.type} ne repond plus. Relance avec 4 threads.`)),60000);
    try{slot.worker.postMessage({id:job.id,type:job.type,payload:job.payload},job.transfer||[]);}
    catch(error){clearTimeout(job.timer);this.jobs.delete(job.id);slot.busy=false;job.reject(error);this.pump();}
  }
  pump(){if(!this.closed)for(const slot of this.workers)if(!slot.busy&&this.queue.length)this.send(slot,this.queue.shift());}
  run(type,payload,transfer=[]) {
    if(this.closed)return Promise.reject(Error('Generation worker pool closed'));
    return new Promise((resolve,reject)=>{this.queue.push({id:++this.next,type,payload,transfer,resolve,reject});this.pump();});
  }
  map(type,items){return Promise.all(items.map(payload=>this.run(type,payload)));}
  broadcast(type,payload) {
    if(this.closed)return Promise.reject(Error('Generation worker pool closed'));
    if(this.jobs.size||this.queue.length)throw Error('Broadcast requires idle generation workers');
    return Promise.all(this.workers.map(slot=>new Promise((resolve,reject)=>
      this.send(slot,{id:++this.next,type,payload,resolve,reject}))));
  }
  close(error=Error('Generation cancelled')) {
    this.closed=true;for(const slot of this.workers||[])slot.worker.terminate();
    for(const job of [...this.jobs.values(),...this.queue]){clearTimeout(job.timer);job.reject(error);}
    this.jobs.clear();this.queue.length=0;
  }
}
