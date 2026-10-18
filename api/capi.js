const PIXEL_ID='1500310161932069';
const allowed=new Set(['PageView','Subscribe']);
const eventIdPattern=/^(pv|sub)_[A-Za-z0-9_-]{8,100}$/;
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.META_CAPI_TOKEN)return res.status(503).json({error:'CAPI token missing'});
  const body=req.body||{};
  if(!allowed.has(body.event_name)||typeof body.event_id!=='string'||!eventIdPattern.test(body.event_id))return res.status(400).json({error:'Invalid event'});
  let url;try{url=new URL(body.event_source_url)}catch{return res.status(400).json({error:'Invalid URL'})}
  const host=(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim().toLowerCase();
  if(url.protocol!=='https:'&&url.hostname!=='localhost')return res.status(403).json({error:'Invalid origin'});
  if(url.host.toLowerCase()!==host)return res.status(403).json({error:'Origin mismatch'});
  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket?.remoteAddress;
  const ua=req.headers['user-agent']||'';
  const user_data={client_ip_address:ip,client_user_agent:ua};
  if(typeof body.fbp==='string'&&body.fbp.length<200)user_data.fbp=body.fbp;
  if(typeof body.fbc==='string'&&body.fbc.length<200)user_data.fbc=body.fbc;
  const event={event_name:body.event_name,event_time:Math.floor(Date.now()/1000),event_id:body.event_id,action_source:'website',event_source_url:url.href,user_data};
  const payload={data:[event]};
  // Set META_TEST_EVENT_CODE in Vercel only during testing; remove it for production.
  if(process.env.META_TEST_EVENT_CODE)payload.test_event_code=process.env.META_TEST_EVENT_CODE;
  try{
    const r=await fetch(`https://graph.facebook.com/v25.0/${PIXEL_ID}/events`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.META_CAPI_TOKEN}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(6500)});
    const result=await r.json().catch(()=>({}));
    if(!r.ok||!Number.isFinite(result.events_received)||result.events_received<1){console.error('Meta CAPI rejected:',r.status,JSON.stringify({error:result.error?.message,code:result.error?.code}));return res.status(502).json({ok:false,error:'Meta did not accept event'})}
    console.log('Meta CAPI accepted:',body.event_name,'events_received:',result.events_received,'test:',Boolean(payload.test_event_code));
    return res.status(200).json({ok:true,events_received:result.events_received});
  }catch(e){console.error('Meta CAPI request failed:',e.message);return res.status(502).json({ok:false,error:'Meta request failed'})}
};
