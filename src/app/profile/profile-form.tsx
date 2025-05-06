"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { useTransition } from "react"; // To show pending state
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
  };
}

export function ProfileForm({ initialData = {} }: ProfileFormProps) {
  // Default to empty object
  // const router = useRouter(); // No longer needed
  const [isPending, startTransition] = useTransition();

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
      const formData = {
        mbti_type: data.mbti_type,
        // Ensure interested_mbti_types is always an array, even if empty
        interested_mbti_types: data.interested_mbti_types || [],
      };
      // Call the action and handle the response
      const result = await updateProfile(formData);

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
      </form>
    </Form>
  );
}
