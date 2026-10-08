import { createHash, randomBytes } from 'node:crypto';
import { sendEmail, resolveProviders } from './notify.js';
import { PlatformAlert, cleanAlertSettings } from './platform-alerts.js';
import { decryptJson } from './notify-secrets.js';
export const inviteHash = token => createHash('sha256').update(token).digest('hex');
export const validInvite = (user, token, now = Date.now()) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) && user?.active && user.role === 'owner' && user.passwordSetupHash === inviteHash(token) && new Date(user.passwordSetupExpiresAt).getTime() > now;
export function ownerWelcomeText({user,store,setupUrl,loginUrl,shopUrl}) {
 return `Hello ${user.name},\n\nYour Digital Shop admin account has been created.\n\nShop: ${store.name}\nLogin email: ${user.email}\nStorefront: ${shopUrl}\n\nChoose your own password using this one-time link (expires in 24 hours):\n${setupUrl}\n\nSign in after setting your password:\n${loginUrl}\n\nDo not share this setup link. No password is included in this email. If you did not expect this account, ignore this email and contact the person who created your shop.`;
}
export async function sendOwnerInvite(user,store,deps={}) {
 try {
  await PlatformAlert.sync();const row=await PlatformAlert.findByPk(1);
  const settings=cleanAlertSettings(row?.settings),providers=resolveProviders(decryptJson(row?.payload)||{},{});
  if(!settings.ownerWelcomeEmails)return {status:'disabled',message:'Welcome email is switched off. Share login details securely.'};
  if(!providers.email)return {status:'unconfigured',message:'Account created, but no platform email provider is connected. No welcome email was sent.'};
  const origin=(process.env.CLIENT_URL||'').split(',')[0].trim();
  if(!origin.startsWith('https://'))return {status:'failed',message:'Welcome email needs a secure website URL.'};
  const token=randomBytes(32).toString('hex');
  await user.update({passwordSetupHash:inviteHash(token),passwordSetupExpiresAt:new Date(Date.now()+24*60*60*1000)});
  const setupUrl=`${origin}/set-password#token=${token}&email=${encodeURIComponent(user.email)}`;
  const text=ownerWelcomeText({user,store,setupUrl,loginUrl:`${origin}/login`,shopUrl:`${origin}/store/${store.slug}`});
  const result=await (deps.sendEmail||sendEmail)({to:user.email,subject:`Your Digital Shop admin account - ${store.name}`,text},{providers});
  if(!result.ok){await user.update({passwordSetupHash:null,passwordSetupExpiresAt:null});return {status:'failed',message:'Account created, but the welcome email could not be sent. Check your email provider and retry from Users.'};}
  return {status:'sent',message:'Welcome email accepted by the provider. It includes login email, storefront and a one-time 24-hour set-password link.'};
 }catch {return {status:'failed',message:'Account created, but the welcome email could not be sent. Check your provider and retry from Users.'};}
}
