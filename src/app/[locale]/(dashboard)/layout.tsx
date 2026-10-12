import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LegalLinks } from "@/components/layout/legal-links";
import { requireTenant } from "@/server/auth/session";
import { logout } from "@/server/auth/actions";
import { asLocale } from "@/i18n/locale";

export default async function DashboardLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = asLocale((await params).locale);
  setRequestLocale(locale);
  const { user } = await requireTenant(locale);
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b bg-muted/30 p-4 md:w-60 md:border-r md:border-b-0">
        <p className="text-lg font-bold">{tc("appName")}</p>
        <SidebarNav />
        <div className="mt-auto flex flex-col gap-2 text-sm">
          <p className="truncate text-muted-foreground" data-testid="current-user">
            {user.email}
          </p>
          <form action={logout}>
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" variant="outline" size="sm" className="w-full">
              {tc("signOut")}
            </Button>
          </form>
          <LocaleSwitcher className="justify-start" />
          <LegalLinks className="justify-start" />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
