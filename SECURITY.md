# Security Policy

Layerkit is an agent-first workbench for updating customer-owned integration code. It should never persist raw production secrets, vendor tokens, or customer data.

## Supported Versions

Security fixes target the latest npm release line. Upgrade to the newest `layerkit` version before reporting behavior that may already be patched.

## Report a Vulnerability

Do not open public GitHub issues for vulnerabilities that expose secrets or private customer code. Email the maintainer listed on the npm package, or open a private security advisory in GitHub if you have repository access.

## Threat Model

Layerkit handles:

- local project metadata under `.layerkit`
- agent memory notes
- vendor map/proposal JSON
- generated agent instructions installed into IDE or coding-agent folders

Layerkit must not:

- store raw API keys, passwords, private keys, or bearer tokens
- treat vendor fixture data as official package truth
- write production integration source from deterministic CLI inference
- apply paths outside the intended project/module root
- silently overwrite user config (unless `--user-config` is passed)
- overwrite non-packaged user skill directories
- fetch skill content from the network (skills come only from the installed npm package)

Packaged `layerkit-*` skills are refreshed from the installed package on `layerkit install`. That package is the supply-chain boundary (install via npm with a pinned version). Prefer editing skills upstream rather than local copies of packaged skill names.

Security gates include secret redaction in memory, doctor secret scans, package hygiene checks, and hallucination/placeholders blocking during proposal apply.
