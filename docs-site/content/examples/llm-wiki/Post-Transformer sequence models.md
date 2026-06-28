---
title: "Post-Transformer sequence models"
tags:
  - llm-wiki/ai
---
Post-Transformer sequence models are attempts to keep the practical strengths of the [[Transformer architecture|Transformer architecture]] -- parallel training, scaling behavior, dense token mixing, and in-context use -- while changing the sequence mixer so long-context training and autoregressive decoding are cheaper. The important comparison is not against a naive attention implementation only: IO-aware exact attention such as FlashAttention made standard attention much harder to beat in wall-clock terms, so post-Transformer designs have to win both on algorithmic state size and on accelerator mapping. [^glwrh4]

## Long-context and linear-time motivation

The recurring bottleneck is the cost of representing history. Standard attention avoids compressing history: training uses pairwise token interactions and autoregressive decoding keeps a KV cache that grows with context. This is expressive, but the implementation can become dominated by GPU memory traffic, not just FLOPs. FlashAttention shows this directly by computing exact attention in tiles, keeping softmax running statistics, and recomputing block-level attention in backward so the full score/probability matrices do not have to be written to HBM. It preserves exact attention semantics while using linear extra memory and substantially fewer HBM accesses than standard attention implementations. [^glwrh4]

Retentive and state-space alternatives take the opposite bet: compress the prefix into a recurrent state, then make that compression expressive enough for language. If the recurrent state is good, decoding can be constant cost per step and training can be linear or chunk-linear in sequence length. If the state is too small or too static, the model loses the content-addressable retrieval behavior that makes attention strong. Mamba frames this as a context-compression problem: efficient models must keep a finite state, but effective models must selectively preserve the right information and ignore the rest. [^gkncfb]

This makes the area a three-way tradeoff between model quality, recurrent state capacity, and hardware efficiency. RetNet emphasizes a retention mechanism with parallel, recurrent, and chunkwise recurrent forms; Mamba emphasizes input-dependent selective state updates; Mamba-2/SSD emphasizes a duality that lets SSM-like models use attention-like matrix-multiply kernels. [^d7xheb] [^gkncfb] [^91s4gh]

## Retentive networks

RetNet replaces multi-head self-attention with multi-scale retention. Its key move is to derive a retention operator that has three equivalent computation modes: a parallel form for GPU training, a recurrent form for autoregressive inference with $O(1)$ per-step state, and a chunkwise recurrent form for long sequences where local chunks are processed in parallel while cross-chunk information is summarized recurrently. [^d7xheb]

Mechanistically, retention removes the softmax attention normalization and adds an exponential decay mask over past positions. Multi-scale retention gives different heads different decay rates, then uses gating and GroupNorm to stabilize the multi-head outputs. In RetNet's own comparison, this aims at the "impossible triangle" of Transformer-like training parallelism, recurrent-style low-cost inference, and competitive language-model quality. [^d7xheb]

The useful reading of RetNet in this page is as a bridge, not just an isolated architecture. From the attention side, it looks like structured masked attention with an exponential decay mask. From the recurrence side, it looks like a high-dimensional recurrent state whose update can be evaluated in parallel or chunkwise. The later SSD/Mamba-2 framework makes this connection explicit by placing RetNet-style decay masks inside the broader family of structured masked attention and semiseparable SSMs. [^91s4gh]

RetNet also shows why the link to [[Efficient attention and training systems|efficient attention and training systems]] matters: the paper reports training and inference benefits relative to Transformers and FlashAttention baselines, but also leaves room for further kernel fusion. The architecture claim and the systems claim are intertwined. [^d7xheb]

## Selective state-space models

Mamba starts from structured state-space models (SSMs), which can be computed as recurrences or convolutions when their dynamics are linear time-invariant. The problem is that time-invariant SSMs are efficient but weak at content-based reasoning on dense discrete data such as text. Mamba's main change is selectivity: make parameters such as `Delta`, `B`, and `C` functions of the input so the model can choose what to write into state, what to forget, and what to expose at each timestep. [^gkncfb]

This selectivity turns an SSM from a static convolution-like sequence mixer into a time-varying recurrent system. It helps with variable spacing, filtering irrelevant context, and resetting state at sequence boundaries. The `Delta` parameter acts like a generalized gate: large values can reset/focus on the current token, while small values can preserve prior state and ignore a transient input. [^gkncfb]

The cost is that input-dependent dynamics break the old convolution shortcut. Mamba therefore relies on a hardware-aware selective scan: it avoids materializing the expanded `(B,L,D,N)` state in HBM, computes recurrent pieces in faster memory, uses parallel scan, and recomputes intermediate states in backward. This is the same broad lesson as FlashAttention, applied to SSMs: an asymptotically attractive recurrence still needs an IO-aware implementation to become a usable foundation-model backbone. [^gkncfb] [^glwrh4]

Architecturally, Mamba folds the sequence mixer and MLP-like gated block into a homogeneous attention-free block. Empirically, the paper reports strong language, audio, and genomics results, improved generation throughput over similar-size Transformers, and better use of very long contexts in domains where irrelevant history can be filtered. The limitation is also clear: because the state is finite, associative recall and in-context retrieval depend heavily on state size and the quality of the selection mechanism. [^gkncfb]

## State-space duality with attention

Mamba-2 reframes the split between attention and SSMs through structured state-space duality (SSD). The central observation is that an SSM sequence transformation can be written as multiplication by a semiseparable matrix, where the SSM state dimension corresponds to the rank/order of that structured matrix. This gives SSMs both a linear recurrent form and a quadratic matrix form. [^91s4gh]

From the attention side, the same paper generalizes linear attention into structured masked attention: attention is a four-way contraction over queries, keys, values, and a structured mask. If the mask is a 1-semiseparable matrix, the attention-like quadratic form and the SSM-like recurrent form become dual computations of the same object. In this view, linear attention is the special case where the mask is the causal cumulative-sum matrix, RetNet is a decay-mask case, and SSD uses input-dependent semiseparable masks. [^91s4gh]

The practical payoff is the SSD algorithm. Instead of computing the whole sequence purely as a scan or purely as quadratic attention, it block-decomposes the semiseparable matrix: diagonal chunks use the attention-like quadratic form, while off-diagonal interactions are handled through low-rank state passing. This keeps the state-size advantage of SSMs while making the dominant work matrix multiplications that modern accelerators handle well. [^91s4gh]

Mamba-2 then changes the block around the SSD layer to be more Transformer-system-friendly: produce `A`, `B`, `C`, and `X` projections in parallel, add an extra normalization before the output projection, and define SSM head patterns analogous to multi-head, multi-query, and multi-value attention. The paper reports that SSD is faster than the earlier Mamba selective scan and competitive with optimized attention kernels at longer sequence lengths, but it also finds that a small number of attention layers mixed into SSD models can outperform pure Mamba-2 or pure Transformer++ at the same scale. [^91s4gh]

The resulting map is that post-Transformer sequence models are not simply “attention replacements.” They are a family of ways to compress, gate, and compute history: RetNet uses decay-structured retention, Mamba uses input-selective SSM state updates, Mamba-2/SSD shows when those recurrences are attention-like structured matrices, and FlashAttention keeps the Transformer baseline strong by making exact attention far more IO-efficient. [^d7xheb] [^gkncfb] [^91s4gh] [^glwrh4]

[^glwrh4]: [[FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness]]
[^gkncfb]: [[Mamba - Linear-Time Sequence Modeling with Selective State Spaces]]
[^d7xheb]: [[Retentive Network - A Successor to Transformer for Large Language Models]]
[^91s4gh]: [[Transformers are SSMs - Generalized Models and Efficient Algorithms Through Structured State Space Duality]]
