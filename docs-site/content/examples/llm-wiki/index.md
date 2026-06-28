---
title: "LLM-Wiki Example (AI)"
tags:
  - llm-wiki/ai
---
> [!example] Example LLM-Wiki
> An auto-generated PARA-ZK LLM-Wiki built from public AI papers. The wiki pages are the original, distributable derivative; the cited [[sources/index|sources]] are metadata-only stubs (the papers' full text is **not** redistributed — read each original at its link).

This hub maps the imported Transformer-to-LLM lineage as one system rather than a list of papers. The spine runs from a reusable attention substrate, through pretraining and scaling, into alignment and reasoning, then outward into efficient sparse systems, multimodal/open model families, and agentic coding workflows. The recurring question is where capability should live: in weights, retrieved context, adapters, routing capacity, explicit reasoning traces, tool environments, or release-time safety scaffolding.

## Architecture and Transfer Substrate

[[Transformer architecture|Transformer architecture]] is the common block-level substrate: encoder, decoder, encoder-decoder, patch-token, contrastive, and multimodal variants all change masks, tokenization, objectives, and interfaces around stacked attention and feed-forward layers.

[[Pretraining and transfer learning|Pretraining and transfer learning]] explains how that substrate became reusable: GPT-style next-token models, BERT-style bidirectional encoders, T5 text-to-text models, and LLaMA-style open recipes move task behavior from bespoke supervised systems into broadly pretrained foundations.

Together, these pages define the base grammar of the area. Architecture supplies the sequence interface; pretraining supplies reusable capability; transfer methods decide whether a task is handled by fine-tuning, prompting, post-training, retrieval, or adapters.

## Scaling, Memory, and Adaptation

[[Scaling laws and compute-optimal training|Scaling laws and compute-optimal training]] is the planning layer for capability: it traces the shift from smooth loss-vs-scale laws to Chinchilla-style token/model allocation, frontier forecasting, data mixture design, sparse scaling, and RL/post-training compute as additional axes.

[[Retrieval-augmented language models|Retrieval-augmented language models]] add non-parametric memory to the lineage, making knowledge update, provenance, and corpus quality explicit system components instead of forcing all useful facts into model weights.

[[Parameter-efficient fine-tuning|Parameter-efficient fine-tuning]] is the lightweight adaptation path: LoRA, QLoRA, and related adapter patterns keep the expensive base model stable while training small task, domain, or modality-specific modules.

These three pages form a practical budget triangle. More pretraining scale can improve the base model, retrieval can externalize volatile knowledge, and PEFT can localize adaptation. Real systems usually mix all three because each spends a different resource: training FLOPs, storage/index quality, or adapter and validation effort.

## Alignment and Reasoning

[[Instruction tuning and alignment|Instruction tuning and alignment]] is the behavior-shaping layer that turns a pretrained model into a useful assistant through demonstrations, preference data, reward models, DPO/RLHF, safety tuning, chat templates, tool protocols, and deployment controls.

[[Reasoning with large language models|Reasoning with large language models]] tracks the move from chain-of-thought prompting into trained reasoning policies, long-CoT RL, distillation, and controllable thinking/non-thinking modes.

The relationship is tight: alignment defines what behavior is desired and how it should be exposed to users; reasoning controls how much inference-time or post-training compute the model spends to reach that behavior. Modern open models increasingly treat reasoning mode, refusal behavior, tool use, and response format as one combined post-training contract.

## Efficiency, Sparsity, and Alternative Sequence Models

[[Efficient attention and training systems|Efficient attention and training systems]] is the implementation layer: FlashAttention, latent/sparse attention, optimizer stability, residual topology, FP8 training, rollout infrastructure, and active-parameter constraints decide whether the modeling recipe can actually run.

[[Mixture-of-Experts language models|Mixture-of-Experts language models]] scale capacity by activating only selected experts per token, trading dense simplicity for routing, load balance, communication, memory residency, and training/inference consistency.

[[Post-Transformer sequence models|Post-Transformer sequence models]] explore cheaper sequence mixers such as retention and selective state-space models while keeping the Transformer-era requirements of parallel training, strong long-context behavior, and accelerator-friendly kernels.

These pages are best read together. Efficient attention keeps the Transformer baseline difficult to beat; MoE expands capacity without dense per-token cost; post-Transformer designs ask whether history can be compressed without losing attention-like retrieval behavior. The shared tension is between expressive token interaction and the hardware cost of long context.

## Open and Multimodal Foundation Families

[[Open foundation model families|Open foundation model families]] is the ecosystem view: LLaMA, Mixtral, Qwen, DeepSeek, Kimi, GLM, and coding-focused families package weights, model sizes, context lengths, safety layers, alignment recipes, active-parameter footprints, and evaluation protocols as release units.

[[Multimodal foundation models|Multimodal foundation models]] extend the same foundation-model recipe beyond text through ViT-style image tokenization, CLIP-style language-image alignment, GPT-4-style visual prompting, Llama-style cross-attention adapters, and vision-language reasoning/evaluation.

Open model families make the tradeoffs visible because they expose multiple checkpoints, modes, licenses, and serving assumptions. Multimodality shows that the Transformer lineage is not limited to text: the same questions about tokenization, scale, post-training, reasoning, and evaluation reappear when pixels, video, OCR, charts, and documents enter the interface.

## Agentic and Coding Frontier

[[Agentic and coding models|Agentic and coding models]] is the current workflow frontier. It joins reasoning, alignment, tool execution, retrieval-like external context, code environments, unit tests, verifiers, and scaffold-specific protocols into trainable multi-step behavior.

This page depends on nearly every other child. Agents need [[Reasoning with large language models|reasoning]] to plan and recover, [[Instruction tuning and alignment|alignment]] to follow tool protocols and safety constraints, [[Efficient attention and training systems|efficient systems]] to support long rollouts, [[Mixture-of-Experts language models|MoE]] or other sparse designs to keep active compute manageable, and [[Open foundation model families|open model families]] to turn those capabilities into deployable artifacts.

## Key Tensions

The imported area has several recurring tensions:

- Dense stability versus sparse capacity: dense models remain simpler to train and serve, while MoE families scale total capacity by accepting routing and communication complexity.
- Parametric knowledge versus external memory: pretraining stores broad capability in weights, while retrieval and tools expose updateable but failure-prone external context.
- Long reasoning versus efficient serving: long-CoT and agent trajectories improve hard tasks, but latency, token cost, and context management force distillation, thinking budgets, and mode control.
- Open release versus full reproducibility: open weights improve local adaptation and inspection, but many recipes still depend on private data filters, synthetic pipelines, teachers, and infrastructure.
- Attention expressivity versus sequence-length cost: exact attention remains powerful, efficient kernels extend its life, and post-Transformer models compete by compressing history without losing retrieval-like behavior.

The useful reading order is therefore not chronological only. Start with [[Transformer architecture|Transformer architecture]] and [[Pretraining and transfer learning|pretraining]], then move through [[Scaling laws and compute-optimal training|scaling]], [[Instruction tuning and alignment|alignment]], and [[Reasoning with large language models|reasoning]]. From there, branch into [[Efficient attention and training systems|systems efficiency]], [[Mixture-of-Experts language models|MoE]], [[Post-Transformer sequence models|post-Transformer alternatives]], [[Retrieval-augmented language models|retrieval]], [[Parameter-efficient fine-tuning|PEFT]], [[Multimodal foundation models|multimodality]], [[Open foundation model families|open families]], and finally [[Agentic and coding models|agentic/coding models]], where the earlier layers converge into executable workflows.
