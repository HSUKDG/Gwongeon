export type ChatRole = "assistant" | "user";

export type Citation = {
  label: string;
  url?: string;
  ref?: string;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  citations?: Citation[];
};
