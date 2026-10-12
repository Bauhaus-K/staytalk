import { Card, CardContent } from "@/components/ui/card";

/** KPI tile: one headline number with a short label and context line. */
export function StatTile({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  testId?: string;
}) {
  return (
    <Card className="gap-1 py-4" data-testid={testId}>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className="text-2xl font-semibold tabular-nums"
          data-testid={testId ? `${testId}-value` : undefined}
        >
          {value}
        </p>
        {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
