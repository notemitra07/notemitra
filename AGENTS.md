# NoteMitra AI Agent Guidelines (AGENTS.md)

Welcome, Agent! You are working on the NoteMitra project. NoteMitra is a student notes-sharing platform designed for sharing and discovering academic notes.

To avoid context amnesia, prevent duplicate implementations, and reduce token waste, this project uses **Project Brain** — a persistent memory and intelligence layer.

## Mandatory Workflow

### 1. Before Every Task
Before performing any research, code analysis, or implementation, you MUST read the following files in the [brain/](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain) directory:
1. [master-memory.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/master-memory.md) (Architecture summary, key decisions, important patterns)
2. [architecture.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/architecture.md) (Detailed structure of client, server, and DB)
3. [patterns.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/patterns.md) (Code style and implementation standards)
4. [decisions.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/decisions.md) (Historical architecture decisions)

### 2. During the Task
- Adhere strictly to the design and implementation patterns recorded in [patterns.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/patterns.md).
- Do not duplicate functionality. Check [feature-map.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/feature-map.md) to see where features are mapped.
- Avoid repeating mistakes cataloged in [mistakes.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/mistakes.md).

### 3. After Every Task
You are responsible for the project's learning loop. If you introduced new patterns, made design decisions, fixed recurring bugs, or changed the roadmap, update:
- [patterns.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/patterns.md) (If new code styles/conventions are approved)
- [decisions.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/decisions.md) (If new tools/packages/methods are adopted)
- [mistakes.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/mistakes.md) (If you encountered and resolved a tricky bug)
- [master-memory.md](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain/master-memory.md) (If any core architectural details have changed)

---

## Directory Structure Overview
- [client/](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/client): Next.js frontend application.
- [server/](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/server): Node.js Express backend.
- [brain/](file:///c:/Users/pavan/OneDrive/Desktop/UXI_Works/NoteMitra_MIC_website/brain): Persistent intelligence layer files.
