---
name: model-selector
description: "Use to evaluate and select the optimal LLM (provider and model) for a given task or project. Centralizes the model-selection logic across multiple projects."
category: pattern
triggers: model selection, model choice, llm provider, cost optimization, dynamic routing
---

# 🎯 Model Selector Skill

This skill provides a centralized, cross-project logic for selecting the "Best Fit" LLM based on task requirements, availability, and cost.

## ⚡ Unified Model Tiers (April 2026)

| Tier | Use Case | Recommended Model | Provider |
|------|----------|-------------------|----------|
| **Fast / Flash** | Tool use, routing, categorization, simple chat. | `gemini-3-flash` | Google |
| **Intelligent / Pro** | Complex reasoning, coding, repair advice, creative writing. | `gemini-3-pro` | Google |
| **Legacy / Ultra-Stable** | High-volume legacy compatibility. | `gpt-4o` | OpenAI |
| **Reasoning-Heavy**| Multi-step planning, deep research. | `claude-3-5-sonnet`| Anthropic |

## 🏗️ Implementation Guidelines

### 1. Environment Variables
Every project using this skill should adopt the following standard environment naming:
- `LLM_PROVIDER`: The primary provider (e.g., `google`).
- `LLM_MODEL`: The specific model ID (e.g., `gemini-3-flash`).

### 2. Factory Pattern
Projects should implement a central `getChatModel()` factory rather than hardcoding instantiations.

```typescript
// Example Implementation
function getChatModel() {
  const provider = process.env.LLM_PROVIDER || 'google';
  const model = process.env.LLM_MODEL || 'gemini-3-flash';
  
  // Implementation logic for Google, OpenAI, etc.
}
```

## 🔄 Self-Updating Logic (Roadmap)
The long-term goal for this skill is to become **self-updating**. 
- **Auditor Mode**: The skill can be invoked to audit a project's `LLM_MODEL` setting against the latest benchmarks (e.g., from LMSYS) and suggest an upgrade.
- **Dynamic Switcher**: Middleware that routes "low complexity" prompts to Flash and "high complexity" prompts to Pro automatically.

## 🔗 Cross-Project Sync
Link this skill into projects like:
- **Obed**: Household manager (Routing: Flash, Tasks: Pro)
- **Librarian**: Ingestion (Fast: Flash)
- **Travel Agent**: Planning (Pro/Sonnet)
