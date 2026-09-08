import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function IndicatorCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: number | string;
  /** Escopo temporal do número (ex.: "Total atual" vs. "Neste mês") — evita
   * confundir contadores acumulados com contadores mensais (bug reportado
   * "Dashboard não recalcula conforme os filtros": era rótulo ambíguo, não
   * erro de cálculo — ver DECISIONS.md). */
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn(className)}>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tabular-nums mt-1">{value}</p>
        {hint && <p className="text-xs text-muted-foreground/70 mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
