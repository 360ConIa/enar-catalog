---
name: retomar
description: Resume el estado del proyecto ENAR para retomar el trabajo (git, commits recientes, planes en docs/, pendientes). Solo lectura. Úsala al empezar una sesión o cuando el usuario pregunte "¿en qué íbamos?".
---

# Retomar el trabajo

**Solo lectura.** No escribas en Firestore, no modifiques archivos del repo, no hagas commit, push ni deploy. Si algo requiere cambios, propónlo al final y espera instrucciones.

## Pasos

1. **Estado de git**
   - `git status -sb` (rama, cambios sin commit, adelantado/atrasado respecto a origin)
   - `git fetch --dry-run` no hace falta; usa `git log --oneline origin/main..HEAD` y `git log --oneline HEAD..origin/main` para ver commits sin subir o sin bajar
   - `git log --oneline -10` y, para los 3 últimos, `git show --stat`

2. **Planes y pendientes**
   - Lee los `docs/plan-*.md` y busca pasos marcados como pendientes, bloqueados o "queda fuera"
   - Revisa los cuerpos de los últimos commits: suelen listar lo que quedó pendiente

3. **Entorno** (sin cambiar nada)
   - `firebase login:list` y `firebase use` (debe ser `enar-b2b`)
   - Existe `~/.config/gcloud/application_default_credentials.json`
   - `git config user.email`: si está vacío, avisa de que el commit necesitará identidad

## Resultado

Un resumen breve en español, con este formato:
- **Rama y sincronización:** …
- **Último trabajo:** 2-3 líneas a partir de los commits
- **Pendientes:** lista corta, citando `archivo:línea` o el commit
- **Avisos:** cambios sin commit, commits sin push, credenciales que faltan
- **Siguiente paso sugerido:** uno solo
