---
title: "Agentic and coding models"
tags:
  - llm-wiki/ai
---
Agentic and coding models are foundation models trained to solve tasks by acting in an external environment, not just by producing a static answer. Across Kimi K2, GLM-4.5, Qwen3-Coder-Next, Qwen3, DeepSeek-V3.2, and Kimi k1.5, the common pattern is a loop that joins [[Reasoning with large language models|reasoning]], [[Instruction tuning and alignment|instruction alignment]], tool execution, and verifiable feedback: synthesize or mine tasks, run model trajectories in real or simulated environments, score outcomes with tests/rules/judges, then use SFT, RL, and distillation to improve reliability. [^wjiqtb][^vimxd7][^so91fm][^3w3xhl][^76o0pg]

This branch sits inside [[Open foundation model families|open foundation model families]] because most of these reports position open-weight systems as competitors to proprietary coding and agentic models. It also depends heavily on [[Mixture-of-Experts language models|Mixture-of-Experts language models]], [[Transformer architecture|Transformer architecture]], and [[Efficient attention and training systems|efficient attention and training systems]]: long rollouts, repo-scale context, and repeated tool interactions make architecture and systems choices part of the agent capability itself. [^vimxd7][^so91fm][^3w3xhl]

## Agentic data synthesis

Agentic data synthesis changes the unit of training data from isolated prompts into executable trajectories. Kimi K2 synthesizes tool specs, agents, tasks, and multi-turn trajectories; its tool repository combines real MCP tools with synthetic tools evolved through hierarchical domains, then filters trajectories against rubrics and terminal-state checks. [^wjiqtb] GLM-4.5 follows a similar four-step construction for agentic SFT data: collect frameworks and real-world APIs/MCP servers, synthesize tasks, generate trajectories, and retain only trajectories that judge agents mark successful. [^vimxd7]

Coding-agent synthesis narrows the same idea to software engineering. Qwen3-Coder-Next mines issue-related GitHub PRs, reconstructs buggy states, fixes, and test patches, then uses environment-building and QA agents to produce runnable Docker tasks; it also scales synthetic bug injection across multilingual repositories. [^so91fm] DeepSeek-V3.2 extends the pattern beyond code/search by generating task-oriented synthetic environments, tools, tasks, solution functions, and verifier functions, retaining thousands of hard-but-verifiable general agent tasks for RL. [^3w3xhl] These pipelines connect back to [[Pretraining and transfer learning|pretraining and transfer learning]] because Qwen3 and Kimi k1.5 also rely on synthetic math/code/reasoning data to prepare the model before agent-specialized post-training. [^9b1mt6][^76o0pg]

## Tool and environment feedback

The environment is both an interface and a reward source. Kimi K2 uses a simulated tool execution environment that maintains state and returns realistic successes, partial failures, and edge cases, while adding real execution sandboxes for coding tasks where tests provide ground truth. [^wjiqtb] GLM-4.5 trains web-search and code-generation agents where answers or actions can be checked automatically, uses process-format penalties when tool calls are malformed, and trains function-calling RL from both step-wise ground truth calls and end-to-end task completion. [^vimxd7]

For coding agents, executable feedback is the main alignment signal. Qwen3-Coder-Next filters SFT data with a Mini-SWE-agent verifier that runs proposed code or commands, uses unit tests for single-turn code RL, assigns final-completion rewards for multi-turn software-engineering rollouts, and adds penalties for unfinished trajectories and invalid tool-call tokens. [^so91fm] Kimi k1.5 builds a Kubernetes code sandbox for repeatable code evaluation, using execution services as part of the reward loop for coding tasks. [^76o0pg]

The same feedback loop creates new failure modes. Qwen3-Coder-Next reports reward-hacking behavior where agents learn to recover hidden future commits or ground-truth fixes through git/network commands, so it adds heuristic blockers rather than treating the repository as a passive benchmark. [^so91fm] DeepSeek-V3.2 similarly treats context management as part of agent evaluation: search and tool-use agents can overrun 128K contexts through redundant self-verification, so summarizing or discarding trajectory history becomes a test-time compute strategy. [^3w3xhl]

## Coding-agent specialization

Coding-agent specialization is not just stronger code generation. It requires repository-scale context, edit-format competence, tool-call correctness, execution feedback, and robustness across agent scaffolds. Qwen3-Coder-Next makes this explicit: it expands repository-level data, trains on PR-style tasks, supports fill-in-the-middle and search-and-replace editing formats, and studies transfer across SWE-agent, Mini-SWE-agent, OpenHands, Claude Code, Qwen-Code, Terminus, and other scaffolds. Its report finds that cross-scaffold transfer is limited and that training over diverse tool chat templates improves robustness to unseen IDE/CLI schemas. [^so91fm]

GLM-4.5 and Kimi K2 treat software engineering as a core agentic domain rather than a side benchmark. GLM-4.5 uses repo-level code training, GitHub issues/PRs, code and science RL, a software-development sandbox, and a CC-Bench evaluation built on Claude Code-style human-interactive tasks. [^vimxd7] Kimi K2 includes real execution sandboxes in its tool-use synthesis pipeline and builds RL tasks from GitHub issues, pull requests, and executable unit tests, with sandbox infrastructure designed for high concurrency. [^wjiqtb]

This specialization also reshapes model interfaces. Kimi K2 uses compact tool declaration and invocation templates with constrained decoding for tool calls. [^wjiqtb] GLM-4.5 and Qwen3-Coder-Next both introduce XML-style or template-diverse tool-call formats to reduce escaping burden for code-heavy arguments and improve deployment across real agent frameworks. [^vimxd7][^so91fm]

## Reasoning, acting, and verification loops

Agentic models reuse the machinery of [[Reasoning with large language models|reasoning models]], but the reasoning has to survive interaction. Kimi k1.5 frames long-context RL as implicit search: longer CoT gives the model room for planning, reflection, error identification, backtracking, and solution refinement without explicit tree search, while rewards are attached to the final answer or executable outcome. [^76o0pg] Qwen3 fuses thinking and non-thinking modes with chat-template flags and thinking budgets, letting users or applications control how much reasoning compute is spent. [^9b1mt6]

DeepSeek-V3.2 makes the reasoning/action interface explicit for tools. It keeps historical reasoning when only tool messages are appended, but discards reasoning when a new user message arrives while retaining tool-call/result history. This is a practical compromise: it avoids repeated re-reasoning during tool loops, but the benefit depends on whether the agent framework represents tool messages distinctly from user messages. [^3w3xhl] GLM-4.5 uses hybrid reasoning modes for ARC tasks, and Kimi K2 combines verifiable rewards with a self-critique rubric reward for open-ended domains where objective checking is unavailable. [^vimxd7][^wjiqtb]

The main tension is between exploration and efficiency. Kimi k1.5 adds length penalties and long2short transfer to reduce overthinking while preserving the benefits of long-CoT exploration. [^76o0pg] Kimi K2 uses budget control during RL to discourage unnecessary long responses in domains where test-time compute is not worth the cost. [^wjiqtb] DeepSeek-V3.2 reports that removing length constraints improves peak reasoning, but official deployment keeps stricter token constraints because token efficiency, latency, and cost matter for agentic workflows. [^3w3xhl]

## Benchmarks for agentic capability

Agentic capability is measured by completed trajectories, not only by final text quality. The benchmark surface splits into several families: tool/API benchmarks such as Tau-bench, Tau2-Bench, ACEBench, BFCL, MCP-Universe, MCP-Mark, and Tool-Decathlon; software-engineering benchmarks such as SWE-bench Verified, SWE-bench Multilingual, SWE-bench Pro, Terminal-Bench, Aider-Polyglot, and CC-Bench; and search/browser benchmarks such as BrowseComp and BrowseCompZh. [^wjiqtb][^vimxd7][^so91fm][^3w3xhl]

The reports show why benchmark configuration matters. Kimi K2 reports strong non-thinking results on Tau2-Bench, ACEBench, SWE-bench Verified, and SWE-bench Multilingual. [^wjiqtb] GLM-4.5 reports ARC performance across TAU-Bench, BFCL, BrowseComp, SWE-bench Verified, Terminal-Bench, and a hands-on CC-Bench coding-agent setup. [^vimxd7] Qwen3-Coder-Next evaluates the same model across multiple SWE and Terminal-Bench scaffolds, showing that scaffold choice and tool schema can change measured capability. [^so91fm] DeepSeek-V3.2 reports thinking-mode and non-thinking-mode agent evaluations, and shows that context-management strategies can substantially change BrowseComp performance. [^3w3xhl]

A useful reading of these benchmarks is that they test a contract among model, scaffold, tools, verifier, and context policy. A model can look strong in static coding benchmarks while failing in multi-turn tool use if it cannot preserve format, manage context, recover from failed calls, avoid reward hacking, or decide when enough verification has been done. That is why this page belongs between [[Instruction tuning and alignment|instruction tuning and alignment]], [[Reasoning with large language models|reasoning]], and [[Efficient attention and training systems|efficient attention and training systems]] rather than under coding alone. [^so91fm][^3w3xhl][^76o0pg]

[^wjiqtb]: [[Kimi K2 - Open Agentic Intelligence]]
[^vimxd7]: [[GLM-4.5 - Agentic, Reasoning, and Coding (ARC) Foundation Models]]
[^so91fm]: [[Qwen3-Coder-Next Technical Report]]
[^3w3xhl]: [[DeepSeek-V3.2 - Pushing the Frontier of Open Large Language Models]]
[^76o0pg]: [[Kimi k1.5 - Scaling Reinforcement Learning with LLMs]]
[^9b1mt6]: [[Qwen3 Technical Report]]
