import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationView } from "@/server/services/conversation-view";
import { AgentTrace } from "./agent-trace";

/**
 * Renders a conversation for staff: guest messages on the right, AI/staff on
 * the left, optional staff-language translation, and the AI trace per guest
 * message.
 */
export function MessageList({
  view,
  showTranslation,
}: {
  view: ConversationView;
  showTranslation: boolean;
}) {
  const te = useTranslations("enums");
  const runsByTrigger = new Map(view.agentRuns.map((r) => [r.triggerMessageId, r]));

  return (
    <ol className="flex flex-col gap-3" data-testid="message-list">
      {view.messages.map((m) => {
        const isGuest = m.role === "GUEST";
        const run = isGuest ? runsByTrigger.get(m.id) : undefined;
        return (
          <li
            key={m.id}
            className={cn("flex flex-col gap-1", isGuest ? "items-end" : "items-start")}
            data-role={m.role}
          >
            <span className="text-xs text-muted-foreground">
              {te(`messageRole.${m.role}`)} · {m.language ?? "-"}
            </span>
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                isGuest ? "bg-primary text-primary-foreground" : "bg-muted",
                m.role === "SYSTEM" && "border border-dashed",
              )}
              data-testid="message-bubble"
            >
              {m.content}
              {showTranslation && m.translatedContent ? (
                <p
                  className={cn(
                    "mt-2 border-t pt-2 text-xs opacity-80",
                    isGuest ? "border-primary-foreground/30" : "border-border",
                  )}
                  data-testid="message-translation"
                >
                  {m.translatedContent}
                </p>
              ) : null}
            </div>
            {m.piiMasked ? <Badge variant="destructive">PII masked</Badge> : null}
            {run ? (
              <div className="w-full max-w-[85%] self-end">
                <AgentTrace run={run} cited={view.citedKnowledge} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
