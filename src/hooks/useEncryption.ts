"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  importJwkToKey,
  exportKeyToJwk,
  deriveSharedKey,
  generateKeyFingerprint,
  mapHashToEmojis, // Assuming mapHashToEmojis is moved or accessible here
} from "@/lib/crypto";
import { Profile } from "@/types";

interface UseEncryptionProps {
  currentUserPrivateKey: CryptoKey | null;
  partnerPublicKey: CryptoKey | null;
  isChatActive: boolean;
  chatId: string;
}

interface UseEncryptionResult {
  sharedSecretKey: CryptoKey | null;
  keyFingerprintEmojis: string[] | null;
  encryptionStatusUpdate: "pending" | "active" | "failed" | "inactive"; // Status from this hook's operations
}

// If mapHashToEmojis is not directly in "@/lib/crypto" or needs to be defined here:
// function mapHashToEmojis(hashHex: string, count: number = 6): string[] {
//   // ... (implementation from page.tsx or crypto.ts)
//   // For now, assuming it's exported from "@/lib/crypto"
// }

export function useEncryption({
  currentUserPrivateKey,
  partnerPublicKey,
  isChatActive,
  chatId,
}: UseEncryptionProps): UseEncryptionResult {
  const [sharedSecretKey, setSharedSecretKey] = useState<CryptoKey | null>(
    null
  );
  const [keyFingerprintEmojis, setKeyFingerprintEmojis] = useState<
    string[] | null
  >(null);
  const [encryptionStatusUpdate, setEncryptionStatusUpdate] = useState<
    "pending" | "active" | "failed" | "inactive"
  >("pending");

  useEffect(() => {
    let isMounted = true;
    const initDerivedKey = async () => {
      if (!isMounted || !currentUserPrivateKey || !partnerPublicKey) {
        if (isChatActive && (!currentUserPrivateKey || !partnerPublicKey)) {
          // Only set to failed if keys are missing for an active chat
          // setEncryptionStatusUpdate("failed");
        }
        return;
      }

      if (!isChatActive) {
        // If chat is not active, encryption is effectively inactive for new operations
        // setEncryptionStatusUpdate("inactive"); // This might be too aggressive if keys are present
        return;
      }
      
      setEncryptionStatusUpdate("pending");

      try {
        const storedSharedKeyJwkString = localStorage.getItem(
          `sharedKey_jwk_${chatId}`
        );
        let derivedKey: CryptoKey | null = null;

        if (storedSharedKeyJwkString) {
          try {
            const storedSharedKeyJwk = JSON.parse(storedSharedKeyJwkString);
            derivedKey = await importJwkToKey(storedSharedKeyJwk, [
              "encrypt",
              "decrypt",
            ]);
            if (isMounted) console.log("Loaded shared key from localStorage for chat:", chatId);
          } catch (e) {
            console.warn(
              `Failed to load shared key from localStorage for chat ${chatId}, re-deriving:`,
              e
            );
            localStorage.removeItem(`sharedKey_jwk_${chatId}`);
          }
        }

        if (!derivedKey) {
          derivedKey = await deriveSharedKey(
            currentUserPrivateKey,
            partnerPublicKey
          );
          const exportedDerivedKeyJwk = await exportKeyToJwk(derivedKey);
          localStorage.setItem(
            `sharedKey_jwk_${chatId}`,
            JSON.stringify(exportedDerivedKeyJwk)
          );
          if (isMounted) console.log("Derived and stored new shared key for chat:", chatId);
        }

        if (isMounted) {
          setSharedSecretKey(derivedKey);
          setEncryptionStatusUpdate("active");

          if (derivedKey) {
            try {
              const fingerprintHex = await generateKeyFingerprint(derivedKey);
              const emojis = mapHashToEmojis(fingerprintHex, 6);
              setKeyFingerprintEmojis(emojis);
            } catch (fpError) {
              console.error("Failed to generate key fingerprint:", fpError);
              setKeyFingerprintEmojis(Array(6).fill("⚠️"));
            }
          }
        }
      } catch (e) {
        console.error("Failed to derive or store shared key for chat:", chatId, e);
        toast.error(`Failed to establish secure session for chat ${chatId}.`);
        if (isMounted) setEncryptionStatusUpdate("failed");
      }
    };

    if (isChatActive && currentUserPrivateKey && partnerPublicKey && chatId) {
      initDerivedKey();
    } else if (!isChatActive) {
        // If chat becomes inactive, clear sensitive derived keys
        if (isMounted) {
            setSharedSecretKey(null);
            setKeyFingerprintEmojis(null);
            // setEncryptionStatusUpdate("inactive"); // Status from init hook should handle this display
            // localStorage.removeItem(`sharedKey_jwk_${chatId}`); // Optionally clear stored key on inactive
        }
    }


    return () => {
      isMounted = false;
    };
  }, [currentUserPrivateKey, partnerPublicKey, isChatActive, chatId]);

  return { sharedSecretKey, keyFingerprintEmojis, encryptionStatusUpdate };
}


export function useHasEncryptionKeys(profile:Profile): boolean {
      const [hasKeys, setHasKeys] = useState(true);

      useEffect(() => {
  
      const storedPrivateKey = localStorage.getItem("privateKeyJwk");
    if (storedPrivateKey) {
      try {
        const parsedKey = JSON.parse(storedPrivateKey);
    
      } catch (error) {
        setHasKeys(false);
      }
    }

    if(!storedPrivateKey){
      setHasKeys(false)
    }

    if(!profile.public_key){
      setHasKeys(false)
    }

    }, [profile]);

    return hasKeys;
}