"use client";

import { useState, useEffect } from "react";
// import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"; // Unused import
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { importJwkToKey } from "@/lib/crypto";
import type { NextRouter } from "next/router"; // Or from "next/navigation" if using App Router
import { Chat, Profile } from "@/types";

interface UseChatInitializationProps {
  user:User,
  partnerProfile:Profile,
  chat:Chat
}

interface ChatInitializationResult {
  isLoading: boolean;
  user: User | null;
  partnerId: string | null;
  initialPartnerPublicKey: CryptoKey | null;
  isChatActiveInitial: boolean;
  initialEncryptionStatus: "pending" | "failed" | "inactive";
  currentUserPrivateKey: CryptoKey | null;
  error: string | null;
}

export function useChatInitialization({
  user,
  chat,
  partnerProfile
}: UseChatInitializationProps): ChatInitializationResult {
  const [isLoading, setIsLoading] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [initialPartnerPublicKey, setInitialPartnerPublicKey] =
    useState<CryptoKey | null>(null);
  const [isChatActiveInitial, setIsChatActiveInitial] = useState(true);
  const [initialEncryptionStatus, setInitialEncryptionStatus] = useState<
    "pending" | "failed" | "inactive"
  >("pending");
  const [currentUserPrivateKey, setCurrentUserPrivateKey] =
    useState<CryptoKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true; // To prevent state updates on unmounted component

    const initializeChat = async () => {
      if (!isMounted) return;
      setIsLoading(true);
      setInitialEncryptionStatus("pending");
      setError(null);


      if (!isMounted) return;

      // 1. Load current user's private key
      const storedPrivateKeyJwk = localStorage.getItem("privateKeyJwk");
      if (storedPrivateKeyJwk) {
        try {
          const parsedPrivJwk = JSON.parse(storedPrivateKeyJwk);
          const privateKey = await importJwkToKey(parsedPrivJwk, [
            "deriveKey",
            "deriveBits",
          ]);
          if (isMounted) setCurrentUserPrivateKey(privateKey);
        } catch (e) {
          console.error("Failed to load/import private key:", e);
          toast.error(
            "Your encryption key is corrupted or missing. Cannot initialize chat securely."
          );
          if (isMounted) {
            setInitialEncryptionStatus("failed");
            setError("Failed to load your encryption key.");
          }
          // Not returning here, as chat might still be viewable in a degraded state or for info
        }
      } else {
        toast.error(
          "Your encryption key is missing. Please visit your profile to generate keys."
        );
        if (isMounted) {
          setInitialEncryptionStatus("failed");
          setError("Your encryption key is missing.");
        }
      }


      if (!isMounted) return;




      if (isMounted) setPartnerId(partnerProfile.id);



        if (!isMounted) return;
        console.log(partnerProfile.public_key)
        if (!partnerProfile.public_key) {
          toast.error(
            "Could not retrieve partner's encryption key. Secure messaging may fail."
          );
          if (isMounted) {
            // Don't set to 'failed' immediately, allow encryption hook to try with what it has
            // setInitialEncryptionStatus("failed");
             setError("Failed to fetch partner's public key.");
          }
        } else {
          try {
            const pubKey = await importJwkToKey(
              partnerProfile.public_key,
              []
            );
            if (isMounted) setInitialPartnerPublicKey(pubKey);
          } catch (e) {
            console.error("Failed to import partner's public key:", e);
            toast.error(
              "Partner's encryption key is invalid. Secure messaging may fail."
            );
            if (isMounted) {
              // setInitialEncryptionStatus("failed");
              setError("Partner's encryption key is invalid.");
            }
          }
        }
      
      if (isMounted) setIsLoading(false);
    };

  
      initializeChat();
    
    return () => {
      isMounted = false;
    };
  }, [chat,user,partnerProfile]);

  return {
    isLoading,
    user,
    partnerId,
    initialPartnerPublicKey,
    isChatActiveInitial,
    initialEncryptionStatus,
    currentUserPrivateKey,
    error,
  };
}
