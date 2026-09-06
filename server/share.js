import sharp from 'sharp';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {q} from './db.js';

const escape=s=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot',"'":'&apos;'}[c]));
const configuredOrigin=()=>String(process.env.PUBLIC_URL||'https://the-last-ad.apps.deployhatch.com').replace(/\/$/,'');
const requestOrigin=req=>{
  const proto=String(req.headers['x-forwarded-proto']||req.protocol||'https').split(',')[0].trim();
  const host=String(req.headers['x-forwarded-host']||req.get('host')||'').split(',')[0].trim();
  return host?`${proto}://${host}`:configuredOrigin();
};

async function placement(id){
  const [p]=await q("SELECT p.*,CASE WHEN c.placement_id IS NULL THEN 0 ELSE 1 END AS metrics_public FROM placements p LEFT JOIN public_metrics_consent c ON c.placement_id=p.id WHERE "+(id?"p.id=? AND p.status IN ('live','ended')":"p.status='live'"),id?[id]:[]);
  return p;
}

function card(p,certificate=false){
  const ended=p.status==='ended';
  const minutes=p.started_at?Math.max(1,Math.round(((Number(p.ended_at)||Date.now())-Number(p.started_at))/60000)):0;
  const metrics=p.metrics_public||p.house?`${p.views} recorded views · ${p.clicks} product visits`:'Detailed metrics are private';
  const state=certificate?'CERTIFICATE OF DEATH':ended?'THE GRAVEYARD':'LIVE DEATHWATCH';
  const primary=ended?'ENDED.':String(p.remaining);
  const secondary=ended?`${p.allowance-p.remaining} audience actions · ${minutes} minutes on the billboard`:'LIVES LEFT. HELP END IT.';
  const footer=`${p.house?'HOUSE AD':p.complimentary?'COMPLIMENTARY PLACEMENT':'SPONSORED PLACEMENT'} / ${ended?(p.reason==='audience'?'ENDED BY THE AUDIENCE':p.reason==='timeout'?'TIME EXPIRED':'ENDED BY OPERATOR'):'THE INTERNET HAS THE LAST WORD'}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#f4f1e9"/>
    <rect x="24" y="24" width="1152" height="582" fill="none" stroke="#171714" stroke-width="2"/>
    <rect x="24" y="24" width="1152" height="70" fill="#171714"/>
    <circle cx="58" cy="59" r="8" fill="#d93624"/>
    <text x="82" y="68" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="23" fill="#f4f1e9">THE LAST AD / ${state}</text>
    <text x="58" y="163" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="40" fill="#171714">${escape(p.name)}</text>
    <text x="50" y="344" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="156" fill="#d93624">${escape(primary)}</text>
    <text x="58" y="405" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="30" fill="#171714">${escape(secondary)}</text>
    <text x="58" y="475" font-family="DejaVu Sans,Arial,sans-serif" font-size="24" fill="#66665f">${escape(ended?metrics:'Every visitor gets one hit. Bring someone else.')}</text>
    <line x1="58" y1="514" x2="1142" y2="514" stroke="#171714"/>
    <text x="58" y="565" font-family="DejaVu Sans,Arial,sans-serif" font-weight="700" font-size="20" fill="#171714">${escape(footer)}</text>
  </svg>`;
}

const cache=new Map();
function cardVersion(p){return [p.id,p.remaining,p.status,p.views,p.clicks,p.metrics_public,p.ended_at||0].join('-');}

export function installShareRoutes(app){
  app.get('/og/:id.png',async(req,res)=>{
    const p=await placement(req.params.id==='live'?null:req.params.id);
    if(!p)return res.sendStatus(404);
    const key=cardVersion(p);
    let buffer=cache.get(key);
    if(!buffer){
      buffer=await sharp(Buffer.from(card(p)),{density:144}).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
      if(cache.size>=32)cache.delete(cache.keys().next().value);
      cache.set(key,buffer);
    }
    res.set({
      'Content-Type':'image/png',
      'Content-Length':String(buffer.length),
      'Cache-Control':'public, max-age=15, s-maxage=15',
      'Cross-Origin-Resource-Policy':'cross-origin',
      'Access-Control-Allow-Origin':'*'
    }).send(buffer);
  });

  app.get('/share/:id.svg',async(req,res)=>{
    const p=await placement(req.params.id);
    if(!p||p.status!=='ended')return res.sendStatus(404);
    res.type('svg').set('Content-Disposition',`attachment; filename="last-ad-${p.id}.svg"`).send(card(p,true));
  });

  app.get(['/','/archive/:id','/live/:id/:version'],async(req,res,next)=>{
    const isLiveShare=Boolean(req.params.version);
    const p=await placement(req.params.id);
    if(!p)return next();
    let html=readFileSync(resolve('dist/index.html'),'utf8');
    const ended=p.status==='ended';
    const title=ended?`${p.name} — ${p.allowance-p.remaining} hits. Ended. | The Last Ad`:`${p.remaining} lives left — ${p.name} | The Last Ad`;
    const description=ended?`${p.name} had its moment. See the recorded results and death certificate.`:`${p.name} has ${p.remaining} lives left. Every visitor gets one hit. Help end it.`;
    const origin=requestOrigin(req);
    const url=ended?`${origin}/archive/${p.id}`:isLiveShare?`${origin}/live/${p.id}/${p.remaining}`:`${origin}/`;
    const image=`${origin}/og/${p.id}.png?v=${encodeURIComponent(cardVersion(p))}`;
    html=html.replace(/<title>.*?<\/title>/,'<title>'+escape(title)+'</title>').replace(/<meta\s+(?:name|property)="(?:description|og:[^"]+|twitter:[^"]+)"[^>]*>/g,'').replace(/<link\s+rel="canonical"[^>]*>/g,'');
    const alt=`${p.name} — ${ended?'ended':`${p.remaining} lives left`} on The Last Ad`;
    const tags=`<link rel="canonical" href="${escape(url)}"/><meta name="description" content="${escape(description)}"/><meta property="og:title" content="${escape(title)}"/><meta property="og:description" content="${escape(description)}"/><meta property="og:type" content="website"/><meta property="og:url" content="${escape(url)}"/><meta property="og:image" content="${escape(image)}"/><meta property="og:image:secure_url" content="${escape(image)}"/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/><meta property="og:image:alt" content="${escape(alt)}"/><meta name="twitter:card" content="summary_large_image"/><meta name="twitter:title" content="${escape(title)}"/><meta name="twitter:description" content="${escape(description)}"/><meta name="twitter:image" content="${escape(image)}"/><meta name="twitter:image:alt" content="${escape(alt)}"/>`;
    res.set({'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Vary':'Host, X-Forwarded-Host, X-Forwarded-Proto'}).type('html').send(html.replace('</head>',tags+'</head>'));
  });
}
