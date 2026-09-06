import { randomUUID } from 'node:crypto';
import { q, tx, snapshot } from './db.js';
import {ensureRound,closeRound,auctionState} from './auctions.js';
import {event,activity} from './instrumentation.js';
export const RULES = { allowance: 500, refillAllowance: 250, price: 2000, refillPrice: 1000, duration: 86400000 };
export const now = () => Date.now();
export async function audit(db, action, id, detail = '') { await db('INSERT INTO audit(id,action,placement_id,detail,created_at) VALUES(?,?,?,?,?)', [randomUUID(), action, id, detail, now()]); }
export async function notify(db, p, subject, body) {
  if (!p.sponsor_id) return;
  const [owner] = await db('SELECT email FROM sponsors WHERE id=?', [p.sponsor_id]);
  if (owner) await db('INSERT INTO outbox(id,recipient,subject,body,state,created_at) VALUES(?,?,?,?,?,?)', [randomUUID(), owner.email, subject, body, 'pending', now()]);
}
export async function enqueue(db,id) {
  const [last]=await db('SELECT MAX(queued_at) AS t FROM placements');
  await db("UPDATE placements SET status='queued',queued_at=? WHERE id=?",[Math.max(now(),Number(last.t||0)+1),id]);
}
export async function finish(db,id,reason) {
  const [last]=await db('SELECT MAX(ended_at) AS t FROM placements');
  await db("UPDATE placements SET status='ended',ended_at=?,reason=? WHERE id=?",[Math.max(now(),Number(last.t||0)+1),reason,id]);
}
export async function advance(db) {
  let [live] = await db("SELECT * FROM placements WHERE status='live'");
  if (live && (live.remaining <= 0 || Number(live.expires_at) <= now())) {
    const reason = live.remaining <= 0 ? 'audience' : 'timeout';
    await finish(db,live.id,reason);
    await audit(db, 'placement.ended', live.id, reason);
    await notify(db, live, `${live.name}: your ad has ended`, 'Your placement has ended. Sign in to your sponsor dashboard to see the results and download your certificate.');
    live = null;
  }
  if (!live) {
    const [previous]=await db("SELECT id FROM placements WHERE status='ended' ORDER BY ended_at DESC LIMIT 1");
    const winningId=previous?await closeRound(db,previous.id):null;
    const [last] = await db("SELECT sponsor_id FROM placements WHERE status='ended' AND house=0 ORDER BY ended_at DESC LIMIT 1");
    let [next] = await db("SELECT * FROM placements WHERE status='queued' AND (sponsor_id<>? OR sponsor_id IS NULL) ORDER BY queued_at ASC, id ASC LIMIT 1", [last?.sponsor_id || '']);
    if(winningId)[next]=await db("SELECT * FROM placements WHERE id=? AND status='queued'",[winningId]);
    // A house placement breaks consecutive runs by the same sponsor.
    const [latest] = await db("SELECT house FROM placements WHERE status='ended' ORDER BY ended_at DESC LIMIT 1");
    if (!next && latest?.house) [next] = await db("SELECT * FROM placements WHERE status='queued' ORDER BY queued_at ASC, id ASC LIMIT 1");
    if (!next) {
      const id = randomUUID();
      await db(`INSERT INTO placements(id,name,headline,description,url,theme,status,house,complimentary,created_at) VALUES(?,?,?,?,?,?,'queued',1,1,?)`, [id, 'The Last Ad', 'EVERY GOOD THING\nCOMES TO AN END.', 'Including this ad. Meet the billboard with a limited lifespan. Take a look, take your shot, and make room for something new.', '/sponsor', 'red', now()]);
      [next] = await db('SELECT * FROM placements WHERE id=?', [id]);
    }
    await db("UPDATE placements SET status='live',started_at=?,expires_at=? WHERE id=?", [now(), now() + RULES.duration, next.id]);
    await ensureRound(db,next.id,Boolean(winningId));
    await activity(db,next.id,'started');
    await audit(db, 'placement.started', next.id);
    await notify(db, next, `${next.name} is live`, 'Your ad is on the billboard. Share the live page with your audience and watch its remaining actions in your dashboard.');
    [live] = await db('SELECT * FROM placements WHERE id=?', [next.id]);
  }
  await ensureRound(db,live.id);
  return live;
}
export const tick = () => tx(advance);
export function publicPlacement(p) {
  if (!p) return null;
  const { id,name,headline,description,url,image,theme,status,allowance,remaining,refilled,complimentary,house,created_at,started_at,ended_at,expires_at,reason,views,clicks } = p;
  return { id,name,headline,description,url,image,theme,status,allowance,remaining,refilled,complimentary,house,created_at,started_at,ended_at,expires_at,reason,views:(p.metrics_public||p.house)?Number(views):null,clicks:(p.metrics_public||p.house)?Number(clicks):null };
}
export async function state(visitor) {
 return snapshot(async db=>{
  const [p]=await db("SELECT p.*,CASE WHEN c.placement_id IS NULL THEN 0 ELSE 1 END AS metrics_public FROM placements p LEFT JOIN public_metrics_consent c ON c.placement_id=p.id WHERE p.status='live'");
  const queue=await db("SELECT * FROM placements WHERE status='queued' ORDER BY queued_at,id LIMIT 6");
  const [totals]=await db("SELECT COUNT(*) AS total_ads, COALESCE(SUM(allowance-remaining),0) AS total_hits, COALESCE(SUM(CASE WHEN status='ended' THEN 1 ELSE 0 END),0) AS ended_ads, COALESCE(SUM(CASE WHEN reason='audience' THEN 1 ELSE 0 END),0) AS killed_ads, COALESCE(SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END),0) AS queued_ads, COALESCE(SUM(refilled),0) AS refills FROM placements WHERE house=0");
  const [hits]=await db("SELECT COUNT(*) AS n FROM audience WHERE placement_id=? AND action='end' AND created_at>?",[p?.id||'',Date.now()-300000]);
  const recent=p?await db('SELECT id,kind,ordinal,remaining,created_at FROM activity_events WHERE placement_id=? ORDER BY created_at DESC,id DESC LIMIT 6',[p.id]):[];
  const [acted]=p?await db("SELECT visitor FROM audience WHERE placement_id=? AND visitor=? AND action='end'",[p.id,visitor]):[];
  const [last]=await db("SELECT p.*,CASE WHEN c.placement_id IS NULL THEN 0 ELSE 1 END AS metrics_public FROM placements p LEFT JOIN public_metrics_consent c ON c.placement_id=p.id WHERE p.status='ended' ORDER BY p.ended_at DESC LIMIT 1");
  const [shared]=await db("SELECT COALESCE(SUM(p.views),0) AS shared_views,COALESCE(SUM(p.clicks),0) AS shared_clicks FROM placements p JOIN public_metrics_consent c ON c.placement_id=p.id WHERE p.house=0");
  const [records]=await db("SELECT MIN(ended_at-started_at) AS fastest, MAX(ended_at-started_at) AS longest FROM placements WHERE house=0 AND reason='audience' AND started_at IS NOT NULL");
  const statistics=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,Number(v)]));
  return {current:publicPlacement(p),previous:publicPlacement(last),queue:queue.map(publicPlacement),queueCount:statistics.queued_ads,endedCount:statistics.ended_ads,stats:{...statistics,shared_views:Number(shared.shared_views),shared_clicks:Number(shared.shared_clicks),fastest:records.fastest===null?null:Number(records.fastest),longest:records.longest===null?null:Number(records.longest)},activity:recent,hitsLast5Minutes:Number(hits.n),acted:Boolean(acted),rules:RULES,auction:p?await auctionState(db,p.id):null};
 });
}
export async function act(id, visitor) {
  return tx(async db => {
    const p = await advance(db);
    if (p.id !== id) return { stale: true };
    const result = await db("INSERT INTO audience(placement_id,visitor,action,created_at) VALUES(?,?,'end',?) ON CONFLICT DO NOTHING RETURNING visitor", [id,visitor,now()]);
    if (!result.length) return { duplicate: true };
    await db('UPDATE placements SET remaining=remaining-1 WHERE id=? AND remaining>0', [id]);
    const ordinal=p.allowance-p.remaining+1,remaining=p.remaining-1;
    await activity(db,id,'hit',ordinal,remaining);
    await event(db,'life_removed',id);
    await advance(db);
    return { counted: true,receipt:{placementId:id,name:p.name,ordinal,remaining,from:p.remaining} };
  });
}
export async function track(id, visitor, action) {
  return tx(async db => {
    const [p] = await db("SELECT * FROM placements WHERE id=? AND status IN ('live','ended','queued')", [id]);
    if (!p) return null;
    const inserted = await db('INSERT INTO audience(placement_id,visitor,action,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING RETURNING visitor', [id,visitor,action,now()]);
    if(inserted.length)await event(db,action==='view'?'ad_viewed':'product_visited',id);
    if (inserted.length) await db(`UPDATE placements SET ${action === 'view' ? 'views' : 'clicks'}=${action === 'view' ? 'views' : 'clicks'}+1 WHERE id=?`, [id]);
    return p;
  });
}
