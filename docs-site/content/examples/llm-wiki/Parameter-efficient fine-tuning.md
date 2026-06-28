---
title: "Parameter-efficient fine-tuning"
tags:
  - llm-wiki/ai
---
Parameter-efficient fine-tuning is the adaptation layer between large-scale [[Pretraining and transfer learning|pretraining and transfer learning]] and application-specific behavior. Instead of updating every parameter in a [[Transformer architecture|Transformer]] checkpoint, it freezes most of the base model and trains a small set of task-specific parameters. The practical effect is operational: one expensive base model can support many small adapters, making [[Open foundation model families|open foundation model families]] locally customizable without repeating pretraining or storing a full checkpoint per task. [^wrk3mu] [^gzs2hm]

## Low-rank adaptation

LoRA treats fine-tuning as a constrained weight update. For a frozen matrix $W_0$, it learns a low-rank update $\Delta W = BA$, where $B \in \mathbb{R}^{d \times r}$ and $A \in \mathbb{R}^{r \times k}$ with $r \ll \min(d,k)$, then adds that update in parallel to the original projection. Only the low-rank matrices are trained; the pretrained weight stays fixed. [^wrk3mu]

This matters because the low-rank update can be merged into the base weight for inference as $W = W_0 + BA$. That avoids the extra sequential layers of classic adapters, so LoRA can keep the latency profile of full fine-tuning while storing only small per-task modules. [^wrk3mu]

LoRA's empirical lesson is that many downstream adaptations appear low-rank relative to the pretrained model. In the paper's GPT-scale experiments, adapting attention projections such as $W_q$ and $W_v$ with small ranks was competitive with much larger updates, and the learned update appears to amplify task-relevant directions already latent in the pretrained weights. [^wrk3mu]

## Quantized fine-tuning

QLoRA combines LoRA with low-bit base-model storage. It stores the pretrained model in 4-bit NormalFloat, dequantizes weights to BF16 for forward and backward computation, and backpropagates through the frozen quantized model into trainable LoRA adapters. [^hny0pi]

The key additions are NF4 for normally distributed pretrained weights, double quantization to reduce the overhead of quantization constants, and paged optimizers to handle transient memory spikes. In the paper's framing, this moved 65B-parameter fine-tuning from a multi-hundred-GB memory requirement to a single 48GB GPU while preserving the quality of 16-bit LoRA or full fine-tuning in the evaluated settings. [^hny0pi]

QLoRA also changed the practical LoRA recipe. The paper found that query/value-only LoRA was not always enough to match full fine-tuning on LLaMA models; applying LoRA across all linear transformer-block layers mattered more than aggressively minimizing adapter count, because the quantized base model and activations dominated memory more than the LoRA parameters themselves. [^hny0pi]

## Memory and optimizer tradeoffs

Parameter efficiency reduces trainable state, gradient state, optimizer state, and checkpoint storage, but those savings are not identical. LoRA reduces trainable parameters and lets many task modules share one base checkpoint; the LoRA paper reports GPT-3-scale examples where adapter checkpoints shrink from hundreds of GB to tens of MB and training memory falls because most optimizer states are unnecessary. [^wrk3mu]

QLoRA exposes the next bottleneck: once adapter weights are tiny, base-model representation, activation gradients, sequence length, and optimizer spikes become dominant. Its memory design combines quantized base storage, gradient checkpointing, broad adapter placement, and paged optimizers rather than treating adapter parameter count as the only objective. [^hny0pi] This connects PEFT to [[Efficient attention and training systems|efficient attention and training systems]], because usable adaptation depends on memory movement and runtime behavior as much as on parameter count.

There is also a serving tradeoff. If LoRA weights are merged into the base matrix, a single task can run with no extra inference latency; if many tasks must be served together with different adapters per request, batching and adapter swapping become more complicated. [^wrk3mu] Llama 3's FP8 inference work is a separate example of quantization as deployment optimization rather than adaptation: it reduces inference cost for the served model, while QLoRA uses quantization to make training adapters feasible. [^gykulg]

## Role in open model customization

Open model families make PEFT strategically important. Llama 2 released base and chat checkpoints while emphasizing that deployment still requires application-specific safety testing and tuning; the expensive part shifts from training a base model to adapting and validating it for a concrete use case. [^gzs2hm]

Llama 3 shows the same pattern at larger scale. Its post-training stack uses SFT, rejection sampling, and DPO across capabilities such as coding, reasoning, long context, multilinguality, tool use, safety, and response quality. [^gykulg] That belongs with [[Instruction tuning and alignment|instruction tuning and alignment]], but PEFT supplies a narrower and cheaper lever when the goal is task or domain adaptation rather than full behavior shaping.

The Llama 3 multimodal experiments show a related adapter pattern, though not always a tiny one: visual recognition is added by composing a pretrained image encoder with the language model through cross-attention layers, image SFT keeps the language-model weights frozen, and video training freezes everything except video-specific components. [^gykulg] The principle is modular backbone preservation: keep the expensive language model stable, then learn a bridge or adapter for a new capability. This links PEFT to [[Multimodal foundation models|multimodal foundation models]] and [[Agentic and coding models|agentic and coding models]] without making it a substitute for broader post-training.

A practical open-model workflow is therefore: choose a pretrained base, use instruction/alignment methods when the target behavior changes, use LoRA or QLoRA-style adapters when full fine-tuning is too expensive, and reserve full continued training for cases that need broad new capabilities or domain knowledge. [^hny0pi] [^gzs2hm]

[^wrk3mu]: [[LoRA - Low-Rank Adaptation of Large Language Models]]
[^gzs2hm]: [[Llama 2 - Open Foundation and Fine-Tuned Chat Models]]
[^hny0pi]: [[QLoRA - Efficient Finetuning of Quantized LLMs]]
[^gykulg]: [[The Llama 3 Herd of Models]]
