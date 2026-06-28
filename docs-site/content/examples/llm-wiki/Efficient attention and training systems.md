---
title: "Efficient attention and training systems"
tags:
  - llm-wiki/ai
---
Efficient attention and training systems are the implementation layer where model architecture, memory hierarchy, precision, routing, optimizer dynamics, and rollout infrastructure are co-designed. In the papers here, the central pattern is not "smaller model wins"; it is to keep the expensive surface narrow, preserve stability with explicit constraints, and spend saved compute on longer context or more agentic data. This makes the topic a bridge between [[Transformer architecture|Transformer architecture]], [[Mixture-of-Experts language models|Mixture-of-Experts language models]], [[Post-Transformer sequence models|Post-Transformer sequence models]], and [[Agentic and coding models|Agentic and coding models]].

## IO-aware exact attention

FlashAttention treats exact attention as an IO problem rather than only a FLOP problem. Standard attention materializes the full attention matrix in high-bandwidth memory; FlashAttention tiles Q, K, and V through SRAM, maintains online softmax statistics, and recomputes intermediate attention values in backward, reducing HBM traffic while returning exact attention outputs. [^z86jjk] The practical lesson is that extra arithmetic can be a good trade when it avoids writing and rereading the quadratic attention matrix: the paper reports large attention-runtime and memory-footprint reductions, including linear memory growth in sequence length. [^z86jjk]

Block-sparse FlashAttention keeps the same IO-aware framing but introduces a sparsity factor in the attention pattern. [^z86jjk] This is the bridge to later long-context systems: sparsity is useful only when the kernel and memory schedule preserve the savings, not merely when the mathematical attention graph is sparse.

## Latent/sparse attention in MoE systems

DeepSeek-V3 moves attention efficiency into the model interface with Multi-head Latent Attention (MLA): keys and values are represented through a compressed latent state plus a decoupled RoPE key, so inference caches the compact latent representation rather than full per-head KV tensors; query compression also reduces training activation memory. [^529spt] In a large [[Mixture-of-Experts language models|MoE]] model, this matters because routing already creates communication pressure, so attention state must not dominate the serving path.

DeepSeek-V3.2 then pushes from latent attention toward sparse attention with DeepSeek Sparse Attention (DSA). DSA uses a lightweight indexer to choose top-k KV entries and computes attention over the selected set; the core attention path drops from quadratic length cost to an `O(Lk)` selected-token path, while the indexer is trained through dense warm-up and sparse continued pretraining to preserve long-context behavior. [^2b1med] Kimi K2 keeps MLA but makes a different efficiency choice: it uses 64 attention heads instead of the 128-head DeepSeek-V3 design because the larger head count gave only small validation gains while substantially increasing long-context inference FLOPs. [^lq7yyu]

## Optimizer and training stability mechanisms

Systems efficiency has to include optimizer stability because a run that spikes, rolls back, or needs conservative precision loses its hardware gains. DeepSeek-V3 combines FP8 mixed precision with fine-grained activation/weight quantization, higher precision for sensitive modules such as embeddings, norms, gates, and attention, and BF16 optimizer moments with FP32 master weights/gradients; the report frames this as part of a stable 14.8T-token pretraining run without irrecoverable loss spikes. [^529spt]

Kimi K2 targets a different failure mode: Muon improves token efficiency, but at trillion-parameter scale it can cause attention-logit explosion. MuonClip adds QK-Clip after the optimizer update, rescaling Q/K projection weights per head when the maximum attention logit exceeds a threshold; the method is adapted to MLA because fully normalized keys are not materialized in the same way as standard attention. [^lq7yyu] DeepSeek-V3.2 extends stability into large-scale RL for MoE models with mechanisms such as Keep Routing, Keep Sampling Mask, and off-policy negative sequence masking, preserving the sampled routing/action constraints during optimization. [^2b1med]

## Residual stream and connection topology

mHC treats the residual stream as another systems surface. Hyper-Connections widen and rewire the residual stream, but unconstrained connection matrices break identity mapping, cause signal amplification or attenuation, and add memory-access overhead. [^af0ghj] Manifold-Constrained Hyper-Connections project the residual connection space onto a doubly stochastic manifold using Sinkhorn-Knopp normalization, so each residual mixing map is a convex combination and compositions stay bounded. [^af0ghj]

The point is not only mathematical stability. mHC's implementation uses kernel fusion, mixed precision, activation recomputation, and pipeline overlap to keep the wider residual topology from becoming an I/O wall; the paper reports only modest runtime overhead for a multi-stream setting while avoiding the instability seen in unconstrained Hyper-Connections. [^af0ghj] This keeps the mechanism as a connection-topology section inside efficient systems, rather than a separate architectural family.

## Efficiency under active-parameter constraints

The MoE papers show that active parameters, total parameters, and communication have to be budgeted separately. DeepSeek-V3 uses 671B total parameters with 37B activated per token, fine-grained and shared experts, auxiliary-loss-free load balancing, node-limited routing, DualPipe overlap, topology-aware all-to-all kernels, and FP8 training to make a very large MoE trainable and serveable. [^529spt] Kimi K2 scales total capacity to roughly 1T parameters while activating about 32B, uses 384 experts with 8 active, and argues that at fixed active compute, increasing sparsity can lower loss; its training stack chooses interleaved pipeline schedules, activation recomputation/offload, and FP8 activation storage rather than simply copying DeepSeek's DualPipe memory trade-off. [^lq7yyu]

Qwen3-Coder-Next is the stricter active-parameter case: an 80B total model with only 3B active parameters per forward pass, aimed at local and production coding-agent deployment. Its efficiency story is not only MoE inference; it compensates for small active compute with long-context repository training, best-fit packing to avoid context fragmentation, diversified tool-call templates, large-scale executable task synthesis, and execution-feedback RL. [^huy198] The resulting lesson for [[Agentic and coding models|agentic and coding models]] is that under tight active-parameter constraints, data/infrastructure scale becomes part of the systems budget: environment throughput, verifier quality, rollout length, and tool-format reliability are as important as attention kernels.

A useful synthesis is to view efficient training as constrained surface design. FlashAttention constrains memory traffic, MLA/DSA constrain KV state and selected tokens, MoE constrains active experts, MuonClip and mHC constrain unstable transformations, and Qwen-style agentic training constrains active compute by spending effort on verifiable data and execution infrastructure. [^z86jjk] [^529spt] [^2b1med] [^af0ghj] [^lq7yyu] [^huy198]

[^z86jjk]: [[FlashAttention - Fast and Memory-Efficient Exact Attention with IO-Awareness]]
[^529spt]: [[DeepSeek-V3 Technical Report]]
[^2b1med]: [[DeepSeek-V3.2 - Pushing the Frontier of Open Large Language Models]]
[^lq7yyu]: [[Kimi K2 - Open Agentic Intelligence]]
[^af0ghj]: [[mHC - Manifold-Constrained Hyper-Connections]]
[^huy198]: [[Qwen3-Coder-Next Technical Report]]
