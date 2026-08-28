# Textos para WhatsApp Business — atoo

Número de soporte: **+57 313 676 8862**

Configura esto en la app **WhatsApp Business** del celular (no hace falta Meta API todavía).

---

## 1. Mensaje de bienvenida (obligatorio)

**Ruta en la app:** Configuración → Herramientas para la empresa → **Mensaje de bienvenida** → Activar → pegar:

```
¡Hola! 👋 Soy el soporte de *atoo*.

Para orientarte bien, envíame en un solo mensaje:
• *Nombre completo*
• *Correo* o *cédula* con la que te registraste
• *Tu vehículo:* Nammi / Aeolus / aún no tengo asignado

Luego escribe el *número* de tu consulta:

*1* 🚗 Dudas del vehículo (uso, carga, mantenimiento)
*2* 📄 Dudas del contrato Rent to Own
*3* 💳 Dudas de pagos y cuotas
*4* 🛡️ Dudas del seguro
*5* 🆘 Emergencia (grúa, falla, accidente)

Un asesor o la IA te responderán según tu caso. Horario habitual: lun–vie 8:00–18:00 (hora Colombia).
```

---

## 2. Mensaje de ausencia (opcional)

Si no contestas fuera de horario:

```
Gracias por escribir a *atoo*. En este momento estamos fuera de horario.

Deja tu *nombre*, *correo o cédula*, *vehículo* y el *número de opción* (1–5). Te respondemos el siguiente día hábil.

Si es *emergencia* en ruta, escribe *5* y tu ubicación; revisamos lo antes posible.
```

---

## 3. Respuestas rápidas manuales (mientras no hay IA)

Puedes guardar respuestas rápidas en WhatsApp Business con atajos:

| Atajo | Texto sugerido |
| --- | --- |
| `/menu` | Reenvía el mensaje de bienvenida (opciones 1–5). |
| `/datos` | "Por favor confírmame: nombre completo, correo o cédula registrada, y si tu vehículo es Nammi o Aeolus." |
| `/vehiculo` | "Cuéntame tu duda del vehículo. Si es Nammi o Aeolus, lo reviso en el manual y te respondo." |
| `/contrato` | "¿Qué parte del contrato Rent to Own quieres aclarar? (plazo, propiedad, devolución, etc.)" |
| `/pago` | "Indica fecha de pago, monto o si ves un cobro incorrecto. Revisamos tu cuenta." |
| `/seguro` | "¿Es siniestro, cobertura o renovación? Te indico el paso a seguir." |
| `/emergencia` | "¿Estás a salvo? Indica ubicación, placa y qué pasó. Escalamos a asistencia." |

---

## 4. Qué hace el botón en atoo.io

Al pulsar **Soporte WhatsApp**, el cliente abre el chat con este mensaje (automático desde la web):

> Hola, necesito soporte atoo.

Eso activa tu **mensaje de bienvenida** con el menú y la petición de datos.

---

## 5. Próximo paso (IA + API)

Cuando Meta levante la restricción:

- Webhook en el backend leerá mensajes.
- Gemini consultará `backend/support-knowledge/` (PDFs por carpeta).
- Responderá en texto según vehículo y tema, sin mandar el PDF.
