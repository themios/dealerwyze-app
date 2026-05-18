# System Architecture

## Architectural Philosophy

Event-driven multi-tenant SaaS platform.

## Recommended Stack

Frontend:
- Next.js
- TypeScript
- Tailwind
- Zustand or Redux
- Recharts

Backend:
- Supabase/Postgres
- Node.js services
- Queue workers
- WebSockets
- Redis

AI:
- OpenAI
- Gemini
- vector memory layer

Infrastructure:
- Vercel
- Docker
- Cloudflare
- AWS Lambda for media rendering

## Core Services

- Auth Service
- Tenant Service
- Lead Service
- Communication Service
- Inventory Service
- AI Orchestrator
- Agent Service
- Analytics Service
- Notification Service
- Billing Service

## Event Bus

Core events:
- LeadCreated
- MessageReceived
- VehicleUpdated
- CampaignPublished
- AgentTaskCompleted
- PaymentMissed

## Queue Architecture

Queues:
- AI processing
- notifications
- rendering
- campaign publishing
- imports
- webhooks

## Realtime System

WebSocket-based realtime infrastructure:
- mission feed
- notifications
- live KPIs
- agent status

## Multi-Tenant Isolation

Requirements:
- strict RLS
- isolated vector memory
- isolated integrations
- tenant-scoped API access
- audit boundaries