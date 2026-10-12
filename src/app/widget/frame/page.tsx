import { resolveWidgetLanguage } from "@/lib/widget-strings";
import { WidgetChat } from "./widget-chat";

// The proxy validates the key and sets CSP frame-ancestors for this route.
export default async function WidgetFramePage({ searchParams }: PageProps<"/widget/frame">) {
  const sp = await searchParams;
  const key = typeof sp.key === "string" ? sp.key : "";
  const language = resolveWidgetLanguage(typeof sp.lang === "string" ? sp.lang : null);
  return <WidgetChat widgetKey={key} language={language} />;
}
