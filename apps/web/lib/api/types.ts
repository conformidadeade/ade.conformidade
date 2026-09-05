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

export interface SkillSummary {
  id: string;
  analystId: string;
  analystName: string;
  clientId: string;
  clientName: string;
  mediaChannelId: string;
  mediaChannelName: string;
  evidenceCount: number;
  firstEvidenceAt: string;
}

export interface SkillEvidence {
  id: string;
  piNumber: string;
  origin: "LANCAMENTO" | "MANUAL" | "IMPORTACAO";
  recordedByName: string;
  createdAt: string;
}

export interface SkillImportRowError {
  line: number;
  column: "ANALISTA" | "CLIENTE" | "MEIO" | "PI";
  value: string;
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
