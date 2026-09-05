"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { CatalogManager } from "@/components/cadastros/catalog-manager";
import { cn } from "@/lib/utils";

function TabTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "px-3 py-1.5 text-sm rounded-md text-muted-foreground transition-colors",
        "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export default function CadastrosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Cadastros</h1>
        <p className="text-sm text-muted-foreground">Clientes, meios de veiculação e analistas.</p>
      </div>

      <TabsPrimitive.Root defaultValue="clients">
        <TabsPrimitive.List className="inline-flex gap-1 rounded-lg bg-muted p-1">
          <TabTrigger value="clients">Clientes</TabTrigger>
          <TabTrigger value="media-channels">Meios</TabTrigger>
          <TabTrigger value="analysts">Analistas</TabTrigger>
        </TabsPrimitive.List>

        <TabsPrimitive.Content value="clients" className="mt-4">
          <CatalogManager apiPath="clients" entityLabel="Cliente" />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="media-channels" className="mt-4">
          <CatalogManager apiPath="media-channels" entityLabel="Meio" />
        </TabsPrimitive.Content>
        <TabsPrimitive.Content value="analysts" className="mt-4">
          {/* withEdit habilitado só aqui por ora — o mesmo endpoint já existe
              para Cliente/Meio, mas exibir "Editar" nesses dois depende de
              confirmação (adendo "Acesso restrito", item 4). */}
          <CatalogManager apiPath="analysts" entityLabel="Analista" withRegistration withEdit />
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  );
}
