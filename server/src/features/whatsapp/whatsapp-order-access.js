import { Op } from 'sequelize';
import { Lead } from '../../models/index.js';
import { decideOrderAccess } from './whatsapp-orders.js';

// Finds the order a WhatsApp sender may see. Returns the lead, or null for every other case (unknown order, other person's order,
// wrong or missing code, too old), so callers cannot tell those apart. A phoneless order is bound to the sender in one UPDATE that also
// clears the code, so two senders cannot both claim it and the code works once.
export async function accessibleLead({ id, code, businessId, sender, maxAgeMs = 24 * 60 * 60 * 1000 }) {
  const lead = await Lead.unscoped().findOne({ where: { id, businessId } });
  if (!lead || Date.now() - new Date(lead.createdAt).getTime() > maxAgeMs) return null;
  const decision = decideOrderAccess(lead, sender, code);
  if (decision === 'match') return lead;
  if (decision !== 'claim') return null;
  const [changed] = await Lead.update({ customerPhone: sender, claimCode: null }, { where: { id, businessId, claimCode: lead.claimCode, [Op.or]: [{ customerPhone: null }, { customerPhone: '' }] } });
  return changed === 1 ? Lead.unscoped().findOne({ where: { id, businessId } }) : null;
}
