---
title: "Open foundation model families"
tags:
  - llm-wiki/ai
---
Open foundation model families are best read as an ecosystem of release strategies, training recipes, and deployment constraints, not just a leaderboard category. The line from LLaMA to Qwen3-Coder-Next moves from dense public-data pretraining toward open-weight systems that combine long context, [[Mixture-of-Experts language models|Mixture-of-Experts language models]], distillation, reinforcement learning, safety layers, and executable agent training. That shift ties this page to [[Pretraining and transfer learning|pretraining and transfer learning]], [[Scaling laws and compute-optimal training|compute-optimal scaling]], [[Instruction tuning and alignment|instruction tuning and alignment]], [[Reasoning with large language models|reasoning with large language models]], [[Agentic and coding models|agentic and coding models]], and [[Efficient attention and training systems|efficient attention and training systems]].

## Open-weight foundation models

"Open" in these families usually means open weights and permissive or research-oriented release artifacts, not full reproducibility of the training run. LLaMA framed the category as research access to strong dense foundation models trained only on public data, with the explicit argument that smaller models trained longer can be more useful under inference-budget constraints than larger undertrained models [^llc32i]. Llama 2 widened that pattern by releasing base and chat models for research and commercial use, while also making post-training and safety work part of the model-family identity [^nqao1t].

Later open families make the release unit broader. A family now commonly includes base and instruction variants, model sizes with different active-parameter footprints, long-context variants, tool-use or safety companions, and detailed evaluation recipes. Mixtral made open sparse MoE practical enough to compare directly with much larger dense models [^x4qrai]; Qwen3 released dense and MoE variants across small-to-frontier scales with unified thinking and non-thinking modes [^7mxj2t]; DeepSeek, Kimi, GLM, and Qwen3-Coder-Next treat training systems, synthetic data generation, and agentic evaluation as first-class parts of the release story [^d13czi] [^47u75t] [^owbxf5] [^k9anlf].

This makes the open-model ecosystem less like a set of isolated checkpoints and more like a public competition over capability packaging: how much capability can be exposed under practical serving cost, how much of the alignment and evaluation stack is released, and whether the model can be adapted locally without relying on a closed API.

## LLaMA and Llama chat lineage

The original LLaMA family established the dense open-foundation baseline: 7B, 13B, 33B, and 65B Transformer models, trained on a public-data corpus with architecture updates such as RMSNorm, SwiGLU, and rotary position embeddings. Its core contribution was not only model quality, but the economic claim that inference-efficient models trained on more tokens could be preferable to larger models trained near the compute-optimal point for pretraining alone [^llc32i].

Llama 2 turned that foundation line into a public chat-model program. It scaled the pretraining corpus to 2T tokens, doubled context length to 4K, used grouped-query attention for larger models, and released 7B, 13B, and 70B pretrained and chat variants. Its chat models combined supervised fine-tuning, preference data, reward models, rejection sampling, PPO, red teaming, safety fine-tuning, and safety documentation, making [[Instruction tuning and alignment|instruction tuning and alignment]] part of the family definition rather than a downstream afterthought [^nqao1t].

Llama 3 and 3.1 then reframed the family as a herd of 8B, 70B, and 405B dense models covering multilingual use, coding, reasoning, long context, tool use, and safety tooling. The 405B model used a 15T-token multilingual corpus and dense Transformer architecture for training stability, while post-training used repeated SFT, rejection sampling, and DPO rounds; the release also tied the model family to Llama Guard, Prompt Guard, and Code Shield [^6lm7r3]. Compared with later MoE-heavy families, the Llama lineage is the dense-model anchor: it emphasizes stable scaling, broad generality, and safety infrastructure before specialized sparse efficiency.

## Qwen, DeepSeek, Kimi, GLM families

The post-Llama open-weight frontier is dominated by sparse activation, long context, and family-level specialization. Mixtral 8x7B was an early hinge point: each layer routes to two of eight feed-forward experts, giving roughly 47B total parameters but about 13B active parameters, with a 32K context and Apache 2.0 release. Its performance against Llama 2 70B and GPT-3.5 made [[Mixture-of-Experts language models|MoE]] an ecosystem strategy, not just an architecture experiment [^x4qrai].

DeepSeek-V3 pushed this line into full frontier-scale sparse training: 671B total parameters, 37B active parameters, 14.8T pretraining tokens, Multi-head Latent Attention, DeepSeekMoE, auxiliary-loss-free load balancing, multi-token prediction, 128K context, FP8 mixed precision, and DualPipe-style training systems. Its importance is that the model family blends algorithmic efficiency and distributed-systems efficiency; the reported capability depends as much on stable large-scale sparse training and serving as on benchmark tuning [^d13czi].

Qwen3 made breadth and controllability central. It spans six dense models and two MoE models, supports 119 languages and dialects, trains over 36T tokens, and exposes thinking and non-thinking modes in one model family. The family also uses strong-to-weak distillation so smaller models inherit capability from larger teachers at much lower GPU cost, reinforcing a pattern where family design includes teacher models, student models, and serving modes together [^7mxj2t].

Kimi K2 and GLM-4.5 shift the center of gravity toward agentic specialization. Kimi K2 is a trillion-parameter sparse model with 32B active parameters, MuonClip stabilization, large-scale tool-use data synthesis, real execution sandboxes, and reinforcement learning over long-horizon agent trajectories [^47u75t]. GLM-4.5 and GLM-4.5-Air package the same frontier around ARC: agentic, reasoning, and coding. They combine MoE architecture, 128K context, Muon optimization, expert-model iteration, reasoning RL, agentic RL, function-call templates, and executable GitHub or web-search environments [^owbxf5].

DeepSeek-V3.2 and Qwen3-Coder-Next show two complementary directions after large sparse models become common. DeepSeek-V3.2 adds DeepSeek Sparse Attention, mixed reasoning-agent RL, and large-scale agentic task synthesis to keep a very large open model competitive on reasoning and tool-use benchmarks [^e667ba]. Qwen3-Coder-Next instead asks how far a much smaller active footprint can go: an 80B total / 3B active hybrid MoE model trained for coding agents with 262K context, repository-level data, executable tasks, scaffold-diverse tool templates, and expert distillation [^k9anlf].

## Open reasoning and agent models

DeepSeek-R1 marks the cleanest transition from open chat models to open reasoning models. DeepSeek-R1-Zero applied reinforcement learning directly to DeepSeek-V3-Base without supervised fine-tuning and observed emergent long-chain reasoning behaviors such as reflection and self-verification; DeepSeek-R1 then added cold-start reasoning traces and multi-stage RL/SFT to improve readability and reduce language-mixing. Its distilled Qwen and Llama checkpoints also showed that [[Reasoning with large language models|reasoning behavior]] can be transferred into smaller open models more economically than training every target model with the same RL recipe [^w2yrgt].

That pattern spreads across later families. Qwen3 exposes thinking and non-thinking as a controllable mode in one family [^7mxj2t]; GLM-4.5 trains unified models from reasoning, agent, and general-chat experts [^owbxf5]; DeepSeek-V3.2 keeps thinking traces through tool interactions and mixes reasoning, agentic, and alignment RL in one post-training stage [^e667ba]. The open reasoning frontier is therefore not just longer chain-of-thought; it is the integration of reasoning mode control, distillation, reward design, and tool interaction.

Agentic open models take that one step further by making external execution part of the training signal. Kimi K2, GLM-4.5, DeepSeek-V3.2, and Qwen3-Coder-Next all synthesize verifiable tasks, build execution environments, and train on multi-step tool trajectories rather than only static instruction-response data [^47u75t] [^owbxf5] [^e667ba] [^k9anlf]. This is where [[Agentic and coding models|agentic and coding models]] and [[Instruction tuning and alignment|alignment]] converge: the model is judged not just by final text quality, but by whether it can call tools correctly, recover from failures, follow a scaffold's syntax, and complete work in an executable environment.

## Benchmark and release pattern shifts

The benchmark story changes across the family timeline. LLaMA and Llama 2 competed primarily on classic language, knowledge, reasoning, code, safety, and chat comparisons against GPT-3, Chinchilla, PaLM, and early chat models [^llc32i] [^nqao1t]. Mixtral added sparse-efficiency comparisons against Llama 2 70B and GPT-3.5, especially on math, code, and multilingual tasks [^x4qrai]. Llama 3, Qwen3, and DeepSeek-V3 broadened the reporting frame to multilingual, coding, long-context, safety, and tool-use dimensions [^6lm7r3] [^7mxj2t] [^d13czi].

The newest releases treat agentic benchmarks as ecosystem-defining. Kimi K2 reports SWE-bench, Tau2, ACEBench, and real tool-use results [^47u75t]; GLM-4.5 reports ARC-style averages across agentic, reasoning, and coding tasks [^owbxf5]; DeepSeek-V3.2 reports reasoning, search, tool, coding, and context-management benchmarks alongside special high-compute variants [^e667ba]; Qwen3-Coder-Next reports scaffold-specific SWE-Bench, Terminal-Bench, template-following, FIM, security, and long-horizon coding evaluations [^k9anlf].

This creates a useful but messy comparison space. Active parameters have become a headline metric, but serving memory, routing overhead, context length, generated-token cost, and test-time interaction count matter just as much. Open weights make local deployment and adaptation possible, but many families still depend on opaque synthetic data pipelines, internal teachers, private infrastructure, and benchmark-specific decontamination rules. The most meaningful open-model comparison therefore asks four questions together: what is released, what active compute is required, what training and post-training recipe produced the behavior, and which real workflow the evaluation actually measures.

[^llc32i]: [[LLaMA - Open and Efficient Foundation Language Models]]
[^nqao1t]: [[Llama 2 - Open Foundation and Fine-Tuned Chat Models]]
[^x4qrai]: [[Mixtral of Experts]]
[^7mxj2t]: [[Qwen3 Technical Report]]
[^d13czi]: [[DeepSeek-V3 Technical Report]]
[^47u75t]: [[Kimi K2 - Open Agentic Intelligence]]
[^owbxf5]: [[GLM-4.5 - Agentic, Reasoning, and Coding (ARC) Foundation Models]]
[^k9anlf]: [[Qwen3-Coder-Next Technical Report]]
[^6lm7r3]: [[The Llama 3 Herd of Models]]
[^e667ba]: [[DeepSeek-V3.2 - Pushing the Frontier of Open Large Language Models]]
[^w2yrgt]: [[DeepSeek-R1 - Incentivizing Reasoning Capability in LLMs via Reinforcement Learning]]
