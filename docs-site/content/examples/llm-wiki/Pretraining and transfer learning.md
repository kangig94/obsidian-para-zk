---
title: "Pretraining and transfer learning"
tags:
  - llm-wiki/ai
---
Pretraining and transfer learning is the line of work that turned NLP from task-specific supervised systems into general foundation models. The core move is to train a high-capacity [[Transformer architecture|Transformer architecture]] on broad self-supervised text, then adapt the same model by supervised fine-tuning, natural-language prompting, or post-training alignment. Across GPT-1, GPT-2, BERT, T5, GPT-3, and the LLaMA family, the transfer interface keeps moving closer to ordinary language while the recipe shifts toward larger data mixtures, longer context, and open foundation-model release practices. [^xzmmbe] [^gq4ktm] [^8jm9ju] [^1bnxb1] [^bgsxq1] [^u9n3ut] [^98y7v8] [^8bqwwe]

## Generative pretraining

GPT-1 made the modern two-stage recipe explicit: pretrain a Transformer decoder with a next-token language-model objective on unlabeled text, then fine-tune the full model on supervised downstream tasks with small task heads and task-aware input formatting. This made transfer less about frozen feature extraction and more about initializing an entire reusable model, with ablations showing large losses when pretraining was removed. [^xzmmbe]

GPT-2 pushed the same decoder-only objective toward unsupervised multitask learning. Instead of training a separate supervised head per dataset, it evaluated WebText-trained language models by expressing tasks as natural text continuations for question answering, translation, summarization, and reading comprehension. This made model capacity, corpus breadth, and prompt wording central to transfer, linking pretraining directly to [[Scaling laws and compute-optimal training|scaling laws and compute-optimal training]]. [^gq4ktm]

GPT-3 converted this into a scale-first foundation-model paradigm. A 175B-parameter autoregressive model was evaluated without gradient updates on each task: the task definition, zero or more examples, and the query were placed in the context window, and the model completed the answer. Few-shot performance improved especially strongly with model size, suggesting that very large language models can treat in-context examples as a transient task specification. [^bgsxq1]

## Zero-shot and few-shot transfer

The transfer interface evolves from supervised fine-tuning to prompting. GPT-1 still required task-specific supervised fine-tuning, but its language-model pretraining already produced useful zero-shot behavior on some heuristically prompted tasks. [^xzmmbe] GPT-2 made zero-shot prompting the primary evaluation style, using natural-language cues and task formats rather than task heads. [^gq4ktm] GPT-3 then separated zero-shot, one-shot, and few-shot settings and showed that in-context examples could often replace dataset-specific optimization, especially for language modeling, closed-book question answering, translation into English, and synthetic reasoning. [^bgsxq1]

This does not make fine-tuning obsolete. Instead, it changes what fine-tuning is for. T5 showed that pretraining plus full supervised fine-tuning remained very strong when every task was cast into text-to-text form. [^1bnxb1] Llama 2 and Llama 3 use post-training to turn a pretrained base model into a safer, more useful assistant through supervised fine-tuning, preference modeling, RLHF or DPO, rejection sampling, and targeted data for code, multilinguality, reasoning, long context, tool use, and factuality; that belongs with [[Instruction tuning and alignment|instruction tuning and alignment]]. [^98y7v8] [^8bqwwe]

## Bidirectional and text-to-text objectives

BERT showed that pretraining did not have to be generative-only. Its masked language modeling objective trains a bidirectional Transformer encoder to recover masked WordPieces, paired with a next-sentence prediction task and a uniform input format for sentence pairs. The result is a pretrained encoder that can be fine-tuned with a small output layer for classification, entailment, and extractive question answering, and its ablations show the value of bidirectionality and sentence-pair pretraining for several NLU tasks. [^8jm9ju]

T5 unified the objective and interface from another direction: every NLP task becomes text-to-text, with task prefixes specifying the requested transformation and an encoder-decoder Transformer trained with a denoising objective on C4. This made pretraining experiments directly comparable across architectures, objectives, data mixes, multitask learning, and scale, and it made transfer feel like conditional generation rather than task-specific classification plumbing. [^1bnxb1]

Together, BERT and T5 establish that pretraining is not one objective. Decoder-only next-token prediction is strongest for open-ended generation and prompting; bidirectional masked objectives are strong for representation-heavy understanding; text-to-text denoising gives a uniform supervised and generative interface. Later foundation models mostly standardize on decoder-only generation for chat and tool use, but the BERT/T5 branch remains the conceptual basis for many encoder, encoder-decoder, and [[Parameter-efficient fine-tuning|parameter-efficient fine-tuning]] workflows. [^8jm9ju] [^1bnxb1]

## Open-weight pretraining recipes

The LLaMA papers turn pretraining from a closed scaling result into a reproducible open-weight recipe. LLaMA-1 emphasized public-data-only training, Chinchilla-inspired allocation of more tokens to smaller models, and inference-efficient dense Transformers with RMSNorm, SwiGLU, RoPE, BPE tokenization, AdamW, efficient attention, and model/sequence parallelism. Its 13B model outperforming GPT-3 on many benchmarks made smaller but better trained models central to open foundation models. [^u9n3ut]

Llama 2 expanded the recipe to 2T tokens, 4k context, grouped-query attention for larger models, stronger public-data cleaning, and a paired release of base and chat models. Its contribution is not only pretraining scale but the transparent coupling of base-model pretraining with open alignment data processes: high-quality supervised fine-tuning, preference comparisons, separate helpfulness and safety reward models, rejection sampling, PPO, safety tuning, red teaming, and model-card style reporting. [^98y7v8]

Llama 3 scales that pattern again: a dense 405B-parameter Transformer trained on about 15.6T tokens with 128K-token long-context continuation, a 128K-token vocabulary, GQA, document masks, RoPE at a higher base frequency, 4D parallelism across up to 16K H100 GPUs, and post-training via supervised fine-tuning, rejection sampling, DPO, model averaging, and targeted synthetic and human data. Its data mix explicitly allocates large portions to general knowledge, math and reasoning, code, and multilingual tokens, making open-weight pretraining a data-engineering and systems problem as much as a modeling problem. [^8bqwwe]

This open-weight line connects directly to [[Open foundation model families|open foundation model families]] and [[Efficient attention and training systems|efficient attention and training systems]]: the artifact is not just a checkpoint, but a recipe for data filtering, scaling-law planning, long-context extension, inference optimization, evaluation, safety systems, and responsible release. [^u9n3ut] [^98y7v8] [^8bqwwe]

## Evaluation shift from task fine-tuning to prompting

The evaluation story tracks the transfer story. GPT-1 is judged by fine-tuning on supervised NLP benchmarks. [^xzmmbe] GPT-2 and GPT-3 make zero-shot and few-shot prompting the object of study, while also surfacing contamination and memorization as major evaluation concerns. [^gq4ktm] [^bgsxq1] BERT and T5 retain task fine-tuning but make the pretrained model the common substrate across benchmarks. [^8jm9ju] [^1bnxb1]

The LLaMA family broadens evaluation from whether transfer works to what kind of general-purpose system the model becomes. LLaMA-1 follows GPT-3-style zero-shot and few-shot academic benchmarks. [^u9n3ut] Llama 2 adds human preference, safety, false-refusal, toxicity, truthfulness, red-team, and chat usability evaluation. [^98y7v8] Llama 3 adds large-scale benchmark suites for pretrained and post-trained models, long-context retrieval, multilingual tasks, tool use, human comparisons against frontier systems, safety uplift studies, and early multimodal experiments, connecting this page to [[Reasoning with large language models|reasoning with large language models]], [[Retrieval-augmented language models|retrieval-augmented language models]], [[Agentic and coding models|agentic and coding models]], and [[Multimodal foundation models|multimodal foundation models]]. [^8bqwwe]

The conceptual endpoint is that pretraining becomes the durable investment, while transfer becomes a spectrum of interfaces: full fine-tuning, lightweight adaptation, instruction tuning, preference optimization, retrieval or tool augmentation, and in-context prompting. The strongest systems are no longer evaluated only as models trained for a benchmark, but as reusable foundations whose behavior depends on data, scale, post-training, prompt context, tool environment, and safety scaffolding. [^1bnxb1] [^bgsxq1] [^98y7v8] [^8bqwwe]

[^xzmmbe]: [[Improving Language Understanding by Generative Pre-Training]]
[^gq4ktm]: [[Language Models are Unsupervised Multitask Learners]]
[^8jm9ju]: [[BERT - Pre-training of Deep Bidirectional Transformers for Language Understanding]]
[^1bnxb1]: [[Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer]]
[^bgsxq1]: [[Language Models are Few-Shot Learners]]
[^u9n3ut]: [[LLaMA - Open and Efficient Foundation Language Models]]
[^98y7v8]: [[Llama 2 - Open Foundation and Fine-Tuned Chat Models]]
[^8bqwwe]: [[The Llama 3 Herd of Models]]
