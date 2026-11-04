-- Historial demo para cliente@gmail.com (datos ficticios de prueba)
INSERT INTO "VehicleHistoryEvent" ("id", "userId", "eventType", "title", "description", "occurredAt", "metadata", "createdAt", "updatedAt")
SELECT
  v.id,
  u.id,
  v."eventType"::"VehicleHistoryEventType",
  v.title,
  v.description,
  v."occurredAt",
  v.metadata::jsonb,
  NOW(),
  NOW()
FROM "User" u
CROSS JOIN (
  VALUES
    (
      'VHIST-DEMO-MULTA',
      'OTHER',
      'Comparendo — exceso de velocidad',
      'Multa registrada por cámara en Autopista Norte (circulación a 92 km/h en zona de 60 km/h). Valor referencia: $546.000 COP. Pendiente de pago con descuento del 50% si se paga antes del vencimiento.',
      NOW() - INTERVAL '2 months',
      '{"kind":"traffic_fine","amountCop":546000,"status":"pending_payment","code":"C29"}'
    ),
    (
      'VHIST-DEMO-ACCIDENT',
      'DAMAGE',
      'Colisión leve en intersección',
      'Impacto en cruce de calle 80 con carrera 68. Daño en paragolpes delantero y faro derecho. Reporte FURAT radicado; cobertura todo riesgo aplicada sin lesionados.',
      NOW() - INTERVAL '5 months',
      '{"kind":"accident","severity":"minor","furat":"DEMO-FURAT-2026-0412"}'
    ),
    (
      'VHIST-DEMO-PARTS',
      'PART_REPLACEMENT',
      'Cambio de paragolpes y faro LED',
      'Reemplazo autorizado por aseguradora: paragolpes delantero, soporte de faro y módulo LED derecho. Trabajo en Taller Demo Bogotá; piezas originales Dongfeng Nammi.',
      NOW() - INTERVAL '4 months',
      '{"kind":"parts","workshop":"Taller Demo Bogotá","parts":["Paragolpes delantero","Faro LED derecho","Soporte faro"]}'
    ),
    (
      'VHIST-DEMO-PERIODIC',
      'PERIODIC_REVIEW',
      'Revisión periódica 10.000 km',
      'Revisión de suspensión, frenos regenerativos, líquido de frenos y software BMS. Resultado satisfactorio; próxima revisión a los 20.000 km.',
      NOW() - INTERVAL '1 month',
      '{"kind":"periodic","odometerKm":10240}'
    ),
    (
      'VHIST-DEMO-TECHNO',
      'TECHNOMECHANICAL',
      'Revisión tecnomecánica aprobada',
      'RTM vigente hasta noviembre 2027. Sin observaciones en frenos, dirección, luces y emisiones (vehículo eléctrico).',
      NOW() - INTERVAL '6 months',
      '{"kind":"technomechanical","result":"approved","validUntil":"2027-11-30"}'
    )
) AS v(id, "eventType", title, description, "occurredAt", metadata)
WHERE u.email = 'cliente@gmail.com'
ON CONFLICT ("id") DO UPDATE SET
  "userId" = EXCLUDED."userId",
  "eventType" = EXCLUDED."eventType",
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  "occurredAt" = EXCLUDED."occurredAt",
  metadata = EXCLUDED.metadata,
  "updatedAt" = NOW();
