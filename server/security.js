import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const hash = x => createHash('sha256').update(x).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export async function passwordHash(password) { const salt = randomBytes(16).toString('hex'); return `${salt}:${Buffer.from(await scrypt(password,salt,64)).toString('hex')}`; }
export async function verifyPassword(password, stored) { const [salt,key] = stored.split(':'); const calculated = await scrypt(password,salt,64); return timingSafeEqual(calculated,Buffer.from(key,'hex')); }
export function safeEqual(a,b) { return timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b))); }
export function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(v=>{const i=v.indexOf('=');return [v.slice(0,i).trim(),v.slice(i+1)];})); }
export function setCookie(res,key,value,maxAge) { res.cookie(key,value,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge,path:'/'}); }
export function validUrl(value) {
  try {
    const u=new URL(value);
    if (u.protocol!=='https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /(^|\.)(localhost|local|internal|test|example|invalid)$/.test(u.hostname) || /^(\d+\.){3}\d+$/.test(u.hostname) || u.hostname.includes(':')) return false;
    return true;
  } catch { return false; }
}

export const signVisitor = (value, secret) => createHmac("sha256", secret).update(value).digest("hex");
