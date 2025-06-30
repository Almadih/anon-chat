import { Tables } from "@/database.types";

export type Profile = Omit<Tables<"profiles">, "public_key"> & {
  public_key: JsonWebKey;
};

export type FindChatStatus = "idle" | "searching" | "error" | "matched";

export type Chat = Tables<"chats">;
export type QueueEntry = Tables<"queue">;

export type ToastMessage = {
  type: "success" | "error";
  message: string;
};
