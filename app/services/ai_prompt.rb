# frozen_string_literal: true

# The AI system prompt, assembled AT BOOT: prompts/system.md with its
# {{GRAMMAR}} placeholder replaced by the grammar section of the engine's
# design doc — read verbatim so prompt and doc cannot drift. bin/ci runs
# AiPrompt.verify! to guard the extraction markers.
module AiPrompt
  DOC      = Rails.root.join("packages/engine/docs/ai-commands-design.md")
  TEMPLATE = Rails.root.join("prompts/system.md")
  EXAMPLES = Rails.root.join("prompts/examples.yml")

  # "## Design rules" through the end of "### Deliberately NOT scriptable"
  # (everything before "## API") — selectors, grammar, and the not-scriptable
  # list, verbatim.
  def self.grammar_block
    @grammar_block ||= begin
      doc = DOC.read
      block = doc[/^## Design rules.*?(?=^## API)/m]
      raise "AiPrompt: grammar markers not found in #{DOC}" if block.blank?
      block.strip
    end
  end

  def self.system_prompt
    @system_prompt ||= begin
      template = TEMPLATE.read
      raise "AiPrompt: {{GRAMMAR}} placeholder missing in #{TEMPLATE}" unless template.include?("{{GRAMMAR}}")
      template.sub("{{GRAMMAR}}", grammar_block)
    end
  end

  # few-shot user/assistant message pairs ahead of the real request
  def self.example_messages
    @example_messages ||= YAML.safe_load(EXAMPLES.read, permitted_classes: []).flat_map do |ex|
      [
        { role: "user", content: user_message(ex["request"], ex["context"]) },
        { role: "assistant", content: JSON.generate(ex["response"]) }
      ]
    end
  end

  def self.user_message(request, context)
    "REQUEST: #{request}\nDRAWING CONTEXT (JSON): #{JSON.generate(context || {})}"
  end

  # CI drift gate: markers intact, sentinels present, verbatim inclusion.
  def self.verify!
    g = grammar_block
    %w[### Draw ### Modify HATCH AREA STRETCH PLINE JOIN EXPLODE Deliberately].each do |sentinel|
      raise "AiPrompt: grammar block lost sentinel #{sentinel.inspect} — check #{DOC}" unless g.include?(sentinel)
    end
    raise "AiPrompt: system prompt does not embed the grammar verbatim" unless system_prompt.include?(g)
    raise "AiPrompt: no few-shot examples" if example_messages.empty?
    puts "AI prompt OK: grammar block #{g.bytesize} bytes (verbatim from design doc), " \
         "#{example_messages.size / 2} few-shot examples."
  end
end
