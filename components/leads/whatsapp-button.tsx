import { MessageCircle } from "lucide-react";
import { whatsappChatLink } from "@/lib/phone";
import { buttonClasses, type ButtonSize } from "@/components/ui/button";

/**
 * "Click to chat" quick action — opens WhatsApp with the lead's number and a
 * pre-filled follow-up message. Plain anchor so it works without JS.
 */
export function WhatsAppButton({
  phone,
  name,
  size = "sm",
  label = "WhatsApp",
}: {
  phone: string;
  name?: string | null;
  size?: ButtonSize;
  label?: string;
}) {
  const greeting = name ? `Hi ${name}, ` : "Hi, ";
  const text = `${greeting}this is Hayat Interiors following up on your enquiry.`;

  return (
    <a
      href={whatsappChatLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonClasses({ variant: "success", size })}
    >
      <MessageCircle className="h-4 w-4" />
      {label}
    </a>
  );
}
