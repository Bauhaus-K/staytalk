import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { ConversationView } from "@/server/services/conversation-view";

type Run = ConversationView["agentRuns"][number];
type Cited = ConversationView["citedKnowledge"];

/** "Why did the AI answer this way": model, tokens, tool calls, cited knowledge. */
export function AgentTrace({ run, cited }: { run: Run; cited: Cited }) {
  const t = useTranslations("playground");
  const citedItems = cited.filter((c) => run.citedKnowledgeIds.includes(c.id));

  return (
    <details className="rounded-md border bg-muted/30 p-3 text-xs" data-testid="agent-trace">
      <summary className="cursor-pointer font-medium text-muted-foreground">
        {t("trace")} · {run.outcome ?? "-"} · {t("latency", { ms: run.latencyMs })}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>
          {t("model")}: <code>{run.model}</code> ({run.mode})
        </p>
        <p>
          {t("tokens", {
            input: run.inputTokens,
            output: run.outputTokens,
            cacheRead: run.cacheReadTokens,
          })}
        </p>
        {run.error ? (
          <p className="text-destructive">
            {t("error")}: {run.error}
          </p>
        ) : null}
        <div>
          <p className="font-medium">{t("toolCalls")}</p>
          {run.toolCalls.length === 0 ? (
            <p className="text-muted-foreground">{t("noToolCalls")}</p>
          ) : (
            <ol className="ml-4 list-decimal">
              {run.toolCalls.map((call) => (
                <li key={call.id} className="mt-1">
                  <code className={call.isError ? "text-destructive" : undefined}>{call.name}</code>{" "}
                  <span className="text-muted-foreground">({call.durationMs}ms)</span>
                  <pre className="mt-1 overflow-x-auto rounded bg-background p-2 whitespace-pre-wrap">
                    {JSON.stringify(call.input)}
                  </pre>
                  <pre className="mt-1 max-h-40 overflow-auto rounded bg-background p-2 whitespace-pre-wrap">
                    {JSON.stringify(call.output, null, 1)}
                  </pre>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div>
          <p className="font-medium">{t("cited")}</p>
          {citedItems.length === 0 ? (
            <p className="text-muted-foreground">{t("noCited")}</p>
          ) : (
            <div className="flex flex-wrap gap-1" data-testid="cited-knowledge">
              {citedItems.map((c) => (
                <Badge key={c.id} variant="outline">
                  {c.question}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </details>
  );
}
