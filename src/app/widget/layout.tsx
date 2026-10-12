import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

/** Root layout for the guest widget (no dashboard chrome, no auth). */
export default function WidgetLayout({ children }: LayoutProps<"/widget">) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-background">{children}</body>
    </html>
  );
}
