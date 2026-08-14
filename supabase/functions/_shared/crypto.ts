const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) { let binary = ''; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function base64ToBytes(value: string) { const binary = atob(value); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }

async function keyMaterial() {
  const configured = Deno.env.get('GOOGLE_TOKEN_ENCRYPTION_KEY');
  if (!configured || configured.length < 32) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must be configured with at least 32 characters');
  }
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(configured));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyMaterial(), encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decrypt(value: string) {
  const [iv, ciphertext] = value.split('.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, await keyMaterial(), base64ToBytes(ciphertext));
  return decoder.decode(decrypted);
}
