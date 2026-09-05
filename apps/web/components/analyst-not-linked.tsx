import { UserX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Estado vazio para um usuário ANALISTA cujo login ainda não foi
 * vinculado a um cadastro de Analyst (adendo "Acesso restrito", item 2 —
 * caso de borda). Não é erro: o login funciona normalmente, só não há
 * dado nenhum para mostrar nestas 3 telas até o vínculo existir.
 */
export function AnalystNotLinked() {
  return (
    <Card>
      <CardContent className="py-12 flex flex-col items-center text-center gap-2">
        <UserX className="size-8 text-muted-foreground" />
        <p className="font-medium">Seu usuário ainda não está vinculado a um cadastro de analista</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Procure o administrador do sistema para vincular seu login ao seu cadastro em Analistas — assim que
          isso acontecer, seus dados aparecem aqui automaticamente.
        </p>
      </CardContent>
    </Card>
  );
}
