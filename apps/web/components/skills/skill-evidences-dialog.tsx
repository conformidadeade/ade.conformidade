"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { SkillEvidence } from "@/lib/api/types";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ORIGIN_LABELS: Record<SkillEvidence["origin"], string> = {
  LANCAMENTO: "Lançamento",
  MANUAL: "Manual",
  IMPORTACAO: "Importação",
};

interface SkillEvidencesDialogProps {
  skillId: string | null;
  onClose: () => void;
  label: string;
}

/** Histórico completo de evidências de uma habilidade — sem conceito de ciclo (item 6.4), só leitura. */
export function SkillEvidencesDialog({ skillId, onClose, label }: SkillEvidencesDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["skill-evidences", skillId],
    queryFn: () => api.get<SkillEvidence[]>(`/skills/${skillId}/evidences`),
    enabled: !!skillId,
  });

  return (
    <Dialog open={!!skillId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Evidências da habilidade</DialogTitle>
          <DialogDescription>{label} — histórico completo, todas as origens.</DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {data && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº do PI</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Registrado por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                    Nenhuma evidência ainda.
                  </TableCell>
                </TableRow>
              )}
              {data.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">{e.piNumber}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(e.createdAt).toLocaleDateString("pt-BR")}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{ORIGIN_LABELS[e.origin]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.recordedByName}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
