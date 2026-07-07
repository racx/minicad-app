# frozen_string_literal: true

require "open3"

# The single swap point behind POST /api/drawings/:id/ai_commands.
# Orchestrates: prompt → model → robust JSON parse → engine validation of the
# returned script against the drawing's server doc (node, previewScript) →
# ONE retry with line-numbered errors → clean user-facing outcome. Falls back
# to the canned stub when no provider is configured (test env, credential-less
# dev without Ollama).
class AiCommandService < BaseService
  option :request
  option :context,  default: -> { {} }
  option :clarify,  default: -> { nil }   # prior round: {"request"=>, "question"=>}
  option :drawing,  default: -> { nil }   # server copy of the doc, for validation
  option :provider, default: -> { AiProvider.from_env }

  MAX_ATTEMPTS = 2
  VALIDATOR = Rails.root.join("bin/validate-mscript.mjs").to_s

  def call
    @meta = { attempts: 0, prompt_tokens: 0, completion_tokens: 0, latency_ms: 0,
              model: provider ? provider.model : "stub", validator_errors: [] }
    return AiCommandStubService.call(request: request, context: context).merge(meta: @meta) unless provider

    messages = build_messages
    loop do
      @meta[:attempts] += 1
      begin
        reply = provider.chat(messages: messages)
      rescue AiProvider::Error => e
        Rails.logger.warn("ai_command provider error: #{e.message}")
        return failure("The AI backend didn't answer — try again in a moment.")
      end
      @meta[:prompt_tokens]     += reply.dig(:usage, "prompt_tokens").to_i
      @meta[:completion_tokens] += reply.dig(:usage, "completion_tokens").to_i
      @meta[:latency_ms]        += reply[:latency_ms].to_i
      @meta[:model] = reply[:model] if reply[:model].present?

      data = extract_json(reply[:content])
      return failure("The AI answered in a format MiniCAD couldn't read — try again.") unless data

      case data["status"]
      when "clarify"
        question = data["question"].to_s.presence || "Could you say more precisely what to draw?"
        return { status: "clarify", plan: nil, script: nil, question: question, meta: @meta }
      when "ok"
        script = data["script"].to_s
        errors = validate(script)
        if errors.empty?
          return { status: "ok", plan: data["plan"].to_s.presence || "AI drawing", script: script,
                   question: nil, meta: @meta }
        elsif @meta[:attempts] < MAX_ATTEMPTS
          @meta[:validator_errors] += errors.first(5)
          messages << { role: "assistant", content: reply[:content] }
          messages << { role: "user", content: retry_message(errors) }
        else
          @meta[:validator_errors] += errors.first(5)
          Rails.logger.info("ai_command gave up after #{@meta[:attempts]} attempts: #{errors.first(3).to_json}")
          return failure("The AI couldn't produce a valid script for that (two tries) — " \
                         "rephrasing or breaking the request into smaller steps usually helps.", failed: true)
        end
      else
        return failure("The AI answered in a format MiniCAD couldn't read — try again.")
      end
    end
  end

  private

  def failure(message, failed: false)
    { status: "clarify", plan: nil, script: nil, question: message,
      meta: (@meta || {}).merge(failed: failed) }
  end

  def build_messages
    msgs = [ { role: "system", content: AiPrompt.system_prompt } ]
    msgs.concat(AiPrompt.example_messages)
    if clarify.present? && clarify["request"].present?
      msgs << { role: "user", content: AiPrompt.user_message(clarify["request"], context) }
      msgs << { role: "assistant",
                content: JSON.generate(status: "clarify", plan: nil, script: nil, question: clarify["question"]) }
      msgs << { role: "user", content: "ANSWER: #{request}" }
    else
      msgs << { role: "user", content: AiPrompt.user_message(request, context) }
    end
    msgs
  end

  def retry_message(errors)
    lines = errors.first(5).map { |e| "line #{e['line']}: #{e['msg']}" }.join("\n")
    "The validator rejected that script:\n#{lines}\n" \
    "Resend the FULL corrected script as the same JSON contract."
  end

  # models wrap JSON in prose/fences — take the outermost object
  def extract_json(content)
    raw = content.to_s.strip
    raw = raw[/\{.*\}/m] or return nil
    data = JSON.parse(raw)
    data.is_a?(Hash) ? data : nil
  rescue JSON::ParserError
    nil
  end

  # engine-true validation: previewScript against the drawing's server doc
  def validate(script)
    return [ { "line" => 0, "msg" => "empty script" } ] if script.blank?

    payload = JSON.generate(doc: drawing&.doc || {}, script: script)
    out, err, status = Open3.capture3("node", VALIDATOR, stdin_data: payload, chdir: Rails.root.to_s)
    unless status.success?
      Rails.logger.error("ai_command validator crashed: #{err.truncate(300)}")
      return [ { "line" => 0, "msg" => "internal validation error" } ]
    end
    JSON.parse(out)["errors"]
  end
end
