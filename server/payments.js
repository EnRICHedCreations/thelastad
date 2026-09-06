import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import { q, tx } from './db.js';
import {validateBid,fundBid} from './auctions.js';
import {event,activity} from './instrumentation.js';
import { RULES, now, advance, audit, notify, enqueue } from './game.js';
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
export const paymentsEnabled = Boolean(stripe && process.env.STRIPE_WEBHOOK_SECRET && /^https:\/\//.test(process.env.PUBLIC_URL || '') && (process.env.DATABASE_URL || process.env.DATA_DIR) && process.env.OPERATOR_NAME && process.env.SUPPORT_EMAIL && process.env.OPERATOR_ADDRESS && process.env.ADMIN_TOKEN);
export async function checkout(sponsorId, placementId, purpose, bidOptions={}) {
  if (!paymentsEnabled) throw Object.assign(new Error('Paid placements are not open yet. You can submit your ad for review.'),{status:503});
  const payment = await tx(async db=>{
    await advance(db);
    const [p]=await db('SELECT * FROM placements WHERE id=? AND sponsor_id=?',[placementId,sponsorId]);
    if(!p) throw Object.assign(new Error('Placement not found.'),{status:404});
    if(purpose==='bid')await validateBid(db,sponsorId,placementId,bidOptions.roundId,bidOptions.amount);
    if(purpose==='placement' && p.status!=='approved') throw Object.assign(new Error('Your ad must be approved before checkout.'),{status:409});
    if(purpose==='refill' && (p.status!=='live'||p.refilled||p.remaining<25||Number(p.expires_at)-now()<1800000)) throw Object.assign(new Error('This ad is not eligible for a refill. Refills close at 25 actions or 30 minutes before expiry.'),{status:409});
    const [existing]=await db("SELECT * FROM payments WHERE placement_id=? AND purpose=? AND state='pending' ORDER BY created_at DESC LIMIT 1",[placementId,purpose]);
    if(existing && now()-Number(existing.created_at)<1800000){
      if(purpose==='bid'){const [b]=await db('SELECT round_id,amount FROM bids WHERE id=?',[existing.id]);if(b.round_id!==bidOptions.roundId||b.amount!==bidOptions.amount)throw Object.assign(new Error('Finish or wait for your pending bid checkout to expire before starting a different bid.'),{status:409});}
      return existing;
    }
    if(existing) await db("UPDATE payments SET state='expired' WHERE id=?",[existing.id]);
    const id=randomUUID(),amount=purpose==='bid'?bidOptions.amount:purpose==='refill'?RULES.refillPrice:RULES.price;
    await db("INSERT INTO payments(id,placement_id,sponsor_id,purpose,amount,state,created_at) VALUES(?,?,?,?,?,'pending',?)",[id,placementId,sponsorId,purpose,amount,now()]);
    if(purpose==='bid')await db("INSERT INTO bids(id,round_id,placement_id,sponsor_id,amount,status,created_at) VALUES(?,?,?,?,?,'pending',?)",[id,bidOptions.roundId,placementId,sponsorId,amount,now()]);
    await event(db,purpose==='refill'?'refill_started':purpose==='bid'?'bid_started':'checkout_started',placementId);
    return {id,placement_id:placementId,purpose,amount,created_at:now()};
  });
  if(payment.checkout_url) return payment.checkout_url;
  const session=await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],client_reference_id:payment.id,metadata:{paymentId:payment.id},line_items:[{price_data:{currency:'usd',unit_amount:payment.amount,product_data:{name:purpose==='bid'?'The Last Ad — next-slot auction premium (losing bids refunded)':purpose==='refill'?'The Last Ad — 250 additional actions':'The Last Ad — 500-action placement (24-hour maximum)'}},quantity:1}],success_url:`${process.env.PUBLIC_URL}/dashboard?checkout=success`,cancel_url:`${process.env.PUBLIC_URL}/dashboard?checkout=cancelled`,expires_at:Math.floor(Number(payment.created_at)/1000)+1800},{idempotencyKey:payment.id});
  await tx(db=>db('UPDATE payments SET session_id=?,checkout_url=? WHERE id=?',[session.id,session.url,payment.id]));
  return session.url;
}
export async function fulfill(session,eventId) {
  if(session.payment_status!=='paid') return;
  await tx(async db=>{
    const [existingEvent]=await db('SELECT id FROM payment_events WHERE id=?',[eventId]); if(existingEvent)return;
    const [payment]=await db('SELECT * FROM payments WHERE id=?',[session.metadata?.paymentId||'']);
    if(!payment) throw new Error('Unknown payment reference');
    if(session.amount_total!==payment.amount||session.currency!=='usd') throw new Error('Payment amount mismatch');
    if(payment.session_id && payment.session_id!==session.id) throw new Error('Payment session mismatch');
    await db('INSERT INTO payment_events(id,created_at) VALUES(?,?)',[eventId,now()]);
    if(['fulfilled','refund_pending','refunded'].includes(payment.state))return;
    await advance(db);
    const [p]=await db('SELECT * FROM placements WHERE id=?',[payment.placement_id]);
    let ok=false;
    if(payment.purpose==='bid'){ok=await fundBid(db,payment);if(ok)await activity(db,payment.placement_id,'bid_funded');}
    else if(payment.purpose==='placement'&&p?.status==='approved') {
      await enqueue(db,p.id);ok=true;
      await notify(db,p,'Your ad is in the queue','Payment confirmed. Your approved ad is in the live queue. Check your dashboard for updates.');
    } else if(payment.purpose==='refill'&&p?.status==='live'&&!p.refilled){
      await db('UPDATE placements SET allowance=allowance+250,remaining=remaining+250,refilled=1 WHERE id=?',[p.id]);ok=true;
      await activity(db,p.id,'refilled',null,p.remaining+250);
    }
    await db('UPDATE payments SET state=?,intent_id=?,session_id=? WHERE id=?',[ok?'fulfilled':'refund_pending',typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id,session.id,payment.id]);
    if(ok)await event(db,payment.purpose==='refill'?'refill_completed':payment.purpose==='bid'?'bid_completed':'checkout_completed',payment.placement_id);
    await audit(db,ok?'payment.fulfilled':'payment.refund_pending',payment.placement_id,payment.purpose);
    await advance(db);
  });
}
let processing=false;
export async function paymentWorker() {
  if(!paymentsEnabled||processing)return;
  processing=true;
  try{
    const pending=await q("SELECT * FROM payments WHERE state IN ('pending','expired') AND session_id IS NOT NULL ORDER BY created_at DESC LIMIT 20");
    for(const p of pending){const session=await stripe.checkout.sessions.retrieve(p.session_id);if(session.payment_status==='paid')await fulfill(session,`reconcile:${session.id}`);else if(session.status==='expired')await tx(db=>db("UPDATE payments SET state='closed' WHERE id=? AND state IN ('pending','expired')",[p.id]));}
    const refunds=await q("SELECT * FROM payments WHERE state='refund_pending' LIMIT 20");
    for(const p of refunds){if(!p.intent_id)continue;await stripe.refunds.create({payment_intent:p.intent_id},{idempotencyKey:`refund:${p.id}`});await tx(async db=>{await db("UPDATE payments SET state='refunded' WHERE id=?",[p.id]);await db("UPDATE bids SET status='refunded' WHERE id=? AND status<>'won'",[p.id]);});}
  } finally{processing=false;}
}
