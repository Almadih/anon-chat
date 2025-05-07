"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react"; // Added
import {
  generateEncryptionKeyPair,
  exportKeyToJwk,
  importJwkToKey,
} from "@/lib/crypto"; // Added
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfile } from "./actions"; // Import the server action
import { useRouter } from "next/navigation"; // No longer needed for redirect
import { useTransition, Suspense } from "react"; // To show pending state // Added Suspense
import { toast } from "sonner"; // Import toast

// Define MBTI types
const mbtiTypes = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const; // Use 'as const' for literal types

// Helper function to check if a string is a valid MBTI type
function isValidMbtiType(
  value: string | null | undefined
): value is (typeof mbtiTypes)[number] {
  return !!value && mbtiTypes.includes(value as (typeof mbtiTypes)[number]);
}

// Define the Zod schema for validation
const profileFormSchema = z.object({
  mbti_type: z.enum(mbtiTypes, {
    required_error: "Please select your MBTI type.",
  }),
  // Keep it optional, default handling will be in useForm
  interested_mbti_types: z.array(z.enum(mbtiTypes)).optional(),
});

// Explicitly define the type based on the schema
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Define props for the component, using potentially undefined for cleaner defaults
interface ProfileFormProps {
  initialData?: {
    // Make initialData optional in case profile doesn't exist yet
    mbti_type?: string | null;
    interested_mbti_types?: string[] | null;
    public_key?: JsonWebKey | null; // Add public_key to initialData
  };
}

export function ProfileForm({ initialData = {} }: ProfileFormProps) {
  // Default to empty object
  // const router = useRouter(); // No longer needed
  const [isPending, startTransition] = useTransition();
  const [privateKeyJwk, setPrivateKeyJwk] = useState<JsonWebKey | null>(null);
  const [publicKeyJwk, setPublicKeyJwk] = useState<JsonWebKey | null>(
    initialData.public_key || null
  );
  const [keyGenerationMessage, setKeyGenerationMessage] = useState<string>("");

  // Effect to load private key from localStorage on mount
  useEffect(() => {
    const storedPrivateKey = localStorage.getItem("privateKeyJwk");
    if (storedPrivateKey) {
      try {
        const parsedKey = JSON.parse(storedPrivateKey);
        setPrivateKeyJwk(parsedKey);
        setKeyGenerationMessage("Encryption keys loaded from local storage.");
        // If public key is also in initialData, assume keys are ready
        if (initialData.public_key) {
          setPublicKeyJwk(initialData.public_key);
        }
      } catch (error) {
        console.error("Failed to parse private key from localStorage:", error);
        setKeyGenerationMessage(
          "Error loading private key. Please regenerate keys."
        );
        localStorage.removeItem("privateKeyJwk"); // Clear corrupted key
      }
    } else if (initialData.public_key) {
      // Has public key from DB but no private key in local storage
      setKeyGenerationMessage(
        "Public key found, but private key missing from local storage. Please regenerate keys for full functionality."
      );
    } else {
      setKeyGenerationMessage(
        "No encryption keys found. Generate them to enable secure chat."
      );
    }
  }, [initialData.public_key]);

  const handleGenerateAndStoreKeys = async () => {
    try {
      setKeyGenerationMessage("Generating keys...");
      const { publicKey, privateKey } = await generateEncryptionKeyPair();
      const pubJwk = await exportKeyToJwk(publicKey);
      const privJwk = await exportKeyToJwk(privateKey);

      localStorage.setItem("privateKeyJwk", JSON.stringify(privJwk));
      setPrivateKeyJwk(privJwk);
      setPublicKeyJwk(pubJwk); // Set public key in state to be included in form submission

      // Update the form value for public_key_jwk if you add it to the schema
      // form.setValue('public_key_jwk', pubJwk as any, { shouldValidate: true });

      setKeyGenerationMessage(
        "New encryption keys generated and stored locally. Save profile to store public key."
      );
      toast.info("Encryption keys generated. Remember to save your profile.");
    } catch (error) {
      console.error("Key generation failed:", error);
      setKeyGenerationMessage(
        "Key generation failed. See console for details."
      );
      toast.error("Key generation failed.");
    }
  };

  // Validate and prepare default values
  const defaultMbtiType = isValidMbtiType(initialData.mbti_type)
    ? initialData.mbti_type
    : undefined;
  const defaultInterestedTypes = (
    initialData.interested_mbti_types || []
  ).filter(isValidMbtiType); // Filter to ensure only valid types are included

  // Initialize the form with react-hook-form, explicitly typed
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      mbti_type: defaultMbtiType,
      // Ensure default is an empty array if initial data is null/undefined
      interested_mbti_types: defaultInterestedTypes || [],
    },
  });

  // Handle form submission - explicitly type the data parameter
  function onSubmit(data: ProfileFormValues) {
    startTransition(async () => {
      // Prepare data, ensuring interested_mbti_types is an array
      const submissionData: {
        mbti_type: (typeof mbtiTypes)[number];
        interested_mbti_types: (typeof mbtiTypes)[number][];
        public_key_jwk?: JsonWebKey;
      } = {
        mbti_type: data.mbti_type,
        // Ensure interested_mbti_types is always an array, even if empty
        interested_mbti_types: data.interested_mbti_types || [],
      };

      if (publicKeyJwk) {
        submissionData.public_key_jwk = publicKeyJwk;
      } else if (initialData.public_key) {
        // If no new public key was generated, but one exists from initial load, send that.
        // This handles cases where user updates other fields without regenerating keys.
        submissionData.public_key_jwk = initialData.public_key;
      }

      // Call the action and handle the response
      const result = await updateProfile(submissionData);

      if (result.success) {
        toast.success(result.message);
        // Optionally reset form or trigger other UI updates on success
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* MBTI Type Selection */}
        <FormField
          control={form.control}
          name="mbti_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your MBTI Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {mbtiTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Interested MBTI Types Selection */}
        <FormField
          control={form.control}
          name="interested_mbti_types"
          render={() => (
            <FormItem>
              <div className="mb-4">
                <FormLabel className="text-base">Interested Types</FormLabel>
                <FormDescription>
                  Select types you'd like to chat with. Leave blank to be open
                  to all.
                </FormDescription>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {mbtiTypes.map((type) => (
                  <FormField
                    key={type}
                    control={form.control}
                    name="interested_mbti_types"
                    render={({ field }) => {
                      return (
                        <FormItem
                          key={type}
                          className="flex flex-row items-start space-x-3 space-y-0"
                        >
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(type)}
                              onCheckedChange={(checked) => {
                                return checked
                                  ? field.onChange([
                                      ...(field.value || []),
                                      type,
                                    ])
                                  : field.onChange(
                                      (field.value || []).filter(
                                        (value) => value !== type
                                      )
                                    );
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal">{type}</FormLabel>
                        </FormItem>
                      );
                    }}
                  />
                ))}
              </div>
              <FormMessage />{" "}
              {/* Display errors for the array field if needed */}
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Update Profile"}
        </Button>

        <div className="mt-8 pt-6 border-t">
          <h3 className="text-lg font-medium mb-2">Encryption Keys</h3>
          <p className="text-sm text-muted-foreground mb-3">
            {keyGenerationMessage}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={handleGenerateAndStoreKeys}
            disabled={isPending}
          >
            {privateKeyJwk || publicKeyJwk
              ? "Regenerate Keys"
              : "Generate Keys"}
          </Button>
          {privateKeyJwk && publicKeyJwk && (
            <p className="text-xs text-green-600 mt-2">
              Keys are active. Public key will be saved with your profile.
            </p>
          )}
          {!privateKeyJwk && initialData.public_key && (
            <p className="text-xs text-orange-600 mt-2">
              Warning: Your public key is saved, but the private key is missing
              from this browser. You won't be able to decrypt messages until you
              regenerate keys. Regenerating keys will allow you to chat but you
              will lose access to previous encrypted messages from other
              devices.
            </p>
          )}
        </div>
      </form>
    </Form>
  );
}
