'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// Define the expected shape of the form data
interface ProfileUpdateData {
    mbti_type: string;
    interested_mbti_types: string[];
}

// Define the return type for the action
interface UpdateProfileResponse {
    success: boolean;
    message: string;
}

export async function updateProfile(formData: ProfileUpdateData): Promise<UpdateProfileResponse> {
    const supabase = await createClient();

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    // Although this check is here, the form should ideally only be shown to logged-in users.
    // Returning an error might be better than redirecting from an action.
    if (userError || !user) {
        console.error('User not authenticated for profile update');
        // redirect('/login'); // Avoid redirecting from action on auth error
        return { success: false, message: 'Authentication required.' };
    }

    // Validate input data (basic example)
    if (!formData.mbti_type) {
        return { success: false, message: 'MBTI type cannot be empty.' };
    }
    // Add more validation as needed

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            mbti_type: formData.mbti_type,
            interested_mbti_types: formData.interested_mbti_types,
            updated_at: new Date().toISOString(), // Manually set updated_at just in case trigger fails
        })
        .eq('id', user.id);

    if (updateError) {
        console.error('Error updating profile:', updateError.message);
        // Return an error state to the form instead of redirecting
        return { success: false, message: `Update failed: ${updateError.message}` };
    }

    // Revalidate the profile page path to show updated data
    revalidatePath('/profile');
    // Return success state
    return { success: true, message: 'Profile updated successfully!' };
}
