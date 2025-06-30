"use server";

import { Json } from "@/database.types";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Define the expected shape of the form data
interface ProfileUpdateData {
  mbti_type: string;
  interested_mbti_types: string[];
  public_key_jwk?: JsonWebKey; // For storing public key in JWK format
}

// Define the return type for the action
interface GenericResponse {
  success: boolean;
  message: string;
}

export async function updateProfile(
  formData: ProfileUpdateData
): Promise<GenericResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Although this check is here, the form should ideally only be shown to logged-in users.
  // Returning an error might be better than redirecting from an action.
  if (userError || !user) {
    console.error("User not authenticated for profile update");
    // redirect('/login'); // Avoid redirecting from action on auth error
    return { success: false, message: "Authentication required." };
  }

  // Validate input data (basic example)
  if (!formData.mbti_type) {
    return { success: false, message: "MBTI type cannot be empty." };
  }
  // Add more validation as needed

  const updateData: {
    mbti_type: string;
    interested_mbti_types: string[];
    updated_at: string;
  } = {
    mbti_type: formData.mbti_type,
    interested_mbti_types: formData.interested_mbti_types,
    updated_at: new Date().toISOString(), // Manually set updated_at just in case trigger fails
  };

  const { error: updateError } = await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", user.id)
    .overrideTypes<{ public_key: JsonWebKey }>();

  if (updateError) {
    console.error("Error updating profile:", updateError.message);
    // Return an error state to the form instead of redirecting
    return { success: false, message: `Update failed: ${updateError.message}` };
  }

  // Revalidate the profile page path to show updated data
  revalidatePath("/profile");
  // Return success state
  return { success: true, message: "Profile updated successfully!" };
}

export async function updatePublicKey(formData: {
  public_key_jwk: JsonWebKey;
}): Promise<GenericResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  // Although this check is here, the form should ideally only be shown to logged-in users.
  // Returning an error might be better than redirecting from an action.
  if (userError || !user) {
    console.error("User not authenticated for profile update");
    // redirect('/login'); // Avoid redirecting from action on auth error
    return { success: false, message: "Authentication required." };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      public_key: formData.public_key_jwk as Json,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("Error updating profile:", updateError.message);
    // Return an error state to the form instead of redirecting
    return {
      success: false,
      message: `Update public key failed: ${updateError.message}`,
    };
  }

  // Revalidate the profile page path to show updated data
  revalidatePath("/profile");
  // Return success state
  return { success: true, message: "Public key updated successfully!" };
}
