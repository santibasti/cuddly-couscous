// Synchronous SHA-256 (WebCrypto is unavailable on plain-http LAN addresses, so we ship our own).
const primes = [];
for (let n = 2; primes.length < 64; n++) if (primes.every(p => n % p)) primes.push(n);
const frac = x => x - Math.floor(x);
const K = primes.map(p => Math.floor(frac(Math.cbrt(p)) * 4294967296) >>> 0);
const H0 = primes.slice(0, 8).map(p => Math.floor(frac(Math.sqrt(p)) * 4294967296) >>> 0);
const ror = (x, n) => (x >>> n) | (x << (32 - n));

export function sha256(msg) {
  const s = unescape(encodeURIComponent(String(msg))), l = s.length, words = [];
  for (let i = 0; i < l; i++) words[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
  words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  const n = (((l + 8) >> 6) + 1) * 16;
  for (let i = 0; i < n; i++) words[i] = words[i] | 0;
  words[n - 1] = l * 8;
  const H = H0.slice(), w = new Array(64);
  for (let j = 0; j < n; j += 16) {
    for (let i = 0; i < 16; i++) w[i] = words[j + i];
    for (let i = 16; i < 64; i++) {
      const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

export function randomSalt() {
  const a = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(a); else for (let i = 0; i < a.length; i++) a[i] = Math.random() * 256;
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}
// Salted, iterated hash for passwords and PINs (never store the secret itself).
export function hashSecret(salt, secret, rounds = 1000) {
  let h = sha256(salt + ':' + secret);
  for (let i = 0; i < rounds; i++) h = sha256(h + salt);
  return h;
}
