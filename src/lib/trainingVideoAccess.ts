import type { TrainingPurchase, TrainingVideo, TrainingVideoKind } from "@prisma/client";

export type TrainingVideoWithAccess = {
  id: string;
  title: string;
  description: string | null;
  kind: TrainingVideoKind;
  priceCop: number | null;
  sortOrder: number;
  published: boolean;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  createdAt: string;
  updatedAt: string;
  canWatch: boolean;
  purchaseStatus: "NONE" | "PENDING" | "APPROVED";
};

export function mapTrainingVideoForClient(
  video: TrainingVideo,
  purchase: TrainingPurchase | null | undefined,
): TrainingVideoWithAccess {
  let canWatch = false;
  let purchaseStatus: TrainingVideoWithAccess["purchaseStatus"] = "NONE";

  if (video.kind === "MANDATORY") {
    canWatch = true;
  } else if (purchase) {
    purchaseStatus = purchase.status === "APPROVED" ? "APPROVED" : "PENDING";
    canWatch = purchase.status === "APPROVED";
  }

  return {
    id: video.id,
    title: video.title,
    description: video.description,
    kind: video.kind,
    priceCop: video.priceCop,
    sortOrder: video.sortOrder,
    published: video.published,
    mimeType: video.mimeType,
    sizeBytes: video.sizeBytes,
    originalName: video.originalName,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt.toISOString(),
    canWatch,
    purchaseStatus,
  };
}

export function userCanStreamTrainingVideo(
  video: TrainingVideo,
  purchase: TrainingPurchase | null | undefined,
): boolean {
  if (!video.published) return false;
  if (video.kind === "MANDATORY") return true;
  return purchase?.status === "APPROVED";
}
