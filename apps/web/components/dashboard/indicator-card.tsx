import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function IndicatorCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tabular-nums mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
