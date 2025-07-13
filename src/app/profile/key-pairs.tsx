"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { exportKeyToJwk, generateEncryptionKeyPair } from "@/lib/crypto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle,
  Key,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner"; // Import toast
import { updatePublicKey } from "./actions";

export default function KeyPairs({ publicKey }: { publicKey?: JsonWebKey }) {
  const [isPending, startTransition] = useTransition();
  const [privateKeyJwk, setPrivateKeyJwk] = useState<JsonWebKey | null>(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState<JsonWebKey | null>(
    publicKey || null
  );
  const [keyGenerationMessage, setKeyGenerationMessage] = useState<string>("");

  useEffect(() => {
    const storedPrivateKey = localStorage.getItem("privateKeyJwk");
    if (storedPrivateKey) {
      try {
        const parsedKey = JSON.parse(storedPrivateKey);
        setPrivateKeyJwk(parsedKey);
        // If public key is also in initialData, assume keys are ready
        if (publicKey) {
          setPublicKeyJwk(publicKey);
        }
      } catch (error) {
        console.error("Failed to parse private key from localStorage:", error);
        setKeyGenerationMessage(
          "Error loading private key. Please regenerate keys."
        );
        localStorage.removeItem("privateKeyJwk"); // Clear corrupted key
      }
    }

    if (publicKey && !storedPrivateKey) {
      // Has public key from DB but no private key in local storage
      setKeyGenerationMessage(
        "Public key found, but private key missing from local storage. Please regenerate keys for full functionality."
      );
    }
    if (!publicKey && storedPrivateKey) {
      setKeyGenerationMessage(
        "Public key is missing please regenerate key pair."
      );
    }

    if (!storedPrivateKey && !publicKey) {
      setKeyGenerationMessage(
        "No encryption keys found. Generate them to enable secure chat."
      );
    }
  }, [publicKey]);

  const handleGenerateAndStoreKeys = async () => {
    startTransition(async () => {
      try {
        const { publicKey, privateKey } = await generateEncryptionKeyPair();
        const pubJwk = await exportKeyToJwk(publicKey);
        const privJwk = await exportKeyToJwk(privateKey);

        localStorage.setItem("privateKeyJwk", JSON.stringify(privJwk));
        setPrivateKeyJwk(privJwk);
        setPublicKeyJwk(pubJwk); // Set public key in state to be included in form submission

        const result = await updatePublicKey({
          public_key_jwk: pubJwk,
        });

        if (result.success) {
          toast.info("Encryption keys generated.");
        } else {
          toast.error(result.message);
        }
      } catch (error) {
        console.error("Key generation failed:", error);
        toast.error("Key generation failed.");
      }
    });
  };

  return (
    <Card className="shadow-lg  bg-white/80 border-gray-100 border">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-green-600" />
          <span>Encryption & Security</span>
        </CardTitle>
        <CardDescription>
          Manage your end-to-end encryption keys for secure messaging
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!publicKey || !privateKeyJwk ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{keyGenerationMessage}</AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Your encryption keys are active and your messages are secured with
              end-to-end encryption.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center space-x-3">
              <Key className="w-5 h-5 text-gray-600" />
              <div>
                <p className="font-medium text-gray-900">Encryption Key Pair</p>
              </div>
            </div>
            <Badge
              className={
                privateKeyJwk && publicKeyJwk
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }
              variant={privateKeyJwk && publicKeyJwk ? "default" : "secondary"}
            >
              {privateKeyJwk && publicKeyJwk ? "Active" : "Inactive"}
            </Badge>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {privateKeyJwk && publicKeyJwk ? "Regenerate" : "Generate"}{" "}
                Encryption Keys
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {privateKeyJwk && publicKeyJwk ? "Regenerate" : "Generate"}{" "}
                  Encryption Keys
                </DialogTitle>
                <DialogDescription>
                  {privateKeyJwk && publicKeyJwk
                    ? "This will create new encryption keys and invalidate your current ones. You may lose access to previous encrypted messages."
                    : "This will generate new encryption keys to secure your messages with end-to-end encryption."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button
                  onClick={handleGenerateAndStoreKeys}
                  disabled={privateKeyJwk && publicKeyJwk ? true : false}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="w-4 h-4 mr-2" />
                      {privateKeyJwk && publicKeyJwk
                        ? "Regenerate"
                        : "Generate"}{" "}
                      Keys
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-medium text-blue-900 mb-2">About Encryption</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • Your messages are encrypted end-to-end for maximum privacy
            </li>
            <li>
              • Private Key is stored locally on your device and never sent to
              our servers
            </li>
            <li>
              • Regenerating keys will prevent access to previous encrypted
              messages
            </li>
            <li>• Keep your keys secure - we cannot recover them if lost</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
