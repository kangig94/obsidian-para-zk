---
type: permanent
maturity: evergreen
---

# The Compounding Model of Learning: Deposits and Depreciation

In one line: **learning is a compounding asset, and net growth rate = learning rate − forgetting rate. The real lever is controlling depreciation (forgetting), not deposits (study volume).**

## Why "1% a day" is a lie

The compounding intuition ("1% a day → 37x a year") hides an assumption: that you never forget. Learning runs
depreciation — forgetting — every day alongside the deposits, so perceived growth puts the **difference**
between deposits and depreciation in the exponent.

## The model

Let achievement be an asset `A`. A day's change is roughly:

```
A(t+1) = A(t) · (1 + r_learn − r_forget)
```

- `r_learn`: the share added that day (study volume, comprehension)
- `r_forget`: the share lost that day (forgetting rate)

If `r_learn > r_forget` it compounds; otherwise it stalls or decays. The key point: **both compound** —
forgetting also drains in proportion to what remains, so left alone it leaks geometrically.

## Implication: cut the depreciation

Most people fixate on `r_learn` (study more, study longer), which hits diminishing returns fast. But
`r_forget` can be lowered directly through review spacing (Ebbinghaus, spaced repetition), buying more net
growth from the same resources. **Stop the leak before pouring in more water.**

## Limits

Treating `r_forget` as constant is a simplification. Real forgetting drops nonlinearly with review count and
spacing, and links between notes (this very note network) lower it — i.e. a Zettelkasten's links are
themselves a defense against depreciation.

## Related

- Origin: [[Compounding learning — forgetting as depreciation (refined)]]
- Next questions: a nonlinear model of the forgetting rate; link density vs. retrieval strength
