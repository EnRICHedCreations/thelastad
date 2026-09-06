import {randomUUID} from 'node:crypto';
export async function event(db,kind,placementId=null,visitor=null){
 if(visitor){const [existing]=await db('SELECT id FROM product_events WHERE visitor=? AND event=? AND COALESCE(placement_id,\'\')=? AND created_at>? LIMIT 1',[visitor,kind,placementId||'',Date.now()-60000]);if(existing)return;}
 await db('INSERT INTO product_events(id,event,placement_id,visitor,created_at) VALUES(?,?,?,?,?)',[randomUUID(),kind,placementId,visitor,Date.now()]);
}
export async function activity(db,placementId,kind,ordinal=null,remaining=null){
 await db('INSERT INTO activity_events(id,placement_id,kind,ordinal,remaining,created_at) VALUES(?,?,?,?,?,?)',[randomUUID(),placementId,kind,ordinal,remaining,Date.now()]);
}
