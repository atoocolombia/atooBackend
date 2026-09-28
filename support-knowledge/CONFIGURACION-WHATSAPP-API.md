# Conectar el bot automático de WhatsApp (Meta API)

El bot envía **varios mensajes seguidos** (bienvenida, pide datos, menú, respuestas por opción 1–5).  
Sin esta configuración, al escribir por WhatsApp **no pasa nada** automático: solo funciona la app del celular a mano.

## 1. Meta Developers

1. Entra a [developers.facebook.com](https://developers.facebook.com) → **Mis apps** → **Crear app** → tipo **Negocio**.
2. Añade el producto **WhatsApp**.
3. En **WhatsApp → API Setup**:
   - Vincula el portafolio de **ISD / atoo**.
   - Añade el número **+57 313 676 8862** (código por SMS).
4. Copia:
   - **Phone number ID**
   - **Access token** (temporal; luego uno permanente en System User)

## 2. Webhook en Railway

URL del webhook (producción):

```
https://atoobackend-production.up.railway.app/webhooks/whatsapp
```

En Meta → WhatsApp → **Configuration** → **Webhook**:

| Campo | Valor |
|---|---|
| Callback URL | la URL de arriba |
| Verify token | un texto secreto que tú inventas (ej. `atoo-wa-verify-2026`) |

Suscríbete al campo **messages**.

## 3. Variables en Railway (backend)

| Variable | Ejemplo |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | token de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número |
| `WHATSAPP_VERIFY_TOKEN` | el mismo verify token del webhook |

Reinicia el servicio.

Comprueba: `GET https://.../webhooks/whatsapp/status` → `{ "configured": true }`.

## 4. Probar

1. Pulsa **Soporte WhatsApp** en atoo.io (envía «Hola atoo»).
2. Debes recibir **3 mensajes** del bot: saludo, pide datos, menú.
3. Responde en un mensaje:
   ```
   Cliente Demo
   cliente@gmail.com
   Nammi
   1
   ```
4. El bot confirma datos desde la base de datos y responde sobre el vehículo.

## 5. Si Meta sigue restringido

- Puedes probar con el **número de prueba** que da Meta en API Setup (sandbox).
- O esperar la **revisión** de Atoo Colombia / usar portafolio ISD verificado.

## 6. Próximo paso (IA)

Los PDFs en `support-knowledge/` alimentarán **Gemini** para contestar la pregunta concreta del cliente (sin enviar el PDF).
