import { MessageCircle } from "lucide-react";
import { customerWhatsApp } from "../whatsapp";

export function CustomerWhatsApp({
  phone,
  name,
}: {
  phone: string | null;
  name: string;
}) {
  const href = customerWhatsApp(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir WhatsApp de ${name} em nova aba`}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline"
    >
      <MessageCircle size={16} aria-hidden />
      WhatsApp
    </a>
  );
}
