---
title: "Multimodal foundation models"
tags:
  - llm-wiki/ai
---
Multimodal foundation models extend the foundation-model recipe from text-only sequence modeling toward images, video, speech, and tool-mediated environments. Across these sources, the progression is: Vision Transformers make image recognition look like token-sequence modeling; CLIP makes natural language a scalable visual supervision signal; GPT-4 puts image+text prompting into a frontier assistant interface; Llama 3 and Kimi k1.5 show compositional and joint vision-language training paths; GLM-4.5 marks an adjacent frontier pattern where agentic tool interaction becomes a core evaluation surface rather than a visual modality. The topic therefore sits at the intersection of [[Transformer architecture|Transformer architecture]], [[Pretraining and transfer learning|pretraining and transfer learning]], [[Reasoning with large language models|reasoning with large language models]], and [[Open foundation model families|open foundation model families]].

## Vision Transformers

Vision Transformer (ViT) reframed image recognition as sequence modeling: split an image into fixed-size patches, flatten and linearly project each patch, add positional embeddings, prepend a class token, and run the resulting sequence through a standard Transformer encoder [^zfjzzi]. This makes vision directly inherit the [[Transformer architecture|Transformer]] scaling machinery, but it also removes much of the locality and translation-equivariance bias built into CNNs.

The ViT tradeoff is scale. On smaller datasets it can underperform convolutional baselines, while large supervised pretraining on ImageNet-21k or JFT-300M lets the lower-inductive-bias architecture dominate; the paper's conclusion is essentially that sufficient large-scale training can compensate for weaker image-specific priors [^zfjzzi] [^zfjzzi]. That makes ViT a bridge from image recognition to [[Scaling laws and compute-optimal training|scaling laws]], not just a new vision backbone.

Later multimodal systems reuse that bridge rather than abandon it. Llama 3's vision experiments attach a ViT-H/14 image encoder to the language model through cross-attention adapters, and the image encoder is trained with image-text alignment before multimodal post-training [^2ixcnw]. In this pattern, the Transformer language model remains the main reasoning surface while a vision Transformer supplies visual tokens.

## Contrastive language-image pretraining

CLIP changed the supervision signal: instead of training a vision model only against fixed image labels, it trains an image encoder and text encoder contrastively on a large set of image-text pairs so matched captions and images have nearby representations [^rlhv6a]. Natural language then defines the class space at inference time, which is why CLIP can form zero-shot classifiers from prompt text rather than retraining a classifier head for every dataset.

The important mechanism is not just scale but interface. Prompt templates and prompt ensembling improve CLIP's zero-shot classification because the text encoder is part of the classifier definition, not a separate annotation layer [^rlhv6a]. This connects multimodal pretraining to [[Instruction tuning and alignment|instruction tuning and alignment]]: language becomes both supervision and control surface.

CLIP also exposes a persistent evaluation tension. It is robust to many natural distribution shifts relative to supervised ImageNet models, but it remains weak on fine-grained classification, counting, abstract reasoning, and tasks far outside the image-text web distribution [^rlhv6a] [^rlhv6a]. This limitation anticipates why later models combine perception with stronger language-model reasoning rather than treating image-text contrastive pretraining as a complete solution.

## Multimodal frontier models

GPT-4 represents a frontier-model interface shift: it accepts prompts containing interleaved image and text inputs and produces text outputs, while many prompting techniques from text-only models carry over to visual inputs [^17530d]. The report's examples include chart interpretation, diagram reasoning, visual humor explanation, and document-like image summarization, placing perception inside the assistant interaction loop rather than in a standalone classifier [^17530d].

Llama 3 shows a compositional route for [[Open foundation model families|open foundation model families]]. Its paper studies adding image and video recognition to a pretrained language model by training cross-attention adapters, keeping text-only performance stable, and avoiding the cost of passing full-resolution images through every feed-forward layer in the language backbone [^2ixcnw]. Video is then added through temporal aggregation and video cross-attention layers, while post-training uses multimodal SFT, preference data, DPO, and rejection sampling to improve chat quality and reasoning [^2ixcnw].

Kimi k1.5 takes a more reasoning-centered view of multimodality. It describes a multi-modal LLM jointly trained on text and vision data, with RL and long-context CoT used to improve reasoning across modalities [^qlcweq]. Its pretraining recipe includes captioning, image-text interleaving, OCR, knowledge, and general QA data, and its training stages move from vision-language pretraining to cooldown and long-context activation [^qlcweq] [^qlcweq]. This makes multimodality part of the same test-time and training-time scaling story as [[Reasoning with large language models|reasoning with large language models]].

GLM-4.5 is useful as a boundary case. It is presented as an open-source MoE language model for agentic, reasoning, and coding tasks, not as a vision-language model; its relevance is that modern foundation-model evaluation is expanding beyond static text answers into tool calls, web browsing, coding environments, and long-horizon interaction [^9x2e1t]. That connects this page to [[Mixture-of-Experts language models|Mixture-of-Experts language models]] and [[Agentic and coding models|agentic and coding models]], while keeping the distinction between visual multimodality and agentic environment interaction clear.

## Multimodal reasoning and evaluation

Multimodal evaluation moves from recognition accuracy to grounded reasoning. GPT-4's exam methodology notes that images were included for questions that required them, but that some exams used transcriptions or placeholders, making vision/no-vision comparisons difficult to interpret without reading the setup carefully [^17530d]. That is a useful caution: multimodal benchmark numbers often depend on whether the model actually saw pixels, transcribed content, or a text surrogate.

Llama 3 evaluates image understanding across natural images, OCR, documents, charts, diagrams, and multimodal reasoning with benchmarks such as MMMU, VQAv2, AI2 Diagram, ChartQA, TextVQA, and DocVQA [^2ixcnw]. Its video section adds temporal benchmarks such as PerceptionTest, TVQA, NExT-QA, and ActivityNet-QA, emphasizing memory, abstraction, physics, semantics, subtitles, and long-form activity understanding [^2ixcnw].

Kimi k1.5 evaluates multimodal reasoning through vision benchmarks including MMMU, MATH-Vision, and MathVista, alongside text and coding benchmarks [^qlcweq]. Its reported long-CoT and short-CoT results make visual math a first-class reasoning target rather than a separate perception appendix [^qlcweq].

GLM-4.5's ARC evaluation broadens the lesson further: frontier capability is measured across agentic, reasoning, and coding benchmarks, including TAU-Bench, BFCL, BrowseComp, SWE-bench Verified, Terminal-Bench, AIME, GPQA, and LiveCodeBench [^9x2e1t]. Even when the inputs are not visual, these benchmarks pressure models to coordinate perception-like state tracking, tool calls, external feedback, and long-horizon planning, which is why multimodal foundation models should be understood as part of a wider shift from passive text prediction to grounded interaction.

[^zfjzzi]: [[An Image is Worth 16x16 Words - Transformers for Image Recognition at Scale]]
[^2ixcnw]: [[The Llama 3 Herd of Models]]
[^rlhv6a]: [[Learning Transferable Visual Models From Natural Language Supervision]]
[^17530d]: [[GPT-4 Technical Report]]
[^qlcweq]: [[Kimi k1.5 - Scaling Reinforcement Learning with LLMs]]
[^9x2e1t]: [[GLM-4.5 - Agentic, Reasoning, and Coding (ARC) Foundation Models]]
