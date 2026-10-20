# Celino protocol architecture

## Objective

Celino allows an external agent to use a narrowly defined capability derived from private knowledge without receiving the underlying source. The owner keeps custody, defines the disclosure boundary, and may revoke the capability.

## Trust boundaries

### Intent Envelope

The caller declares the task, accepted output schema, expiry, budget and required attestation. Anything outside that envelope is invalid by construction.

### Broker

The Broker matches the envelope against public Capability Cards. It removes caller context that is unnecessary for execution and cannot read the private source.

### Guardian

The Guardian compiles owner policy, screens inputs for extraction attempts, filters proposed outputs, and accounts for cumulative inference across related requests.

### Vault Cell

The Vault Cell executes in the data owner's environment. The source is mounted for the duration and scope of the call, never returned to the caller, and inaccessible to the Broker.

### Proof Capsule

A capsule commits to:

- the bounded intent digest;
- the owner-policy digest;
- the capability version;
- execution and output integrity;
- settlement eligibility.

It explicitly excludes raw source material, credentials, hidden prompts and persistent memory.

## Capability Card

```text
capability "private-code-risk" {
  accepts     = ["text/code", "sha256"]
  returns     = ["verdict", "category", "confidence", "proof"]
  source      = sealed("vault://owner/security-corpus")
  disclosure  = deny(["rules", "samples", "memory", "credentials"])
  budget      = compose(window: "24h", limit: 0.72)
  settlement  = after(valid_output && valid_proof)
}
```

Capability Cards are public. Sources are not.

## Privacy budget

An individually safe answer can contribute to unsafe disclosure when combined with earlier answers. Celino therefore evaluates correlated query volume, output detail, source overlap and time window. Policy may progressively mask rare fields, reduce precision, rate-limit or reject a request.

## Capability liquidity

The liquid object is a temporary right to ask a bounded question. It is not ownership of the source and does not grant general access. This distinction allows private knowledge to provide useful work while remaining under owner custody.

## Settlement principle

Payment follows valid work: accepted envelope, policy-compliant execution, valid output and valid proof. An idle cell has no automatic claim on fees. Rejected, unverifiable or policy-breaking executions do not settle.
