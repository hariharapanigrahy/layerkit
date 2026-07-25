---
name: layerkit-research-vendor
description: Read primary vendor documentation and draft a Layerkit vendor_map proposal with sources (agent knowledge work).
---

# layerkit-research-vendor

You create the integration knowledge. Core ships empty maps.

1. `layerkit map show <vendor>` — open skeleton
2. Open every `documentation[].url`
3. Draft proposal JSON with `sources: [{title,url,excerpt}]`
4. `layerkit proposal validate ./proposal.json`
5. Ask human before `layerkit proposal apply ./proposal.json`

Forbidden: inventing hash/phone rules without excerpts from docs.
