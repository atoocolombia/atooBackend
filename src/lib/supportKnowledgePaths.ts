import fs from "node:fs";
import path from "node:path";

export type SupportTopicId = 1 | 2 | 3 | 4 | 5;
export type SupportVehicle = "nammi" | "aeolus";

export const SUPPORT_TOPICS: {
  id: SupportTopicId;
  label: string;
  emoji: string;
  needsVehicle: boolean;
}[] = [
  { id: 1, label: "Vehículo", emoji: "🚗", needsVehicle: false },
  { id: 2, label: "Contrato", emoji: "📄", needsVehicle: false },
  { id: 3, label: "Pagos y cuotas", emoji: "💳", needsVehicle: false },
  { id: 4, label: "Seguro", emoji: "🛡️", needsVehicle: false },
  { id: 5, label: "Emergencia", emoji: "🆘", needsVehicle: false },
];

const ALLOWED_EXT = new Set([".pdf", ".txt", ".docx"]);

export function resolveSupportKnowledgeRoot(): string {
  const fromEnv = process.env.SUPPORT_KNOWLEDGE_DIR?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const cwdPath = path.join(process.cwd(), "support-knowledge");
  if (fs.existsSync(cwdPath)) return cwdPath;
  return path.join(process.cwd(), "backend", "support-knowledge");
}

function listFilesInDir(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && ALLOWED_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => path.join(dir, e.name));
}

function matchesVehicle(filePath: string, vehicle: SupportVehicle): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (vehicle === "nammi") return /nammi/.test(base);
  return /aeolus|sky/.test(base);
}

export function resolveKnowledgeFiles(topic: SupportTopicId, vehicle?: SupportVehicle): string[] {
  const root = resolveSupportKnowledgeRoot();
  const files: string[] = [];

  switch (topic) {
    case 1: {
      const vehRoot = path.join(root, "vehiculos");
      if (vehicle === "nammi") {
        files.push(...listFilesInDir(path.join(vehRoot, "nammi")));
        files.push(...listFilesInDir(vehRoot).filter((f) => matchesVehicle(f, "nammi")));
      } else if (vehicle === "aeolus") {
        files.push(...listFilesInDir(path.join(vehRoot, "aeolus")));
        files.push(...listFilesInDir(vehRoot).filter((f) => matchesVehicle(f, "aeolus")));
      } else {
        files.push(...listFilesInDir(vehRoot));
        for (const sub of ["nammi", "aeolus"] as const) {
          files.push(...listFilesInDir(path.join(vehRoot, sub)));
        }
      }
      break;
    }
    case 2:
      files.push(...listFilesInDir(path.join(root, "contrato")));
      break;
    case 3:
      files.push(...listFilesInDir(path.join(root, "pagos")));
      break;
    case 4:
      files.push(...listFilesInDir(path.join(root, "seguro")));
      break;
    case 5: {
      const emergenciaDir = path.join(root, "emergencia");
      files.push(...listFilesInDir(emergenciaDir));
      const vehRoot = path.join(root, "vehiculos");
      if (vehicle === "nammi" || vehicle === "aeolus") {
        files.push(...listFilesInDir(path.join(vehRoot, vehicle)));
        files.push(...listFilesInDir(vehRoot).filter((f) => matchesVehicle(f, vehicle)));
      } else if (files.length === 0) {
        for (const sub of ["nammi", "aeolus"] as const) {
          files.push(...listFilesInDir(path.join(vehRoot, sub)));
        }
      }
      break;
    }
    default:
      break;
  }

  return [...new Set(files)];
}

export function listSupportKnowledgeInventory(): {
  root: string;
  topics: Record<string, string[]>;
} {
  const root = resolveSupportKnowledgeRoot();
  const topics: Record<string, string[]> = {
    vehiculos: resolveKnowledgeFiles(1),
    contrato: resolveKnowledgeFiles(2),
    pagos: resolveKnowledgeFiles(3),
    seguro: resolveKnowledgeFiles(4),
    emergencia: resolveKnowledgeFiles(5),
  };
  return {
    root,
    topics: Object.fromEntries(
      Object.entries(topics).map(([k, v]) => [k, v.map((f) => path.relative(root, f))]),
    ),
  };
}
