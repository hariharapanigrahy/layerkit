---
name: layerkit-author-processor
description: Author email/phone/time processors from vendor docs with mandatory citations.
---

# layerkit-author-processor

Processors are agent-authored. Proposal `sources[]` required.

```bash
layerkit proposal validate ./proc.json
layerkit proposal apply ./proc.json
```

Point vendor map field rows at `processorId`. Java implementation via `layerkit-generate-java`.
