# Wompi — producción vs pruebas (atoo)

## ¿Qué es `APP_ENV`?

Es una variable **en Railway** (servicio del backend), no en Wompi.

Le dice al código de atoo **qué despliegue es este**:

| Valor | Dónde |
|-------|--------|
| `APP_ENV=production` | Servicio Railway que atiende **www.atoo.io** (clientes reales) |
| `APP_ENV=staging` | Servicio Railway de **pruebas** (staging.atoo.io, BD aparte) |

Según eso el backend elige **qué variables Wompi leer** (nombres distintos en cada servicio).

## URLs del portal

| Ambiente | URL pagos |
|----------|-----------|
| **Pruebas** | https://staging.atoo.io/dashboard?view=payments |
| **Clientes** | https://www.atoo.io/dashboard?view=payments |
| **Local** | http://localhost:5173/dashboard?view=payments |

Usuario demo: `cliente@gmail.com` (cuota 50.000 en la BD de ese mismo ambiente).

## Railway — servicio **staging** (`APP_ENV=staging`)

Llaves **sandbox** de Wompi (prefijo `pub_test_`):

```
APP_ENV=staging
WOMPI_TEST_PUBLIC_KEY=pub_test_...
WOMPI_TEST_INTEGRITY_SECRET=test_integrity_...
WOMPI_TEST_EVENTS_SECRET=test_events_...
```

Webhook en el panel Wompi **Pruebas**:

```
https://TU-BACKEND-STAGING.up.railway.app/webhooks/wompi
```

## Railway — servicio **production** (`APP_ENV=production`)

Nombres **originales** (llaves **producción** de Wompi, `pub_prod_`):

```
APP_ENV=production
WOMPI_PUBLIC_KEY=pub_prod_...
WOMPI_INTEGRITY_SECRET=prod_integrity_...
WOMPI_EVENTS_SECRET=prod_events_...
```

Webhook en el panel Wompi **Producción**:

```
https://atoobackend-production.up.railway.app/webhooks/wompi
```

No mezcles: en prod no uses `WOMPI_TEST_*`; en staging no uses solo `WOMPI_PUBLIC_KEY` si quieres aislar sandbox.

## Vercel (staging.atoo.io)

Para que el front de pruebas llame al API de pruebas:

```
VITE_API_URL=https://TU-BACKEND-STAGING.up.railway.app
VITE_APP_ENV=staging
```

## Tarjetas sandbox

Solo en **staging** o con `pub_test_`: https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/

- Aprobada: `4242 4242 4242 4242`
- Activar **Modo de pruebas** en el checkout Wompi si aparece.