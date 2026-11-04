import type { Application, User, UserApplicationKnowledgeTest, UserIdentityExtraction, UserWorkAddressExtraction } from "@prisma/client";
import { buildClientName } from "./mapVehicleDelivery.js";
import { serializeWorkAddressStepMeta } from "./workAddressStepMeta.js";

export type AnalystKnowledgeTestSummary = {
  includeEvSection: boolean;
  evScore: number | null;
  vialScore: number;
  customerServiceScore: number;
  weightedScore: number;
  completedAt: string;
};

export type AnalystPendingApplicationDto = {
  id: string;
  userId: string;
  status: Application["status"];
  submittedAt: string;
  clientName: string;
  idDocumentNumber: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  dwellingType: string | null;
  addressComplement: string | null;
  utilityBillHolderMatchesApplicant: boolean | null;
  utilityBillHolderName: string | null;
  mobilityDrivenElectricVehicle: boolean | null;
  mobilityElectricExperienceText: string | null;
  bankHolderMatchesIdentity: boolean | null;
  platformSlot1Complete: boolean;
  platformSlot2Complete: boolean;
  platformSlot3Complete: boolean;
  knowledgeTest: AnalystKnowledgeTestSummary | null;
};

type Row = Application & {
  user: User & {
    identityExtraction: UserIdentityExtraction | null;
    workAddressExtraction: UserWorkAddressExtraction | null;
    applicationKnowledgeTest: UserApplicationKnowledgeTest | null;
  };
};

function serializeKnowledgeTest(
  row: UserApplicationKnowledgeTest | null | undefined,
): AnalystKnowledgeTestSummary | null {
  if (!row) return null;
  return {
    includeEvSection: row.includeEvSection,
    evScore: row.evScore,
    vialScore: row.vialScore,
    customerServiceScore: row.customerServiceScore,
    weightedScore: row.weightedScore,
    completedAt: row.completedAt.toISOString(),
  };
}

export function serializeAnalystPendingApplication(row: Row): AnalystPendingApplicationDto {
  const work = row.user.workAddressExtraction;
  const stepMeta = serializeWorkAddressStepMeta(work);

  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    clientName: buildClientName(row.user.identityExtraction, row.user.email),
    idDocumentNumber: row.user.identityExtraction?.idDocumentNumber ?? null,
    email: row.user.email,
    phone: row.user.phone,
    address: work?.utilityServiceAddress ?? null,
    dwellingType: work?.utilityDwellingType ?? null,
    addressComplement: work?.utilityAddressComplement ?? null,
    utilityBillHolderMatchesApplicant: work?.utilityBillHolderMatchesApplicant ?? null,
    utilityBillHolderName: work?.utilityBillHolderName?.trim() || null,
    mobilityDrivenElectricVehicle: work?.mobilityDrivenElectricVehicle ?? null,
    mobilityElectricExperienceText: work?.mobilityElectricExperienceText?.trim() || null,
    bankHolderMatchesIdentity: work?.bankHolderMatchesIdentity ?? null,
    platformSlot1Complete: stepMeta.platformSlot1Complete,
    platformSlot2Complete: stepMeta.platformSlot2Complete,
    platformSlot3Complete: stepMeta.platformSlot3Complete,
    knowledgeTest: serializeKnowledgeTest(row.user.applicationKnowledgeTest),
  };
}
