# frozen_string_literal: true

require "net/http"

# Minimal OpenAI-compatible /chat/completions client. No provider SDK —
# AI_BASE_URL + AI_MODEL + AI_API_KEY select the backend (Ollama, Anthropic's
# OpenAI-compat endpoint, OpenRouter, …). Dev defaults to local Ollama so the
# loop runs free; test never auto-configures.
class AiProvider
  class Error < StandardError; end

  DEV_DEFAULT_BASE  = "http://localhost:11434/v1"
  DEV_DEFAULT_MODEL = "qwen2.5-coder:7b"   # eval-picked: 4/10 (llama3.2) vs 6/10, see evals/results/

  def self.from_env
    base = ENV["AI_BASE_URL"].presence
    base ||= DEV_DEFAULT_BASE if Rails.env.development?
    return nil if base.blank?

    new(base_url: base,
        model: ENV["AI_MODEL"].presence || DEV_DEFAULT_MODEL,
        api_key: ENV["AI_API_KEY"].presence)
  end

  attr_reader :model, :base_url

  def initialize(base_url:, model:, api_key: nil)
    @base_url = base_url.chomp("/")
    @model = model
    @api_key = api_key
  end

  # → { content:, usage: {prompt_tokens:, completion_tokens:}, model:, latency_ms: }
  def chat(messages:)
    uri = URI("#{@base_url}/chat/completions")
    req = Net::HTTP::Post.new(uri)
    req["Content-Type"] = "application/json"
    req["Authorization"] = "Bearer #{@api_key}" if @api_key
    req.body = JSON.generate(model: @model, messages: messages, temperature: 0, stream: false)

    started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
    res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == "https",
                          open_timeout: 5, read_timeout: 180) { |http| http.request(req) }
    latency_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round

    raise Error, "#{res.code} #{res.body.to_s.truncate(200)}" unless res.is_a?(Net::HTTPSuccess)

    data = JSON.parse(res.body)
    { content: data.dig("choices", 0, "message", "content").to_s,
      usage: data["usage"] || {},
      model: data["model"] || @model,
      latency_ms: latency_ms }
  rescue JSON::ParserError => e
    raise Error, "unparseable provider response: #{e.message}"
  rescue Timeout::Error, SystemCallError, IOError => e
    raise Error, e.message
  end
end
