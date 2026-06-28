---
title: "Reasoning with large language models"
tags:
  - llm-wiki/ai
---
Reasoning with large language models has moved from an inference-time prompting trick to a post-training and deployment discipline. The lineage starts with prompts that ask a sufficiently large model to externalize intermediate steps, then shifts to reinforcement-learning pipelines that train models to spend, compress, or suppress reasoning compute depending on the task. This connects directly to [[Scaling laws and compute-optimal training|scaling laws and compute-optimal training]], [[Instruction tuning and alignment|instruction tuning and alignment]], [[Agentic and coding models|agentic and coding models]], and [[Open foundation model families|open foundation model families]].

## Chain-of-thought prompting

Chain-of-thought prompting inserts natural-language intermediate steps between a problem and its answer. In the original few-shot setup, examples are triples of input, reasoning trace, and output; the method improves arithmetic, commonsense, and symbolic reasoning most when the model is sufficiently large and the baseline scaling curve is flat. [^dbm7ta] GPT-4 helped turn this into a standard evaluation pattern: its report uses 5-shot CoT for GSM8K and shows broad gains across exams and benchmarks, while still treating reasoning errors and hallucinations as central limitations. [^ei81wd]

The important lesson is that CoT is useful as a working trace, not as proof that the model computed faithfully. The CoT paper reports fluent but wrong traces, missing steps, and symbol-mapping errors; its ablations also show that equation-only traces, extra tokens alone, or reasoning after the answer do not explain the full effect. [^dbm7ta] That makes CoT a bridge between latent capability and later training recipes rather than a complete account of reasoning.

## Reasoning-oriented RL

Reasoning-oriented reinforcement learning changes the question from "can the model be prompted to think?" to "can the model learn policies that allocate reasoning effort and recover from mistakes?" DeepSeek-R1-Zero is the clean example: starting from DeepSeek-V3-Base, it uses GRPO with rule-based accuracy and format rewards, no initial SFT, and a required thinking/answer format; the resulting behavior includes longer CoT, self-verification, reflection, and an observed re-evaluation or "aha" pattern. [^ua29bk]

Later systems make this recipe operational. DeepSeek-R1 adds cold-start long-CoT data, reasoning RL, rejection-sampled SFT, and general RL to improve readability, reduce language mixing, and preserve non-reasoning behavior. [^ua29bk] Kimi k1.5 treats long context as a scaling axis for RL, arguing that longer autoregressive traces can approximate planning and search in context without explicit MCTS, value functions, or process reward models. [^aitdqr] GLM-4.5 extends reasoning RL into agentic and coding settings, where compute scales through interaction turns with tools and environments as well as through longer generated traces. [^o66zi7] DeepSeek-V3.2 further frames stable GRPO, off-policy masking, MoE routing consistency, and scaled post-training compute as infrastructure for reasoning rather than isolated benchmark tuning. [^rm2uhc]

## Long-CoT and short-CoT distillation

Long-CoT improves hard task performance but creates latency and token-cost pressure. Kimi k1.5 frames this as a long2short problem: train or select strong long-CoT behavior, then transfer it into shorter responses through length penalties, shortest rejection sampling, DPO, model merging, or long2short RL. [^aitdqr] DeepSeek-R1 similarly shows that distilling 800k reasoning samples from a stronger teacher into smaller dense Qwen/Llama models can outperform trying to rediscover the same behavior through RL on a smaller base model. [^ua29bk]

This makes distillation a practical bridge between reasoning capability and deployment economics. Qwen3 uses strong-to-weak distillation so smaller models inherit reasoning control without repeating the full flagship post-training recipe, and reports better efficiency from teacher-logit distillation. [^3bguvt] DeepSeek-V3.2 uses specialist distillation across mathematics, programming, logical reasoning, general agentic tasks, agentic coding, and agentic search, then merges reasoning, agent, and human-alignment training into a mixed RL stage. [^rm2uhc]

## Hybrid thinking/non-thinking modes

A reasoning model is not useful if every request pays the cost of deliberation. Qwen3 explicitly fuses thinking and non-thinking modes in one model, exposes `/think` and `/no_think` chat controls, and supports a thinking-budget mechanism that halts reasoning at a user-defined threshold before producing the final answer. [^3bguvt] GLM-4.5 follows a similar hybrid pattern by distilling reasoning, agent, and general-chat expert models into one generalist that can produce deliberative or direct responses depending on task demands. [^o66zi7]

This design is especially important for [[Agentic and coding models|agentic and coding models]]. DeepSeek-V3.2 keeps historical reasoning content across tool-result messages but discards it when a new user message arrives, preserving tool calls and outputs; the paper reports that this reduces redundant re-reasoning in tool-use loops while still requiring context management when trajectories grow too long. [^rm2uhc] Its non-thinking agent evaluations remain competitive but generally trail thinking mode, which makes the mode boundary a deployment tradeoff rather than a simple preference. [^rm2uhc]

## Reasoning as an open-model frontier

The open-model frontier has shifted from releasing general chat models to releasing families that combine [[Mixture-of-Experts language models|MoE efficiency]], long context, reasoning RL, distillation, controllable inference-time compute, and agentic training data. DeepSeek-R1, Kimi k1.5, Qwen3, GLM-4.5, and DeepSeek-V3.2 all position reasoning as a system-level capability built from pretraining data, verifiable tasks, post-training recipes, infrastructure, and deployment controls. [^ua29bk] [^aitdqr] [^3bguvt] [^o66zi7] [^rm2uhc]

DeepSeek-V3.2 is the clearest frontier statement: it adds DeepSeek Sparse Attention for cheaper long-context operation, scales post-training compute beyond 10% of pretraining cost, synthesizes large agentic task environments, and reports that the high-compute Speciale variant gains substantially by relaxing length constraints, though token efficiency remains a limitation versus frontier closed models. [^rm2uhc] The practical split is therefore stable: CoT prompting remains a cheap way to elicit latent reasoning, but frontier open models increasingly train the policy to decide when to think, how long to think, how to use tools, and how to compress that behavior into efficient serving modes. [^dbm7ta] [^rm2uhc]

[^dbm7ta]: [[Chain-of-Thought Prompting Elicits Reasoning in Large Language Models]]
[^ei81wd]: [[GPT-4 Technical Report]]
[^ua29bk]: [[DeepSeek-R1 - Incentivizing Reasoning Capability in LLMs via Reinforcement Learning]]
[^aitdqr]: [[Kimi k1.5 - Scaling Reinforcement Learning with LLMs]]
[^o66zi7]: [[GLM-4.5 - Agentic, Reasoning, and Coding (ARC) Foundation Models]]
[^rm2uhc]: [[DeepSeek-V3.2 - Pushing the Frontier of Open Large Language Models]]
[^3bguvt]: [[Qwen3 Technical Report]]
