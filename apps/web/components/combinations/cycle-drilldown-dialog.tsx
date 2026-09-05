"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CurrentCycleResponse {
  combinationId: string;
  status: string;
  constructionCount: number;
  processes: { id: string; piNumber: string; analysisDate: string; recordedByName: string }[];
}

interface CycleDrilldownDialogProps {
  combinationId: string | null;
  onClose: () => void;
  label: string;
}

/** Drill-down de PIs do ciclo atual de uma combinação (adendo Fase 2, item 5) — somente leitura. */
export function CycleDrilldownDialog({ combinationId, onClose, label }: CycleDrilldownDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["combination-current-cycle", combinationId],
    queryFn: () => api.get<CurrentCycleResponse>(`/combinations/${combinationId}/current-cycle`),
    enabled: !!combinationId,
  });

  return (
    <Dialog open={!!combinationId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>PIs do ciclo atual</DialogTitle>
          <DialogDescription>
            {label} — processos corretos lançados desde o último reset ou retorno.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {data && (
          <>
            <p className="text-xs text-muted-foreground -mt-2 mb-3">
              {data.processes.length}/{data.constructionCount} processos deste ciclo
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº do PI</TableHead>
                  <TableHead>Data da análise</TableHead>
                  <TableHead>Registrado por</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.processes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                      Nenhum processo neste ciclo ainda.
                    </TableCell>
                  </TableRow>
                )}
                {data.processes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.piNumber}</TableCell>
                    <TableCell>{new Date(p.analysisDate).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-muted-foreground">{p.recordedByName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
