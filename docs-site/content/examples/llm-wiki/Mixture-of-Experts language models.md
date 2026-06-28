---
title: "Mixture-of-Experts language models"
tags:
  - llm-wiki/ai
---
Mixture-of-Experts (MoE) language models scale a Transformer by replacing some or all dense feed-forward blocks with several expert FFNs and a router that activates only a small subset per token. This makes the model's capacity closer to its total parameter count while its per-token compute is closer to the activated-parameter count, which is why recent [[Open foundation model families|open foundation model families]] can advertise hundreds of billions or over a trillion total parameters while serving each token through tens of billions of active parameters. [^95aev5] The tradeoff is that MoE shifts difficulty into routing, load balance, expert-parallel communication, memory residency, and training/inference consistency, so it belongs as much to [[Efficient attention and training systems|efficient attention and training systems]] as to [[Transformer architecture|Transformer architecture]].

## Sparse expert routing

In the common sparse-FFN design, the router scores experts for each token and applies a top-k selection; only selected experts compute, and their outputs are combined with gating weights. Mixtral is the clean baseline: each Transformer FFN is replaced by 8 SwiGLU experts, and each token is routed to 2 experts at each layer. [^95aev5] DeepSeekMoE generalizes this with 1 shared expert plus many routed experts, sigmoid affinity scores, normalized top-k gating, and token/node limits for communication. [^msw347]

Routing is not just semantic dispatch. Mixtral's routing analysis found little broad domain specialization and more evidence for syntactic and positional locality; consecutive tokens often reuse experts more than random assignment would predict. [^95aev5] DeepSeek-V3 instead emphasizes that batch-wise load balance can allow more domain specialization than strict sequence-wise balance, while still requiring safeguards against collapse. [^msw347] This makes routing a learned systems interface: it decides both which parameters are used and how tokens move through expert-parallel hardware.

## Activated vs total parameters

MoE economics depend on separating total parameters from activated parameters. Mixtral 8x7B exposes about 47B total parameters but activates about 13B per token, which let it compete with much larger dense baselines on many benchmarks while using fewer active parameters. [^95aev5] DeepSeek-V3 scales this pattern to 671B total and 37B active parameters, with 256 routed experts per MoE layer and 8 routed experts active per token. [^msw347] Kimi K2 pushes total capacity above 1T while keeping roughly 32B active parameters by increasing expert sparsity to 384 experts with 8 active, and reports that, at fixed activated compute, higher sparsity lowered train and validation loss in its scaling studies. [^cvolcb]

The active-parameter count is the better first approximation for per-token compute, but it is not the whole serving cost. Memory residency is closer to total/sparse parameters, and MoE introduces dispatch, combine, routing, and expert-parallel load-balance overheads. Mixtral explicitly notes that batching improves arithmetic intensity, while DeepSeek-V3 and Kimi K2 devote substantial system design to all-to-all overlap, expert parallelism, redundant experts, FP8 activation movement, recomputation, and activation offload. [^95aev5] [^msw347] [^cvolcb] These tradeoffs connect MoE scaling to [[Scaling laws and compute-optimal training|scaling laws and compute-optimal training]] rather than making parameter count alone the comparison axis.

## MoE training stability and routing balance

The central failure mode is that the router can overload some experts while starving others. DeepSeek-V3 treats this as both a quality and systems problem: imbalance can cause routing collapse and makes expert-parallel hardware inefficient. Its auxiliary-loss-free strategy adds a per-expert routing bias only for top-k selection, increases the bias for underloaded experts, decreases it for overloaded experts, and keeps the gate values tied to the original affinity scores. [^msw347] A tiny sequence-wise auxiliary loss is retained only to avoid extreme imbalance inside individual sequences, and no token dropping is needed when balance is effective. [^msw347]

Stability also extends beyond the router. DeepSeek-V3's FP8 system keeps sensitive components such as MoE gating in higher precision, and its appendix reports that block-wise quantization of activation gradients caused divergence in a 16B MoE experiment. [^msw347] Kimi K2 highlights a different instability: Muon training can produce exploding attention logits, so QK-Clip rescales query/key weights per head when the maximum attention logit exceeds a threshold; in K2, QK-Clip was active early and then deactivated after attention logits stabilized. [^cvolcb] DeepSeek-V3.2 adds a post-training-specific MoE concern: if rollout inference and training choose different experts for the same tokens, the active parameter subspace shifts abruptly. Its Keep Routing operation preserves sampled expert routing paths during training and is described as crucial for MoE RL stability. [^yz6r59]

## MoE in open frontier models

The open frontier has converged on MoE as a way to scale capability without dense-model per-token compute. Mixtral established an open-weight sparse MoE reference point with 8 experts and 2 active experts. [^95aev5] DeepSeek-V3 then combined 671B/37B MoE scale with MLA, FP8 training, DualPipe, load-balanced expert routing, and no-token-drop training. [^msw347] Kimi K2 uses a 1T/32B ultra-sparse MoE backbone to support agentic post-training, choosing higher expert sparsity and fewer attention heads to balance performance and long-context inference cost. [^cvolcb] GLM-4.5 takes a more depth-heavy MoE design: 355B total, 32B active, 160 total experts, 8 active experts, 89 MoE layers, loss-free balance routing, QK-Norm, and an MoE MTP layer. [^hkqll6]

By DeepSeek-V3.2, the MoE backbone is only one part of a larger efficiency stack: the model lineage keeps sparse expert computation while adding DeepSeek Sparse Attention, mixed RL, specialist distillation, and agentic task synthesis. [^yz6r59] For current open systems, MoE is therefore best read as a capacity-and-systems pattern that connects architecture, training infrastructure, and post-training for [[Agentic and coding models|agentic and coding models]] and [[Reasoning with large language models|reasoning models]], not as a standalone layer trick.

[^95aev5]: [[Mixtral of Experts]]
[^msw347]: [[DeepSeek-V3 Technical Report]]
[^cvolcb]: [[Kimi K2 - Open Agentic Intelligence]]
[^yz6r59]: [[DeepSeek-V3.2 - Pushing the Frontier of Open Large Language Models]]
[^hkqll6]: [[GLM-4.5 - Agentic, Reasoning, and Coding (ARC) Foundation Models]]
