---
title: "Retrieval-augmented language models"
tags:
  - llm-wiki/ai
---
Retrieval-augmented language models add an explicit memory path to the usual Transformer language-model lineage. Instead of forcing all usable knowledge into weights through [[Pretraining and transfer learning|pretraining and transfer learning]], they let a model condition on retrieved passages, chunks, or documents at inference or fine-tuning time. This makes retrieval an alternative pressure valve to raw parameter scaling in [[Scaling laws and compute-optimal training|scaling laws and compute-optimal training]]: the system can spend storage and lookup over an external corpus rather than only increasing model size, training tokens, or context length. [^fepsew] [^zjwdwp]

## Parametric vs non-parametric memory

In RAG, the parametric memory is the generator's neural weights, while the non-parametric memory is a dense vector index of Wikipedia passages accessed by a neural retriever. The paper makes this division explicit: a BART seq2seq Transformer supplies generation parameters, DPR retrieves top-k latent documents, and the answer distribution marginalizes over those documents. [^fepsew] This connects retrieval directly to [[Transformer architecture|Transformer architecture]]: the generator remains a standard pre-trained Transformer, but its input is expanded by an inspected and replaceable evidence channel.

The practical advantage is not just accuracy. Non-parametric memory can be updated, audited, or removed without changing the model weights. RAG demonstrates this with index hot-swapping across Wikipedia snapshots, while RETRO generalizes the idea into a semi-parametric language model that queries a massive text database during language modeling. [^fepsew] [^zjwdwp] The tradeoff is that retrieval turns memory into an exposed systems component: corpus quality, freshness, privacy, and nearest-neighbour behavior become part of model behavior rather than hidden pretraining details.

## RAG for knowledge-intensive tasks

RAG is designed for tasks where a human would normally consult an external source: open-domain QA, abstractive QA, fact verification, and precise factual generation. Its retriever returns a truncated distribution over documents, and its generator conditions on the input plus retrieved passage. RAG-Sequence assumes one retrieved document supports the whole output sequence; RAG-Token allows different retrieved documents to support different output tokens. [^fepsew]

This design competes with both closed-book generation and retrieve-and-extract pipelines. On open-domain QA, RAG outperformed parametric-only seq2seq baselines and did not require a separate extractive reader or re-ranker; on generation tasks, it produced more factual, specific, and diverse outputs than BART baselines. [^fepsew] The mechanism is strongest when retrieval matters to the loss: learned dense retrieval improved most tasks, BM25 remained competitive for entity-centric FEVER, and the appendix notes retrieval collapse on tasks where the generator can learn to ignore unhelpful documents. [^fepsew]

The RAG result is therefore a middle point in the LLM lineage. It keeps the broad transfer behavior of pre-trained seq2seq models, but shifts factual grounding into a retrievable evidence layer. That makes it a natural ancestor of assistant designs that combine [[Instruction tuning and alignment|instruction tuning and alignment]] with external context rather than relying only on memorized facts.

## Retrieval-enhanced pretraining and RETRO

RETRO moves retrieval earlier: retrieval is not merely added for downstream QA, but used while modeling arbitrary text sequences. The input is split into fixed-size chunks, each chunk retrieves nearest-neighbour chunks from a key-value database using frozen BERT embeddings, and a retrieval encoder plus chunked cross-attention injects neighbour chunks and their continuations into the autoregressive decoder. [^zjwdwp]

This architecture is a scaling argument as much as a modeling trick. RETRO reports comparable performance to much larger systems on language-modeling benchmarks while using far fewer parameters, and shows that performance improves as the retrieval database grows from billions toward trillions of tokens and as evaluation-time neighbour count increases up to a useful range. [^zjwdwp] It also supports retrofitting: a baseline Transformer can be frozen while newly initialized retrieval encoder and cross-attention weights are trained, preserving retrieval-off behavior while gaining retrieval-on performance. [^zjwdwp]

The cost is systems complexity. Token-level kNN language models do not scale cleanly to trillion-token stores, so RETRO retrieves at chunk granularity and uses approximate nearest-neighbour infrastructure. The paper also stresses evaluation leakage: retrieval can improve genuinely novel chunks by surfacing related facts, but it can also copy leaked training text when evaluation data overlaps the retrieval database. [^zjwdwp] This places RETRO between [[Efficient attention and training systems|efficient attention and training systems]] and retrieval-augmented modeling: its memory path changes both model quality and evaluation methodology.

## Modern role in tool and assistant systems

GPT-4 shows the other side of the lineage: a frontier assistant can be a large multimodal Transformer pre-trained for next-token prediction and post-trained for alignment, yet still hallucinate, have a limited context window, lack most post-cutoff knowledge, and not learn from experience. [^c77z9m] Retrieval is the standard system-level answer to those limitations: attach external context at inference time, keep sources inspectable, and update knowledge by editing an index rather than retraining the model. This is an inference from the RAG and RETRO mechanisms combined with GPT-4's stated limitations. [^fepsew] [^zjwdwp] [^c77z9m]

In [[Agentic and coding models|agentic and coding models]], retrieval behaves like a tool boundary: the model decides or is given what to consult, then reasons over the returned context. That makes retrieval complementary to [[Open foundation model families|open foundation model families]], where a general model can be specialized or kept current through indexes, documentation corpora, codebases, or private notes without changing its base weights. The same boundary also creates risks: stale or biased corpora can ground the model badly, private corpora can be copied too directly, and users may over-trust sourced-looking outputs unless the system preserves provenance and evaluation discipline. [^zjwdwp] [^c77z9m]

[^fepsew]: [[Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks]]
[^zjwdwp]: [[Improving language models by retrieving from trillions of tokens]]
[^c77z9m]: [[GPT-4 Technical Report]]
