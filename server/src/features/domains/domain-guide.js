// Client guide text. Renders from the domain row and verified hosting config only. No hosting vendor names, no invented values.
import { ownershipRecord, routingRecords } from './domain-core.js';
const rec = r => `  Type:  ${r.type}\n  Host:  ${r.host}\n  Value: ${r.value}\n  TTL:   ${r.ttl} seconds`;
export function genericGuide() {
  return ['Connecting your own domain to your Digital Shop store', '',
    'How it works', '1. We save your domain and give you an ownership record (a TXT record).', '2. You add that record at your DNS provider. Your DNS provider is the service named in your domain\'s current nameservers. It is not always the company you bought the domain from (the registrar).', '3. We confirm it. Then we give you the routing records to add.', '4. We set up the secure (HTTPS) connection and check your store loads on your domain.', '5. We switch the domain on.', '',
    'IMPORTANT: the exact DNS values for steps 3 and 4 are not in this guide. They come after server setup, in a personalised guide for your domain. Do not add any routing records from other sources.', '',
    'Nothing changes in your store, products or orders while you do this. DNS changes can take a few hours to show.'].join('\n');
}
export function personalGuide(domain, hosting) {
  if (!hosting?.configured) return null;
  const routes = routingRecords(domain.hostname, hosting);
  return [`Connecting ${domain.hostname} to your Digital Shop store`, '', 'Step 1: ownership record (add this first)', rec(ownershipRecord(domain.hostname, domain.ownershipToken)), 'Some DNS providers add your domain name to the end of the Host automatically. If yours does, enter the relative name instead (for example _digitalshop-verify.shop when you are inside example.com), then check that the saved full name matches the Host above. Do not paste the full Host blindly.', '', 'Step 2: routing records (add these after ownership is confirmed)', ...routes.map(rec), '', 'If this hostname already has A, AAAA, CNAME, parking or forwarding records, stop and have your DNS administrator review them. Save a backup, then replace only conflicts approved for this exact hostname. Leave other hosts, email records and nameservers unchanged.', 'DNS changes can take a few hours to show. Nothing changes in your store, products or orders.'].join('\n');
}
