# Base de conocimiento — soporte WhatsApp (atoo)

Aquí van los documentos que **alimentarán la IA** para responder en WhatsApp según el tema (vehículo, contrato, pago, seguro, emergencia).  
**No se envían al cliente como PDF**; la IA leerá estos archivos y contestará en texto.

## Dónde subir cada cosa

```
backend/support-knowledge/
├── vehiculos/
│   ├── nammi/          ← Manual y guías del Dongfeng Nammi
│   └── aeolus/         ← Manual y guías del Dongfeng Aeolus Sky EV01
├── contrato/           ← Contrato, derechos/deberes, FAQ contractual
├── pagos/              ← Cuotas, mora, formas de pago, Wompi
├── seguro/             ← Cobertura, siniestros, contacto aseguradora
└── emergencia/         ← Grúa, asistencia en ruta, teléfonos 24h
```

Formatos recomendados: **PDF**, **DOCX** o **TXT**. Un archivo por tema si puedes (ej. `manual-usuario.pdf`, `faq-pagos.pdf`).

## Cómo se usará (próximo paso)

1. El cliente escribe por WhatsApp y elige una opción del menú.
2. El bot pide nombre, correo/cédula y vehículo (Nammi o Aeolus).
3. La IA busca en la carpeta correspondiente y responde con la info del documento.

## WhatsApp hoy (sin API de Meta)

Mientras Meta no levante la restricción del Business Manager:

1. Instala **WhatsApp Business** en el celular **313 676 8862**.
2. Copia el **mensaje de bienvenida** de `MENSAJES-WHATSAPP.md` en la app (Configuración → Herramientas → Mensaje de bienvenida).
3. El botón de atoo abre el chat con un mensaje inicial; WhatsApp Business responde solo con ese menú.

Cuando Meta apruebe la cuenta, conectaremos la API y la IA (Gemini) leyendo esta carpeta.

## Producción (Railway)

Estos archivos deben existir también en el servidor. Opciones:

- Incluirlos en el repo (si no son enormes), o
- Subirlos al volumen del backend y apuntar `SUPPORT_KNOWLEDGE_DIR` a esa ruta.
