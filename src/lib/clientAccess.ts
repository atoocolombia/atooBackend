import { ApplicationStatus, DeliveryStatus } from "@prisma/client";
import { prisma } from "./prisma.js";

export type ClientPortalPhase = "application" | "waiting_delivery" | "dashboard";

export interface ClientAccessState {
  phase: ClientPortalPhase;
  hasVehicleDelivered: boolean;
  applicationStatus: ApplicationStatus | null;
  deliveryStatus: DeliveryStatus | null;
  message: string;
}

export async function getClientAccessState(userId: string): Promise<ClientAccessState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { application: true, vehiclePlan: true },
  });

  if (!user) {
    return {
      phase: "application",
      hasVehicleDelivered: false,
      applicationStatus: null,
      deliveryStatus: null,
      message: "Completa tu solicitud para continuar con atoo.",
    };
  }

  if (user.vehiclePlan) {
    return {
      phase: "dashboard",
      hasVehicleDelivered: true,
      applicationStatus: user.application?.status ?? null,
      deliveryStatus: DeliveryStatus.COMPLETED,
      message: "Tu vehículo está activo en tu panel.",
    };
  }

  const delivery = await prisma.vehicleDelivery.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (delivery?.status === DeliveryStatus.COMPLETED && delivery.clientConfirmedAt) {
    return {
      phase: "dashboard",
      hasVehicleDelivered: true,
      applicationStatus: user.application?.status ?? null,
      deliveryStatus: delivery.status,
      message: "Entrega confirmada.",
    };
  }

  if (delivery && delivery.status !== DeliveryStatus.COMPLETED) {
    const deliveryMessage =
      delivery.status === DeliveryStatus.AWAITING_CLIENT_CONFIRMATION
        ? "Tu vehículo fue entregado. Revisa el enlace de confirmación que te enviamos por WhatsApp."
        : "Tu vehículo está en proceso de entrega. Te avisaremos cuando puedas acceder a tu panel.";

    return {
      phase: "waiting_delivery",
      hasVehicleDelivered: false,
      applicationStatus: user.application?.status ?? null,
      deliveryStatus: delivery.status,
      message: deliveryMessage,
    };
  }

  const app = user.application;
  if (app?.status === ApplicationStatus.REJECTED) {
    return {
      phase: "waiting_delivery",
      hasVehicleDelivered: false,
      applicationStatus: app.status,
      deliveryStatus: delivery?.status ?? null,
      message: "Tu solicitud no fue aprobada. Contacta a soporte atoo si necesitas ayuda.",
    };
  }

  if (
    app &&
    (app.status === ApplicationStatus.SUBMITTED || app.status === ApplicationStatus.APPROVED)
  ) {
    return {
      phase: "waiting_delivery",
      hasVehicleDelivered: false,
      applicationStatus: app.status,
      deliveryStatus: delivery?.status ?? null,
      message:
        app.status === ApplicationStatus.SUBMITTED
          ? "Recibimos tu solicitud. Te avisaremos cuando avance el proceso de entrega."
          : "Tu solicitud fue aprobada. Aún no hemos registrado la entrega de tu vehículo.",
    };
  }

  return {
    phase: "application",
    hasVehicleDelivered: false,
    applicationStatus: app?.status ?? null,
    deliveryStatus: delivery?.status ?? null,
    message: "Continúa tu solicitud para acceder a tu vehículo atoo.",
  };
}
