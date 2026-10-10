import { createHmac } from 'node:crypto';
export const passwordStamp = hash => createHmac('sha256', process.env.JWT_SECRET).update(hash).digest('hex');
export const validPasswordSession = (payload, user) => payload.pwd ? payload.pwd === passwordStamp(user.passwordHash) : !user.passwordChangedAt;
export function validatePasswordChange(body) {
  const { currentPassword, newPassword, confirmPassword } = body || {};
  if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) return 'Enter your current password.';
  if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128 || Buffer.byteLength(newPassword,'utf8') > 72) return 'Use 12-72 bytes for your new password (at least 12 characters).';
  if (newPassword !== confirmPassword) return 'New passwords do not match.';
  if (newPassword === currentPassword) return 'Choose a different new password.';
  return null;
}
