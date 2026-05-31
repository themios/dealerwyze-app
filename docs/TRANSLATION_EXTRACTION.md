# Translation Extraction Guide

## Overview

This document outlines the 30 most critical user-facing strings that have been extracted for translation into Spanish (and other languages in the future). These strings were selected based on impact and frequency of user exposure.

## Extraction Completed (Phase 1)

The following strings have been extracted and stored in JSON translation files:
- `/public/locales/en.json` — English (default)
- `/public/locales/es.json` — Spanish (pending professional translation)

## String Categories

### 1. Navigation Labels (7 strings)
- "Today" → "Hoy"
- "Leads" → "Leads"
- "Messages" → "Mensajes"
- "Vehicles" → "Vehículos"
- "Sequences" → "Secuencias"
- "Settings" → "Configuración"
- "More" → "Más"

**Priority:** High - Users see these constantly in navigation menu

### 2. Common Buttons (10 strings)
- "Send Message" → "Enviar mensaje"
- "Add Vehicle" → "Agregar vehículo"
- "Confirm Payment" → "Confirmar pago"
- "Schedule Sequence" → "Programar secuencia"
- "Save" → "Guardar"
- "Cancel" → "Cancelar"
- "Submit" → "Enviar"
- "Delete" → "Eliminar"
- "Edit" → "Editar"
- "Close" → "Cerrar"

**Priority:** High - CTAs drive conversion and retention

### 3. Error Messages (7 strings)
- "Lead not found" → "Lead no encontrado"
- "SMS failed to send" → "Error al enviar SMS"
- "Upload failed" → "Error al cargar"
- "Unauthorized" → "No autorizado"
- "You don't have permission to access this resource" → "No tienes permiso para acceder a este recurso"
- "An error occurred. Please try again." → "Ocurrió un error. Por favor, intenta de nuevo."
- "Invalid input provided" → "Entrada inválida"

**Priority:** High - Errors must be clear and actionable

### 4. SMS/Email Templates (4 strings)
- "Welcome to DealerWyze" → "Bienvenido a DealerWyze"
- "New lead from {{source}}" → "Nuevo lead de {{source}}"
- "Payment reminder: Your DealerWyze invoice is due" → "Recordatorio de pago: Tu factura de DealerWyze está vencida"
- "This is an automated message from {{dealership}}" → "Este es un mensaje automatizado de {{dealership}}"

**Priority:** Critical - Customers see these directly

### 5. Onboarding Flow (6 strings)
- "Your Dealership" → "Tu concesionario"
- "First Vehicle" → "Primer vehículo"
- "Lead Inbox" → "Bandeja de entrada"
- "Your Team" → "Tu equipo"
- "Welcome to DealerWyze" → "Bienvenido a DealerWyze"
- "Let's get you started" → "Comencemos"

**Priority:** High - First-time users must understand onboarding

### 6. Template Selection (3 strings)
- "SMS Template" → "Plantilla de SMS"
- "Email Template" → "Plantilla de correo"
- "Select a template" → "Selecciona una plantilla"

**Priority:** Medium - Used when working with templates

### 7. Utility Messages (5 strings)
- "Loading..." → "Cargando..."
- "No results found" → "Sin resultados"
- "Success" → "Éxito"
- "Error" → "Error"
- "Retry" → "Reintentar"

**Priority:** Medium - Status feedback messages

### 8. App Name (1 string)
- "DealerWyze" → "DealerWyze" (no translation — brand name)

---

## Translation File Structure

### English (`en.json`)
```json
{
  "common": {
    "appName": "DealerWyze",
    "signOut": "Sign Out"
  },
  "nav": {
    "today": "Today",
    "leads": "Leads",
    ...
  },
  ...
}
```

### Spanish (`es.json`)
```json
{
  "common": {
    "appName": "DealerWyze",
    "signOut": "Cerrar sesión"
  },
  "nav": {
    "today": "Hoy",
    "leads": "Leads",
    ...
  },
  ...
}
```

---

## Implementation Status

### Phase 1: Infrastructure ✓ Complete
- [x] next-intl installed and configured
- [x] Middleware routing set up (/en/, /es/ paths)
- [x] Translation files created (en.json, es.json)
- [x] Language toggle component built
- [x] Server-side translation config ready
- [x] localStorage + DB persistence planned

### Phase 2: Integration (Pending)
- [ ] Add LanguageToggle component to app header
- [ ] Update Top Page, Lead Detail, SMS Thread, Inventory pages to use translations
- [ ] Test language switching functionality
- [ ] Verify Spanish SMS templates send correctly

### Phase 3: Professional Translation (Pending)
- [ ] Hire professional Spanish translator
- [ ] Review and QA Spanish translations
- [ ] Update es.json with professional copy
- [ ] Test all user-facing strings in Spanish

---

## Using Translations in Code

### Client Components
```tsx
'use client'
import { useTranslations } from 'next-intl'

export function MyComponent() {
  const t = useTranslations('nav')
  return <button>{t('sendMessage')}</button>
}
```

### Server Components
```tsx
import { getTranslations } from 'next-intl/server'

export async function MyServerComponent() {
  const t = await getTranslations('button')
  return <h1>{t('save')}</h1>
}
```

### Params with Variables
```tsx
const t = useTranslations('sms')
return <div>{t('newLeadText', { source: 'AutoTrader' })}</div>
```

---

## Language Storage

### Local Storage (Client)
Language preference is cached in localStorage under key: `dealerwyze_language_preference`

### Database Storage
The `profiles` table has a `language_preference` column (migration 209) to persist user choice across sessions.

### Route
Use server action `updateLanguagePreference(locale)` from `/app/api/actions/updateLanguagePreference.ts` to sync preference to DB.

---

## Future Locales

The infrastructure supports easy addition of new languages:

1. Create `public/locales/[locale].json` with translations
2. Add locale to `i18n.locales` in `i18n.config.ts`
3. Update middleware to route the new locale
4. No code changes needed

Supported pattern:
```typescript
export const i18n = {
  defaultLocale: 'en',
  locales: ['en', 'es', 'fr', 'pt'] // Add as needed
}
```

---

## Quality Checklist Before Launch

- [ ] All 30 strings have professional Spanish translations
- [ ] Language toggle appears in app header (top-right)
- [ ] EN ↔ ES switching works without page errors
- [ ] Spanish SMS templates send correctly
- [ ] Language preference persists on reload
- [ ] No hardcoded English in critical paths (Today, lead detail, SMS, inventory pages)
- [ ] RTL layout foundation in place (optional for future languages)

---

## Strings Pending Translation (Post-Phase 1)

These strings can be extracted and translated in subsequent phases:

- Form labels ("Lead Name", "Phone", "Email", "Status")
- Help text and tooltips
- Admin-only copy
- Email templates (in addition to SMS templates)
- Landing page copy
- Legal documents (Terms, Privacy Policy)

Each category requires professional translation review before deployment.

---

## Integration Timeline

**Week 1–2:**
- Phase 1 infrastructure: ✓ Complete
- Professional translator engagement: In progress
- Phase 2 UI integration: Pending

**Week 3:**
- Spanish translation review and QA
- Update es.json with final translations
- Bilingual SMS/email testing

**Week 4:**
- Mobile testing (Spanish UI responsive at 375px)
- Integration testing (bilingual flows)
- Ready for DealerWyze GA

---

## Contact & Questions

For translation quality or language-specific issues:
- Verify with target audience (Spanish-speaking dealers in CA/TX/FL/AZ/NV)
- A/B test messaging if adoption is critical
- Document any culture-specific adjustments (e.g., date formats, currency symbols)

---

**Last Updated:** 2026-05-31  
**Status:** Phase 1 Complete - Awaiting Phase 2 Integration & Phase 3 Professional Translation
