"use client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";

import { Edit, Loader2, Save, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { updateProfile } from "./actions";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Profile } from "@/types";

const MBTI_TYPES = [
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
] as const;

function isValidMbtiType(
  value: string | null | undefined
): value is (typeof MBTI_TYPES)[number] {
  return !!value && MBTI_TYPES.includes(value as (typeof MBTI_TYPES)[number]);
}

// Define the Zod schema for validation
const profileFormSchema = z.object({
  mbti_type: z.enum(MBTI_TYPES, {
    required_error: "Please select your MBTI type.",
  }),
  // Keep it optional, default handling will be in useForm
  interested_mbti_types: z.array(z.enum(MBTI_TYPES)),
});

// Explicitly define the type based on the schema
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Define props for the component, using potentially undefined for cleaner defaults
interface PreferencesProps {
  preferences: Profile | null;
}

export default function Preferences({ preferences }: PreferencesProps) {
  const [isEditingPreferences, setIsEditingPreferences] = useState(false);
  const [isPending, startTransition] = useTransition();

  const defaultMbtiType = isValidMbtiType(preferences?.mbti_type)
    ? preferences.mbti_type
    : undefined;
  const defaultInterestedTypes = (
    preferences?.interested_mbti_types || []
  ).filter(isValidMbtiType); // Filter to ensure only valid types are included
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      mbti_type: defaultMbtiType,
      // Ensure default is an empty array if initial data is null/undefined
      interested_mbti_types: defaultInterestedTypes,
    },
  });

  function onSubmit(data: ProfileFormValues) {
    startTransition(async () => {
      // Prepare data, ensuring interested_mbti_types is an array
      const submissionData: {
        mbti_type: (typeof MBTI_TYPES)[number];
        interested_mbti_types: (typeof MBTI_TYPES)[number][];
      } = {
        mbti_type: data.mbti_type,
        // Ensure interested_mbti_types is always an array, even if empty
        interested_mbti_types: data.interested_mbti_types,
      };

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
    <Card className="shadow-lg  bg-white/80 border-gray-100 border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Edit className="w-5 h-5 text-purple-600" />
              <span>Preferences</span>
            </CardTitle>
            <CardDescription>
              Update your MBTI type and matching preferences
            </CardDescription>
          </div>
          {!isEditingPreferences && (
            <Button
              onClick={() => setIsEditingPreferences(true)}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isEditingPreferences ? (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                <FormField
                  control={form.control}
                  name="mbti_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Your MBTI Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select your type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MBTI_TYPES.map((type) => (
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

                <FormField
                  control={form.control}
                  name="interested_mbti_types"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel className="text-base">
                          Interested Types
                        </FormLabel>
                        <FormDescription>
                          Select types you'd like to chat with. Leave blank to
                          be open to all.
                        </FormDescription>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {MBTI_TYPES.map((type) => (
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
                                  <FormLabel className=" text-sm font-medium cursor-pointer">
                                    {type}
                                  </FormLabel>
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

                <div className="flex space-x-3 pt-4">
                  <Button
                    type="submit"
                    disabled={isPending}
                    className="cursor-pointer bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving ..
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => setIsEditingPreferences(false)}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </form>
            </Form>
          </>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Current MBTI Type
              </Label>
              <div className="mt-2">
                <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-base px-3 py-1">
                  {preferences?.mbti_type}
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-700">
                Interested Types
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {preferences?.interested_mbti_types &&
                  preferences?.interested_mbti_types?.length > 0 &&
                  preferences?.interested_mbti_types?.map((type) => (
                    <Badge
                      key={type}
                      variant="outline"
                      className="border-pink-200 text-pink-700"
                    >
                      {type}
                    </Badge>
                  ))}

                {preferences?.interested_mbti_types &&
                  preferences?.interested_mbti_types?.length == 0 && (
                    <Badge
                      variant="outline"
                      className="border-pink-200 text-pink-700"
                    >
                      Open to All
                    </Badge>
                  )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
