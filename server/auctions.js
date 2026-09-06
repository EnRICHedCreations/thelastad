// Auction selection runs inside the same application transaction as queue advancement.
export const AUCTION_RULES={minimum:500,increment:500,maximum:1000000};
const fail=message=>Object.assign(new Error(message),{status:409});
export async function ensureRound(db,liveId,wasAuction=false){
 await db('INSERT INTO auction_rounds(live_id,status,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING',[liveId,wasAuction?'queue_turn':'open',Date.now()]);
}
export async function auctionState(db,liveId){
 const [round]=await db('SELECT * FROM auction_rounds WHERE live_id=?',[liveId]);
 const leaders=await db("SELECT b.id,b.amount,b.placement_id,p.name,b.created_at FROM bids b JOIN placements p ON p.id=b.placement_id WHERE b.round_id=? AND b.status='leading' AND p.status='queued'",[liveId]);
 const [count]=await db("SELECT COUNT(*) AS n FROM bids WHERE round_id=? AND status IN ('leading','outbid','won')",[liveId]);
 const leader=leaders[0]||null;
 return {roundId:liveId,status:round?.status||'open',leader,minimumBid:leader?leader.amount+AUCTION_RULES.increment:AUCTION_RULES.minimum,bidCount:Number(count.n),rules:AUCTION_RULES};
}
export async function validateBid(db,sponsorId,placementId,liveId,amount){
 const [round]=await db("SELECT * FROM auction_rounds WHERE live_id=? AND status='open'",[liveId]);
 const [live]=await db("SELECT * FROM placements WHERE id=? AND status='live'",[liveId]);
 const [p]=await db("SELECT * FROM placements WHERE id=? AND sponsor_id=? AND status='queued'",[placementId,sponsorId]);
 if(!round||!live)throw fail('This auction has closed. Check the current round.');
 if(!p)throw fail('Only your approved, queued ads can bid.');
 if(live.sponsor_id===sponsorId)throw fail('You cannot buy consecutive placements for the same sponsor.');
 const state=await auctionState(db,liveId);
 if(!Number.isInteger(amount)||amount%100!==0||amount<state.minimumBid||amount>AUCTION_RULES.maximum)throw fail(`Bid at least $${state.minimumBid/100}, in whole dollars. Maximum $10,000.`);
 return p;
}
export async function fundBid(db,payment){
 const [bid]=await db('SELECT * FROM bids WHERE id=?',[payment.id]);
 if(!bid)return false;
 try{await validateBid(db,bid.sponsor_id,bid.placement_id,bid.round_id,bid.amount);}catch(error){if(error.status!==409)throw error;await db("UPDATE bids SET status='cancelled' WHERE id=?",[bid.id]);return false;}
 const previous=await db("SELECT id FROM bids WHERE round_id=? AND status='leading'",[bid.round_id]);
 for(const p of previous){await db("UPDATE bids SET status='outbid' WHERE id=?",[p.id]);await db("UPDATE payments SET state='refund_pending' WHERE id=? AND state='fulfilled'",[p.id]);}
 await db("UPDATE bids SET status='leading' WHERE id=?",[bid.id]);
 return true;
}
export async function closeRound(db,liveId){
 const [round]=await db('SELECT * FROM auction_rounds WHERE live_id=?',[liveId]);
 if(!round||round.status==='closed')return null;
 const [live]=await db('SELECT sponsor_id FROM placements WHERE id=?',[liveId]);
 const [leader]=await db("SELECT b.*,p.status AS placement_status FROM bids b JOIN placements p ON p.id=b.placement_id WHERE b.round_id=? AND b.status='leading'",[liveId]);
 let winner=null;
 if(round.status==='open'&&leader?.placement_status==='queued'&&leader.sponsor_id!==live?.sponsor_id){
  winner=leader.placement_id;await db("UPDATE bids SET status='won' WHERE id=?",[leader.id]);
 }else if(leader){await db("UPDATE bids SET status='cancelled' WHERE id=?",[leader.id]);await db("UPDATE payments SET state='refund_pending' WHERE id=? AND state='fulfilled'",[leader.id]);}
 await db("UPDATE auction_rounds SET status='closed',winner_id=?,closed_at=? WHERE live_id=?",[winner,Date.now(),liveId]);
 return winner;
}
export async function cancelPlacementBids(db,id){
 const rows=await db("SELECT id FROM bids WHERE placement_id=? AND status='leading'",[id]);
 for(const b of rows){await db("UPDATE bids SET status='cancelled' WHERE id=?",[b.id]);await db("UPDATE payments SET state='refund_pending' WHERE id=? AND state='fulfilled'",[b.id]);}
}
