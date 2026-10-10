import {ownerWelcomeText} from '../stores/owner-invites.js';
import { Business,User,Product,Lead,ShopRequest } from '../../models/index.js';
import { PlatformAlert } from './platform-alerts.js';
import { decryptJson } from '../notifications/notify-secrets.js';
import { resolveProviders,sendEmail } from '../notifications/notify.js';
import {bad} from '../../shared/utils/core.js';
export function reportText(counts){return `Digital Shop platform summary\n\nStores: ${counts.stores}\nActive stores: ${counts.activeStores}\nOwner accounts: ${counts.owners}\nProducts: ${counts.products}\nRetail enquiries: ${counts.enquiries}\nNew shop requests: ${counts.requests}\n\nEnquiries are not confirmed sales. Counts are a current snapshot, not a financial statement.\nOpen https://digitalshop.website/superadmin to review.`;}
export async function platformReport(user){const [stores,activeStores,owners,products,enquiries,requests]=await Promise.all([Business.count({where:{deletedAt:null}}),Business.count({where:{deletedAt:null,active:true}}),User.count({where:{role:'owner'}}),Product.count(),Lead.count(),ShopRequest.count({where:{status:'new'}})]);return{to:user.email,subject:'Digital Shop platform summary',text:reportText({stores,activeStores,owners,products,enquiries,requests})};}
export async function sendPlatformReport(report){await PlatformAlert.sync();const row=await PlatformAlert.findByPk(1);const providers=resolveProviders(decryptJson(row?.payload)||{},{});if(!providers.email)throw bad(400,'Connect a platform email provider first.');const result=await sendEmail(report,{providers});if(!result.ok)throw bad(502,'Provider did not accept the summary email.');return{status:'accepted',message:'Provider accepted the summary email. Delivery is not yet confirmed.'};}

export function welcomeSample(user) {
 return {to:user.email,subject:'Your Digital Shop admin account - Mumbra Chashmawaala',text:'PREVIEW ONLY: No account or shop was created. The password below is a nonfunctional example.\n\n'+ownerWelcomeText({user:{name:'Ayan',email:user.email},store:{name:'Mumbra Chashmawaala'},shopUrl:'https://digitalshop.website/store/mumbra-chashmawaala',loginUrl:'https://digitalshop.website/login',password:'[DEMO ONLY - not a working password]'})};
}
