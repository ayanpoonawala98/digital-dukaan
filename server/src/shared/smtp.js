// Minimal SMTP submission client (plain text mail, STARTTLS or implicit TLS, AUTH PLAIN/LOGIN). No dependencies.
import net from 'node:net';
import tls from 'node:tls';
import { publicAddress } from './net-guard.js';

const clean = s => String(s).replace(/[\r\n]+/g, ' ').trim();
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const addr = s => (String(s).match(/<([^>]+)>/)?.[1] || String(s)).trim();

export function buildMessage({ from, to, subject, text, now = new Date(), id = Math.random().toString(36).slice(2) }) {
  const domain = addr(from).split('@')[1] || 'localhost';
  const body = b64(String(text).replace(/\r?\n/g, '\r\n')).match(/.{1,76}/g)?.join('\r\n') || '';
  return [`From: ${clean(from)}`, `To: ${clean(to)}`, `Subject: =?UTF-8?B?${b64(clean(subject))}?=`, `Date: ${now.toUTCString()}`, `Message-ID: <${id}@${domain}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, ''].join('\r\n');
}

export async function sendSmtp(cfg, mail, { lookup, allowPrivate = false, timeoutMs = 10000 } = {}) {
  const host = cfg.host, port = Number(cfg.port);
  const ip = allowPrivate ? host : await publicAddress(host, lookup);
  let sock = await new Promise((resolve, reject) => {
    const opts = { host: ip, port, servername: net.isIP(host) ? undefined : host };
    const s = cfg.secure ? tls.connect(opts, () => resolve(s)) : net.connect(opts, () => resolve(s));
    s.once('error', reject); s.setTimeout(timeoutMs, () => s.destroy(new Error('SMTP timeout')));
  });
  let buf = '', waiter = null;
  const attach = s => { s.setEncoding('utf8'); s.on('data', d => { buf += d; pump(); }); s.on('error', e => waiter?.reject(e)); s.on('close', () => waiter?.reject(new Error('SMTP connection closed'))); };
  const pump = () => {
    if (!waiter) return;
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const text = lines.slice(0, i + 1); buf = lines.slice(i + 1).join('\r\n'); const w = waiter; waiter = null; return w.resolve({ code: Number(text[i].slice(0, 3)), lines: text }); }
  };
  const read = () => new Promise((resolve, reject) => { waiter = { resolve, reject }; pump(); });
  const cmd = async (line, ok) => { sock.write(`${line}\r\n`); const r = await read(); if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code} on ${line.split(' ')[0]}`); return r; };
  attach(sock);
  try {
    const hello = await read(); if (hello.code !== 220) throw new Error('SMTP greeting failed');
    let ehlo = await cmd('EHLO shop.local', [250]);
    if (!cfg.secure && ehlo.lines.some(l => /STARTTLS/i.test(l))) {
      await cmd('STARTTLS', [220]);
      sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error');
      sock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, servername: net.isIP(host) ? undefined : host }, () => resolve(t)); t.once('error', reject); });
      buf = ''; attach(sock);
      ehlo = await cmd('EHLO shop.local', [250]);
    } else if (!cfg.secure && cfg.user) throw new Error('Server does not offer STARTTLS; refusing to send the password unencrypted');
    if (cfg.user) {
      const mech = ehlo.lines.join(' ').toUpperCase();
      if (mech.includes('PLAIN')) await cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass || ''}`)}`, [235]);
      else { await cmd('AUTH LOGIN', [334]); await cmd(b64(cfg.user), [334]); await cmd(b64(cfg.pass || ''), [235]); }
    }
    await cmd(`MAIL FROM:<${addr(cfg.from)}>`, [250]);
    await cmd(`RCPT TO:<${addr(mail.to)}>`, [250, 251]);
    await cmd('DATA', [354]);
    const msg = buildMessage({ from: cfg.from, ...mail }).replace(/^\./gm, '..');
    sock.write(`${msg}\r\n.\r\n`); const done = await read(); if (done.code !== 250) throw new Error(`SMTP ${done.code} on DATA`);
    try { sock.write('QUIT\r\n'); } catch {}
    return { ok: true };
  } finally { try { sock.destroy(); } catch {} }
}
