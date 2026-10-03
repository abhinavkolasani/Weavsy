import { useState } from 'react';
export function RunInspector() {
  const [id,setId]=useState(()=>{try{return sessionStorage.getItem('outing-last-run')??'';}catch{return '';}});
  const [data,setData]=useState<unknown>(null),[error,setError]=useState('');
  async function load(){setError('');try{const r=await fetch('/api/runs/'+encodeURIComponent(id));if(!r.ok)throw new Error('Run not found');setData(await r.json());}catch(e){setError(e instanceof Error?e.message:'Could not load run');}}
  return <><div className="page-heading"><h1>Planning run inspector</h1><p>Local founder diagnostics. This surface is separate from the guest experience.</p></div><section className="panel"><label htmlFor="run-id">Run ID</label><input id="run-id" value={id} onChange={e=>setId(e.target.value)}/><button className="secondary" onClick={load}>Inspect run</button>{error&&<p role="alert">{error}</p>}{data!==null&&<pre className="run-json">{JSON.stringify(data,null,2)}</pre>}</section></>;
}
