# Schema Design

## Core Entities

- Tenant
- User
- Lead
- Vehicle
- Campaign
- MissionEvent
- AgentTask
- Conversation
- Payment
- Appointment

## MissionEvent Schema

Fields:
- id
- tenantId
- type
- severity
- source
- actor
- entityType
- entityId
- summary
- aiSummary
- metadata
- createdAt

## AgentTask Schema

Fields:
- id
- tenantId
- agentType
- status
- confidence
- input
- output
- logs
- approvalStatus
- createdAt

## Audit Requirements

All critical actions must log:
- actor
- timestamp
- before state
- after state
- approval chain