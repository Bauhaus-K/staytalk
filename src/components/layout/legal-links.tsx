import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function LegalLinks({ className }: { className?: string }) {
  const t = useTranslations("legal");
  return (
    <nav className={cn("flex justify-center gap-3 text-xs text-muted-foreground", className)}>
      <Link href="/legal/terms" className="hover:underline">
        {t("terms")}
      </Link>
      <Link href="/legal/privacy" className="hover:underline">
        {t("privacy")}
      </Link>
    </nav>
  );
}
