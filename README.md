# IDY Notch

Un notch vivo para Windows + una web app para iPhone, sincronizados con Supabase.
Uso personal y para un grupo pequeño de amigos.

```
idy-notch/
├── desktop/     App de escritorio (Tauri 2 + React) — el notch
├── web/         Web app / PWA para iPhone (Vite + React) — se publica en Vercel
├── shared/      Tipos y configuración compartidos
└── supabase/    Migraciones SQL y Edge Functions
```

## Qué hace

**Notch (Windows 10/11)**

| Estado | Descripción |
|---|---|
| Reposo | Hora y fecha en una píldora negra pegada al borde superior |
| Mínimo | Una línea fina cuando no suena nada (opcional) |
| Música | Carátula + ecualizador; al abrir: controles, barra de progreso y salto |
| Letras | Línea actual en el notch cerrado; vista dividida con letra sincronizada (LRCLIB) |
| Enfoque | Pomodoro con anillo de progreso; aviso con campanita |
| Estante | Arrastra archivos al notch; ábrelos o arrástralos fuera |
| To-do | Tareas sincronizadas; aviso al empezar y al acabar el tiempo |
| Notas | Captura rápida tipo Keep |
| Recordatorios | Crea recordatorios; suenan como **alarma** en el notch |
| Auriculares / Carga | Aviso al conectar auriculares Bluetooth o el cargador |
| Mascota | Ojitos cuando estás inactivo; se duermen y te saludan al volver |

Se oculta en pantalla completa, abre con hover o clic, y tiene ventana de Ajustes
(icono de la bandeja junto al reloj).

**Web app (iPhone, Android, PC)**: recordatorios con notificación push, notas tipo Keep,
tareas, grupos de amigos con código de invitación.

## Cómo funciona

- **Supabase** guarda usuarios, recordatorios, notas, tareas y grupos (con RLS: cada quien
  ve lo suyo y lo de sus grupos).
- **pg_cron** llama cada minuto a la Edge Function `send-reminders`, que envía Web Push a
  todos los dispositivos de los destinatarios y reprograma los repetitivos.
- El **notch** escucha cambios en tiempo real y hace sonar la alarma al segundo exacto.
- Las cuentas usan **usuario + contraseña** (sin correo). Para registrarse hace falta el
  **código de invitación** (tabla `app_secrets`, clave `invite_code`).

## Web en Vercel

1. vercel.com → **Add New… → Project** → importa `idy-notch`.
2. **Root Directory**: `web` (deja activado "Include files outside the root directory").
3. Framework: Vite (se detecta solo). Deploy.

En el iPhone: abre la URL en **Safari → Compartir → Añadir a pantalla de inicio**, entra
desde el ícono y activa las notificaciones en **Ajustes**.

## Notch en Windows

Cada push a `main` que toque `desktop/` compila el instalador en GitHub Actions
(pestaña **Actions → Notch para Windows → Artifacts**). Para publicar una versión:

```bash
git tag v1.0.0 && git push --tags   # crea un Release con el .exe y el .msi
```

Desarrollo local (Windows, con Rust y Node instalados):

```bash
cd desktop
npm install
npm run tauri dev
```

Para diseñar sin Windows: `npm run dev` y abre `http://localhost:1420/?mock=music`
(otros: `resting`, `lyrics`, `focus`, `mascot`, `sleep`, `hud`, `charging`, `alarm`, `open`, `shelf`).

## Supabase

- Proyecto: `ljesyblxcbknstsyeohu` (São Paulo).
- `supabase/migrations/` — esquema, RLS, funciones y cron.
- `supabase/functions/` — `signup`, `send-reminders`, `push-test`.
- Los secretos (claves VAPID, secreto del cron, código de invitación) viven en la tabla
  `app_secrets`, que solo puede leer el rol de servicio. Para cambiar el código de invitación:

```sql
update public.app_secrets set value = 'NUEVO-CODIGO' where key = 'invite_code';
```

## Límites conocidos

- En iPhone la notificación suena una vez con el tono normal (no en bucle como el
  despertador) y respeta el modo Silencio / Concentración.
- El plan gratis de Supabase pausa el proyecto tras 7 días sin uso; se reactiva desde el panel.
