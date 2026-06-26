---
id: distributed-ledger-5c8e0a93
name: "Distributed ledger"
keywords: [evidence-custody, fault-codes, chain-of-custody, defect-classification, ISO-21434]
discoveries: 2
finds_screened: 13
created: 2026-06-23T00:00:00.000Z
updated: 2026-06-23T00:00:00.000Z
---

# Distributed ledger

Domain memory for how autonomy moves liability evidence from human testimony to cryptographic custody — machine-readable fault codes, provenance logs, and chain-of-custody as the new proof of fault.

## Load-bearing facts

### Machine-readable fault codes make defect classification verifiable, not arguable

SAE J3161 standardizes automotive fault codes into machine-readable defect maps, which turns "what failed and when" from a contested testimony problem into a provenance problem — the same shift IBM Food Trust demonstrated when verifiable provenance logs cut dispute latency ~95%. Once defect classification is cryptographically anchored, liability attaches to a record instead of a reconstruction.
_Grounded: SAE J3161 fault-code standardization · IBM Food Trust provenance dispute-latency (−95%)_ ^verifiable-defects

### Split-at-ingestion custody is what makes the evidence admissible

Chain-of-custody, not raw data, is the binding constraint for using telemetry as liability proof. ISO/SAE 21434 custody requirements plus NHTSA EDR access logs show the model: split and anchor the data at ingestion so no single party can alter it, and the custody architecture becomes the liability-proof architecture.
_Grounded: ISO/SAE 21434 custody requirements · NHTSA EDR access-log precedent_ ^split-custody
