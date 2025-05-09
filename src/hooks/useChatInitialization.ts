"use client";

import { useState, useEffect } from "react";
// import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"; // Unused import
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { importJwkToKey } from "@/lib/crypto";
import type { NextRouter } from "next/router"; // Or from "next/navigation" if using App Router

interface UseChatInitializationProps {
  supabase: SupabaseClient;
  chatId: string;
  router: any; // Using 'any' for simplicity, ideally NextRouter or AppRouterInstance
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
  supabase,
  chatId,
  router,
}: UseChatInitializationProps): ChatInitializationResult {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
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
      let currentPartnerId: string | null = null;

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) return;
      if (userError || !currentUser) {
        toast.error("Authentication error. Please log in.");
        router.push("/login");
        setIsLoading(false);
        setInitialEncryptionStatus("failed");
        setError("Authentication failed.");
        return;
      }
      setUser(currentUser);

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

      // 2. Fetch chat details to find partner ID
      const { data: chatDetails, error: chatDetailsError } = await supabase
        .from("chats")
        .select("ended_at, user1_id, user2_id")
        .eq("id", chatId)
        .single();

      if (!isMounted) return;
      if (chatDetailsError || !chatDetails) {
        toast.error("Could not load chat details.");
        setIsChatActiveInitial(false);
        setIsLoading(false);
        setInitialEncryptionStatus("failed");
        setError("Failed to load chat details.");
        return;
      }

      if (chatDetails.ended_at) {
        toast.info("This chat has already ended.");
        if (isMounted) {
          setIsChatActiveInitial(false);
          setInitialEncryptionStatus("inactive");
        }
      }

      if (currentUser.id === chatDetails.user1_id) {
        currentPartnerId = chatDetails.user2_id;
      } else if (currentUser.id === chatDetails.user2_id) {
        currentPartnerId = chatDetails.user1_id;
      } else {
        toast.error("Access denied to this chat.");
        if (isMounted) {
          setIsChatActiveInitial(false);
          setIsLoading(false);
          setInitialEncryptionStatus("failed");
          setError("Access denied to this chat.");
        }
        return;
      }
      if (isMounted) setPartnerId(currentPartnerId);

      // 3. Fetch partner's public key if partnerId is found
      if (currentPartnerId) {
        const { data: partnerProfile, error: partnerProfileError } =
          await supabase
            .from("profiles")
            .select("public_key")
            .eq("id", currentPartnerId)
            .single();

        if (!isMounted) return;
        if (
          partnerProfileError ||
          !partnerProfile ||
          !partnerProfile.public_key
        ) {
          console.error(
            "Failed to fetch partner's public key:",
            partnerProfileError
          );
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
              partnerProfile.public_key as JsonWebKey,
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
      } else if (isChatActiveInitial) { // Only an issue if chat is supposed to be active
        if (isMounted) {
          // This case (no partnerId but chat is active) should ideally not happen if chatDetails logic is correct
          setInitialEncryptionStatus("failed");
          setError("Partner ID could not be determined for an active chat.");
        }
      }
      if (isMounted) setIsLoading(false);
    };

    if (chatId && supabase) {
      initializeChat();
    } else {
      setIsLoading(false); // Not enough info to start
    }
    
    return () => {
      isMounted = false;
    };
  }, [supabase, chatId, router]);

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
