"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";

interface ExportButtonsProps {
  basePath: string; // ex.: "/combinations" ou "/skills"
  baseFilename: string; // ex.: "mapa-liberacao"
}

/**
 * Exportação Excel/PDF (adendo Fase 2, item 4) — sempre a base completa,
 * a API ignora qualquer filtro (os endpoints de export nem aceitam
 * query params). Restrito a LIDERANÇA/ADMINISTRADOR mesmo quando a tela
 * de origem é de leitura geral.
 */
export function ExportButtons({ basePath, baseFilename }: ExportButtonsProps) {
  const role = useAuthStore((s) => s.user?.role);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"xlsx" | "pdf" | null>(null);

  if (role !== "LIDERANCA" && role !== "ADMINISTRADOR") return null;

  async function handleExport(kind: "xlsx" | "pdf") {
    setError(null);
    setPending(kind);
    try {
      await api.download(`${basePath}/export.${kind}`, `${baseFilename}.${kind}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Erro ao exportar.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!!pending} onClick={() => handleExport("xlsx")}>
          <FileSpreadsheet className="size-4" />
          {pending === "xlsx" ? "Exportando…" : "Exportar Excel"}
        </Button>
        <Button variant="outline" size="sm" disabled={!!pending} onClick={() => handleExport("pdf")}>
          <FileText className="size-4" />
          {pending === "pdf" ? "Exportando…" : "Exportar PDF"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
