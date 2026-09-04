/** Formas de resposta da API que ainda não estão em @reanalise-erp/types (entidades de cadastro simples). */

export interface CatalogEntry {
  id: string;
  name: string;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalystEntry extends CatalogEntry {
  registration: string | null;
}

export interface GuidelineEntry {
  id: string;
  clientId: string;
  mediaChannelId: string;
  targetCount: number;
  returnLimit: number;
  active: boolean;
  effectiveFrom: string;
  supersededAt: string | null;
  changeReason: string | null;
  client?: CatalogEntry;
  mediaChannel?: CatalogEntry;
}
