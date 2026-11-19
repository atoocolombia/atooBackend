# Wompi — producción vs pruebas (atoo)

## URLs del portal

| Ambiente | URL pagos |
|----------|-----------|
| **Pruebas (staging)** | https://staging.atoo.io/dashboard?view=payments |
| **Clientes (prod)** | https://www.atoo.io/dashboard?view=payments |
| **Local** | http://localhost:5173/dashboard?view=payments |

Usuario demo: `cliente@gmail.com` (cuota 50.000 COP en BD de ese ambiente).

## Railway — variables

### Backend **staging** (`APP_ENV=staging`)

```
WOMPI_TEST_PUBLIC_KEY=pub_test_...
WOMPI_TEST_INTEGRITY_SECRET=test_integrity_...
WOMPI_TEST_EVENTS_SECRET=test_events_...
```

Webhook en Wompi (ambiente **Pruebas**):

```
https://TU-BACKEND-STAGING.up.railway.app/webhooks/wompi
```

### Backend **production** (`APP_ENV=production`)

```
WOMPI_PROD_PUBLIC_KEY=pub_prod_...
WOMPI_PROD_INTEGRITY_SECRET=prod_integrity_...
WOMPI_PROD_EVENTS_SECRET=prod_events_...
```

Webhook en Wompi (ambiente **Producción**):

```
https://atoobackend-production.up.railway.app/webhooks/wompi
```

## Vercel (frontend staging)

En el deployment de `develop` / staging.atoo.io:

```
VITE_API_URL=https://TU-BACKEND-STAGING.up.railway.app
VITE_APP_ENV=staging
```

Sin esto, staging.atoo.io seguiría llamando al API de producción.

## Tarjetas sandbox

Ver https://docs.wompi.co/docs/colombia/datos-de-prueba-en-sandbox/

- Aprobada: `4242 4242 4242 4242`
- En checkout Wompi: activar **Modo de pruebas** (esquina superior derecha) si aparece.