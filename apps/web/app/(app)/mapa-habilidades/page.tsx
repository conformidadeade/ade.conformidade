"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import { ApiError, api } from "@/lib/api/client";
import type { SkillImportRowError, SkillSummary } from "@/lib/api/types";
import { useAnalysts, useClients, useMediaChannels } from "@/lib/hooks/use-catalog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { ExportButtons } from "@/components/export-buttons";
import { SkillEvidencesDialog } from "@/components/skills/skill-evidences-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "__all__";

export default function MapaHabilidadesPage() {
  const queryClient = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canWrite = role === "LIDERANCA" || role === "ADMINISTRADOR";

  const [analystId, setAnalystId] = useState(ALL);
  const [clientId, setClientId] = useState(ALL);
  const [mediaChannelId, setMediaChannelId] = useState(ALL);
  const [selectedSkill, setSelectedSkill] = useState<{ id: string; label: string } | null>(null);

  const { data: analysts } = useAnalysts();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (analystId !== ALL) params.set("analystId", analystId);
    if (clientId !== ALL) params.set("clientId", clientId);
    if (mediaChannelId !== ALL) params.set("mediaChannelId", mediaChannelId);
    return params.toString();
  }, [analystId, clientId, mediaChannelId]);

  const { data, isLoading } = useQuery({
    queryKey: ["skills", query],
    queryFn: () => api.get<SkillSummary[]>(`/skills?${query}`),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Mapa de Habilidades</h1>
          <p className="text-sm text-muted-foreground">
            Quais combinações Cliente + Meio cada analista já demonstrou saber operar — independente do status
            atual de liberação. Clique numa linha para ver as evidências.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {canWrite && (
            <div className="flex gap-2">
              <ImportDialog onImported={() => queryClient.invalidateQueries({ queryKey: ["skills"] })} />
              <ManualSkillDialog onCreated={() => queryClient.invalidateQueries({ queryKey: ["skills"] })} />
            </div>
          )}
          <ExportButtons basePath="/skills" baseFilename="mapa-habilidades" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select value={analystId} onValueChange={setAnalystId}>
            <SelectTrigger>
              <SelectValue placeholder="Analista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os analistas</SelectItem>
              {analysts?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os clientes</SelectItem>
              {clients?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mediaChannelId} onValueChange={setMediaChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="Meio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os meios</SelectItem>
              {mediaChannels?.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Analista</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Meio</TableHead>
                <TableHead className="text-right">Evidências</TableHead>
                <TableHead>Primeira evidência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhuma habilidade registrada para os filtros selecionados.
                  </TableCell>
                </TableRow>
              )}
              {data?.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    setSelectedSkill({
                      id: row.id,
                      label: `${row.analystName} · ${row.clientName} · ${row.mediaChannelName}`,
                    })
                  }
                >
                  <TableCell className="font-medium">{row.analystName}</TableCell>
                  <TableCell>{row.clientName}</TableCell>
                  <TableCell>{row.mediaChannelName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.evidenceCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(row.firstEvidenceAt).toLocaleDateString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <SkillEvidencesDialog
        skillId={selectedSkill?.id ?? null}
        label={selectedSkill?.label ?? ""}
        onClose={() => setSelectedSkill(null)}
      />
    </div>
  );
}

function ManualSkillDialog({ onCreated }: { onCreated: () => void }) {
  const { data: analysts } = useAnalysts();
  const { data: clients } = useClients();
  const { data: mediaChannels } = useMediaChannels();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ analystId: "", clientId: "", mediaChannelId: "", piNumber: "" });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post("/skills", form),
    onSuccess: () => {
      onCreated();
      setOpen(false);
      setForm({ analystId: "", clientId: "", mediaChannelId: "", piNumber: "" });
      setError(null);
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Erro ao registrar a habilidade."),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" />
          Registro manual
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar habilidade manualmente</DialogTitle>
          <DialogDescription>
            Para casos anteriores ao sistema ou fora do fluxo normal de reanálise.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label>Analista</Label>
            <Select value={form.analystId} onValueChange={(v) => setForm((f) => ({ ...f, analystId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {analysts?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Cliente</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Meio</Label>
              <Select value={form.mediaChannelId} onValueChange={(v) => setForm((f) => ({ ...f, mediaChannelId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {mediaChannels?.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="piNumber">Nº do PI</Label>
            <Input
              id="piNumber"
              value={form.piNumber}
              onChange={(e) => setForm((f) => ({ ...f, piNumber: e.target.value }))}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              type="submit"
              disabled={!form.analystId || !form.clientId || !form.mediaChannelId || !form.piNumber || mutation.isPending}
            >
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ImportResult {
  rowsImported: number;
  skillsAffected: number;
}

function ImportDialog({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<SkillImportRowError[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postFile<ImportResult>("/skills/import", formData);
    },
    onSuccess: (data) => {
      setResult(data);
      setErrors(null);
      onImported();
    },
    onError: (err) => {
      setResult(null);
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "errors" in err.body) {
        setErrors((err.body as { errors: SkillImportRowError[] }).errors);
      } else {
        setErrors([{ line: 0, column: "PI", value: err instanceof ApiError ? err.message : "Erro desconhecido" }]);
      }
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) mutation.mutate(file);
    e.target.value = "";
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setErrors(null);
          setResult(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Upload className="size-4" />
          Importar planilha
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar habilidades de planilha</DialogTitle>
          <DialogDescription>
            Colunas obrigatórias: ANALISTA, CLIENTE, MEIO, PI. Se qualquer linha referenciar um cadastro
            inexistente, a planilha inteira é rejeitada — nada é gravado.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Enviando…" : "Escolher arquivo .xlsx"}
        </Button>

        {result && (
          <p className="text-sm rounded-md border border-success bg-success/10 p-3">
            {result.rowsImported} linha(s) importada(s), {result.skillsAffected} habilidade(s) afetada(s).
          </p>
        )}

        {errors && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-destructive">
              Planilha rejeitada — nenhuma linha foi gravada. Corrija e reenvie.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Linha</TableHead>
                  <TableHead>Coluna</TableHead>
                  <TableHead>Valor não encontrado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((e, i) => (
                  <TableRow key={i}>
                    <TableCell className="tabular-nums">{e.line}</TableCell>
                    <TableCell>{e.column}</TableCell>
                    <TableCell className="text-destructive">{e.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
