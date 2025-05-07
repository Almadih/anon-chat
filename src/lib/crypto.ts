"use client"; // Mark as client component if it uses client-side features like window.crypto

// src/lib/crypto.ts

/**
 * Generates an ECDH key pair (P-256 curve) for deriving shared secrets.
 * Keys are extractable for storage and exchange.
 */
export async function generateEncryptionKeyPair(): Promise<{ publicKey: CryptoKey; privateKey: CryptoKey }> {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256", // Standard curve for ECDH
    },
    true, // Key pair is extractable
    ["deriveKey", "deriveBits"] // Private key can be used to derive keys/bits
  );
  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

/**
 * Exports a CryptoKey to its JWK (JSON Web Key) format.
 */
export async function exportKeyToJwk(key: CryptoKey): Promise<JsonWebKey> {
  const jwk = await window.crypto.subtle.exportKey("jwk", key);
  return jwk;
}

/**
 * Imports a JWK (JSON Web Key) back into a CryptoKey.
 * Handles ECDH and AES-GCM keys based on JWK properties and usages.
 * @param jwk The JWK object.
 * @param keyUsages The intended usages for the imported key.
 */
export async function importJwkToKey(
  jwk: JsonWebKey,
  keyUsages: KeyUsage[]
): Promise<CryptoKey> {
  let algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm;

  // Determine algorithm based on JWK and intended usages
  if (jwk.kty === "EC" && jwk.crv === "P-256") {
    algorithm = { name: "ECDH", namedCurve: "P-256" };
  } else if (jwk.kty === "oct" && (keyUsages.includes("encrypt") || keyUsages.includes("decrypt"))) {
    algorithm = { name: "AES-GCM" };
  } else if (jwk.kty === "RSA") { // Keep RSA for compatibility if other parts of app use it
    algorithm = { name: "RSA-OAEP", hash: "SHA-256" };
  }
  else {
    throw new Error("Unsupported key type or missing information in JWK for import.");
  }

  const key = await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    algorithm,
    true, // Key is extractable (consistent with generation)
    keyUsages
  );
  return key;
}

/**
 * Derives a shared AES-GCM symmetric key from a local private ECDH key and a remote public ECDH key.
 * @param privateKey The local user's private ECDH key.
 * @param publicKey The remote user's public ECDH key.
 * @returns A 256-bit AES-GCM CryptoKey for encryption/decryption.
 */
export async function deriveSharedKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const sharedKey = await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey, // The public key of the other party
    },
    privateKey, // Your private key
    {
      name: "AES-GCM", // Algorithm for the derived key
      length: 256,    // Key length in bits
    },
    true, // Derived key is extractable
    ["encrypt", "decrypt"] // Usages for the derived key
  );
  return sharedKey;
}

/**
 * Encrypts data using a shared AES-GCM CryptoKey.
 * Prepends a 12-byte IV to the ciphertext.
 * @param key The shared AES-GCM key.
 * @param data The string data to encrypt.
 * @returns An ArrayBuffer containing [IV (12 bytes)][Ciphertext].
 */
export async function encryptData(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  const encodedData = new TextEncoder().encode(data);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV for AES-GCM

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encodedData
  );

  // Prepend IV to ciphertext: create a new ArrayBuffer, copy IV, then copy ciphertext
  const resultBuffer = new ArrayBuffer(iv.length + ciphertext.byteLength);
  const resultView = new Uint8Array(resultBuffer);
  resultView.set(iv, 0);
  resultView.set(new Uint8Array(ciphertext), iv.length);

  return resultBuffer;
}

/**
 * Decrypts data using a shared AES-GCM CryptoKey.
 * Assumes a 12-byte IV is prepended to the ciphertext.
 * @param key The shared AES-GCM key.
 * @param encryptedDataWithIv The ArrayBuffer containing [IV][Ciphertext].
 * @returns The decrypted string.
 */
export async function decryptData(key: CryptoKey, encryptedDataWithIv: ArrayBuffer): Promise<string> {
  if (encryptedDataWithIv.byteLength < 12) {
    throw new Error("Encrypted data is too short to contain an IV.");
  }

  const iv = new Uint8Array(encryptedDataWithIv.slice(0, 12));
  const ciphertext = new Uint8Array(encryptedDataWithIv.slice(12));

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Helper to convert ArrayBuffer to Base64 string (for storing/transmitting)
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 string back to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generates a SHA-256 hash of a CryptoKey's JWK representation to be used as a fingerprint.
 * @param key The CryptoKey (expected to be the shared AES-GCM key).
 * @returns A hex string representation of the hash.
 */
export async function generateKeyFingerprint(key: CryptoKey): Promise<string> {
  const jwk = await exportKeyToJwk(key);
  // Stringify the JWK. For consistency, consider sorting keys if the environment/library supports it,
  // though for typical client-side JS, standard JSON.stringify is usually sufficient.
  const jwkString = JSON.stringify(jwk);
  const hashBuffer = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(jwkString)
  );
  // Convert hash buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}


// EMOJI_LIST for key fingerprint visualization
// Sourced from a common set, ensure diversity and no ambiguous/offensive ones.
// Using a smaller set for brevity in example, expand as needed.
export const EMOJI_LIST = [
  "🍎",
  "🍊",
  "🍋",
  "🍉",
  "🍇",
  "🍓",
  "🫐",
  "🍈",
  "🍒",
  "🍑",
  "🥭",
  "🍍",
  "🥥",
  "🥝",
  "🍅",
  "🍆",
  "🥑",
  "🥦",
  "🥬",
  "🥒",
  "🌶️",
  "🫑",
  "🌽",
  "🥕",
  "🫒",
  "🧄",
  "🧅",
  "🥔",
  "🍠",
  "🥐",
  "🥯",
  "🍞",
  "🥖",
  "🥨",
  "🧀",
  "🥚",
  "🍳",
  "🧈",
  "🥞",
  "🧇",
  "🥓",
  "🥩",
  "🍗",
  "🍖",
  "🌭",
  "🍔",
  "🍟",
  "🍕",
  "🫓",
  "🥪",
  "🥙",
  "🧆",
  "🌮",
  "🌯",
  "🫔",
  "🥗",
  "🥘",
  "🫕",
  "🥫",
  "🍝",
  "🍜",
  "🍲",
  "🍛",
  "🍣",
  "🍱",
  "🥟",
  "🦪",
  "🍤",
  "🍙",
  "🍚",
  "🍘",
  "🍥",
  "🥠",
  "🥮",
  "🍢",
  "🍡",
  "🍧",
  "🍨",
  "🍦",
  "🥧",
  "🧁",
  "🍰",
  "🎂",
  "🍮",
  "🍭",
  "🍬",
  "🍫",
  "🍿",
  "🍩",
  "🍪",
  "🌰",
  "🥜",
  "🍯",
  "🥛",
  "🍼",
  "☕",
  "🫖",
  "🍵",
  "🍶",
  "🍾",
  "🍷",
  "🍸",
  "🍹",
  "🍺",
  "🍻",
  "🥂",
  "🥃",
  "🥤",
  "🧋",
  "🧃",
  "🧉",
  "🧊",
  "🥢",
  "🍽️",
  "🍴",
  "🥄",
  "🔪",
  "🏺",
  "🌍",
  "🌎",
  "🌏",
  "🧭",
  "🗺️",
  "🗾",
  "🏔️",
  "⛰️",
  "🌋",
  "🗻",
  "🏕️",
  "🏖️",
  "🏜️",
  "🏝️",
  "🏞️",
  "🏟️",
  "🏛️",
  "🏗️",
  "🧱",
  "🪨",
  "🪵",
  "🛖",
  "🏘️",
  "🏚️",
  "🏠",
  "🏡",
  "🏢",
  "🏣",
  "🏤",
  "🏥",
  "🏦",
  "🏨",
  "🏩",
  "🏪",
  "🏫",
  "🏬",
  "🏭",
  "🏯",
  "🏰",
  "💒",
  "🗼",
  "🗽",
  "⛪",
  "🕌",
  "🛕",
  "🕍",
  "⛩️",
  "🕋",
  "⛲",
  "⛺",
  "🌁",
  "🌃",
  "🏙️",
  "🌄",
  "🌅",
  "🌆",
  "🌇",
  "🌉",
  "♨️",
  "🎠",
  "🎡",
  "🎢",
  "💈",
  "🎪",
  "🚂",
  "🚃",
  "🚄",
  "🚅",
  "🚆",
  "🚇",
  "🚈",
  "🚉",
  "🚊",
  "🚝",
  "🚞",
  "🚋",
  "🚌",
  "🚍",
  "🚎",
  "🚐",
  "🚑",
  "🚒",
  "🚓",
  "🚔",
  "🚕",
  "🚖",
  "🚗",
  "🚘",
  "🚚",
  "🚛",
  "🚜",
  "🏎️",
  "🏍️",
  "🛵",
  "🦽",
  "🦼",
  "🛺",
  "🚲",
  "🛴",
  "🛹",
  "🛼",
  "🚏",
  "🛣️",
  "🛤️",
  "🛢️",
  "⛽",
  "🚨",
  "🚥",
  "🚦",
  "🛑",
  "🚧",
  "⚓",
  "⛵",
  "🛶",
  "🚤",
  "🛳️",
  "⛴️",
  "🛥️",
  "🚢",
  "✈️",
  "🛩️",
  "🛫",
  "🛬",
  "🪂",
  "💺",
  "🚁",
  "🚟",
  "🚠",
  "🚡",
  "🛰️",
  "🚀",
  "🛸",
  "🛎️",
  "🧳",
  "⌛",
  "⏳",
  "⌚",
  "⏰",
  "⏱️",
  "⏲️",
  "🕰️",
  "🕛",
  "🕧",
  "🕐",
  "🕜",
  "🕑",
  "🕝",
  "🕒",
  "🕞",
  "🕓",
  "🕟",
  "🕔",
  "🕠",
  "🕕",
  "🕡",
  "🕖",
  "🕢",
  "🕗",
  "🕣",
  "🕘",
  "🕤",
  "🕙",
  "🕥",
  "🕚",
  "🕦",
  "🌑",
  "🌒",
  "🌓",
  "🌔",
  "🌕",
  "🌖",
  "🌗",
  "🌘",
  "🌙",
  "🌚",
  "🌛",
  "🌜",
  "🌡️",
  "☀️",
  "🌝",
  "🌞",
  "🪐",
  "⭐",
  "🌟",
  "🌠",
  "🌌",
  "☁️",
  "⛅",
  "⛈️",
  "🌤️",
  "🌥️",
  "🌦️",
  "🌧️",
  "🌨️",
  "🌩️",
  "🌪️",
  "🌫️",
  "🌬️",
  "🌀",
  "🌈",
  "🌂",
  "☂️",
  "☔",
  "⛱️",
  "⚡",
  "❄️",
  "☃️",
  "⛄",
  "☄️",
  "🔥",
  "💧",
  "🌊",
]; // Total 256 emojis for 1 byte mapping