---
title: "Transformer architecture"
tags:
  - llm-wiki/ai
---
Transformer architecture is the reusable pattern behind modern foundation models: embed a sequence of tokens, patches, or modality features; run stacked attention and feed-forward blocks; then adapt the attention mask, objective, and output interface. The same substrate supports [[Pretraining and transfer learning|pretraining and transfer learning]], [[Scaling laws and compute-optimal training|scaling]], [[Multimodal foundation models|multimodal transfer]], and [[Open foundation model families|open model families]].

## Self-attention and encoder-decoder design

The original Transformer made attention, rather than recurrence or convolution, the sequence modeling primitive. Its encoder-decoder stack uses multi-head scaled dot-product self-attention plus position-wise feed-forward layers, residual connections, layer norm, and positional encodings; the decoder adds masked self-attention and encoder-decoder cross-attention so generation can condition on prior target tokens and encoded source tokens. [^8jx7u8] The key architectural tradeoff is parallelism and short dependency paths at the price of quadratic self-attention over sequence length, which later work either scaled directly or optimized in [[Efficient attention and training systems|efficient attention and training systems]]. [^8jx7u8]

## Decoder-only GPT lineage

GPT-1 selected the Transformer decoder as a reusable language-model backbone: causal self-attention, learned positions, BPE tokenization, next-token pretraining, then supervised fine-tuning by serializing each downstream task into a text sequence with minimal task-specific heads. [^mgmxdt] GPT-2 kept that causal decoder interface but scaled it across WebText and model sizes, making natural-language context act as task specification; its zero-shot behavior improved with scale, while the paper still framed left-to-right conditioning as less directly suited to some bidirectional understanding tasks than BERT-style encoders. [^7xs5jt] GPT-4 remains described at this level as a Transformer-style, next-token-pretrained model, with post-training alignment and multimodal input support layered over a scaled GPT lineage; the report withholds architecture size and training details but emphasizes predictable scaling and long-context/vision work as system-level extensions. [^uzreg0] This branch feeds [[Instruction tuning and alignment|instruction tuning and alignment]], [[Reasoning with large language models|reasoning with large language models]], and [[Agentic and coding models|agentic and coding models]].

## Encoder-only bidirectional pretraining

BERT took the opposite mask choice: a multi-layer Transformer encoder with fully visible self-attention, [CLS]/[SEP] task formatting, segment embeddings, and position embeddings. [^94sdzx] Its masked language modeling objective lets each token representation condition on both left and right context, while next sentence prediction and fine-tuning heads turned the same encoder into a strong NLU substrate. [^94sdzx] Architecturally, BERT demonstrates that Transformer does not imply generation; the same attention block becomes a representation learner when the decoder and causal mask are removed. This encoder-only path is one anchor of [[Pretraining and transfer learning|pretraining and transfer learning]] and later [[Parameter-efficient fine-tuning|parameter-efficient fine-tuning]].

## Text-to-text unification

T5 returned to encoder-decoder Transformers but made the interface uniform: every task is cast as text input plus text output, so training, fine-tuning, and decoding share one procedure. [^4ryg5a] Its encoder uses fully visible attention, the decoder uses causal self-attention plus cross-attention, and the paper compares this encoder-decoder choice against decoder-only language models and prefix-LM variants inside the same text-to-text setup. [^4ryg5a] The main lesson is that architecture and objective co-design matter: span-corruption denoising over C4 made encoder-decoder pretraining especially effective, even though the underlying blocks are close to the original Transformer. [^4ryg5a]

## Vision and multimodal transfer

ViT showed that a Transformer encoder can operate on images by changing tokenization rather than the core block: split an image into fixed patches, linearly project each patch, add a class token and position embeddings, then run a standard encoder. [^lkc75c] This strips away most CNN-specific inductive bias, so performance depends heavily on large-scale pretraining; with enough data, the patch-token Transformer becomes competitive with or stronger than convolutional baselines. [^lkc75c]

CLIP then made Transformer architecture part of a multimodal transfer system: an image encoder, often a ResNet or ViT, is paired with a Transformer text encoder and trained contrastively on 400M image-text pairs. [^gcewqb] At inference, prompts and class names become text embeddings that act like zero-shot classifier weights, shifting the architectural interface from generating tokens or classifying a [CLS] vector to aligning modalities in a shared embedding space. [^gcewqb] GPT-4 extends the GPT branch toward multimodal input by accepting interleaved text and images while still producing text outputs, tying vision-language capability back to a Transformer-style next-token model. [^uzreg0] These models sit closest to [[Multimodal foundation models|multimodal foundation models]].

## Transformer as the common substrate

Across these branches, the stable substrate is stacked attention and feed-forward blocks with residual/norm scaffolding; the changing design choices are the attention mask, input tokenization, objective, and output interface. [^8jx7u8] Encoder-only BERT, decoder-only GPT, encoder-decoder T5, patch-token ViT, contrastive CLIP, and multimodal GPT-4 are therefore less separate inventions than different operating modes of the same architectural family. [^94sdzx] [^7xs5jt] [^4ryg5a] [^lkc75c] [^gcewqb] [^uzreg0]

This explains why the Transformer became the common substrate for [[Open foundation model families|open foundation model families]] and why its limitations motivate [[Post-Transformer sequence models|post-Transformer sequence models]]. The central tension is that self-attention gives flexible global interaction and easy scaling, but its cost and sequence-length behavior push systems work, efficient attention variants, and alternative sequence models to search for cheaper ways to preserve that same flexible conditioning. [^8jx7u8]

[^8jx7u8]: [[Attention Is All You Need]]
[^mgmxdt]: [[Improving Language Understanding by Generative Pre-Training]]
[^7xs5jt]: [[Language Models are Unsupervised Multitask Learners]]
[^uzreg0]: [[GPT-4 Technical Report]]
[^94sdzx]: [[BERT - Pre-training of Deep Bidirectional Transformers for Language Understanding]]
[^4ryg5a]: [[Exploring the Limits of Transfer Learning with a Unified Text-to-Text Transformer]]
[^lkc75c]: [[An Image is Worth 16x16 Words - Transformers for Image Recognition at Scale]]
[^gcewqb]: [[Learning Transferable Visual Models From Natural Language Supervision]]
