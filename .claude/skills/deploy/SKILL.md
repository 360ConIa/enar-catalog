---
name: deploy
description: Despliega una app ENAR a Firebase Hosting (b2b, crm o portal) o las reglas de Firestore, exigiendo árbol limpio y commit hecho.
disable-model-invocation: true
argument-hint: "b2b | crm | portal | reglas"
---

# Deploy a Firebase

App solicitada: $ARGUMENTS

## Destinos permitidos (únicos)

| Argumento | Comando | Directorio | URL |
|---|---|---|---|
| `b2b` | `firebase deploy --only hosting:b2b` | `public/` | https://enar-b2b.web.app |
| `crm` | `firebase deploy --only hosting:crm` | `public-crm/` | https://enar-comercial.web.app |
| `portal` | `firebase deploy --only hosting:portal` | `public-portal/` | https://enar-digital.web.app |
| `reglas` | `firebase deploy --only firestore:rules` | `firestore.rules` | — |

**Prohibido:** `firebase deploy` sin `--only`, `--only hosting` sin target y cualquier deploy de `functions` (falla por `rolldown_runtime.js`, ver CLAUDE.md). Si el usuario pide algo fuera de esta tabla, explícale por qué no y detente.

## Pasos

1. **App**: si `$ARGUMENTS` está vacío o no es uno de los cuatro valores, pregunta cuál desplegar. No la deduzcas de los cambios.

2. **Precondiciones** (si alguna falla, detente y explica cómo resolverla; sugiere `/cierre`):
   - `git status --porcelain` debe estar vacío: árbol limpio, sin archivos sin seguimiento dentro del directorio de la app
   - El último commit debe incluir el trabajo a desplegar: muestra `git log --oneline -3`
   - Si hay commits sin push (`git log origin/main..HEAD`), avisa y pregunta si continuar o hacer push antes
   - `firebase login:list` con sesión activa y `firebase use` = `enar-b2b`

3. **Confirmar**: muestra el comando exacto, el commit (`git rev-parse --short HEAD`) y la URL, y pide confirmación.

4. **Desplegar**: ejecuta solo el comando de la tabla. Si falla, muestra el error completo; no reintentes con otro filtro.

5. **Verificar**: `curl -s -o /dev/null -w "%{http_code}" <URL>` debe dar 200. Para `reglas`, confirma en la salida del CLI que se publicaron.

## Resultado

App, commit desplegado, URL y código HTTP.
