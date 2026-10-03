import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
import { auth } from '../middleware/auth.js';
import { bad, wrap } from '../utils/core.js';
const r = Router();
import { effective as staffPerms } from '../permissions.js';
const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role, staffBusinessId: u.staffBusinessId || null, ...(u.role === 'staff' ? { permissions: staffPerms(u) } : {}) });
const sign = u => jwt.sign({ sub: u.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
// Public registration is intentionally disabled. Existing clients cannot create accounts.
r.post('/signup', (_, res) => res.status(403).json({ error: 'New accounts are created by the superadmin. Request a shop instead.' }));
r.post('/login', wrap(async (req, res) => {
  const user = await User.unscoped().findOne({ where: { email: String(req.body.email || '').toLowerCase().trim() } });
  if (!user || !await bcrypt.compare(String(req.body.password || ''), user.passwordHash)) throw bad(401, 'Invalid credentials');
  if (!user.active) throw bad(403, 'Account unavailable');
  res.json({ token: sign(user), user: safeUser(user) });
}));
r.get('/me', auth, (req, res) => res.json({ user: safeUser(req.user) }));
export default r;
