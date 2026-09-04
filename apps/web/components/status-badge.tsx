import type { CombinationStatus } from "@reanalise-erp/types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<CombinationStatus, string> = {
  EM_CONSTRUCAO: "Em construção",
  LIBERADO: "Liberado",
  RETORNADO: "Retornado à reanálise",
};

const VARIANTS: Record<CombinationStatus, "secondary" | "success" | "destructive"> = {
  EM_CONSTRUCAO: "secondary",
  LIBERADO: "success",
  RETORNADO: "destructive",
};

export function StatusBadge({ status }: { status: CombinationStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
