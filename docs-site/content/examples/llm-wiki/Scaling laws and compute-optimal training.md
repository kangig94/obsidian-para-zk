---
title: "Scaling laws and compute-optimal training"
tags:
  - llm-wiki/ai
---
Scaling laws began as an empirical account of how next-token loss improves with parameters, tokens, and compute, then became a design discipline for allocating scarce training FLOPs, data quality, sparsity, infrastructure, and post-training exploration. Here, compute-optimal training means the full recipe that maximizes capability for a compute and deployment budget, not only the dense-model parameter/token ratio. It connects [[Pretraining and transfer learning|pretraining and transfer learning]], [[Mixture-of-Experts language models|Mixture-of-Experts language models]], and [[Reasoning with large language models|reasoning with large language models]].

## Empirical scaling laws
Kaplan et al. established the canonical empirical picture: cross-entropy loss follows smooth power laws in model size, dataset size, and optimized compute, with architecture details mattering less than scale within the studied range [^ydi7op]. Their compute-allocation result favored rapidly growing model size and comparatively slow growth in training tokens/steps (`N ~ C^0.73`, `D ~ C^0.27`), so the Kaplan-era recipe made the largest possible model attractive under a fixed training budget [^ydi7op].

GPT-3 operationalized this regime: eight model sizes from 125M to 175B parameters were trained on the same 300B-token budget, and validation loss continued a power-law trend across additional compute orders [^41h11n] [^41h11n]. This made scaling visible as a capability driver: larger models used in-context examples more effectively, and loss improvements broadly tracked downstream task gains, but the 175B/300B-token setup later became the central example of an undertrained dense model under Chinchilla-style accounting [^41h11n].

## Compute-optimal token/model tradeoff
Chinchilla revised the allocation rule by fitting many models across both parameter count and token count. Its headline conclusion is that, for compute-optimal dense transformers under the studied conditions, model size and training tokens should scale approximately equally: doubling parameters should be accompanied by roughly doubling tokens [^ctlo5d]. The practical result was stark: a 70B Chinchilla model trained on 1.4T tokens used the same training compute as 280B Gopher but outperformed it, implying lower inference and adaptation cost for the same or better quality [^ctlo5d].

The implication is not merely "use more data"; it is "make the data/model point match the budget." Chinchilla estimates put a compute-optimal 175B model near 4T+ tokens and a 280B model near 7T tokens, far above the 300B-token practice common in earlier large models [^ctlo5d]. It also made schedule and one-epoch assumptions part of compute optimality: cosine schedule length misestimation can hurt, and the token/model fit is only as good as the data distribution and repeat budget supporting it [^ctlo5d] [^ctlo5d].

## Predictable scaling for frontier models
Frontier programs turned scaling laws from retrospective curves into forecasting instruments. GPT-4 reports that final loss could be predicted by fitting a power law with an irreducible-loss term on smaller runs, with predictions made before the full run completed and using models trained with up to 1000x-10000x less compute [^96k5vb] [^96k5vb]. It also attempted capability prediction on HumanEval from models trained with up to 1000x less compute, while noting that some capabilities remain difficult because inverse-scaling or emergent behavior can create nonmonotonic curves [^96k5vb].

Llama 3 shows the same idea in an open foundation model family. Meta trained small scaling-law models across 6e18 to 1e22 FLOPs, fit IsoFLOP minima, and extrapolated to a 3.8e25-FLOP budget, predicting roughly 402B parameters and 16.55T tokens; the production 405B/15.6T-token model follows that estimate closely [^da4ps2]. It also used likelihood-to-accuracy mappings to forecast downstream benchmark performance before pretraining, linking scaling laws to model-family release planning in [[Open foundation model families|open foundation model families]].

## Data and curriculum scaling
Modern compute optimality treats data quality, mixture, ordering, and curriculum as scaling variables. Llama 3 describes data, scale, and managing complexity as its development levers: its final pretraining mix is roughly 50% general knowledge, 25% math/reasoning, 17% code, and 8% multilingual data, chosen with knowledge classification and scaling-law experiments rather than raw web volume alone [^da4ps2] [^da4ps2]. Its recipe also changes the data mix during training, performs long-context pretraining, and uses high-quality annealing data, so token count is embedded in a curriculum rather than a single static corpus [^da4ps2].

DeepSeek-V3 pushes this further through efficient MoE scaling: it trains 671B total parameters with only 37B active per token on 14.8T tokens, using DeepSeekMoE, auxiliary-loss-free load balancing, and no token dropping [^ucem6g] [^ucem6g]. Its training stack makes sparsity practically useful by overlapping pipeline and all-to-all communication, using FP8 mixed precision, and reducing the cost per trillion tokens to a reported 180K H800 GPU hours [^ucem6g] [^ucem6g]. This is why compute-optimal training now belongs as much to [[Efficient attention and training systems|efficient training systems]] as to loss-curve fitting.

Kimi K2 makes the data side explicit as token utility: with high-quality human data becoming scarce, it uses rephrasing of knowledge and math material to increase useful training signal without simple repetition, and reports better SimpleQA accuracy from diversified rephrasings than from repeated raw text [^0sdnoi]. Its MoE design uses a sparsity scaling law: at fixed active parameters and FLOPs, increasing total experts lowers training and validation loss; K2 chooses sparsity 48 as a performance/infrastructure tradeoff [^0sdnoi]. This links synthetic data, sparsity, and deployment constraints in [[Mixture-of-Experts language models|Mixture-of-Experts language models]].

## RL as an additional scaling axis
Kimi k1.5 frames reinforcement learning as a way to keep scaling after next-token pretraining becomes constrained by available data: the model learns by exploring with rewards rather than only imitating a static corpus [^aumm4n]. Its long-CoT setup treats additional context length as search budget: reasoning traces can include planning, reflection, error recovery, and alternative paths, approximating a planning process within the autoregressive context [^aumm4n]. Empirically, training accuracy and response length grow together, harder tasks induce longer responses, and the final run scales to a 128K context window [^aumm4n].

This makes RL compute optimality different from pretraining compute optimality. The objective must balance reward signal quality, exploration, rollout length, and inference cost. Kimi k1.5 uses curated verifiable prompts, long-CoT warmup, online-mirror-descent-style policy optimization without a value network, length penalties, curriculum/prioritized sampling, and partial rollouts so long trajectories do not dominate training throughput [^aumm4n] [^aumm4n] [^aumm4n]. Its ablations suggest that a smaller model can approach a larger model by spending more test-time/context budget, while larger models remain more token efficient and have a higher upper bound when context is also scaled [^aumm4n].

Kimi K2 extends this into agentic training. It combines large-scale tool-use trajectory synthesis, real execution sandboxes, verifiable reward gyms, and self-critique rubric rewards, turning interaction data and environment feedback into another axis of scale [^0sdnoi] [^0sdnoi] [^0sdnoi]. Its RL algorithm adds budget control, PTX loss, and temperature decay so gains from exploration do not collapse into uncontrolled verbosity or forgetting [^0sdnoi]. This connects scaling laws to [[Agentic and coding models|agentic and coding models]] and to [[Instruction tuning and alignment|instruction tuning and alignment]].

## Synthesis
The trajectory is Kaplan to Chinchilla to frontier scaling practice to data/MoE/RL scaling. Kaplan showed that loss is predictably scale-sensitive; Chinchilla corrected the dense-model allocation toward far more tokens; GPT-4 and Llama 3 used smaller runs to forecast frontier outcomes; DeepSeek-V3 and Kimi K2 make sparsity, systems, optimizer stability, and token utility part of compute optimality; Kimi k1.5 and K2 add reinforcement learning, long context, and environment interaction as new scaling axes. A current compute-optimal recipe is therefore a joint allocation across parameters, tokens, data quality, architecture sparsity, infrastructure, context length, and post-training exploration.

[^ydi7op]: [[Scaling Laws for Neural Language Models]]
[^41h11n]: [[Language Models are Few-Shot Learners]]
[^ctlo5d]: [[Training Compute-Optimal Large Language Models]]
[^96k5vb]: [[GPT-4 Technical Report]]
[^da4ps2]: [[The Llama 3 Herd of Models]]
[^ucem6g]: [[DeepSeek-V3 Technical Report]]
[^0sdnoi]: [[Kimi K2 - Open Agentic Intelligence]]
[^aumm4n]: [[Kimi k1.5 - Scaling Reinforcement Learning with LLMs]]
