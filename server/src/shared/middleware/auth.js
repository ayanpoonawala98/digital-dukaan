import { validPasswordSession } from '../password-security.js';
import jwt from 'jsonwebtoken';
import { User } from '../../models/index.js';
import { bad, wrap } from '../utils/core.js';
export const auth = wrap(async (req, res, next) => {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization || '')?.[1];
  if (!token) throw bad(401, 'Sign in required');
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); } catch { throw bad(401, 'Invalid or expired token'); }
  const user = await User.findByPk(payload.sub, { attributes: { include: ['passwordHash'] } });
  if (!user?.active) throw bad(403, 'Account unavailable');
  if (!validPasswordSession(payload, user)) throw bad(401, 'Password changed. Sign in again.');
  req.user = user;
  next();
});
export const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : next(bad(403, 'Not allowed'));
