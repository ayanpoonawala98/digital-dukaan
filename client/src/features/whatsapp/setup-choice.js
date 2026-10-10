// Copy for the WhatsApp setup chooser, taken verbatim from the spec main relayed (user chose Plain English option B). Keep wording as is.
// The basic description uses the fallback wording because the owner-side "Open WhatsApp" links do not all prefill a message.
export const SETUP_COPY = {
  heading: 'Choose your WhatsApp setup',
  basic: {
    title: 'Send messages yourself',
    description: 'Open WhatsApp and send the message yourself. No automatic sending.',
    cta: 'Set up basic WhatsApp',
    steps: ['Add your shop number', 'Check the test link', 'Save basic setup'],
    success: 'Basic WhatsApp is set up. You send each message yourself.'
  },
  auto: {
    title: 'Set up automatic messages',
    description: 'Connect your WhatsApp provider and check the required templates. Provider charges may apply.',
    cta: 'View automation steps',
    steps: ['Choose your provider', 'Complete the connection', 'Check template approval', 'Send a test to your own number'],
    helper: 'Keep your existing WhatsApp account until your provider confirms the setup requirements.',
    // "Test received" is intentionally never shown: nothing verifies receipt of a test message.
    states: ['Needs setup', 'Connection checked']
  },
  later: 'Set up later'
};
export const waTestLink = number => { const d = String(number || '').replace(/\D/g, ''); return d.length >= 8 ? `https://wa.me/${d}` : ''; };
const key = id => `dd-wa-setup-${id}`;
export function loadSetupState(storeId, storage = globalThis.localStorage) { try { return { basicDone: false, later: false, ...JSON.parse(storage.getItem(key(storeId)) || '{}') }; } catch { return { basicDone: false, later: false }; } }
export function saveSetupState(storeId, state, storage = globalThis.localStorage) { try { storage.setItem(key(storeId), JSON.stringify({ basicDone: Boolean(state.basicDone), later: Boolean(state.later) })); } catch { /* private mode */ } }
