import type { CatalogVehicle, CatalogVehicleImage } from "@prisma/client";

export type CatalogSpec = { label: string; value: string };

export type CatalogVehicleDto = {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  type: "carro" | "camioneta";
  image: string;
  gallery: string[];
  highlights: string[];
  features: string[];
  specs: CatalogSpec[];
  badge: string | null;
  popular: boolean;
  weeklyPriceCop: number;
  active: boolean;
  sortOrder: number;
  specSheetPdf: string | null;
  images: Array<{
    id: string;
    url: string;
    isPrimary: boolean;
    sortOrder: number;
    originalName: string;
    storedPath: string | null;
    publicUrl: string | null;
  }>;
};

type VehicleWithImages = CatalogVehicle & { images: CatalogVehicleImage[] };

export function buildImageFileUrl(imageId: string, req?: { protocol?: string; get?: (n: string) => string | undefined }): string {
  const base = process.env.PUBLIC_API_URL?.replace(/\/+$/, "");
  if (base) {
    return `${base}/api/v1/landing/images/${imageId}/file`;
  }
  if (req?.get && req.protocol) {
    const host = req.get("host");
    if (host) {
      return `${req.protocol}://${host}/api/v1/landing/images/${imageId}/file`;
    }
  }
  return `/api/v1/landing/images/${imageId}/file`;
}

export function resolveImagePublicUrl(
  image: CatalogVehicleImage,
  req?: { protocol?: string; get?: (n: string) => string | undefined },
): string {
  if (image.storedPath) {
    return buildImageFileUrl(image.id, req);
  }
  return image.publicUrl ?? "";
}

export function mapCatalogVehicleToDto(
  vehicle: VehicleWithImages,
  req?: { protocol?: string; get?: (n: string) => string | undefined },
): CatalogVehicleDto {
  const sortedImages = [...vehicle.images].sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
  const urls = sortedImages.map((img) => resolveImagePublicUrl(img, req)).filter(Boolean);
  const primary = sortedImages.find((img) => img.isPrimary) ?? sortedImages[0];
  const image = primary ? resolveImagePublicUrl(primary, req) : urls[0] ?? "";

  return {
    id: vehicle.id,
    slug: vehicle.slug,
    name: vehicle.name,
    subtitle: vehicle.subtitle,
    type: vehicle.type === "CAMIONETA" ? "camioneta" : "carro",
    image,
    gallery: urls.length > 0 ? urls : image ? [image] : [],
    highlights: Array.isArray(vehicle.highlights) ? (vehicle.highlights as string[]) : [],
    features: Array.isArray(vehicle.features) ? (vehicle.features as string[]) : [],
    specs: Array.isArray(vehicle.specs) ? (vehicle.specs as CatalogSpec[]) : [],
    badge: vehicle.badge,
    popular: vehicle.popular,
    weeklyPriceCop: vehicle.weeklyPriceCop,
    active: vehicle.active,
    sortOrder: vehicle.sortOrder,
    specSheetPdf: vehicle.specSheetPath ?? (vehicle.slug ? `/vehicles/${vehicle.slug}/ficha-tecnica.pdf` : null),
    images: sortedImages.map((img) => ({
      id: img.id,
      url: resolveImagePublicUrl(img, req),
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
      originalName: img.originalName,
      storedPath: img.storedPath,
      publicUrl: img.publicUrl,
    })),
  };
}
