# CLAUDE.md — Isla (Perros de la Isla)

## Resumen del proyecto

Evaluación pública y gratuita de **Salud Comportamental** para tutores de **Perros de la Isla** (escuela de adiestramiento canino, Palma de Mallorca). Es la puerta de entrada del embudo: 17 preguntas, 4 dimensiones, un mapa de islas como resultado.

Flujo de la app: `intro → cuestionario (17) → registro → riego x4 → mapa → total`.

Modos de arranque:
- **directo** — flujo completo.
- **cliente_activo** — salta intro y registro (llega con datos por URL).
- **`?t=token`** — recupera una evaluación guardada y aterriza en el mapa.

Slogan oficial: **"Tu perro merece ser feliz hoy"** (no inventar variantes).

## Stack y decisiones técnicas

- **Frontend**: Vanilla JS puro. Sin framework, sin build step, sin npm, sin service worker. Tres archivos en la raíz: `app.js` (todo el flujo y el render), `styles.css`, `supabase-client.js` (solo llamadas de red). `index.html` los carga con `<script>` clásico — no son ES modules.
- **Hosting**: GitHub Pages — repo `github.com/perrosdelaisla/isla`.
- **Dominio de producción**: **bienestar.perrosdelaisla.es** (también accesible en `perrosdelaisla.github.io/isla/`).
- **Backend**: Supabase, proyecto **`sydzfwwiruxqaxojymdz`** — es el **hub** compartido con Clases y Victoria, no un proyecto propio de Isla. Ojo con esto: tocar el schema afecta a las otras apps.
- **Auth**: no hay. La app es pública y anónima; el frontend usa solo la publishable key (`supabase-client.js`).
- **Assets**: SVG de vegetación locales en `assets/vegetacion/` (10 niveles). Los logos vienen de i.ibb.co.

### Tablas y RPCs (schema `public` del hub)

| Objeto | Rol |
|---|---|
| `preguntas_isla` | Catálogo **versionado** de las 17 preguntas. Se lee directo por REST (`activa=eq.true&version=eq.1`). |
| `evaluaciones_isla` | Una fila por evaluación completa de un perro. Un tutor puede tener varias (re-evaluaciones). |
| `tokens_evaluacion_isla` | Tokens de magic link, expiran a 30 días. Sin acceso directo desde el frontend, solo vía RPC. |
| `submit_evaluacion_isla` | RPC de envío del flujo público. **Calcula los scores en el backend.** |
| `submit_evaluacion_cliente_activo` | RPC de envío para cliente activo. |
| `get_evaluacion_isla` | RPC de recuperación por token. |

El frontend **no calcula scores**: `getScores()` en `app.js` solo lee lo que devolvió el RPC, y `scoreGlobal()` promedia las 4 dimensiones.

## Brand voice

- **Tipografías**: Bebas Neue para titulares (siempre en mayúsculas), Inter para texto corrido.
- **Paleta**:

  | Color | Hex | Uso |
  |---|---|---|
  | Rojo | `#C8102E` | acento de marca |
  | Negro | `#1A1A1A` | fondo de pantallas oscuras |
  | Crema | `#F5EFE0` | fondo de pantallas claras |
  | Oliva | `#6B7A3A` | vegetación, verde de acento |

- **Estilo visual**: alternancia oscuro/crema por pantalla, metáfora de isla y riego, animaciones cuidadas (floración, viento, gotas).

## Reglas de lenguaje (estrictas)

Aplican a **todo** el texto visible en la app — UI, copy, mensajes, errores, emails. Excepción: textos legales y de facturación pueden usar terminología estándar.

| Nunca usar | Siempre usar |
|---|---|
| dueño, amo, propietario | **tutor** |
| sesión | **clase** |
| precio, coste, tarifa, cuánto cuesta | **valor** o **inversión** |
| peludito, peludo, amigo peludo, bolita de pelo, colita feliz | **perro** (o **perrito** ocasional) |

## Idioma

Comunicación con Charly siempre en **español rioplatense** (es argentino). Aplica a:

- Explicaciones, comentarios y preguntas en chat.
- Mensajes de commit.
- Comentarios dentro del código.
- Texto de usuario en la app (logs, errores, mensajes UI, copy).

**Excepción técnica**: nombres de variables, funciones, clases, palabras clave del lenguaje y APIs de librerías van en inglés (estándar técnico).

## Reglas de trabajo

1. **REGLA DURA — no tocar el instrumento.** Las **17 preguntas** ni el **scoring de las 4 dimensiones** (física, emocional, social, cognitiva) se modifican **sin orden explícita de Charly**. Esto incluye wording, orden, opciones, pesos, umbrales y las funciones RPC que puntúan. Si algo parece un bug ahí, se reporta y se espera OK — no se arregla sobre la marcha.
2. Las preguntas son **versionadas**: si cambia el wording de una, se inserta fila nueva con `version+1`, nunca se edita la existente. Las evaluaciones viejas conservan su versión.
3. **Nunca** hacer push automático a GitHub sin permiso explícito de Charly.
4. Antes de cualquier cambio destructivo (DELETE, DROP, eliminar archivos), enseñar qué se va a tocar y esperar OK.
5. El proyecto Supabase es **compartido** con Clases y Victoria. Cualquier migración o cambio de schema se avisa antes: puede romper otra app.
6. Al editar archivos grandes (`app.js`, `styles.css`), mostrar solo el bloque modificado, no el archivo entero.
7. Antes de eliminar funciones que parezcan no usadas, hacer `grep` para confirmar que no se referencian.
8. Si una operación de escritura en Supabase no tiene efecto visible, sospechar primero de **RLS**.
9. Tras cualquier cambio de código, bumpear cache: `?v=N` en `index.html`. (No hay service worker en este repo, así que no hay `CACHE_VERSION` que tocar.)
10. Charly aprueba manualmente cada acción ("Yes" individual). No usar "allow all session".
11. **No improvisar sobre adiestramiento canino** — la metodología está cerrada en otro contexto. Si surge una duda metodológica, preguntar antes de escribir código.

## Pendientes y notas

- `_prototipos/` y `_diseño/` son material de exploración, no forman parte de la app en producción.
