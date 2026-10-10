import { validInvite } from '../features/stores/owner-invites.js';
import { logSetupEvent } from '../features/stores/setup-links.js';
import { passwordStamp, validatePasswordChange } from '../shared/password-security.js';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { auth } from '../shared/middleware/auth.js';
import { bad, wrap } from '../shared/utils/core.js';
const r = Router();
import { effective as staffPerms } from '../shared/permissions.js';
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, staffBusinessId: u.staffBusinessId || null, ...(u.role === 'staff' ? { permissions: staffPerms(u) } : {}) });
const sign = u => jwt.sign({ sub: u.id, pwd: passwordStamp(u.passwordHash) }, process.env.JWT_SECRET, { expiresIn: '7d', algorithm: 'HS256' });
// Public registration is intentionally disabled. Existing clients cannot create accounts.
r.post('/signup', (_, res) => res.status(403).json({ error: 'New accounts are created by the superadmin. Request a shop instead.' }));
// Login hardening: constant-ish timing for unknown emails and a per-email failure lockout (in-memory, per process).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);
const fails = new Map();
const LOCK_AFTER = 8, LOCK_MS = 15 * 60 * 1000;
const lockedFor = key => { const f = fails.get(key); if (!f) return 0; if (Date.now() - f.first > LOCK_MS) { fails.delete(key); return 0; } return f.n >= LOCK_AFTER ? LOCK_MS - (Date.now() - f.first) : 0; };
const noteFail = key => { const f = fails.get(key); if (!f || Date.now() - f.first > LOCK_MS) fails.set(key, { n: 1, first: Date.now() }); else f.n++; if (fails.size > 5000) fails.clear(); };
r.post('/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const wait = lockedFor(email);
  if (wait) throw bad(429, 'Too many failed attempts. Try again in a few minutes.');
  const user = await User.unscoped().findOne({ where: { email } });
  const ok = await bcrypt.compare(String(req.body.password || ''), user?.passwordHash || DUMMY_HASH);
  if (!user || !ok) { noteFail(email); throw bad(401, 'Invalid credentials'); }
  if (!user.active) throw bad(403, 'Account unavailable');
  fails.delete(email);
  res.json({ token: sign(user), user: safeUser(user) });
}));
r.post('/set-password', wrap(async (req,res) => {
 const { email, token, newPassword, confirmPassword }=req.body||{};
 const problem=validatePasswordChange({currentPassword:'setup-link',newPassword,confirmPassword});
 if(problem)throw bad(400,problem);
 const user=await User.unscoped().findOne({where:{email:String(email||'').toLowerCase().trim()}});
 if(!validInvite(user,token))throw bad(400,'This setup link is invalid or expired. Ask the platform admin for a new link.');
 const hash=await bcrypt.hash(newPassword,12);
 const [changed]=await User.update({passwordHash:hash,passwordChangedAt:new Date(),passwordSetupHash:null,passwordSetupExpiresAt:null},{where:{id:user.id,passwordSetupHash:user.passwordSetupHash}});
 if(!changed)throw bad(400,'This setup link has already been used.');
 await logSetupEvent(user.id,'used');
 res.json({changed:true});
}));
r.post('/change-password', auth, wrap(async (req, res) => {
  const problem = validatePasswordChange(req.body);
  if (problem) throw bad(400, problem);
  const user = await User.unscoped().findByPk(req.user.id);
  if (!user?.active || !await bcrypt.compare(req.body.currentPassword, user.passwordHash)) throw bad(400, 'Current password is incorrect.');
  const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  const [changed] = await User.update({ passwordHash, passwordChangedAt: new Date(), passwordSetupHash:null, passwordSetupExpiresAt:null }, { where: { id: user.id, passwordHash: user.passwordHash } });
  if (!changed) throw bad(409, 'Password changed elsewhere. Sign in again.');
  res.json({ changed: true });
}));
r.get('/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
export default r;
